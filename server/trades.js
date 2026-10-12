// Trade history and candles built straight from Robinhood Chain logs: launch-curve buy/sell events,
// Uniswap V3 pool swaps and Uniswap V4 PoolManager swaps. No third-party chart feed, so new launches
// still on their curve get a live chart too.
import { keccak256, toHex } from 'viem';
import { getLogs, client, topicToAddr } from './rpc.js';
import { poolInfo } from './uniswap.js';
import { poolKey } from './uniswap4.js';
import { fetchMarket } from './market.js';
import { chain } from './indexer.js';
import { db } from './store.js';
import { config, ADDR, TOPIC } from './config.js';

const CURVE_BUY = '0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455';  // (buyer, recipient) ethIn, tokensOut, fee, fee
const CURVE_SELL = '0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df'; // (seller, recipient) tokensIn, ethOut, fee, fee
const V3_SWAP = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const V4_SWAP = keccak256(toHex('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)'));
const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
const ETH = '0x0000000000000000000000000000000000000000';
const WINDOW_HOURS = 24;
const MAX_TRADES = 6000;

const books = new Map(); // token -> { sources, lastBlock, trades, at }

const word = (data, i) => BigInt('0x' + data.slice(2 + i * 64, 2 + (i + 1) * 64));
const signed = (v, bits) => (v >= 1n << BigInt(bits - 1) ? v - (1n << BigInt(bits)) : v);
const int = (data, i, bits = 256) => signed(word(data, i) & ((1n << BigInt(bits)) - 1n), bits);
const abs = v => (v < 0n ? -v : v);

let ethUsd = { at: 0, v: null };
async function ethPrice() {
  if (Date.now() - ethUsd.at < 60e3 && ethUsd.v) return ethUsd.v;
  const m = await fetchMarket(ADDR.WETH).catch(() => null);
  if (m?.priceUsd) ethUsd = { at: Date.now(), v: m.priceUsd };
  return ethUsd.v;
}

// Where does this token trade? Curve (found via its first mint), Uniswap V3 pools and V4 pools paired with ETH.
async function discover(token, t) {
  const sources = { curve: null, v3: [], v4: [] };
  const created = t?.createdBlock ? BigInt(t.createdBlock) : null;
  if (created) {
    const mints = await getLogs({ address: token, topics: [TOPIC.TRANSFER, TOPIC.ZERO32] }, created, created + 50n).catch(() => []);
    const candidates = new Set(mints.filter(l => l.topics.length === 3).map(l => topicToAddr(l.topics[2])));
    if (t.factory) candidates.add(t.factory);
    for (const c of candidates) {
      const ev = await getLogs({ address: c, topics: [[CURVE_BUY, CURVE_SELL]] }, created, created + 99999n, { noSplit: true }).catch(() => []);
      if (ev.length) { sources.curve = c; break; }
    }
  }
  const pairs = await fetch(`${config.dexscreenerApi}/token-pairs/v1/robinhood/${token}`, { signal: AbortSignal.timeout(15000) })
    .then(r => r.json()).catch(() => []);
  for (const p of (Array.isArray(pairs) ? pairs : []).filter(p => p.dexId === 'uniswap').sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)).slice(0, 4)) {
    const labels = p.labels || [];
    if (labels.includes('v3')) {
      const info = await poolInfo(p.pairAddress).catch(() => null);
      if (info && (info.token0 === ADDR.WETH || info.token1 === ADDR.WETH)) sources.v3.push({ pool: p.pairAddress.toLowerCase(), wethIs0: info.token0 === ADDR.WETH });
    } else if (labels.includes('v4')) {
      const key = await poolKey(p.pairAddress, p.pairCreatedAt).catch(() => null);
      if (key && key.currency0 === ETH && key.currency1 === token) sources.v4.push({ id: p.pairAddress.toLowerCase() });
    }
  }
  return sources;
}

