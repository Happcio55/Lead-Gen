// Live indexer for Uniswap v4 native-ETH pools on Robinhood Chain.
// Polls PoolManager logs (Initialize + Swap), keeps per-pool market state in memory and
// exposes compact board rows plus per-pool detail (candles + recent swaps).
import { createPublicClient, http, getAddress, parseAbi } from 'viem';
import { ADDR, ERC20_ABI, EVENTS, robinhood } from '../shared/chain.js';
import { ethPerToken, isTradable, virtualEthReserve } from '../shared/v4.js';
import { isMemecoin, parseLogo, parseSocials } from './meme.js';

const META_ABI = parseAbi([
  'function logo() view returns (string)',
  'function socials() view returns (string, string, string)',
]);

const MAX_RANGE = 10_000n; // provider cap on blocks per getLogs call
const MIN_RANGE = 50n;
const HISTORY_MS = 6 * 3600_000; // price points kept per pool
const MAX_POOLS = 2_500;
const FEED_MIN_ETH = 0.02; // buys at least this large show up in the feed
const FEED_LEN = 30;
const STALE_MS = 3 * 3600_000; // drop pools with no swaps for this long (unless pinned)

export class Indexer {
  constructor({ rpcUrl, backfillBlocks = 36_000n, pollMs = 1500, log = console } = {}) {
    // cacheTime 0: viem otherwise caches eth_blockNumber for 4s, which would throttle every poll.
    this.client = createPublicClient({ chain: robinhood, cacheTime: 0, transport: http(rpcUrl, { batch: true, retryCount: 3 }) });
    this.backfillBlocks = BigInt(backfillBlocks);
    this.pollMs = pollMs;
    this.log = log;
    this.pools = new Map(); // id -> pool state
    this.tokens = new Map(); // address -> metadata | null (null = unreadable)
    this.cursor = null; // last fully processed block
    this.range = 2_000n; // adaptive getLogs window
    this.head = null;
    this.blockTimes = new Map(); // block number -> ms timestamp (sparse cache)
    this.ethUsd = 0;
    this.gasGwei = 0;
    this.status = { synced: false, lastPollAt: 0, lag: 0, errors: 0 };
    this.listeners = new Set();
    this.pinned = new Set();
    this.feed = []; // recent sizeable buys across all pools, newest first
    this.feedPending = [];
    this.ready = null;
    this.polling = null;
    this.pricesAt = 0;
    this.extAt = 0;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(evt) {
    for (const fn of this.listeners) fn(evt);
  }

  // Long-running mode (local `npm start`): backfill once, then poll forever in the background.
  async start() {
    await this.init({ maxAttempts: Infinity });
    setInterval(() => this.refreshEthUsd(), 60_000).unref();
    setInterval(() => this.refreshGas(), 15_000).unref();
    setInterval(() => this.refreshExternalMeta(), 60_000).unref();
    this.refreshExternalMeta();
    this.loop();
  }

  // Backfill the recent window. Progress lives in this.cursor, so a retry resumes where it failed.
  async init({ maxAttempts = 3 } = {}) {
    await Promise.all([this.refreshEthUsd(), this.refreshGas()]);
    this.head = await this.client.getBlockNumber();
    this.cursor = this.head - this.backfillBlocks;
    this.log.info?.(`[indexer] backfilling ${this.backfillBlocks} blocks from ${this.cursor}`);
    for (let attempt = 1; ; attempt++) {
      try {
        await this.catchUp();
        break;
      } catch (e) {
        this.log.warn?.(`[indexer] backfill error (attempt ${attempt}): ${describe(e)}`);
        if (attempt >= maxAttempts) throw e;
        await sleep(Math.min(15_000, 1000 * attempt));
      }
    }
    this.status.synced = true;
    this.status.lastPollAt = Date.now();
    this.log.info?.(`[indexer] synced: ${this.pools.size} ETH pools tracked`);
  }

  // Serverless mode (Vercel): no background work. Each request brings the index up to date,
  // and concurrent requests share the same in-flight work.
  async ensureFresh() {
    if (!this.ready) {
      this.ready = this.init().catch((e) => {
        this.ready = null; // let the next request try again
        throw e;
      });
    }
    await this.ready;
    const now = Date.now();
    const chores = [];
    if (now - this.status.lastPollAt >= this.pollMs) {
      this.polling ??= this.catchUp()
        .then(() => (this.status.lastPollAt = Date.now()))
        .catch((e) => {
          this.status.errors++;
          this.log.warn?.(`[indexer] poll failed: ${describe(e)}`);
        })
        .finally(() => (this.polling = null));
      chores.push(this.polling);
    }
    if (now - this.extAt > 60_000) {
      this.extAt = now;
      chores.push(this.refreshExternalMeta());
    }
    if (now - this.pricesAt > 60_000) {
      this.pricesAt = now;
      chores.push(this.refreshEthUsd(), this.refreshGas());
    }
    await Promise.all(chores);
  }

  async loop() {
    for (;;) {
      try {
        await this.catchUp();
        this.status.lastPollAt = Date.now();
      } catch (e) {
        this.status.errors++;
        this.log.warn?.(`[indexer] poll failed: ${describe(e)}`);
        await sleep(3000);
      }
      await sleep(this.pollMs);
    }
  }

  async catchUp() {
    this.head = await this.client.getBlockNumber();
    // After a long idle (e.g. a sleeping serverless instance) skip ahead instead of replaying hours of blocks.
    if (this.head - this.cursor > this.backfillBlocks) this.cursor = this.head - this.backfillBlocks;
    while (this.cursor < this.head) {
      const from = this.cursor + 1n;
      const to = from + this.range - 1n < this.head ? from + this.range - 1n : this.head;
      let logs;
      try {
        logs = await this.client.getLogs({
          address: ADDR.POOL_MANAGER,
          events: [EVENTS.initialize, EVENTS.swap],
          fromBlock: from,
          toBlock: to,
        });
      } catch (e) {
        // The provider caps results per query (10k logs); busy stretches need smaller windows.
        if (/exceeds limit|too many|range/i.test(e.details || e.message) && this.range > MIN_RANGE) {
          this.range = this.range / 2n;
          continue;
        }
        throw e;
      }
      await this.ingest(logs, to);
      this.cursor = to;
      if (logs.length < 4000 && this.range < MAX_RANGE) this.range = this.range * 2n > MAX_RANGE ? MAX_RANGE : this.range * 2n;
    }
    this.status.lag = Number(this.head - this.cursor);
    this.prune();
  }

  // Block timestamps: fetch the range endpoints and interpolate (Robinhood Chain blocks are ~0.1s apart).
  async timeOf(blockNumber) {
    let t = this.blockTimes.get(blockNumber);
    if (t) return t;
    const b = await this.client.getBlock({ blockNumber });
    t = Number(b.timestamp) * 1000;
    this.blockTimes.set(blockNumber, t);
    if (this.blockTimes.size > 64) this.blockTimes.delete(this.blockTimes.keys().next().value);
    return t;
  }

  async ingest(logs, toBlock) {
    if (!logs.length) return;
    const first = logs[0].blockNumber;
    const [t0, t1] = await Promise.all([this.timeOf(first), this.timeOf(toBlock)]);
    const span = Number(toBlock - first) || 1;
    const timeAt = (bn) => Math.round(t0 + ((t1 - t0) * Number(bn - first)) / span);

    // Read metadata for every new token in this batch at once.
    const fresh = [];
    for (const l of logs) {
      if (l.eventName !== 'Initialize' || !isTradable(l.args)) continue;
      const token = getAddress(l.args.currency1);
      if (!this.tokens.has(token)) fresh.push(token);
    }
    if (fresh.length) await this.loadTokens([...new Set(fresh)]);

    const changed = [];
    for (const l of logs) {
      if (l.eventName === 'Initialize') {
        const p = this.onInitialize(l, timeAt(l.blockNumber));
        if (p) changed.push(p);
      } else {
        const p = this.onSwap(l, timeAt(l.blockNumber));
        if (p) changed.push(p);
      }
    }
    await this.resolveFeed();
    if (this.status.synced && changed.length) this.emit({ type: 'pools', ids: [...new Set(changed.map((p) => p.id))] });
  }

  async loadTokens(addresses) {
    const PER = 6; // name, symbol, decimals, totalSupply, logo, socials
    const calls = addresses.flatMap((address) => [
      ...['name', 'symbol', 'decimals', 'totalSupply'].map((functionName) => ({ address, abi: ERC20_ABI, functionName })),
      { address, abi: META_ABI, functionName: 'logo' },
      { address, abi: META_ABI, functionName: 'socials' },
    ]);
    for (let i = 0; i < calls.length; i += PER * 40) {
      const chunk = calls.slice(i, i + PER * 40);
      const res = await this.client.multicall({ contracts: chunk, allowFailure: true });
      for (let j = 0; j < res.length; j += PER) {
        const address = chunk[j].address;
        const [name, symbol, decimals, supply, logo, socials] = res.slice(j, j + PER);
        if (decimals.status !== 'success' || supply.status !== 'success') {
          this.tokens.set(address, null);
          continue;
        }
        const token = {
          address,
          name: clean(name.result) || 'Unknown',
          symbol: clean(symbol.result) || '???',
          decimals: Number(decimals.result),
          supply: Number(supply.result) / 10 ** Number(decimals.result),
          logo: logo.status === 'success' ? parseLogo(logo.result) : null,
          socials: socials.status === 'success' ? parseSocials(socials.result) : null,
        };
        token.meme = isMemecoin(token);
        this.tokens.set(address, token);
      }
    }
  }

  onInitialize(l, at) {
    const a = l.args;
    if (!isTradable(a)) return null;
    const token = this.tokens.get(getAddress(a.currency1));
    if (!token) return null;
    const pool = {
      id: a.id,
      currency0: a.currency0,
      currency1: getAddress(a.currency1),
      fee: Number(a.fee),
      tickSpacing: Number(a.tickSpacing),
      hooks: getAddress(a.hooks),
      token,
      createdAt: at,
      createdBlock: Number(l.blockNumber),
      txHash: l.transactionHash,
      sqrtPriceX96: a.sqrtPriceX96,
      liquidity: 0n,
      priceEth: ethPerToken(a.sqrtPriceX96, token.decimals),
      athEth: 0,
      buys: 0,
      sells: 0,
      volEth: 0,
      lastSwapAt: 0,
      history: [], // { t, p } price in ETH per token
      swaps: [], // recent swaps
      window: [], // swaps in the last hour, for 5m / 1h aggregates
    };
    pool.athEth = pool.priceEth;
    pool.history.push({ t: at, p: pool.priceEth });
    this.pools.set(pool.id, pool);
    return pool;
  }

  onSwap(l, at) {
    const pool = this.pools.get(l.args.id);
    if (!pool) return null;
    const { amount0, amount1, sqrtPriceX96, liquidity } = l.args;
    // Amounts are the swapper's balance deltas: paying ETH in (amount0 < 0) is a buy.
    const side = amount0 < 0n ? 'buy' : 'sell';
    const eth = Math.abs(Number(amount0)) / 1e18;
    const tokens = Math.abs(Number(amount1)) / 10 ** pool.token.decimals;
    pool.sqrtPriceX96 = sqrtPriceX96;
    pool.liquidity = liquidity;
    pool.priceEth = ethPerToken(sqrtPriceX96, pool.token.decimals);
    if (pool.priceEth > pool.athEth) pool.athEth = pool.priceEth;
    pool[side === 'buy' ? 'buys' : 'sells']++;
    pool.volEth += eth;
    pool.lastSwapAt = at;

    const last = pool.history[pool.history.length - 1];
    if (last && at - last.t < 1000) last.p = pool.priceEth;
    else pool.history.push({ t: at, p: pool.priceEth });
    const cutoff = at - HISTORY_MS;
    while (pool.history.length > 2 && pool.history[0].t < cutoff) pool.history.shift();

    const swap = { t: at, side, eth, tokens, priceEth: pool.priceEth, tx: l.transactionHash, block: Number(l.blockNumber) };
    pool.swaps.push(swap);
    if (pool.swaps.length > 80) pool.swaps.shift();
    pool.window.push(swap);
    if (side === 'buy' && eth >= FEED_MIN_ETH) {
      this.feedPending.push({ t: at, eth, tx: l.transactionHash, pool: pool.id, token: pool.token.address, symbol: pool.token.symbol });
      if (this.feedPending.length > FEED_LEN) this.feedPending.shift();
    }
    while (pool.window.length && pool.window[0].t < at - 3600_000) pool.window.shift();
    return pool;
  }

  // The Swap event's sender is the router, so the buyer comes from the transaction itself.
  async resolveFeed() {
    if (!this.feedPending.length) return;
    const batch = this.feedPending.splice(0).slice(-FEED_LEN);
    const txs = await Promise.all(batch.map((b) => this.client.getTransaction({ hash: b.tx }).catch(() => null)));
    const resolved = batch.map((b, i) => ({ ...b, buyer: txs[i]?.from || null })).reverse();
    this.feed = [...resolved, ...this.feed].slice(0, FEED_LEN);
  }

  prune() {
    const now = Date.now();
    for (const [id, p] of this.pools) {
      if (this.pinned.has(id)) continue;
      const last = p.lastSwapAt || p.createdAt;
      if (now - last > STALE_MS) this.pools.delete(id);
    }
    if (this.pools.size > MAX_POOLS) {
      const victims = [...this.pools.values()]
        .filter((p) => !this.pinned.has(p.id))
        .sort((a, b) => (a.lastSwapAt || a.createdAt) - (b.lastSwapAt || b.createdAt));
      for (const p of victims.slice(0, this.pools.size - MAX_POOLS)) this.pools.delete(p.id);
    }
  }

  async refreshEthUsd() {
    const sources = [
      async () => (await getJson('https://api.coinbase.com/v2/prices/ETH-USD/spot')).data.amount,
      async () => (await getJson('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')).ethereum.usd,
      async () => (await getJson('https://api.kraken.com/0/public/Ticker?pair=ETHUSD')).result.XETHZUSD.c[0],
    ];
    for (const src of sources) {
      try {
        const v = Number(await src());
        if (v > 0) {
          this.ethUsd = v;
          return;
        }
      } catch {
        // try next source
      }
    }
    if (!this.ethUsd) this.log.warn?.('[indexer] could not fetch ETH/USD; USD values will show as 0');
  }

  // Fallback artwork and links for tokens that carry none on-chain: DexScreener's public token
  // profiles (set by the projects themselves). Looked up in batches of 30, busiest pools first,
  // and retried every 10 minutes for tokens that still have nothing.
  async refreshExternalMeta(limit = 30) {
    const now = Date.now();
    const seen = new Set();
    const due = [];
    const pools = [...this.pools.values()].sort((a, b) => b.volEth - a.volEth);
    for (const p of pools) {
      const t = p.token;
      if (!t || seen.has(t.address)) continue;
      seen.add(t.address);
      if ((t.logo || t.extLogo) && t.socials) continue;
      if (t.extCheckedAt && now - t.extCheckedAt < 10 * 60_000) continue;
      due.push(t);
      if (due.length >= limit) break;
    }
    if (!due.length) return;
    for (const t of due) t.extCheckedAt = now;
    try {
      const url = `https://api.dexscreener.com/tokens/v1/robinhood/${due.map((t) => t.address).join(',')}`;
      const pairs = await getJson(url);
      for (const pair of Array.isArray(pairs) ? pairs : []) {
        const info = pair?.info;
        const addr = pair?.baseToken?.address;
        if (!info || !addr) continue;
        const t = this.tokens.get(getAddress(addr));
        if (!t) continue;
        if (!t.logo && !t.extLogo && info.imageUrl) t.extLogo = parseLogo(info.imageUrl);
        if (!t.socials) {
          const social = (type) => info.socials?.find((s) => s?.type === type)?.url;
          t.socials = parseSocials([social('twitter'), social('telegram'), info.websites?.[0]?.url]);
        }
      }
    } catch {
      // DexScreener is optional; try again on the next round
    }
  }

  async refreshGas() {
    try {
      this.gasGwei = Number(await this.client.getGasPrice()) / 1e9;
    } catch {
      // keep last value
    }
  }

  // ---- Views ----

  row(p, now = Date.now()) {
    const usd = this.ethUsd;
    let b5 = 0, s5 = 0, v5 = 0, v1h = 0;
    for (const s of p.window) {
      v1h += s.eth;
      if (s.t >= now - 300_000) {
        v5 += s.eth;
        if (s.side === 'buy') b5++;
        else s5++;
      }
    }
    const priceAgo = (ms) => {
      const target = now - ms;
      let ref = p.history[0]?.p;
      for (const h of p.history) {
        if (h.t > target) break;
        ref = h.p;
      }
      return ref;
    };
    const ch = (ref) => (ref ? (p.priceEth / ref - 1) * 100 : 0);
    const liqEth = p.liquidity ? virtualEthReserve(p.liquidity, p.sqrtPriceX96) * 2 : 0;
    const spark = sample(p.history, 30, now - 3600_000).map((v) => Number(v.toPrecision(4)));
    return {
      id: p.id,
      token: p.token.address,
      logo: p.token.logo || p.token.extLogo ? `/api/logo/${p.token.address}` : null,
      socials: p.token.socials,
      meme: p.token.meme,
      symbol: p.token.symbol,
      name: p.token.name,
      decimals: p.token.decimals,
      fee: p.fee,
      tickSpacing: p.tickSpacing,
      hooks: p.hooks,
      currency0: p.currency0,
      currency1: p.currency1,
      createdAt: p.createdAt,
      creationTx: p.txHash,
      lastSwapAt: p.lastSwapAt,
      priceEth: p.priceEth,
      priceUsd: p.priceEth * usd,
      mcapUsd: p.priceEth * p.token.supply * usd,
      athUsd: p.athEth * p.token.supply * usd,
      liqUsd: liqEth * usd,
      liqEth,
      buys: p.buys,
      sells: p.sells,
      buys5m: b5,
      sells5m: s5,
      vol5mUsd: v5 * usd,
      vol1hUsd: v1h * usd,
      volUsd: p.volEth * usd,
      ch5m: round(ch(priceAgo(300_000)), 1),
      ch1h: round(ch(priceAgo(3600_000)), 1),
      spark,
    };
  }

  board() {
    const now = Date.now();
    return [...this.pools.values()].map((p) => this.row(p, now));
  }

  detail(id, { bucketMs = 15_000 } = {}) {
    const p = this.pools.get(id);
    if (!p) return null;
    return {
      ...this.row(p),
      supply: p.token.supply,
      candles: candles(p.history, bucketMs),
      swaps: p.swaps.slice().reverse(),
    };
  }

  meta() {
    return {
      ethUsd: this.ethUsd,
      gasGwei: round(this.gasGwei, 4),
      head: this.head ? Number(this.head) : null,
      cursor: this.cursor ? Number(this.cursor) : null,
      pools: this.pools.size,
      ...this.status,
    };
  }
}

// ---- helpers ----

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const describe = (e) => [e.shortMessage || e.message, e.details].filter(Boolean).join(' — ').slice(0, 300);
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

function clean(s) {
  if (typeof s !== 'string') return '';
  // strip control chars / zero-width tricks and cap length
  return s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, 40);
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

// Evenly sample a price series from `since` (carrying the last known value forward).
export function sample(history, n, since) {
  if (!history.length) return [];
  const now = Math.max(history[history.length - 1].t, since + 1);
  const step = (now - since) / (n - 1);
  const out = [];
  let i = 0;
  let last = history[0].p;
  for (let k = 0; k < n; k++) {
    const t = since + k * step;
    while (i < history.length && history[i].t <= t) last = history[i++].p;
    out.push(last);
  }
  return out;
}

export function candles(history, bucketMs) {
  const out = [];
  let cur = null;
  for (const h of history) {
    const b = Math.floor(h.t / bucketMs) * bucketMs;
    if (!cur || cur.t !== b) {
      const open = cur ? cur.c : h.p;
      cur = { t: b, o: open, h: Math.max(open, h.p), l: Math.min(open, h.p), c: h.p, n: 0 };
      out.push(cur);
    }
    cur.h = Math.max(cur.h, h.p);
    cur.l = Math.min(cur.l, h.p);
    cur.c = h.p;
    cur.n++;
  }
  return out.slice(-400);
}
