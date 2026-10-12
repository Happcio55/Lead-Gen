// A wallet's holdings on Robinhood Chain with live USD values.
// Candidate tokens: stock tokens, trending tokens, recent launches we index, tokens the client tells us it
// traded, and anything the wallet received in the last few hours. Balances come from one multicall pass.
import { client, getLogs, topicToAddr } from './rpc.js';
import { erc20Abi, getMetadata } from './erc20.js';
import { fetchMarkets } from './market.js';
import { getTrending, logoFor } from './gecko.js';
import { chain } from './indexer.js';
import { db } from './store.js';
import { ADDR, TOPIC } from './config.js';

const RECENT_BLOCKS = 200000n; // ~6 hours of incoming transfers
const isAddr = a => /^0x[0-9a-f]{40}$/.test(a);
const cache = new Map(); // address -> { at, data }

async function recentlyReceived(owner) {
  const tip = BigInt(chain.tip || await client.getBlockNumber());
  const toTopic = '0x' + owner.slice(2).padStart(64, '0');
  const logs = await getLogs({ topics: [TOPIC.TRANSFER, null, toTopic] }, tip - RECENT_BLOCKS, tip).catch(() => []);
  return logs.filter(l => l.topics.length === 3).map(l => l.address.toLowerCase());
}

export async function portfolio(owner, extra = []) {
  owner = owner.toLowerCase();
  const hit = cache.get(owner);
  if (hit && Date.now() - hit.at < 20e3 && !extra.length) return hit.data;

  const trending = await getTrending().catch(() => []);
  const recentLaunches = Object.values(db.tokens)
    .filter(t => t.market?.listed && Date.now() - t.createdAt < 3 * 864e5)
    .sort((a, b) => (b.market.vol24 || 0) - (a.market.vol24 || 0)).slice(0, 300).map(t => t.address);
  const received = await recentlyReceived(owner);
  const candidates = [...new Set([
    ...Object.keys(db.stocks), ...trending.map(t => t.address), ...recentLaunches, ...received,
    ...extra.map(a => String(a).toLowerCase()).filter(isAddr)
  ])].filter(a => a !== ADDR.ZERO);

  const [ethWei, ...balances] = await Promise.all([
    client.getBalance({ address: owner }),
    ...chunk(candidates, 150).map(part => part.length === 0 ? Promise.resolve([]) : client.multicall({
      contracts: part.map(address => ({ address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })),
      allowFailure: true
    }))
  ]);
  const held = [];
  const flat = balances.flat();
  candidates.forEach((a, i) => {
    const r = flat[i];
    if (r?.status === 'success' && r.result > 0n) held.push({ address: a, raw: r.result });
  });

  const markets = held.length ? await fetchMarkets(held.map(h => h.address)) : {};
  const trendingBy = new Map(trending.map(t => [t.address, t]));
  const weth = (await fetchMarkets([ADDR.WETH]))[ADDR.WETH];
  const ethUsd = weth?.priceUsd || null;

  const items = [];
  for (const h of held) {
    const meta = db.tokens[h.address] || db.stocks[h.address] || trendingBy.get(h.address) || await getMetadata(h.address).catch(() => null);
    if (!meta) continue;
    const decimals = meta.decimals ?? 18;
    const amount = Number(h.raw) / 10 ** decimals;
    const m = markets[h.address] || {};
    const priceUsd = m.priceUsd ?? trendingBy.get(h.address)?.priceUsd ?? null;
    items.push({
      address: h.address,
      name: meta.name,
      symbol: meta.symbol,
      decimals,
      balance: h.raw.toString(),
      amount,
      priceUsd,
      valueUsd: priceUsd != null ? amount * priceUsd : null,
      change24: m.change24 ?? trendingBy.get(h.address)?.change24 ?? null,
      image: m.image || logoFor(h.address) || trendingBy.get(h.address)?.image || null,
      stock: Boolean(db.stocks[h.address]),
      score: db.tokens[h.address]?.score?.score ?? null
    });
  }
  items.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));
  const eth = Number(ethWei) / 1e18;
  const data = {
    address: owner,
    eth: { amount: eth, valueUsd: ethUsd ? eth * ethUsd : null },
    ethUsd,
    totalUsd: items.reduce((s, t) => s + (t.valueUsd || 0), 0) + (ethUsd ? eth * ethUsd : 0),
    items,
    scanned: candidates.length
  };
  cache.set(owner, { at: Date.now(), data });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return data;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [[]];
}
