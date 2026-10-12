// Runs the Vercel function (api/index.js) behind a plain Node server, the way Vercel calls it,
// plus the built app from dist/. Usage: npm run build && node scripts/serverless-preview.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import handler from '../api/index.js';
const DIST = path.resolve('dist');
http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    // Mirror vercel.json: /api/<path> -> /api?__path=<path>
    const u = new URL(req.url, 'http://x');
    u.searchParams.set('__path', u.pathname.slice(5));
    req.url = `/api${u.search}`;
    return handler(req, res);
  }
  let f = path.join(DIST, new URL(req.url, 'http://x').pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(Number(process.env.PORT || 8790), () => console.log(`serverless preview on http://localhost:${process.env.PORT || 8790}`));
