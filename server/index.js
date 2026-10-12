// Local / self-hosted server: background indexer + API + the built web app.
// On Vercel the same API runs as a serverless function instead (see api/[...path].js).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RPC } from '../shared/chain.js';
import { createApi } from './app.js';
import { Indexer } from './indexer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8787);
const RPC_URL = process.env.RH_RPC_URL || DEFAULT_RPC;

const log = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), ...a),
};

const indexer = new Indexer({ rpcUrl: RPC_URL, backfillBlocks: BigInt(process.env.BACKFILL_BLOCKS || 36_000), log });
const api = createApi({ indexer, log });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
};

function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('Vestas API is running. Build the web app with `npm run build`, or use `npm run dev`.');
  }
  const { pathname } = new URL(req.url, 'http://localhost');
  let file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': cache });
  fs.createReadStream(file).pipe(res);
}

http
  .createServer(async (req, res) => {
    if (!(await api(req, res))) serveStatic(req, res);
  })
  .listen(PORT, () => {
    log.info(`[vestas] http://localhost:${PORT}  rpc=${RPC_URL}  privy=${process.env.PRIVY_APP_ID ? 'on' : 'off (injected wallets only)'}`);
  });

indexer.start().catch((e) => {
  log.warn('[indexer] failed to start:', e.shortMessage || e.message);
  process.exitCode = 1;
});
