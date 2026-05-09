import { cpSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';

// 1. Vite build
console.log('[vercel-build] 1/4 Running vite build...');
execSync('npm run build', { stdio: 'inherit' });

// 2. Clean and prepare .vercel/output
console.log('[vercel-build] 2/4 Preparing output directory...');
const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/static`, { recursive: true });
mkdirSync(`${out}/functions/index.func`, { recursive: true });

// 3. Static assets
cpSync('dist/client', `${out}/static`, { recursive: true });

// 4. Bundle SSR server as CJS (react uses CJS require internally;
//    package.json "type":"module" means .cjs extension is needed)
console.log('[vercel-build] 3/4 Bundling SSR server...');
execSync(
  `npx esbuild dist/server/server.js \
    --bundle \
    --platform=node \
    --target=node20 \
    --format=cjs \
    --outfile=${out}/functions/index.func/server-bundle.cjs`,
  { stdio: 'inherit' }
);

// 5. Handler: load CJS bundle via createRequire (compatible with "type":"module")
writeFileSync(`${out}/functions/index.func/index.js`, `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { default: server } = require('./server-bundle.cjs');

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

// 7. Routing: static files first, everything else to SSR function
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index' },
  ],
}, null, 2));

console.log('[vercel-build] 4/4 Done.');
