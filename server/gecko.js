// GeckoTerminal (free public API, ~30 calls/min): trending pools and token logos for Robinhood Chain.
// Calls are spaced out and cached so we stay well inside the free limit no matter how many visitors we get.
import { ADDR } from './config.js';

const API = 'https://api.geckoterminal.com/api/v2/networks/robinhood';
const GAP = 2600; // ms between calls (~23/min)
let last = 0;

async function get(path) {
  const wait = last + GAP - Date.now();
  last = Math.max(Date.now(), last + GAP);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  const res = await fetch(API + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('geckoterminal HTTP ' + res.status);
  return res.json();
}

const SKIP = new Set([ADDR.WETH, ADDR.USDG, ADDR.ZERO]);
const addrOf = id => String(id || '').split('_').pop().toLowerCase();
const num = v => (v == null || v === '' ? null : Number(v));
const goodImage = u => (typeof u === 'string' && /^https:\/\//.test(u) && !/missing/.test(u) ? u : null);

// address -> { url, at }
export const logos = new Map();

let trending = { at: 0, items: [] };

// Most active pools right now, one entry per token (its most liquid trending pool).
export async function getTrending() {
  if (Date.now() - trending.at < 60e3) return trending.items;
  try {
    const d = await get('/trending_pools?page=1&include=base_token,quote_token');
    const tokens = new Map();
    for (const x of d.included || []) if (x.type === 'token') tokens.set(x.id, x.attributes);
    const out = new Map();
    for (const p of d.data || []) {
      const a = p.attributes;
      let side = 'base_token', id = p.relationships?.base_token?.data?.id;
      if (SKIP.has(addrOf(id))) { side = 'quote_token'; id = p.relationships?.quote_token?.data?.id; }
      const address = addrOf(id);
      if (!address || SKIP.has(address)) continue;
      const tk = tokens.get(id) || {};
      if (goodImage(tk.image_url)) logos.set(address, { url: tk.image_url, at: Date.now() });
      const entry = {
        address,
        name: tk.name || a.name,
        symbol: tk.symbol || '?',
        decimals: tk.decimals ?? 18,
        image: goodImage(tk.image_url),
        priceUsd: num(side === 'base_token' ? a.base_token_price_usd : a.quote_token_price_usd),
        vol24: num(a.volume_usd?.h24),
        vol1h: num(a.volume_usd?.h1),
        liquidityUsd: num(a.reserve_in_usd),
        change24: side === 'base_token' ? num(a.price_change_percentage?.h24) : null,
        marketCap: num(a.market_cap_usd) ?? num(a.fdv_usd),
        createdAt: a.pool_created_at ? Date.parse(a.pool_created_at) : null,
        listed: true
      };
      const prev = out.get(address);
      if (!prev || (entry.liquidityUsd || 0) > (prev.liquidityUsd || 0)) out.set(address, entry);
    }
    trending = { at: Date.now(), items: [...out.values()] };
  } catch (e) {
    console.warn('[gecko] trending:', e.message);
    trending.at = Date.now() - 30e3; // retry in ~30 s
  }
  return trending.items;
}

// Fetch logos for up to 30 addresses we don't have yet (or haven't checked in a day).
export async function fillLogos(addresses) {
  const need = [...new Set(addresses.map(a => a.toLowerCase()))]
    .filter(a => !SKIP.has(a) && (!logos.has(a) || Date.now() - logos.get(a).at > 864e5))
    .slice(0, 30);
  if (!need.length) return;
  try {
    const d = await get('/tokens/multi/' + need.join(','));
    const seen = new Set();
    for (const x of d.data || []) {
      const a = addrOf(x.id);
      seen.add(a);
      logos.set(a, { url: goodImage(x.attributes?.image_url), at: Date.now() });
    }
    for (const a of need) if (!seen.has(a)) logos.set(a, { url: null, at: Date.now() });
  } catch (e) {
    console.warn('[gecko] logos:', e.message);
  }
}

export const logoFor = address => logos.get(String(address).toLowerCase())?.url || null;
