// Kairo server: chain indexer + scorer + JSON API + static site.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db, load, save, prune } from './store.js';
import { start as startIndexer, events, chain, backfillProgress } from './indexer.js';
import { analyze, analyzeAddress, label } from './scorer.js';
import { fetchMarkets } from './market.js';
import { explain, aiEnabled } from './ai.js';
import * as relay from './relay.js';
import { buildRoute } from './route.js';
import { chartData } from './trades.js';
import { rpcStats } from './rpc.js';
import { getTrending, fillLogos, logoFor } from './gecko.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isAddr = a => /^0x[0-9a-f]{40}$/.test(a);

// ---------------- scoring queue ----------------
const queue = [];
const queued = new Set();
let running = 0;
const SCORE_CONCURRENCY = 3;

function enqueue(address, urgent = false) {
  if (queued.has(address)) return;
  queued.add(address);
  urgent ? queue.unshift(address) : queue.push(address);
  pumpScores();
}

function pumpScores() {
  while (running < SCORE_CONCURRENCY && queue.length) {
    const a = queue.shift();
    running++;
    scoreToken(a).finally(() => { running--; queued.delete(a); pumpScores(); });
  }
}

async function scoreToken(address) {
  const t = db.tokens[address];
  if (!t) return;
  try {
    const { score, market } = await analyze(t);
    t.score = score;
    if (market) t.market = market;
  } catch (e) {
    console.warn('[score]', t.symbol, address, e.message);
  }
}

events.on('token', t => enqueue(t.address, Date.now() - t.createdAt < 15 * 60e3));

