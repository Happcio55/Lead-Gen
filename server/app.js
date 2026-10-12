// Surge HTTP API, shared by the local server (server/index.js) and the Vercel function (api/[...path].js).
import { ADDR, CHAIN_ID, DEFAULT_RPC, EXPLORER } from '../shared/chain.js';

const BOARD_LIMIT = 400;
// Surge's Privy app (a public client id, safe to ship). PRIVY_APP_ID overrides it.
const DEFAULT_PRIVY_APP_ID = 'cmv527g7j03lv0fjyt8xsqzqs';

// Reads the browser may make through the proxy. Writes are limited to broadcasting
// already-signed transactions; keys never touch this server.
const RPC_METHODS = new Set([
  'eth_chainId', 'eth_blockNumber', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
  'eth_feeHistory', 'eth_getBalance', 'eth_getCode', 'eth_getTransactionCount', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_sendRawTransaction', 'net_version',
]);

// `defer` keeps a promise running after the response is sent (Vercel's waitUntil).
export function createApi({ indexer, lazy = false, defer = null, env = process.env, log = console }) {
  const rpcUrl = env.RH_RPC_URL || DEFAULT_RPC;
  const privyAppId = env.PRIVY_APP_ID || DEFAULT_PRIVY_APP_ID;

  // In serverless mode every data request brings the index up to date first. A cold instance's
  // backfill takes ~10-20s: answer "syncing" after a few seconds and let it finish in the background.
  async function fresh() {
    if (!lazy) return;
    const work = indexer.ensureFresh();
    if (indexer.status.synced) return work;
    const settled = work.then(() => true, () => true);
    defer?.(settled);
    await Promise.race([settled, new Promise((r) => setTimeout(r, 6000))]);
  }

  function boardPayload() {
    const rows = indexer.board();
    // Most relevant first: recent activity, then newest.
    rows.sort((a, b) => Math.max(b.lastSwapAt, b.createdAt) - Math.max(a.lastSwapAt, a.createdAt));
    return { meta: indexer.meta(), rows: rows.slice(0, BOARD_LIMIT), feed: indexer.feed };
  }

  async function proxyRpc(body) {
    const calls = Array.isArray(body) ? body : [body];
    if (calls.length > 50) return { status: 400, json: { error: 'batch too large' } };
    for (const c of calls) {
      if (!c || !RPC_METHODS.has(c.method)) {
        return { status: 400, json: { jsonrpc: '2.0', id: c?.id ?? null, error: { code: -32601, message: `method not allowed: ${c?.method}` } } };
      }
    }
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    return { status: res.status, json: await res.json() };
  }

  // Returns true when the request was an API request (and has been answered).
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    if (!pathname.startsWith('/api/')) return false;
    try {
      if (pathname === '/api/config') {
        json(res, 200, { chainId: CHAIN_ID, explorer: EXPLORER, privyAppId, addresses: ADDR }, 'public, s-maxage=60');
      } else if (pathname === '/api/health') {
        json(res, 200, { ok: true, ...indexer.meta() });
      } else if (pathname === '/api/board') {
        await fresh();
        if (!indexer.status.synced) json(res, 503, { syncing: true, meta: indexer.meta() });
        // The CDN may serve this for a second, so many viewers share one computation.
        else json(res, 200, boardPayload(), 'public, s-maxage=1, stale-while-revalidate=4');
      } else if (/^\/api\/pool\/0x[0-9a-fA-F]{64}$/.test(pathname)) {
        await fresh();
        const id = pathname.slice('/api/pool/'.length).toLowerCase();
        const bucket = Math.min(3600_000, Math.max(1000, Number(url.searchParams.get('bucket')) || 15_000));
        const d = indexer.detail(id, { bucketMs: bucket });
        if (d) json(res, 200, d, 'public, s-maxage=1, stale-while-revalidate=4');
        else json(res, 404, { error: 'pool not tracked' });
      } else if (pathname === '/api/pin' && req.method === 'POST') {
        // Keep pools the user holds from being pruned while they're idle.
        const body = await readBody(req);
        const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => /^0x[0-9a-fA-F]{64}$/.test(x)).slice(0, 200) : [];
        for (const id of ids) indexer.pinned.add(id.toLowerCase());
        json(res, 200, { pinned: ids.length });
      } else if (pathname === '/api/rpc' && req.method === 'POST') {
        const out = await proxyRpc(await readBody(req));
        json(res, out.status, out.json);
      } else {
        json(res, 404, { error: 'not found' });
      }
    } catch (e) {
      log.warn?.('[api]', pathname, e.shortMessage || e.message);
      if (!res.headersSent) json(res, 500, { error: 'internal error' });
    }
    return true;
  };
}

function json(res, status, obj, cache = 'no-store') {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': cache });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 256 * 1024) {
  // Vercel's Node runtime may have parsed the body already.
  if (req.body !== undefined) {
    const b = req.body;
    if (b == null || typeof b === 'object' && !Buffer.isBuffer(b)) return Promise.resolve(b);
    return Promise.resolve(JSON.parse(b.toString('utf8') || 'null'));
  }
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
