// Market data from DexScreener (free API, ~300 req/min). Robinhood Chain's id there is "robinhood".
import { config } from './config.js';

let last = 0;
const GAP = 260; // ms between calls keeps us well under the rate limit

async function get(path) {
  const wait = last + GAP - Date.now();
  last = Math.max(Date.now(), last + GAP);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  const res = await fetch(config.dexscreenerApi + path, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('dexscreener HTTP ' + res.status);
  return res.json();
}

function summarize(address, pairs) {
  const mine = pairs.filter(p => p.chainId === 'robinhood' &&
    (p.baseToken?.address?.toLowerCase() === address || p.quoteToken?.address?.toLowerCase() === address));
  if (!mine.length) return { listed: false, fetchedAt: Date.now() };
  mine.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  const p = mine[0];
  const isBase = p.baseToken.address.toLowerCase() === address;
  const sum = (k, f) => mine.reduce((s, x) => s + (f(x) || 0), 0);
  return {
    listed: true,
    fetchedAt: Date.now(),
    dex: p.dexId,
    pair: p.pairAddress,
    url: p.url,
    priceUsd: isBase ? Number(p.priceUsd) || null : null,
    liquidityUsd: sum('liq', x => x.liquidity?.usd),
    vol24: sum('vol', x => x.volume?.h24),
    vol1h: sum('vol1', x => x.volume?.h1),
    buys24: sum('b', x => x.txns?.h24?.buys),
    sells24: sum('s', x => x.txns?.h24?.sells),
    change5m: isBase ? p.priceChange?.m5 ?? null : null,
    change1h: isBase ? p.priceChange?.h1 ?? null : null,
    change6h: isBase ? p.priceChange?.h6 ?? null : null,
    change24: isBase ? p.priceChange?.h24 ?? null : null,
    fdv: p.fdv ?? null,
    marketCap: p.marketCap ?? null,
    pairCreatedAt: mine.reduce((m, x) => Math.min(m, x.pairCreatedAt || Infinity), Infinity),
    image: p.info?.imageUrl || null
  };
}

// Returns { [address]: summary } for up to 30 addresses per request.
export async function fetchMarkets(addresses) {
  const out = {};
  for (let i = 0; i < addresses.length; i += 30) {
    const batch = addresses.slice(i, i + 30);
    let pairs = [];
    try {
      pairs = await get('/tokens/v1/robinhood/' + batch.join(','));
    } catch (e) {
      console.warn('[market]', e.message);
      continue;
    }
    for (const a of batch) out[a] = summarize(a, Array.isArray(pairs) ? pairs : []);
  }
  return out;
}

export async function fetchMarket(address) {
  return (await fetchMarkets([address]))[address] || { listed: false, fetchedAt: Date.now() };
}
