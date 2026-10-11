// Follows Robinhood Chain block by block and records every new ERC-20 launch and stock token it sees.
//
// A launch is detected from its first mint (Transfer from 0x0). The public node has no traces or
// historical state, so "new" is decided by checking that the token emitted no Transfer events in the
// 100k blocks (~3 hours) before that mint.
import { EventEmitter } from 'node:events';
import { rpc, getLogs, client } from './rpc.js';
import { getMetadata } from './erc20.js';
import { db, save } from './store.js';
import { config, ADDR, TOPIC, SEED_STOCKS } from './config.js';

export const events = new EventEmitter();
export const chain = { tip: 0, blockMs: null, startedAt: Date.now() };

const LIVE_CHUNK = 3000n;
const LOOKBACK = 100000n;
const skip = new Set([ADDR.WETH, ADDR.USDG]);
const pending = new Set();
const blockTimes = new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function blockTime(n, low = false) {
  n = BigInt(n);
  if (blockTimes.has(n)) return blockTimes.get(n);
  const b = await rpc('eth_getBlockByNumber', ['0x' + n.toString(16), false], low);
  const ts = Number(BigInt(b.timestamp)) * 1000;
  if (blockTimes.size > 5000) blockTimes.clear();
  blockTimes.set(n, ts);
  return ts;
}

async function classify(address, log, low) {
  if (pending.has(address)) return;
  pending.add(address);
  try {
    const block = BigInt(log.blockNumber);
    let prior;
    try {
      prior = await getLogs({ address, topics: [TOPIC.TRANSFER] }, block > LOOKBACK ? block - LOOKBACK : 0n, block - 1n, { noSplit: true, low });
    } catch (e) {
      if (e.code === 'LIMIT') { db.oldTokens[address] = 1; return; }
      throw e;
    }
    if (prior.length) { db.oldTokens[address] = 1; return; }
    if (db.stocks[address]) return;

    const meta = await getMetadata(address).catch(() => null);
    // Not an ERC-20, or a machine-generated market token (e.g. "PRD-df5052bd" prediction-market legs).
    if (!meta || /-[0-9a-f]{6,}$/i.test(meta.symbol)) { db.oldTokens[address] = 1; return; }
    const [tx, createdAt] = await Promise.all([
      rpc('eth_getTransactionByHash', [log.transactionHash], low),
      blockTime(block, low)
    ]);
    const record = {
      address,
      ...meta,
      creator: tx?.from?.toLowerCase() || null,
      factory: tx?.to?.toLowerCase() || null,
      createdBlock: Number(block),
      createdAt,
      txHash: log.transactionHash,
      score: null,
      market: null
    };
    db.tokens[address] = record;
    events.emit('token', record);
  } catch (e) {
    console.warn('[indexer] classify failed', address, e.message);
  } finally {
    pending.delete(address);
  }
}

async function processRange(from, to, low = false) {
  const logs = await getLogs({ topics: [TOPIC.TRANSFER, TOPIC.ZERO32] }, from, to, { low });
  const first = new Map();
  for (const l of logs) {
    if (l.topics.length !== 3 || l.removed) continue; // 4 topics = NFT
    const a = l.address.toLowerCase();
    if (skip.has(a) || db.tokens[a] || db.oldTokens[a] || db.stocks[a] || first.has(a)) continue;
    first.set(a, l);
  }
  await Promise.all([...first].map(([a, l]) => classify(a, l, low)));
}

async function scanStocks(from, to) {
  const logs = await getLogs({ topics: [TOPIC.SCALED] }, from, to, { low: true });
  const found = new Set(logs.map(l => l.address.toLowerCase()));
  await addStocks([...found].filter(a => !db.stocks[a]));
}

async function addStocks(list) {
  for (const a of list) {
    const meta = await getMetadata(a).catch(() => null);
    if (!meta) continue;
    db.stocks[a] = { address: a, name: meta.name, symbol: meta.symbol, decimals: meta.decimals };
    delete db.tokens[a];
    db.oldTokens[a] = 1;
  }
}

