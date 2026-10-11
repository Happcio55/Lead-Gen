import { createStore } from './store.js'
import { ACTIVE_CHAIN } from './chains.js'

const GT = 'https://api.geckoterminal.com/api/v2'
const DS = 'https://api.dexscreener.com'
const NET = ACTIVE_CHAIN.gecko
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ */
/* Network status shown in the UI                                      */
/* ------------------------------------------------------------------ */
export const net = createStore({ throttledUntil: 0, lastOk: 0, error: null })

/* ------------------------------------------------------------------ */
/* GeckoTerminal: free tier allows ~30 calls/min per visitor, so every */
/* call goes through one priority queue with a fixed gap and a backoff */
/* on 429. Identical in-flight requests are shared.                    */
/* ------------------------------------------------------------------ */
const GAP = 2800
const queue = []
const inflight = new Map()
let pumping = false
let nextAt = 0

export function gecko(path, { priority = 5 } = {}) {
  if (inflight.has(path)) return inflight.get(path)
  const p = new Promise((resolve, reject) => {
    queue.push({ path, priority, resolve, reject, at: performance.now(), tries: 0 })
    queue.sort((a, b) => a.priority - b.priority || a.at - b.at)
    pump()
  })
  inflight.set(path, p)
  p.catch(() => {}).finally(() => inflight.delete(path))
  return p
}

async function pump() {
  if (pumping) return
  pumping = true
  while (queue.length) {
    const wait = Math.max(nextAt, net.get().throttledUntil) - Date.now()
    if (wait > 0) await sleep(wait)
    const job = queue.shift()
    nextAt = Date.now() + GAP
    try {
      const r = await fetch(GT + job.path, { headers: { accept: 'application/json' } })
      if (r.status === 429) {
        net.set({ throttledUntil: Date.now() + 15000 })
        if (++job.tries < 3) queue.unshift(job)
        else job.reject(new Error('rate_limited'))
        continue
      }
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const j = await r.json()
      net.set({ lastOk: Date.now(), error: null })
      job.resolve(j)
    } catch (e) {
      net.set({ error: e.message })
      job.reject(e)
    }
  }
  pumping = false
}

/* DexScreener allows far more traffic; a small gap keeps us polite. */
let dsNext = 0
async function dexs(path) {
  const wait = dsNext - Date.now()
  dsNext = Math.max(Date.now(), dsNext) + 350
  if (wait > 0) await sleep(wait)
  const r = await fetch(DS + path)
  if (!r.ok) throw new Error('DexScreener HTTP ' + r.status)
  return r.json()
}

/* ------------------------------------------------------------------ */
/* Pool registry: one record per pool, merged from both sources.       */
/* ------------------------------------------------------------------ */
export const market = createStore({
  pools: {},
  ethUsd: 0,
  lists: { new: [], trending: [], top: [] },
  firstSeen: {},
  loaded: { new: false, trending: false, top: false },
})

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isFinite(n) ? n : 0
}
const cleanImg = (u) => (!u || /missing/.test(u) ? null : u)

function fromGecko(d, inc) {
  const a = d.attributes
  const baseId = d.relationships?.base_token?.data?.id || ''
  const bt = inc[baseId]?.attributes
  const [bSym = '', qPart = ''] = (a.name || '').split(' / ')
  const qSym = qPart.split(' ')[0]
  const fee = (qPart.match(/([\d.]+%)/) || [])[1] || null
  const tx = (k) => ({ b: a.transactions?.[k]?.buys || 0, s: a.transactions?.[k]?.sells || 0 })
  const fdv = num(a.fdv_usd)
  return {
    pool: a.address.toLowerCase(),
    tokenAddress: baseId.split('_').slice(1).join('_').toLowerCase(),
    symbol: bt?.symbol || bSym,
    name: bt?.name || bSym,
    image: cleanImg(bt?.image_url),
    quote: qSym,
    fee,
    dex: d.relationships?.dex?.data?.id || null,
    createdAt: Date.parse(a.pool_created_at) || null,
    priceUsd: num(a.base_token_price_usd),
    quoteUsd: num(a.quote_token_price_usd),
    fdv,
    mc: num(a.market_cap_usd) || fdv,
    liq: num(a.reserve_in_usd),
    vol: { m5: num(a.volume_usd?.m5), h1: num(a.volume_usd?.h1), h6: num(a.volume_usd?.h6), h24: num(a.volume_usd?.h24) },
    chg: {
      m5: num(a.price_change_percentage?.m5),
      h1: num(a.price_change_percentage?.h1),
      h6: num(a.price_change_percentage?.h6),
      h24: num(a.price_change_percentage?.h24),
    },
    txns: { m5: tx('m5'), h1: tx('h1'), h24: tx('h24') },
    buyers: a.transactions?.h24?.buyers || 0,
    sellers: a.transactions?.h24?.sellers || 0,
  }
}

