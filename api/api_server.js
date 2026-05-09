import { server } from '../dist/server/server.js';

export default async function handler(req, res) {
  // Convert Node.js req to a Web Fetch API Request
  const url = `https://${req.headers.host}${req.url}`;
  
  const body =
    req.method !== 'GET' && req.method !== 'HEAD'
      ? await new Promise((resolve) => {
          const chunks = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', () => resolve(Buffer.concat(chunks)));
        })
      : undefined;

  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body,
  });

  const response = await server.fetch(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const buffer = await response.arrayBuffer();
  res.end(Buffer.from(buffer));
}