function rescoreTick() {
  const now = Date.now();
  const due = Object.values(db.tokens)
    .filter(t => t.score && !queued.has(t.address))
    .filter(t => {
      const age = now - t.createdAt, since = now - t.score.scoredAt;
      return since > (age < 3600e3 ? 3 * 60e3 : age < 864e5 ? 20 * 60e3 : 3 * 3600e3);
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40);
  for (const t of due) enqueue(t.address);
}

async function marketTick() {
  const now = Date.now();
  const list = Object.values(db.tokens)
    .filter(t => now - t.createdAt < 3 * 864e5)
    .sort((a, b) => (a.market?.fetchedAt || 0) - (b.market?.fetchedAt || 0))
    .slice(0, 90);
  if (!list.length) return;
  const res = await fetchMarkets(list.map(t => t.address));
  for (const [a, m] of Object.entries(res)) if (db.tokens[a]) db.tokens[a].market = m;
}

// ---------------- serializers ----------------
function brief(t) {
  return {
    address: t.address,
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals,
    createdAt: t.createdAt,
    score: t.score?.score ?? null,
    label: t.score ? t.score.label || label(t.score.score) : null,
    topFlag: t.score?.flags?.[0] || null,
    priceUsd: t.market?.priceUsd ?? null,
    change24: t.market?.change24 ?? null,
    vol24: t.market?.vol24 ?? null,
    liquidityUsd: t.market?.liquidityUsd ?? null,
    marketCap: t.market?.marketCap ?? t.market?.fdv ?? null,
    listed: Boolean(t.market?.listed),
    image: t.market?.image || logoFor(t.address)
  };
}

// Keep the front page clean: names like these stay searchable but are never featured.
const BLOCKED = /\b(porn\w*|nsfw|xxx|sex\w*|nude\w*|cum|dick\w*|cock\w*|pussy|tits?|boob\w*|fuck\w*|shit\w*|nazi\w*|hitler|rape\w*|nigg\w*|fag\w*|retard\w*|kkk|pedo\w*|onlyfans)\b/i;
const clean = t => !BLOCKED.test(`${t.name} ${t.symbol}`);

async function full(t) {
  return {
    ...brief(t),
    decimals: t.decimals,
    totalSupply: t.totalSupply,
    creator: t.creator,
    createdBlock: t.createdBlock,
    knownCreation: t.knownCreation !== false,
    launch: t.score?.launch ?? null,
    marketScore: t.score?.market ?? null,
    flags: t.score?.flags || [],
    holders: t.score?.holders ?? null,
    top10Pct: t.score?.top10Pct ?? null,
    creatorHoldPct: t.score?.creatorHoldPct ?? null,
    sniperPct: t.score?.sniperPct ?? null,
    scoredAt: t.score?.scoredAt ?? null,
    market: t.market || null,
    explorer: `${config.explorer}/token/${t.address}`,
    ai: await explain(t)
  };
}

const adhoc = new Map(); // on-demand reports for tokens we don't track
const adhocPending = new Set();

async function scoreAdhoc(address) {
  const t = await analyzeAddress(address);
  if (!t) return null;
  const { score, market } = await analyze(t);
  Object.assign(t, { score, market });
  if (adhoc.size > 500) adhoc.delete(adhoc.keys().next().value);
  adhoc.set(address, t);
  return t;
}
// Score in the background; the feed shows the token right away and the score fills in.
function ensureScored(address) {
  if (db.tokens[address]?.score) return db.tokens[address];
  const a = adhoc.get(address);
  if ((!a || Date.now() - a.score.scoredAt > 15 * 60e3) && !adhocPending.has(address) && adhocPending.size < 3) {
    adhocPending.add(address);
    scoreAdhoc(address).catch(e => console.warn('[adhoc]', address, e.message)).finally(() => adhocPending.delete(address));
  }
  return a || null;
}

// GeckoTerminal trending, merged with our own scores where we have them.
async function trendingBriefs() {
  const list = (await getTrending()).filter(clean);
  return list.map(g => {
    const t = ensureScored(g.address);
    const b = t ? brief(t) : {};
    return { ...b, ...g, score: b.score ?? null, label: b.label ?? null, topFlag: b.topFlag ?? null, image: g.image || b.image || null };
  });
}

async function report(address) {
  if (db.stocks[address]) {
    const s = db.stocks[address];
    const m = (await fetchMarkets([address]))[address];
    return { stock: true, address, name: s.name, symbol: s.symbol, decimals: s.decimals, image: logoFor(address), market: m, explorer: `${config.explorer}/token/${address}` };
  }
  let t = db.tokens[address];
  if (t) {
    if (!t.score || Date.now() - t.score.scoredAt > 5 * 60e3) await scoreToken(address);
    return full(t);
  }
  const cached = adhoc.get(address);
  if (cached && Date.now() - cached.score.scoredAt < 10 * 60e3) return full(cached);
  t = await scoreAdhoc(address);
  return t ? full(t) : null;
}

function within24h() {
  const cutoff = Date.now() - 864e5;
  return Object.values(db.tokens).filter(t => t.createdAt >= cutoff);
}

// ---------------- HTTP ----------------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => { size += c.length; if (size > 65536) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname !== '/index.html' && !pathname.startsWith('/assets/')) return send(res, 404, { error: 'not found' });
  const file = path.join(ROOT, path.normalize(pathname));
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

const routes = {
  'GET /api/pulse': () => {
    const day = within24h();
    return {
      block: chain.tip,
      blockMs: chain.blockMs,
      tokens24h: day.length,
      flagged24h: day.filter(t => t.score && t.score.score < 4).length,
      scored24h: day.filter(t => t.score).length,
      stocks: Object.keys(db.stocks).length,
      backfill: backfillProgress(),
      ai: aiEnabled()
    };
  },
  'GET /api/feed': async (q) => {
    const tab = q.get('tab') || 'new';
    const limit = Math.min(50, Number(q.get('limit')) || 12);
    const minScore = Number(q.get('minScore')) || 0;
    if (tab === 'trending') {
      const items = (await trendingBriefs()).filter(t => (t.score ?? 10) >= minScore);
      return { tab, items: items.slice(0, limit) };
    }
    let list = Object.values(db.tokens).filter(t => t.score && t.score.score >= minScore && clean(t));
    if (tab === 'top') {
      // Rated launches that actually trade: real liquidity and volume, and old enough to judge.
      list = list.filter(t => t.market?.listed && (t.market.liquidityUsd || 0) >= 5000 && (t.market.vol24 || 0) >= 1000 &&
        Date.now() - t.createdAt > 15 * 60e3 && Date.now() - t.createdAt < 3 * 864e5)
        .sort((a, b) => b.score.score - a.score.score || (b.market.vol24 || 0) - (a.market.vol24 || 0));
    } else list.sort((a, b) => b.createdAt - a.createdAt);
    return { tab, items: list.slice(0, limit).map(brief) };
  },
  'GET /api/highlight': async () => {
    // The busiest trending token we've already scored, for the landing page's score showcase.
    const scored = (await trendingBriefs()).filter(t => t.score != null);
    const addr = scored[0]?.address;
    const pick = (addr && (db.tokens[addr] || adhoc.get(addr)))
      || within24h().filter(t => t.score && t.market?.listed && clean(t)).sort((a, b) => (b.market.vol24 || 0) - (a.market.vol24 || 0))[0];
    return pick ? full(pick) : null;
  },
  'GET /api/search': (q) => {
    const s = (q.get('q') || '').trim().toLowerCase();
    if (!s) return { items: [] };
    if (isAddr(s)) return { items: [{ address: s }] };
    const match = t => t.symbol.toLowerCase() === s ? 3 : t.symbol.toLowerCase().startsWith(s) ? 2 : t.name.toLowerCase().includes(s) ? 1 : 0;
    const stocks = Object.values(db.stocks).map(t => ({ t, m: match(t) + 1, stock: true }));
    const seen = new Set(Object.keys(db.tokens));
    const extra = [...adhoc.values()].filter(t => !seen.has(t.address));
    const launches = Object.values(db.tokens).concat(extra).map(t => ({ t, m: match(t) }));
    const items = stocks.concat(launches).filter(x => x.m > (x.stock ? 1 : 0))
      .sort((a, b) => b.m - a.m || (b.t.market?.vol24 || 0) - (a.t.market?.vol24 || 0)).slice(0, 8)
      .map(x => (x.stock ? { address: x.t.address, name: x.t.name, symbol: x.t.symbol, stock: true, image: logoFor(x.t.address) } : brief(x.t)));
    return { items };
  },
  'GET /api/stocks': async () => {
    const list = Object.values(db.stocks);
    const m = await cachedStockMarkets(list.map(s => s.address));
    return { items: list.map(s => ({ ...s, ...(m[s.address] || {}), image: logoFor(s.address) || m[s.address]?.image || null })).sort((a, b) => (b.vol24 || 0) - (a.vol24 || 0)) };
  },
  'GET /api/chains': async () => ({ origins: await relay.originChains(), destination: await relay.destinationChain() }),
  'GET /api/balance': async (q) => ({ balance: await relay.balance(q.get('chainId'), q.get('address'), q.get('token') || null) }),
  'POST /api/quote': async (q, body, res) => { const r = await relay.quote(body); send(res, r.status, r.body); },
  'GET /api/relay/status': async (q, body, res) => { const r = await relay.status(q.get('requestId') || ''); send(res, r.status, r.body); },
  'POST /api/relay/step': async (q, body, res) => { const r = await relay.postStep(body.endpoint, body.body); send(res, r.status, r.body); },
  // Best way to fill a buy/sell (Relay, launch curve or Uniswap) as a list of steps for the wallet to sign.
  'POST /api/route': async (q, body, res) => {
    const ok = a => /^0x[0-9a-fA-F]{40}$/.test(a || '');
    if (!ok(body.user) || !ok(body.token) || !/^\d+$/.test(String(body.amount || '')) || BigInt(body.amount) <= 0n) {
      return send(res, 400, { message: 'Invalid request' });
    }
    try {
      send(res, 200, await buildRoute(body));
    } catch (e) {
      send(res, 422, { message: /revert|execution reverted/i.test(e.message) ? 'The trade would fail at current prices' : e.message });
    }
  },
  'GET /api/health': () => ({ ok: true, tip: chain.tip, queue: queue.length, scoring: running, rpc: rpcStats, tokens: Object.keys(db.tokens).length })
};

let stockCache = { at: 0, data: {} };
async function cachedStockMarkets(addrs) {
  if (Date.now() - stockCache.at > 60e3) stockCache = { at: Date.now(), data: await fetchMarkets(addrs) };
  return stockCache.data;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const key = `${req.method} ${url.pathname}`;
  try {
    const chartMatch = /^\/api\/chart\/(0x[0-9a-fA-F]{40})$/.exec(url.pathname);
    if (req.method === 'GET' && chartMatch) {
      const tf = [1, 15, 60, 300, 900, 3600].includes(Number(url.searchParams.get('tf'))) ? Number(url.searchParams.get('tf')) : 60;
      return send(res, 200, await chartData(chartMatch[1].toLowerCase(), tf));
    }
    const tokenMatch = /^\/api\/token\/(0x[0-9a-fA-F]{40})$/.exec(url.pathname);
    if (req.method === 'GET' && tokenMatch) {
      const r = await report(tokenMatch[1].toLowerCase());
      return r ? send(res, 200, r) : send(res, 404, { error: 'Not an ERC-20 token on Robinhood Chain' });
    }
    const handler = routes[key];
    if (handler) {
      const body = req.method === 'POST' ? await readBody(req) : null;
      const out = await handler(url.searchParams, body, res);
      if (!res.headersSent) send(res, 200, out);
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url.pathname);
    send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.warn('[http]', key, e.message);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});

// ---------------- boot ----------------
load();
server.listen(config.port, () => console.log(`[kairo] http://localhost:${config.port}  (AI: ${aiEnabled() ? config.aiModel : 'rule-based'})`));
await startIndexer();
console.log(`[kairo] following Robinhood Chain from block ${chain.tip}, ${chain.blockMs} ms blocks`);

Object.values(db.tokens).filter(t => !t.score).sort((a, b) => b.createdAt - a.createdAt).forEach(t => enqueue(t.address));
setInterval(rescoreTick, 60e3);
// Logos: stocks first, then the newest launches that don't have one yet.
async function logoTick() {
  const want = Object.keys(db.stocks)
    .concat(Object.values(db.tokens).filter(t => !t.market?.image).sort((a, b) => b.createdAt - a.createdAt).map(t => t.address));
  await fillLogos(want);
}
setInterval(() => logoTick().catch(() => {}), 20e3);
getTrending().catch(() => {});
setInterval(() => marketTick().catch(e => console.warn('[market]', e.message)), 30e3);
setInterval(save, 30e3);
setInterval(prune, 3600e3);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(0); });
