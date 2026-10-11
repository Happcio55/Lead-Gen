// Rate-limited JSON-RPC access to Robinhood Chain, exposed both as raw `rpc()` and a viem client.
import { createPublicClient, custom, defineChain } from 'viem';
import { config, ADDR } from './config.js';

export const robinhood = defineChain({
  id: config.chainId,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
  contracts: { multicall3: { address: ADDR.MULTICALL3 } }
});

// Two priority lanes; cheap calls are packed into JSON-RPC batches (one HTTP request, many calls).
const lanes = { high: [], low: [] };
let active = 0;
let tokens = config.rpcRps;
let lastRefill = Date.now();
let reqId = 0;
const BATCH = 25;
export const rpcStats = { sent: 0, calls: 0, retries: 0, errors: 0 };

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class RpcError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

function refill() {
  const now = Date.now();
  tokens = Math.min(config.rpcRps, tokens + ((now - lastRefill) / 1000) * config.rpcRps);
  lastRefill = now;
}

function nextBatch() {
  const lane = lanes.high.length ? lanes.high : lanes.low;
  if (!lane.length) return null;
  // eth_getLogs responses can be large, so they travel alone.
  if (lane[0].method === 'eth_getLogs') return [lane.shift()];
  const out = [];
  for (let i = 0; i < lane.length && out.length < BATCH;) {
    if (lane[i].method === 'eth_getLogs') { i++; continue; }
    out.push(lane.splice(i, 1)[0]);
  }
  return out;
}

let timer = null;
function pump() {
  refill();
  while (active < config.rpcConcurrency && tokens >= 1) {
    const batch = nextBatch();
    if (!batch) return;
    tokens -= 1;
    active++;
    sendBatch(batch).finally(() => { active--; pump(); });
  }
  if ((lanes.high.length || lanes.low.length) && !timer) {
    timer = setTimeout(() => { timer = null; pump(); }, Math.ceil(1000 / config.rpcRps));
  }
}

function retry(job, delay) {
  job.attempt = (job.attempt || 0) + 1;
  if (job.attempt > 6) { rpcStats.errors++; job.reject(new RpcError('RPC unavailable', 'RETRY')); return; }
  rpcStats.retries++;
  setTimeout(() => { (job.low ? lanes.low : lanes.high).unshift(job); pump(); }, delay * 2 ** (job.attempt - 1) + Math.random() * 300);
}

async function sendBatch(batch) {
  rpcStats.sent++;
  rpcStats.calls += batch.length;
  const ids = batch.map(() => ++reqId);
  const payload = batch.map((j, i) => ({ jsonrpc: '2.0', id: ids[i], method: j.method, params: j.params }));
  let body;
  try {
    const res = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch.length === 1 ? payload[0] : payload),
      signal: AbortSignal.timeout(25000)
    });
    if (res.status === 429 || res.status >= 500) throw new RpcError('HTTP ' + res.status, res.status);
    body = await res.json();
  } catch {
    batch.forEach(j => retry(j, 500));
    return;
  }
  const byId = new Map((Array.isArray(body) ? body : [body]).map(r => [r.id, r]));
  batch.forEach((job, i) => {
    const r = byId.get(ids[i]);
    if (!r) return retry(job, 500);
    if (r.error) {
      if (r.error.code === 429 || /rate|too many requests/i.test(r.error.message || '')) return retry(job, 800);
      // Deterministic errors (bad params, ranges, reverts) are not retried.
      return job.reject(new RpcError(r.error.message || 'rpc error', r.error.code));
    }
    job.resolve(r.result);
  });
}

// low=true for background work (historical backfill) so live scoring is never starved.
export function rpc(method, params = [], low = false) {
  return new Promise((resolve, reject) => {
    (low ? lanes.low : lanes.high).push({ method, params, resolve, reject, low });
    pump();
  });
}

export const client = createPublicClient({
  chain: robinhood,
  transport: custom({ request: ({ method, params }) => rpc(method, params) }),
  batch: { multicall: { wait: 16 } }
});

const hex = n => '0x' + BigInt(n).toString(16);
const MAX_RANGE = 100000n;

// eth_getLogs that splits ranges to stay under the node's 100k-block and 10k-result limits.
export async function getLogs(filter, fromBlock, toBlock, opts = {}) {
  const from = BigInt(fromBlock), to = BigInt(toBlock);
  if (to < from) return [];
  const maxLogs = opts.maxLogs ?? Infinity;
  if (to - from + 1n > MAX_RANGE) {
    const out = [];
    for (let s = from; s <= to; s += MAX_RANGE) {
      const e = s + MAX_RANGE - 1n < to ? s + MAX_RANGE - 1n : to;
      out.push(...await getLogs(filter, s, e, opts));
      if (out.length > maxLogs) throw new RpcError('too many logs', 'LIMIT');
    }
    return out;
  }
  try {
    return await rpc('eth_getLogs', [{ ...filter, fromBlock: hex(from), toBlock: hex(to) }], opts.low);
  } catch (e) {
    const allowed = /only (\d+) are allowed/.exec(e.message);
    if (allowed && to > from) {
      const step = BigInt(allowed[1]);
      const out = [];
      for (let s = from; s <= to; s += step) out.push(...await getLogs(filter, s, s + step - 1n < to ? s + step - 1n : to, opts));
      return out;
    }
    if (/exceeds limit|too many|response size/i.test(e.message) && to > from) {
      if (opts.noSplit) throw new RpcError('too many logs', 'LIMIT');
      const mid = from + (to - from) / 2n;
      const a = await getLogs(filter, from, mid, opts);
      const b = await getLogs(filter, mid + 1n, to, opts);
      return a.concat(b);
    }
    throw e;
  }
}

export const topicToAddr = t => '0x' + t.slice(26).toLowerCase();