function fromDex(p) {
  const tx = (k) => ({ b: p.txns?.[k]?.buys || 0, s: p.txns?.[k]?.sells || 0 })
  return {
    pool: p.pairAddress.toLowerCase(),
    tokenAddress: p.baseToken.address.toLowerCase(),
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    image: cleanImg(p.info?.imageUrl),
    header: p.info?.header || null,
    socials: p.info?.socials || null,
    websites: p.info?.websites || null,
    quote: p.quoteToken.symbol,
    dexscreener: p.url,
    createdAt: p.pairCreatedAt || null,
    priceUsd: num(p.priceUsd),
    fdv: num(p.fdv),
    mc: num(p.marketCap) || num(p.fdv),
    liq: num(p.liquidity?.usd),
    vol: { m5: num(p.volume?.m5), h1: num(p.volume?.h1), h6: num(p.volume?.h6), h24: num(p.volume?.h24) },
    chg: { m5: num(p.priceChange?.m5), h1: num(p.priceChange?.h1), h6: num(p.priceChange?.h6), h24: num(p.priceChange?.h24) },
    txns: { m5: tx('m5'), h1: tx('h1'), h24: tx('h24') },
  }
}

// Merge: newer numbers win, but never overwrite known values with blanks.
function upsert(records) {
  if (!records.length) return
  market.set((s) => {
    const pools = { ...s.pools }
    const firstSeen = { ...s.firstSeen }
    let ethUsd = s.ethUsd
    for (const r of records) {
      const old = pools[r.pool]
      // DexScreener sometimes lists a pool with base/quote swapped; never let that overwrite the token
      if (old && old.tokenAddress && r.tokenAddress && old.tokenAddress !== r.tokenAddress) continue
      const merged = { ...(old || {}) }
      for (const [k, v] of Object.entries(r)) {
        if (v === null || v === undefined || v === '') continue
        if (typeof v === 'number' && v === 0 && old && old[k]) continue
        merged[k] = v
      }
      merged.updatedAt = Date.now()
      if (old && old.priceUsd && merged.priceUsd !== old.priceUsd) merged.prevPriceUsd = old.priceUsd
      pools[r.pool] = merged
      if (!firstSeen[r.pool]) firstSeen[r.pool] = Date.now()
      if (/^W?ETH$/.test(r.quote || '') && r.quoteUsd > 100) ethUsd = r.quoteUsd
    }
    return { ...s, pools, firstSeen, ethUsd }
  })
}

function includedMap(j) {
  const m = {}
  for (const i of j.included || []) m[i.id] = i
  return m
}

const P = `/networks/${NET}`
const INC = 'include=base_token,quote_token,dex'

function setList(key, ids, { merge = false, cap = 60 } = {}) {
  market.set((s) => {
    let list = ids
    if (merge) {
      const seen = new Set()
      list = [...ids, ...s.lists[key]].filter((id) => (seen.has(id) ? false : seen.add(id)))
      list.sort((a, b) => (s.pools[b]?.createdAt || 0) - (s.pools[a]?.createdAt || 0))
      list = list.slice(0, cap)
    }
    return { ...s, lists: { ...s.lists, [key]: list }, loaded: { ...s.loaded, [key]: true } }
  })
}

async function loadList(key, path, opts) {
  const j = await gecko(path, opts)
  const inc = includedMap(j)
  const recs = (j.data || []).map((d) => fromGecko(d, inc))
  upsert(recs)
  return recs
}

