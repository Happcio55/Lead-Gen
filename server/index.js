// Surge API server: live board over SSE, pool detail, a read-mostly RPC proxy, and the built web app.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Indexer } from './indexer.js';
import { CHAIN_ID, DEFAULT_RPC, ADDR, EXPLORER } from '../shared/chain.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8787);
const RPC_URL = process.env.RH_RPC_URL || DEFAULT_RPC;
const PRIVY_APP_ID = process.env.PRIVY_APP_ID || '';
const BACKFILL = BigInt(process.env.BACKFILL_BLOCKS || 36_000);
const BOARD_LIMIT = 600;

const log = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), ...a),
};

const indexer = new Indexer({ rpcUrl: RPC_URL, backfillBlocks: BACKFILL, log });

// ---------------------------------------------------------------------------
// SSE: push the board once per second to every connected client.
// ---------------------------------------------------------------------------

const clients = new Set();

function boardPayload() {
  const rows = indexer.board();
  // Most relevant first: recent activity, then newest.
  rows.sort((a, b) => Math.max(b.lastSwapAt, b.createdAt) - Math.max(a.lastSwapAt, a.createdAt));
  return { meta: indexer.meta(), rows: rows.slice(0, BOARD_LIMIT), feed: indexer.feed };
}

setInterval(() => {
  if (!clients.size || !indexer.status.synced) return;
  const data = `event: board\ndata: ${JSON.stringify(boardPayload())}\n\n`;
  for (const res of clients) res.write(data);
}, 1000).unref();

setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 20_000).unref();

// ---------------------------------------------------------------------------
// RPC proxy: lets the browser read chain state without CORS issues. Writes are limited to
// broadcasting already-signed transactions; keys never touch this server.
// ---------------------------------------------------------------------------

const RPC_METHODS = new Set([
  'eth_chainId', 'eth_blockNumber', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
  'eth_feeHistory', 'eth_getBalance', 'eth_getCode', 'eth_getTransactionCount', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_sendRawTransaction', 'net_version',
]);

async function proxyRpc(body) {
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length > 50) return { status: 400, json: { error: 'batch too large' } };
  for (const c of calls) {
    if (!c || !RPC_METHODS.has(c.method)) {
      return { status: 400, json: { jsonrpc: '2.0', id: c?.id ?? null, error: { code: -32601, message: `method not allowed: ${c?.method}` } } };
    }
  }
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, json: await res.json() };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}

const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'content-type': 'application/json' });

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  if (!fs.existsSync(DIST)) {
    return send(res, 200, 'Surge API is running. Build the web app with `npm run build`, or use `npm run dev`.', { 'content-type': 'text/plain' });
  }
  let file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
  if (!file.startsWith(DIST)) return send(res, 403, 'forbidden');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const ext = path.extname(file);
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': cache });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  try {
    if (pathname === '/api/config') {
      return json(res, 200, {
        chainId: CHAIN_ID,
        explorer: EXPLORER,
        privyAppId: PRIVY_APP_ID,
        addresses: ADDR,
      });
    }
    if (pathname === '/api/health') return json(res, 200, { ok: true, ...indexer.meta() });
    if (pathname === '/api/board') {
      if (!indexer.status.synced) return json(res, 503, { syncing: true, meta: indexer.meta() });
      return json(res, 200, boardPayload());
    }
    if (pathname === '/api/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      if (indexer.status.synced) res.write(`event: board\ndata: ${JSON.stringify(boardPayload())}\n\n`);
      else res.write(`event: syncing\ndata: ${JSON.stringify(indexer.meta())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    const m = pathname.match(/^\/api\/pool\/(0x[0-9a-fA-F]{64})$/);
    if (m) {
      const bucket = Math.min(3600_000, Math.max(1000, Number(url.searchParams.get('bucket')) || 15_000));
      const d = indexer.detail(m[1].toLowerCase(), { bucketMs: bucket }) || indexer.detail(m[1], { bucketMs: bucket });
      return d ? json(res, 200, d) : json(res, 404, { error: 'pool not tracked' });
    }
    if (pathname === '/api/pin' && req.method === 'POST') {
      // Keep pools the user holds from being pruned while they're idle.
      const body = await readBody(req);
      const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => /^0x[0-9a-fA-F]{64}$/.test(x)).slice(0, 200) : [];
      for (const id of ids) indexer.pinned.add(id);
      return json(res, 200, { pinned: ids.length });
    }
    if (pathname === '/api/rpc' && req.method === 'POST') {
      const out = await proxyRpc(await readBody(req));
      return json(res, out.status, out.json);
    }
    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
    return serveStatic(req, res, pathname);
  } catch (e) {
    log.warn('[http]', pathname, e.message);
    if (!res.headersSent) json(res, 500, { error: 'internal error' });
  }
});

server.listen(PORT, () => {
  log.info(`[surge] http://localhost:${PORT}  rpc=${RPC_URL}  privy=${PRIVY_APP_ID ? 'on' : 'off (injected wallets only)'}`);
});

indexer.start().catch((e) => {
  log.warn('[indexer] failed to start:', e.shortMessage || e.message);
  process.exitCode = 1;
});