function decodeTrades(logs, sources, dec) {
  const scale = 10 ** (18 - dec); // price in ETH per whole token
  const out = [];
  for (const l of logs) {
    const block = Number(BigInt(l.blockNumber));
    const base = { block, tx: l.transactionHash, idx: Number(BigInt(l.logIndex)) };
    let eth, tok, buy, trader = null;
    if (l.topics[0] === CURVE_BUY) {
      tok = word(l.data, 1); eth = word(l.data, 0) - word(l.data, 2) - word(l.data, 3); buy = true; trader = topicToAddr(l.topics[2]);
    } else if (l.topics[0] === CURVE_SELL) {
      tok = word(l.data, 0); eth = word(l.data, 1) + word(l.data, 2) + word(l.data, 3); buy = false; trader = topicToAddr(l.topics[2]);
    } else if (l.topics[0] === V3_SWAP) {
      const s = sources.v3.find(x => x.pool === l.address.toLowerCase());
      if (!s) continue;
      const a0 = int(l.data, 0), a1 = int(l.data, 1);
      const e = s.wethIs0 ? a0 : a1, k = s.wethIs0 ? a1 : a0;
      eth = abs(e); tok = abs(k); buy = e > 0n; trader = topicToAddr(l.topics[2]);
    } else if (l.topics[0] === V4_SWAP) {
      const a0 = int(l.data, 0, 128), a1 = int(l.data, 1, 128); // swapper's deltas: negative = paid in
      eth = abs(a0); tok = abs(a1); buy = a0 < 0n;
    } else continue;
    if (!tok || !eth) continue;
    out.push({ ...base, buy, eth: Number(eth) / 1e18, tokens: Number(tok) / 10 ** dec, price: (Number(eth) / Number(tok)) * scale, trader });
  }
  return out;
}

async function fetchRange(sources, from, to) {
  const jobs = [];
  if (sources.curve) jobs.push(getLogs({ address: sources.curve, topics: [[CURVE_BUY, CURVE_SELL]] }, from, to));
  for (const p of sources.v3) jobs.push(getLogs({ address: p.pool, topics: [V3_SWAP] }, from, to));
  if (sources.v4.length) jobs.push(getLogs({ address: POOL_MANAGER, topics: [V4_SWAP, sources.v4.map(p => p.id)] }, from, to));
  return (await Promise.all(jobs)).flat();
}

export async function getBook(token) {
  token = token.toLowerCase();
  const t = db.tokens[token];
  const stock = db.stocks[token];
  const dec = t?.decimals ?? stock?.decimals ?? 18;
  const tip = BigInt(chain.tip || await client.getBlockNumber());
  let b = books.get(token);
  if (!b || Date.now() - b.discoveredAt > 15 * 60e3) {
    const sources = await discover(token, t);
    const horizon = tip - BigInt(Math.round(WINDOW_HOURS * 3600e3 / (chain.blockMs || 100)));
    const start = t?.createdBlock && BigInt(t.createdBlock) > horizon ? BigInt(t.createdBlock) : horizon;
    b = { sources, lastBlock: b?.lastBlock ?? start - 1n, trades: b?.trades ?? [], discoveredAt: Date.now() };
    books.set(token, b);
    if (books.size > 300) books.delete(books.keys().next().value);
  }
  if (tip > b.lastBlock) {
    const logs = await fetchRange(b.sources, b.lastBlock + 1n, tip);
    const fresh = decodeTrades(logs, b.sources, dec);
    b.trades = b.trades.concat(fresh).sort((x, y) => x.block - y.block || x.idx - y.idx).slice(-MAX_TRADES);
    b.lastBlock = tip;
  }
  return b;
}

// Block -> unix seconds, interpolated from the tip (blocks are ~100 ms and steady on Robinhood Chain).
const blockTime = (block, tip, now) => Math.floor((now - (tip - block) * (chain.blockMs || 100)) / 1000);

export async function chartData(token, tfSec = 60) {
  const b = await getBook(token);
  const usd = await ethPrice();
  const tip = Number(b.lastBlock), now = Date.now();
  const candles = [];
  let cur = null;
  for (const tr of b.trades) {
    const time = blockTime(tr.block, tip, now);
    const bucket = time - (time % tfSec);
    const p = usd ? tr.price * usd : tr.price;
    if (!cur || cur.time !== bucket) {
      const open = cur ? cur.close : p;
      cur = { time: bucket, open, high: Math.max(open, p), low: Math.min(open, p), close: p, volume: 0 };
      candles.push(cur);
    } else {
      cur.high = Math.max(cur.high, p); cur.low = Math.min(cur.low, p); cur.close = p;
    }
    cur.volume += usd ? tr.eth * usd : tr.eth;
  }
  const meta = db.tokens[token.toLowerCase()] || db.stocks[token.toLowerCase()];
  const dec = meta?.decimals ?? 18;
  const supply = meta?.totalSupply ? Number(BigInt(meta.totalSupply)) / 10 ** dec : null;
  const recent = b.trades.slice(-40).reverse().map(tr => ({
    time: blockTime(tr.block, tip, now), buy: tr.buy, tokens: tr.tokens, eth: tr.eth,
    usd: usd ? tr.eth * usd : null, priceUsd: usd ? tr.price * usd : null, trader: tr.trader, tx: tr.tx
  }));
  return {
    unit: usd ? 'usd' : 'eth', ethUsd: usd, supply, candles, trades: recent,
    sources: { curve: Boolean(b.sources.curve), v3: b.sources.v3.length, v4: b.sources.v4.length }
  };
}