export async function pollNewPairs(priority = 2) {
  const recs = await loadList('new', `${P}/new_pools?${INC}&page=1`, { priority })
  setList('new', recs.map((r) => r.pool), { merge: true })
  enrich(recs)
}
export async function loadNewPairsPage2() {
  const recs = await loadList('new', `${P}/new_pools?${INC}&page=2`, { priority: 6 })
  setList('new', recs.map((r) => r.pool), { merge: true })
  enrich(recs)
}
export async function pollTrending() {
  const recs = await loadList('trending', `${P}/trending_pools?${INC}&duration=1h`, { priority: 4 })
  setList('trending', recs.map((r) => r.pool))
  enrich(recs)
}
export async function pollTop() {
  const recs = await loadList('top', `${P}/pools?${INC}&sort=h24_volume_usd_desc`, { priority: 5 })
  setList('top', recs.map((r) => r.pool))
  enrich(recs)
}

export async function loadPool(pool, priority = 1) {
  const j = await gecko(`${P}/pools/${pool}?${INC}`, { priority })
  const inc = includedMap(j)
  if (j.data) upsert([fromGecko(j.data, inc)])
  refreshPrices([pool])
}

export async function searchPools(q) {
  const j = await gecko(`/search/pools?query=${encodeURIComponent(q)}&network=${NET}&${INC}`, { priority: 1 })
  const inc = includedMap(j)
  const recs = (j.data || []).map((d) => fromGecko(d, inc))
  upsert(recs)
  return recs.map((r) => r.pool)
}

/* Logos, socials and fresher numbers from DexScreener, batched by token. */
const asked = new Map()
async function enrich(recs) {
  const now = Date.now()
  const want = recs
    .filter((r) => !market.get().pools[r.pool]?.image && now - (asked.get(r.tokenAddress) || 0) > 90000)
    .map((r) => r.tokenAddress)
  const uniq = [...new Set(want)].filter(Boolean)
  for (let i = 0; i < uniq.length; i += 30) {
    const batch = uniq.slice(i, i + 30)
    batch.forEach((a) => asked.set(a, now))
    try {
      const pairs = await dexs(`/tokens/v1/${ACTIVE_CHAIN.dex}/${batch.join(',')}`)
      const want = new Set(batch)
      upsert((pairs || []).filter((p) => p.chainId === ACTIVE_CHAIN.dex && want.has(p.baseToken.address.toLowerCase())).map(fromDex))
    } catch {
      /* logos are a nice-to-have */
    }
  }
}

/* Fast price refresh for pools the visitor is looking at or holds. */
export async function refreshPrices(pools) {
  const ids = [...new Set(pools.map((p) => p.toLowerCase()))]
  for (let i = 0; i < ids.length; i += 30) {
    try {
      const j = await dexs(`/latest/dex/pairs/${ACTIVE_CHAIN.dex}/${ids.slice(i, i + 30).join(',')}`)
      upsert((j.pairs || []).map(fromDex))
    } catch {
      /* fall through: the gecko polls still keep numbers moving */
    }
  }
}

/* Candles. Gecko returns newest first. */
export async function loadCandles(pool, tf) {
  const [unit, agg] = { '1m': ['minute', 1], '5m': ['minute', 5], '15m': ['minute', 15], '1h': ['hour', 1], '4h': ['hour', 4] }[tf]
  const j = await gecko(`${P}/pools/${pool}/ohlcv/${unit}?aggregate=${agg}&limit=300&currency=usd&token=base`, { priority: 1 })
  const list = j.data?.attributes?.ohlcv_list || []
  return list
    .map(([t, o, h, l, c, v]) => ({ time: t, open: o, high: h, low: l, close: c, value: v }))
    .sort((a, b) => a.time - b.time)
}

export async function loadTrades(pool) {
  const j = await gecko(`${P}/pools/${pool}/trades`, { priority: 2 })
  return (j.data || []).map((d) => {
    const a = d.attributes
    const buy = a.kind === 'buy'
    return {
      id: d.id,
      t: Date.parse(a.block_timestamp),
      side: a.kind,
      usd: num(a.volume_in_usd),
      tokens: num(buy ? a.to_token_amount : a.from_token_amount),
      quoteAmt: num(buy ? a.from_token_amount : a.to_token_amount),
      price: num(buy ? a.price_to_in_usd : a.price_from_in_usd),
      wallet: a.tx_from_address,
      tx: a.tx_hash,
    }
  })
}
