// Rate-limited JSON-RPC access to Robinhood Chain, exposed both as raw `rpc()` and a viem client.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createPublicClient, custom, defineChain } from 'viem';
import { config, ADDR } from './config.js';

export const robinhood = defineChain({
  id: config.chainId,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
  contracts: { multicall3: { address: ADDR.MULTICALL3 } }
});

// Three priority lanes, cheap calls packed into JSON-RPC batches (one HTTP request, many calls):
// urgent = a person is waiting (report, portfolio, quote), high = live indexing/scoring, low = backfill.
const lanes = { urgent: [], high: [], low: [] };
const ctx = new AsyncLocalStorage();
// Run fn with its RPC calls in the urgent lane; background() opts back out for work it spawns.
export const urgent = fn => ctx.run({ urgent: true }, fn);
export const background = fn => ctx.run({ urgent: false }, fn);
let active = 0;
let tokens = config.rpcRps;
// Adaptive rate: drops when the RPC rate-limits us, creeps back up while requests succeed.
let rate = config.rpcRps;
let lastThrottle = 0;
let lastRefill = Date.now();
let reqId = 0;
let urlIdx = 0;
const BATCH = 25;
const UA = 'Mozilla/5.0 (compatible; Kairo/1.0; +https://github.com/happcio55/lead-gen)';
// Endpoints that just failed sit out for a while so traffic moves to the healthy ones.
const benched = new Map();
// What each endpoint allows. Configured endpoints (official node, QuickNode, ...) get the full profile;
// the free fallbacks only take tiny batches and short eth_getLogs ranges.
const PROFILES = { 'https://robinhood.drpc.org': { batch: 3, logRange: 100n } };
const FULL = { batch: BATCH, logRange: 100000n };
const profile = url => PROFILES[url.replace(/\/+$/, '')] || FULL;
const free = list => list.filter(u => (benched.get(u) || 0) < Date.now());
// Configured endpoints first (round-robin); fallbacks only while all of those are benched.
function pickUrl() {
  const urls = free(config.rpcUrls);
  if (urls.length) return urls[urlIdx++ % urls.length];
  const fb = free(config.rpcFallbacks);
  if (fb.length) return fb[urlIdx++ % fb.length];
  return config.rpcUrls[urlIdx++ % config.rpcUrls.length];
}
const usingFallback = () => !free(config.rpcUrls).length && free(config.rpcFallbacks).length > 0;
export const rpcStats = {
  sent: 0, calls: 0, retries: 0, errors: 0, kinds: {},
  get rate() { return Math.round(rate * 10) / 10; },
  get fallback() { return usingFallback(); },
  get queued() { return lanes.urgent.length + lanes.high.length + lanes.low.length; },
  get active() { return active; }
};
const note = kind => { rpcStats.kinds[kind] = (rpcStats.kinds[kind] || 0) + 1; };

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class RpcError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

function refill() {
  const now = Date.now();
  tokens = Math.min(Math.max(1, rate), tokens + ((now - lastRefill) / 1000) * rate);
  lastRefill = now;
}

function nextBatch(size) {
  const lane = lanes.urgent.length ? lanes.urgent : lanes.high.length ? lanes.high : lanes.low;
  if (!lane.length) return null;
  // eth_getLogs responses can be large, so they travel alone.
  if (lane[0].method === 'eth_getLogs') return [lane.shift()];
  const out = [];
  for (let i = 0; i < lane.length && out.length < size;) {
    if (lane[i].method === 'eth_getLogs') { i++; continue; }
    out.push(lane.splice(i, 1)[0]);
  }
  return out;
}

let timer = null;
function pump() {
  refill();
  while (active < config.rpcConcurrency && tokens >= 1) {
    const url = pickUrl();
    const batch = nextBatch(profile(url).batch);
    if (!batch) return;
    tokens -= 1;
    active++;
    sendBatch(batch, url).finally(() => { active--; pump(); });
  }
  if ((lanes.urgent.length || lanes.high.length || lanes.low.length) && !timer) {
    timer = setTimeout(() => { timer = null; pump(); }, Math.ceil(1000 / rate));
  }
}

function throttled() {
  const now = Date.now();
  if (now - lastThrottle > 1000) rate = Math.max(1, rate * 0.6);
  lastThrottle = now;
}
function recovered() {
  if (Date.now() - lastThrottle > 5000) rate = Math.min(config.rpcRps, rate + 0.25);
}