async function measureBlockTime() {
  const tip = BigInt(chain.tip);
  const span = 6000n;
  const [a, b] = await Promise.all([blockTime(tip - span), blockTime(tip)]);
  chain.blockMs = Math.round(((b - a) / Number(span)) * 10) / 10;
}

async function liveLoop() {
  for (;;) {
    try {
      const tip = await client.getBlockNumber();
      chain.tip = Number(tip);
      let cursor = BigInt(db.cursor);
      while (cursor < tip) {
        const end = cursor + LIVE_CHUNK < tip ? cursor + LIVE_CHUNK : tip;
        await processRange(cursor + 1n, end);
        cursor = end;
        db.cursor = Number(cursor);
      }
    } catch (e) {
      console.warn('[indexer] live loop error:', e.message);
      await sleep(3000);
    }
    await sleep(1500);
  }
}

async function backfillLoop() {
  // Work through queued historical segments oldest-first, one chunk at a time.
  for (;;) {
    const seg = db.backfill && db.backfill[0];
    if (!seg) { await sleep(10000); continue; }
    try {
      const from = BigInt(seg.next), to = BigInt(seg.to);
      if (from > to) { db.backfill.shift(); save(); continue; }
      const end = from + LIVE_CHUNK - 1n < to ? from + LIVE_CHUNK - 1n : to;
      await processRange(from, end, true);
      seg.next = Number(end + 1n);
    } catch (e) {
      console.warn('[indexer] backfill error:', e.message);
      await sleep(5000);
    }
  }
}

async function stockLoop() {
  let cursor = null;
  for (;;) {
    try {
      const tip = BigInt(chain.tip);
      if (tip) {
        if (cursor == null) {
          // First run: look back over the backfill window in large steps.
          const back = BigInt(Math.round(config.backfillHours * 3600 * 1000 / (chain.blockMs || 100)));
          await scanStocks(tip > back ? tip - back : 0n, tip);
        } else if (tip > cursor) {
          await scanStocks(cursor + 1n, tip);
        }
        cursor = tip;
      }
    } catch (e) {
      console.warn('[indexer] stock scan error:', e.message);
    }
    await sleep(60000);
  }
}

export async function start() {
  const tip = await client.getBlockNumber();
  chain.tip = Number(tip);
  await measureBlockTime().catch(() => {});
  const perHour = BigInt(Math.round(3600 * 1000 / (chain.blockMs || 100)));
  const horizon = tip - perHour * BigInt(config.backfillHours);

  if (db.cursor == null) {
    db.cursor = Number(tip);
    db.backfill = [{ from: Number(horizon), next: Number(horizon), to: Number(tip) }];
  } else if (BigInt(db.cursor) < tip - LIVE_CHUNK * 20n) {
    // We were offline: queue the gap (bounded by the backfill horizon) and jump to the tip.
    const from = BigInt(db.cursor) + 1n > horizon ? BigInt(db.cursor) + 1n : horizon;
    db.backfill = db.backfill || [];
    db.backfill.push({ from: Number(from), next: Number(from), to: Number(tip) });
    db.cursor = Number(tip);
  }
  await addStocks(SEED_STOCKS.filter(a => !db.stocks[a]));

  liveLoop();
  backfillLoop();
  stockLoop();
  setInterval(() => measureBlockTime().catch(() => {}), 60000);
}

export function backfillProgress() {
  const segs = db.backfill || [];
  if (!segs.length) return { done: true, progress: 1 };
  let total = 0, left = 0;
  for (const s of segs) { total += s.to - s.from + 1; left += Math.max(0, s.to - s.next + 1); }
  return { done: false, progress: total ? Math.round((1 - left / total) * 1000) / 1000 : 1 };
}
