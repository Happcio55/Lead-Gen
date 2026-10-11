#!/usr/bin/env node
/* Sherwood server — static files + a small read-only proxy to Robinhood's public market data.
 *
 * Robinhood's market-data endpoints answer without a login but send no CORS headers, so a
 * browser can't call them directly. This forwards an allowlisted set of GET endpoints,
 * caches briefly, and adds CORS. No dependencies: `node server.js` (Node 18+).
 *
 *   PORT=8000 node server.js   →  http://localhost:8000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = +process.env.PORT || 8000;
const ROOT = __dirname;
const UPSTREAM = 'https://api.robinhood.com/';

// path prefix → cache seconds
const ALLOW = [
  ['marketdata/quotes/', 1.5],
  ['marketdata/historicals/', 20],
  ['fundamentals/', 300],
  ['markets/XNYS/hours/', 600],
  ['midlands/ratings/', 3600],
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8',
};

const cache = new Map(); // url → { at, ttl, status, body }
const inflight = new Map();

async function proxy(rhPath, res) {
  const rule = ALLOW.find(([p]) => rhPath.startsWith(p));
  if (!rule || rhPath.includes('..')) return send(res, 403, JSON.stringify({ error: 'Endpoint not allowed' }), 'application/json');
  const url = UPSTREAM + rhPath;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < rule[1] * 1000) return send(res, hit.status, hit.body, 'application/json', rule[1]);
  try {
    let p = inflight.get(url);
    if (!p) {
      p = fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Sherwood/1.0 (paper trading)' } })
        .then(async (r) => ({ status: r.status, body: await r.text() }))
        .finally(() => inflight.delete(url));
      inflight.set(url, p);
    }
    const { status, body } = await p;
    if (status === 200) {
      cache.set(url, { at: Date.now(), status, body });
      if (cache.size > 2000) cache.delete(cache.keys().next().value);
    }
    send(res, status, body, 'application/json', rule[1]);
  } catch (e) {
    if (hit) return send(res, hit.status, hit.body, 'application/json');
    send(res, 502, JSON.stringify({ error: 'Upstream unavailable' }), 'application/json');
  }
}

function send(res, status, body, type, maxAge) {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': maxAge ? `public, max-age=${Math.floor(maxAge)}` : 'no-store',
  });
  res.end(body);
}

function serveStatic(urlPath, res) {
  let file = path.normalize(path.join(ROOT, decodeURIComponent(urlPath)));
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');
  if (urlPath.endsWith('/')) file = path.join(file, 'index.html');
  const base = path.basename(file);
  if (base.startsWith('.') || base === 'server.js') return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/rh/')) return proxy(u.pathname.slice(8) + u.search, res);
  serveStatic(u.pathname, res);
}).listen(PORT, () => console.log(`Sherwood running at http://localhost:${PORT}`));