// Live requests give up after a few tries; background backfill work just waits and tries again.
function retry(job, delay) {
  job.attempt = (job.attempt || 0) + 1;
  if (!job.low && job.attempt > 8) { rpcStats.errors++; job.reject(new RpcError('RPC unavailable', 'RETRY')); return; }
  rpcStats.retries++;
  const wait = Math.min(job.low ? 30000 : 15000, delay * 2 ** Math.min(job.attempt - 1, 6)) + Math.random() * 500;
  setTimeout(() => { laneFor(job).unshift(job); pump(); }, wait);
}

async function sendBatch(batch, url) {
  // A log query wider than this endpoint allows goes back to getLogs(), which splits it.
  const { logRange } = profile(url);
  if (batch[0].method === 'eth_getLogs') {
    const f = batch[0].params[0];
    if (BigInt(f.toBlock) - BigInt(f.fromBlock) + 1n > logRange) {
      const e = new RpcError('range too wide for ' + url, 'RANGE');
      e.limit = logRange;
      batch[0].reject(e);
      return;
    }
  }
  rpcStats.sent++;
  rpcStats.calls += batch.length;
  const ids = batch.map(() => ++reqId);
  const payload = batch.map((j, i) => ({ jsonrpc: '2.0', id: ids[i], method: j.method, params: j.params }));
  let body;
  try {
    const res = await fetch(url, {
      method: 'POST',
      // The public endpoint's firewall rejects unknown clients (Node's default user agent gets 403s from datacenter IPs).
      headers: { 'content-type': 'application/json', 'user-agent': UA, accept: 'application/json' },
      body: JSON.stringify(batch.length === 1 ? payload[0] : payload),
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) throw new RpcError('HTTP ' + res.status, res.status);
    body = await res.json();
  } catch (e) {
    note(e.code ? 'http ' + e.code : e.name === 'TimeoutError' ? 'timeout' : e instanceof SyntaxError ? 'bad json' : 'network: ' + (e.cause?.code || e.message).slice(0, 40));
    // Any transport-level failure (429, 403, 5xx, timeouts, HTML error pages) means: slow down.
    throttled();
    // 401/403 is a block (the official node refuses many datacenter IPs), not a hiccup: sit out longer.
    if (config.rpcUrls.length + config.rpcFallbacks.length > 1) benched.set(url, Date.now() + (e.code === 403 || e.code === 401 ? 600e3 : 15e3));
    batch.forEach(j => retry(j, 500));
    return;
  }
  const byId = new Map((Array.isArray(body) ? body : [body]).map(r => [r.id, r]));
  let limited = false;
  batch.forEach((job, i) => {
    const r = byId.get(ids[i]);
    if (!r) { note('missing in batch'); limited = true; return retry(job, 500); }
    if (r.error) {
      if (r.error.code === 429 || /rate|too many requests|capacity|limit exceeded/i.test(r.error.message || '')) { note('rpc ' + r.error.code); limited = true; return retry(job, 800); }
      // Deterministic errors (bad params, ranges, reverts) are not retried.
      return job.reject(new RpcError(r.error.message || 'rpc error', r.error.code));
    }
    job.resolve(r.result);
  });
  if (limited) throttled(); else recovered();
}

// low=true for background work (historical backfill) so live scoring is never starved.
const laneFor = job => (job.low ? lanes.low : job.urgent ? lanes.urgent : lanes.high);

export function rpc(method, params = [], low = false) {
  return new Promise((resolve, reject) => {
    const job = { method, params, resolve, reject, low, urgent: !low && ctx.getStore()?.urgent === true };
    laneFor(job).push(job);
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
// On a short-range fallback endpoint, queries needing more pieces than this fail fast instead of crawling.
const MAX_PIECES = 60n;

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
    if (e.code === 'RANGE') {
      if (opts.noSplit || (to - from + 1n) > e.limit * MAX_PIECES) throw new RpcError('range too wide for the fallback RPC', 'LIMIT');
      // Pieces go out together; the request queue still enforces the rate and concurrency limits.
      const pieces = [];
      for (let s = from; s <= to; s += e.limit) pieces.push(getLogs(filter, s, s + e.limit - 1n < to ? s + e.limit - 1n : to, opts));
      const out = (await Promise.all(pieces)).flat();
      if (out.length > maxLogs) throw new RpcError('too many logs', 'LIMIT');
      return out;
    }
    const allowed = /only (\d+) are allowed/.exec(e.message);
    if (allowed && to > from) {
      const step = BigInt(allowed[1]);
      const out = [];
      for (let s = from; s <= to; s += step) out.push(...await getLogs(filter, s, s + step - 1n < to ? s + step - 1n : to, opts));
      return out;
    }
    if (/exceeds limit|too many|response size|ranges? over|block range|range too/i.test(e.message) && to > from) {
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
