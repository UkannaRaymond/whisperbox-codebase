import { cpSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';

// 1. Run Vite build
console.log('[vercel-build] 1/4 Running vite build...');
execSync('npm run build', { stdio: 'inherit' });

// 2. Prepare output directory
console.log('[vercel-build] 2/4 Preparing .vercel/output...');
const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/static`, { recursive: true });
mkdirSync(`${out}/functions/index.func`, { recursive: true });

// 3. Copy static client assets
cpSync('dist/client', `${out}/static`, { recursive: true });

// 4. Bundle the SSR server + all its node_modules into one file
console.log('[vercel-build] 3/4 Bundling SSR server...');
execSync(
  `npx esbuild dist/server/server.js \
    --bundle \
    --platform=node \
    --target=node20 \
    --format=esm \
    --outfile=${out}/functions/index.func/server-bundle.js`,
  { stdio: 'inherit' }
);

// 5. Write the Vercel function handler
writeFileSync(`${out}/functions/index.func/index.js`, `
import { server } from './server-bundle.js';

export default async function handler(req, res) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const url   = proto + '://' + host + req.url;

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined) headers[k] = String(v);
  }

  const request  = new Request(url, { method: req.method, headers, body });
  const response = await server.fetch(request);

  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}
`.trim());

// 6. Function runtime config
writeFileSync(`${out}/functions/index.func/.vc-config.json`, JSON.stringify({
  runtime: 'nodejs20.x',
  handler: 'index.js',
  launcherType: 'Nodejs',
  shouldAddHelpers: true,
}, null, 2));

// 7. Vercel routing: static files first, everything else → SSR function
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index' },
  ],
}, null, 2));

console.log('[vercel-build] 4/4 Done. .vercel/output is ready.');
