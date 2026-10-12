// Robinhood Chain launches from GeckoTerminal: new and trending pools on every DEX on the chain
// (Pons launches, Uniswap v2/v3/v4), so the board shows what is actually being launched, not only
// the Uniswap v4 pools our own indexer reads. Free API, ~30 calls/min per IP: everything is cached.
import { getAddress, isAddress } from 'viem';

const GT = 'https://api.geckoterminal.com/api/v2';
const NET = 'robinhood';
const BOARD_TTL = 30_000;
const DETAIL_TTL = 20_000;
const MIN_LIQ_USD = 500;
const NO_HOOK = '0x0000000000000000000000000000000000000000';

const DEX_NAMES = {
  'pons-v2': 'Pons',
  'pons-dot-family': 'Pons',
  'pons-v2-dex': 'Pons',
  'uniswap-pools-trade': 'Uniswap',
  'uniswap-v2-robinhood': 'Uniswap v2',
  'uniswap-v3-robinhood': 'Uniswap v3',
  'uniswap-v4-robinhood': 'Uniswap v4',
};
export const dexName = (id) =>
  DEX_NAMES[id] || (id || 'DEX').replace(/-robinhood$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function get(path) {
  const res = await fetch(GT + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`geckoterminal ${res.status}`);
  return res.json();
}

// A rough 24h sparkline from the price changes GeckoTerminal reports.
function sparkFrom(price, ch) {
  const pts = [];
  for (const k of ['h24', 'h6', 'h1', 'm30', 'm15', 'm5']) {
    const c = ch[k];
    if (c == null || c === '') continue;
    pts.push(price / (1 + num(c) / 100));
  }
  pts.push(price);
  return pts.map((v) => Number(v.toPrecision(4)));
}

export function toRow(pool, tokens, ethUsd, now = Date.now()) {
  const a = pool.attributes || {};
  const baseId = pool.relationships?.base_token?.data?.id || '';
  const quoteId = pool.relationships?.quote_token?.data?.id || '';
  const base = tokens.get(baseId);
  const quote = tokens.get(quoteId);
  const tokenAddr = baseId.split('_')[1];
  if (!base || !tokenAddr || !isAddress(tokenAddr)) return null;
  // Only coins traded against ETH, like the rest of the board.
  const qs = (quote?.attributes?.symbol || '').toUpperCase();
  if (qs !== 'WETH' && qs !== 'ETH') return null;
  const liqUsd = num(a.reserve_in_usd);
  if (liqUsd < MIN_LIQ_USD) return null;
  const priceUsd = num(a.base_token_price_usd);
  const mcapUsd = num(a.market_cap_usd) || num(a.fdv_usd);
  const tx = a.transactions || {};
  const vol = a.volume_usd || {};
  const ch = a.price_change_percentage || {};
  const ethPx = ethUsd || 1;
  const img = base.attributes?.image_url;
  const dex = pool.relationships?.dex?.data?.id || '';
  return {
    id: `gt-${String(a.address).toLowerCase()}`,
    source: 'gecko',
    dex,
    dexName: dexName(dex),
    poolAddress: a.address,
    token: getAddress(tokenAddr),
    logo: img && !/missing/.test(img) ? img : null,
    socials: null,
    meme: true,
    symbol: base.attributes?.symbol || '?',
    name: base.attributes?.name || base.attributes?.symbol || 'Unknown',
    decimals: num(base.attributes?.decimals) || 18,
    fee: null,
    hooks: NO_HOOK,
    createdAt: Date.parse(a.pool_created_at) || now,
    lastSwapAt: now,
    priceEth: priceUsd / ethPx,
    priceUsd,
    mcapUsd,
    athUsd: 0,
    liqUsd,
    liqEth: liqUsd / ethPx,
    buys: num(tx.h24?.buys),
    sells: num(tx.h24?.sells),
    buys5m: num(tx.m5?.buys),
    sells5m: num(tx.m5?.sells),
    vol5mUsd: num(vol.m5),
    vol1hUsd: num(vol.h1),
    volUsd: num(vol.h24),
    ch5m: Math.round(num(ch.m5) * 10) / 10,
    ch1h: Math.round(num(ch.h1) * 10) / 10,
    spark: sparkFrom(priceUsd / ethPx, ch),
  };
}

function tokenMap(body) {
  return new Map((body.included || []).filter((x) => x.type === 'token').map((x) => [x.id, x]));
}

export function createGecko({ log = console } = {}) {
  let board = { at: 0, rows: [] };
  let refreshing = null;
  const details = new Map(); // `${addr}|${agg}` -> { at, data }

  async function refresh(ethUsd) {
    const inc = 'include=base_token,quote_token,dex';
    const paths = [`/networks/${NET}/new_pools?page=1&${inc}`, `/networks/${NET}/new_pools?page=2&${inc}`, `/networks/${NET}/trending_pools?page=1&${inc}`];
    const results = await Promise.allSettled(paths.map(get));
    const rows = new Map();
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const tokens = tokenMap(r.value);
      for (const p of r.value.data || []) {
        const row = toRow(p, tokens, ethUsd);
        if (!row) continue;
        // One row per coin: keep its most liquid pool.
        const cur = rows.get(row.token);
        if (!cur || row.liqUsd > cur.liqUsd) rows.set(row.token, row);
      }
    }
    if (rows.size || !board.rows.length) board = { at: Date.now(), rows: [...rows.values()] };
    else board.at = Date.now(); // keep the last good list through a rate-limit blip
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) log.warn?.('[gecko]', failed.length, 'of', results.length, 'requests failed:', failed[0].reason?.message);
  }

  // Cached rows; refreshes in the background when stale. Waits only when there is nothing yet.
  async function rows(ethUsd, { waitMs = 4000 } = {}) {
    if (Date.now() - board.at > BOARD_TTL && !refreshing) {
      refreshing = refresh(ethUsd).catch((e) => log.warn?.('[gecko]', e.message)).finally(() => (refreshing = null));
    }
    if (!board.rows.length && refreshing) await Promise.race([refreshing, new Promise((r) => setTimeout(r, waitMs))]);
    return board.rows;
  }

  // Chart and trades for one pool. Prices are converted to ETH so the client treats them like
  // the indexer's pools.
  async function detail(id, { bucketMs = 15_000, ethUsd }) {
    const row = board.rows.find((r) => r.id === id);
    const addr = id.replace(/^gt-/, '');
    const agg = bucketMs >= 300_000 ? 5 : 1;
    const key = `${addr}|${agg}`;
    const hit = details.get(key);
    if (hit && Date.now() - hit.at < DETAIL_TTL) return { ...(row || hit.row), ...hit.data };
    const [ohlcv, trades, pool] = await Promise.allSettled([
      get(`/networks/${NET}/pools/${addr}/ohlcv/minute?aggregate=${agg}&limit=200&currency=usd`),
      get(`/networks/${NET}/pools/${addr}/trades`),
      row ? Promise.resolve(null) : get(`/networks/${NET}/pools/${addr}?include=base_token,quote_token,dex`),
    ]);
    let base = row;
    if (!base && pool.status === 'fulfilled' && pool.value?.data) base = toRow(pool.value.data, tokenMap(pool.value), ethUsd);
    if (!base) return hit ? { ...hit.row, ...hit.data } : null;
    const px = ethUsd || 1;
    const candles =
      ohlcv.status === 'fulfilled'
        ? (ohlcv.value.data?.attributes?.ohlcv_list || [])
            .map(([t, o, h, l, c]) => ({ t: t * 1000, o: o / px, h: h / px, l: l / px, c: c / px, n: 1 }))
            .sort((x, y) => x.t - y.t)
        : hit?.data.candles || [];
    const swaps =
      trades.status === 'fulfilled'
        ? (trades.value.data || []).slice(0, 60).map((t) => {
            const x = t.attributes || {};
            const usd = num(x.volume_in_usd);
            const tokenPx = x.kind === 'buy' ? num(x.price_to_in_usd) : num(x.price_from_in_usd);
            return { t: Date.parse(x.block_timestamp), side: x.kind === 'sell' ? 'sell' : 'buy', eth: usd / px, priceEth: tokenPx / px, tx: x.tx_hash, buyer: x.tx_from_address };
          })
        : hit?.data.swaps || [];
    // No candles yet (brand-new pool or a rate-limit blip): draw the 24h price path we already know.
    const now = Date.now();
    const path = base.spark || [];
    const fallback = path.map((p, i) => ({ t: now - (path.length - 1 - i) * 3600_000, o: path[i - 1] ?? p, h: Math.max(p, path[i - 1] ?? p), l: Math.min(p, path[i - 1] ?? p), c: p, n: 1 }));
    const data = { supply: base.priceUsd ? base.mcapUsd / base.priceUsd : 0, candles: candles.length > 1 ? candles : fallback, swaps };
    details.set(key, { at: Date.now(), row: base, data });
    if (details.size > 200) details.delete(details.keys().next().value);
    return { ...base, ...data };
  }

  return { rows, detail };
}
