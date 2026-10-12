// Local preview: serves public/ and the api/ handlers the way Vercel does.
//   ANTHROPIC_API_KEY=sk-ant-... npm run dev   →  http://localhost:8800
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const routes = {
  '/api/chat': (await import('./api/chat.js')).default,
  '/api/health': (await import('./api/health.js')).default,
};
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
};

const port = Number(process.env.PORT) || 8800;
createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (routes[pathname]) return routes[pathname](req, res);
  let file = normalize(join(root, decodeURIComponent(pathname)));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file += '.html'; // cleanUrls: /widget → widget.html
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}).listen(port, () => console.log(`Vektor on http://localhost:${port}`));
