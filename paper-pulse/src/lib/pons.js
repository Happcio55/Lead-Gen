import { createStore } from './store.js'
import { market, upsertRecords } from './api.js'

/*
  Pons launchpad, read straight from Robinhood Chain (no indexer, no rate limits).

  Factory 0x7ed5…7e7e emits CurveCreated(token, curve, creator, …, targetEth) for every launch.
  Each token gets its own bonding curve contract that emits Buy / Sell events.
  When the curve holds the target (4.2 ETH) the factory emits Migrated(token) and the
  token moves to a Uniswap v4 pool (PoolManager Initialize with currency1 = token).

  Columns, like Axiom: New Pairs (fresh launches), Final Stretch (furthest along the curve),
  Migrated (graduated to the DEX).
*/

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const FACTORY = '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e'
const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951'
const T_CREATED = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607'
const T_BUY = '0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455'
const T_SELL = '0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df'
const T_MIGRATED = '0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259'
const T_V4_INIT = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438'
const SUPPLY = 1e9
const SEC_PER_BLOCK = 0.1029
const LAUNCH_LOOKBACK = 24 * 3600 / SEC_PER_BLOCK // a day of launches, for Final Stretch candidates
const MIGRATION_LOOKBACK = 2 * 24 * 3600 / SEC_PER_BLOCK
const START_PRICE_ETH = 1.65 / SUPPLY // every Pons curve starts around 1.65 ETH market cap
const CHUNK = 2000000

export const pons = createStore({ ready: false, tokens: {}, newIds: [], finalIds: [], migratedIds: [], error: null })

/* ---------------- rpc helpers ---------------- */
let rid = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// The public RPC allows roughly 20 calls/s per visitor: pace batches and back off on 429.
let budgetAt = 0
async function batch(calls) {
  if (!calls.length) return []
  const out = []
  for (let i = 0; i < calls.length; i += 50) {
    const part = calls.slice(i, i + 50).map(([method, params]) => ({ jsonrpc: '2.0', id: ++rid, method, params }))
    const wait = budgetAt - Date.now()
    if (wait > 0) await sleep(wait)
    budgetAt = Math.max(Date.now(), budgetAt) + part.length * 55
    let j = null
    for (let attempt = 0; attempt < 4 && !Array.isArray(j); attempt++) {
      try {
        const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(part) })
        j = r.status === 429 ? null : await r.json()
      } catch {
        j = null
      }
      if (!Array.isArray(j)) await sleep(1500 * (attempt + 1))
    }
    const byId = Object.fromEntries((Array.isArray(j) ? j : []).map((x) => [x.id, x]))
    out.push(...part.map((p) => byId[p.id]?.result ?? null))
  }
  return out
}
const call1 = async (method, params) => (await batch([[method, params]]))[0]
const hex = (n) => '0x' + Math.max(0, Math.floor(n)).toString(16)
const word = (data, i) => BigInt('0x' + data.slice(2 + i * 64, 2 + (i + 1) * 64))
const addr = (topic) => '0x' + topic.slice(26).toLowerCase()
const pad = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0')
const wei = (b) => Number(b) / 1e18

async function logsChunked(filter, from, to) {
  // queries without an address filter are limited to 30k blocks by the RPC
  const size = filter.address ? CHUNK : 29000
  const ranges = []
  for (let a = Math.floor(from); a <= to; a += size) ranges.push([a, Math.min(to, a + size - 1)])
  const res = await batch(ranges.map(([a, b]) => ['eth_getLogs', [{ ...filter, fromBlock: hex(a), toBlock: hex(b) }]]))
  return res.flat().filter(Boolean)
}

function decodeString(res) {
  if (!res || res.length < 130) return null
  try {
    const len = Number(BigInt('0x' + res.slice(66, 130)))
    const bytes = res.slice(130, 130 + len * 2).match(/.{2}/g) || []
    return new TextDecoder().decode(new Uint8Array(bytes.map((b) => parseInt(b, 16)))).replace(/\0/g, '').trim() || null
  } catch {
    return null
  }
}

export const imageUrl = (u) => {
  if (!u) return null
  if (u.startsWith('ipfs://')) return '/api/img?u=' + encodeURIComponent(u)
  if (/^https?:\/\//.test(u)) return u
  return null
}

/* ---------------- clock: block number -> time ---------------- */
let headBlock = 0
let headTime = 0
const blockTime = (b) => headTime - (headBlock - b) * SEC_PER_BLOCK * 1000

/* ---------------- state ---------------- */
const tokens = {} // token address -> record
const curveToToken = {}
let lastBlock = 0
let ticks = 0
let ethUsd = () => market.get().ethUsd || 0

// Pons curve, calibrated on a token that went all the way to migration:
// sqrt(market cap in ETH) = 0.7235 * (1.77 + ETH in the curve)
const curveEthFromPrice = (priceEth) => Math.max(0, Math.sqrt(priceEth * SUPPLY) / 0.7235 - 1.77)

function priceFromTrade(t) {
  return t.tokens > 0 ? t.eth / t.tokens : 0
}

function windowStats(tok, ms) {
  const since = Date.now() - ms
  let vol = 0, b = 0, s = 0, first = null
  for (const t of tok.trades) {
    if (t.t < since) continue
    if (first == null) first = t.price
    vol += t.eth
    if (t.side === 'buy') b++
    else s++
  }
  return { vol, b, s, first }
}

// Turn a token into the record shape the rest of the app uses.
function toRecord(tok) {
  const e = ethUsd()
  const priceUsd = tok.priceEth * e
  const mc = priceUsd * SUPPLY
  const chg = {}
  const vol = {}
  const txns = {}
  for (const [k, ms] of [['m5', 3e5], ['h1', 36e5], ['h6', 216e5], ['h24', 864e5]]) {
    const w = windowStats(tok, ms)
    vol[k] = w.vol * e
    txns[k] = { b: w.b, s: w.s }
    chg[k] = w.first ? ((tok.priceEth - w.first) / w.first) * 100 : 0
  }
  const migrated = !!tok.poolId
  return {
    pool: migrated ? tok.poolId : tok.curve,
    curve: tok.curve,
    tokenAddress: tok.token,
    symbol: tok.symbol || '…',
    name: tok.name || '',
    image: imageUrl(tok.logo),
    socials: tok.socials,
    websites: tok.websites,
    dex: migrated ? 'pons-v2-dex' : 'pons-v2',
    launchpad: 'Pons',
    quote: 'ETH',
    quoteAddress: '0x0000000000000000000000000000000000000000',
    decimals: 18,
    quoteDecimals: 18,
    createdAt: tok.createdAt,
    migratedAt: tok.migratedAt || null,
    progress: migrated ? 100 : Math.min(100, (tok.curveEth / tok.target) * 100),
    curveEth: tok.curveEth,
    devPct: tok.devPct,
    holdersHint: tok.buyers.size,
    buyers: tok.buyers.size,
    sellers: tok.sellers.size,
    // after migration the DEX pool is priced by DexScreener and the on-chain swap watcher
    ...(priceUsd > 0 && !migrated ? { priceUsd, mc, fdv: mc, liq: tok.curveEth * e * 2 || mc * 0.5, vol, txns, chg } : {}),
  }
}

function publish() {
  const list = Object.values(tokens)
  const recs = list.filter((t) => t.symbol && (t.poolId || curveEthFromPrice(t.priceEth) <= t.target * 1.15)).map(toRecord)
  upsertRecords(recs, { authoritative: true })
  const now = Date.now()
  // a curve priced far beyond its graduation point is quoted in something other than ETH (e.g. a stock token): skip it
  const live = list.filter((t) => !t.poolId && t.symbol && curveEthFromPrice(t.priceEth) <= t.target * 1.15)
  const newIds = live
    .filter((t) => now - t.createdAt < 6 * 3600e3)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 80)
    .map((t) => t.curve)
  const finalIds = live
    .filter((t) => t.curveEth / t.target >= 0.25)
    .sort((a, b) => b.curveEth - a.curveEth)
    .slice(0, 60)
    .map((t) => t.curve)
  const migratedIds = list
    .filter((t) => t.poolId)
    .sort((a, b) => (b.migratedAt || 0) - (a.migratedAt || 0))
    .slice(0, 60)
    .map((t) => t.poolId)
  pons.set({ ready: true, newIds, finalIds, migratedIds, tokens: { ...tokens } })
}

/* ---------------- loading ---------------- */
function addLaunch(l) {
  const token = addr(l.topics[1])
  if (tokens[token]) return tokens[token]
  const curve = addr(l.topics[2])
  const creator = addr(l.topics[3])
  const target = wei(word(l.data, 2)) || 4.2
  const b = parseInt(l.blockNumber, 16)
  tokens[token] = {
    token, curve, creator, target, block: b, createdAt: blockTime(b), tx: l.transactionHash,
    priceEth: START_PRICE_ETH, curveEth: 0, trades: [], buyers: new Set(), sellers: new Set(), devPct: null,
  }
  curveToToken[curve] = token
  return tokens[token]
}

function addTrade(l) {
  const token = curveToToken[l.address.toLowerCase()]
  const tok = tokens[token]
  if (!tok) return
  const buy = l.topics[0] === T_BUY
  const t = buy
    ? { side: 'buy', eth: wei(word(l.data, 0) - word(l.data, 2) - word(l.data, 3)), tokens: wei(word(l.data, 1)), wallet: addr(l.topics[2]) }
    : { side: 'sell', eth: wei(word(l.data, 1)), tokens: wei(word(l.data, 0)), wallet: addr(l.topics[1]) }
  const b = parseInt(l.blockNumber, 16)
  t.t = blockTime(b)
  t.block = b
  t.tx = l.transactionHash
  t.id = l.transactionHash + ':' + l.logIndex
  t.price = priceFromTrade(t)
  if (tok.trades.some((x) => x.id === t.id)) return
  tok.trades.push(t)
  tok.trades.sort((a, c) => a.block - c.block)
  if (tok.trades.length > 3000) tok.trades.splice(0, tok.trades.length - 3000)
  if (b >= (tok.lastTradeBlock || 0)) {
    tok.lastTradeBlock = b
    if (t.price > 0) {
      tok.priceEth = t.price
      tok.curveEth = Math.min(tok.target, curveEthFromPrice(t.price))
    }
  }
  ;(buy ? tok.buyers : tok.sellers).add(t.wallet)
}

const META_KEY = 'paperpulse:meta'
const metaCache = (() => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY)) || {}
  } catch {
    return {}
  }
})()
let metaSave = null
const saveMeta = () => {
  clearTimeout(metaSave)
  metaSave = setTimeout(() => {
    try {
      const keys = Object.keys(metaCache)
      if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach((k) => delete metaCache[k])
      localStorage.setItem(META_KEY, JSON.stringify(metaCache))
    } catch {
      /* storage full or blocked */
    }
  }, 1000)
}

function applyMeta(t, m) {
  t.name = m.name
  t.symbol = m.symbol
  t.logo = m.logo
  t.socials = m.socials || []
  t.websites = m.websites || []
  t.metaLoaded = !!m.symbol
}

// Name, symbol, logo and socials: from the browser cache, else our edge endpoint (cached for everyone).
async function loadMeta(list) {
  const need = list.filter((t) => !t.metaLoaded)
  for (const t of need) if (metaCache[t.token]) applyMeta(t, metaCache[t.token])
  const rest = need.filter((t) => !t.metaLoaded)
  let i = 0
  const worker = async () => {
    while (i < rest.length) {
      const t = rest[i++]
      try {
        const r = await fetch(`/api/meta?t=${t.token}&tx=${t.tx}`)
        if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('no edge')
        const m = await r.json()
        applyMeta(t, m)
        if (m.symbol) metaCache[t.token] = m
      } catch {
        await loadMetaRpc([t]) // local dev: read the chain directly
      }
      if (i % 10 === 0) publish()
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  saveMeta()
}

async function loadMetaRpc(need) {
  const calls = []
  for (const t of need) {
    calls.push(['eth_call', [{ to: t.token, data: '0x06fdde03' }, 'latest']])
    calls.push(['eth_call', [{ to: t.token, data: '0x95d89b41' }, 'latest']])
    calls.push(['eth_call', [{ to: t.token, data: '0xfb7f21eb' }, 'latest']])
  }
  const res = await batch(calls)
  need.forEach((t, k) => {
    const m = { name: decodeString(res[k * 3]), symbol: decodeString(res[k * 3 + 1]), logo: decodeString(res[k * 3 + 2]) }
    applyMeta(t, m)
    if (m.symbol) metaCache[t.token] = m
  })
}

// Creator's share of supply ("dev holding"), for the tokens on screen.
async function loadDev(list) {
  const need = list.filter((t) => t.devPct == null || Date.now() - (t.devAt || 0) > 60000).slice(0, 40)
  if (!need.length) return
  const res = await batch(need.map((t) => ['eth_call', [{ to: t.token, data: '0x70a08231' + pad(t.creator).slice(2) }, 'latest']]))
  need.forEach((t, k) => {
    if (res[k] && res[k].length > 2) {
      t.devPct = (wei(BigInt(res[k])) / SUPPLY) * 100
      t.devAt = Date.now()
    }
  })
}

async function loadBalances(list) {
  const res = await batch(list.map((t) => ['eth_getBalance', [t.curve, 'latest']]))
  list.forEach((t, i) => {
    if (res[i]) t.curveEth = wei(BigInt(res[i]))
  })
}

async function attachMigrations(logs) {
  const fresh = logs.map((l) => ({ token: addr(l.topics[1]), block: parseInt(l.blockNumber, 16), tx: l.transactionHash })).filter((m) => tokens[m.token] && !tokens[m.token].poolId)
  if (!fresh.length) return
  const receipts = await batch(fresh.map((m) => ['eth_getTransactionReceipt', [m.tx]]))
  fresh.forEach((m, i) => {
    const init = (receipts[i]?.logs || []).find((l) => l.address.toLowerCase() === POOL_MANAGER && l.topics[0] === T_V4_INIT)
    const tok = tokens[m.token]
    tok.migratedAt = blockTime(m.block)
    tok.curveEth = tok.target
    if (init) tok.poolId = init.topics[1].toLowerCase()
  })
}

async function boot() {
  const head = await call1('eth_getBlockByNumber', ['latest', false])
  headBlock = parseInt(head.number, 16)
  headTime = parseInt(head.timestamp, 16) * 1000
  const tradesFrom = headBlock - Math.round((2 * 3600) / SEC_PER_BLOCK)
  // three big queries: a day of launches, two days of migrations, two hours of every Pons trade
  const [launches, migrations, trades] = await Promise.all([
    logsChunked({ address: FACTORY, topics: [T_CREATED] }, headBlock - LAUNCH_LOOKBACK, headBlock),
    logsChunked({ address: FACTORY, topics: [T_MIGRATED] }, headBlock - MIGRATION_LOOKBACK, headBlock),
    logsChunked({ topics: [[T_BUY, T_SELL]] }, tradesFrom, headBlock),
  ])
  launches.forEach(addLaunch)
  await resolveUnknown([...migrations.map((l) => addr(l.topics[1]))], trades)
  trades.forEach(addTrade)
  await attachMigrations(migrations)
  const now = Date.now()
  const all = Object.values(tokens)
  const active = all.filter((t) => !t.poolId && t.trades.length)
  const young = all.filter((t) => !t.poolId && now - t.createdAt < 6 * 3600e3).sort((a, b) => b.createdAt - a.createdAt).slice(0, 80)
  const final = active.filter((t) => t.curveEth / t.target >= 0.25).sort((a, b) => b.curveEth - a.curveEth).slice(0, 60)
  const migrated = all.filter((t) => t.poolId).sort((a, b) => (b.migratedAt || 0) - (a.migratedAt || 0)).slice(0, 60)
  lastBlock = headBlock
  await loadMeta([...young.slice(0, 30), ...final.slice(0, 30), ...migrated.slice(0, 30)])
  publish()
  loadMeta([...young, ...final, ...migrated]).then(publish)
  loadDev(young.slice(0, 40)).then(publish)
}

// Trades or migrations for curves launched before our launch window: look up their launch by curve/token.
async function resolveUnknown(migratedTokens, trades) {
  const unknownCurves = [...new Set(trades.map((l) => l.address.toLowerCase()).filter((c) => !curveToToken[c]))]
  const unknownTokens = [...new Set(migratedTokens.filter((t) => !tokens[t]))]
  const from = Math.max(0, headBlock - 30 * 24 * 3600 / SEC_PER_BLOCK)
  const qs = []
  if (unknownCurves.length) qs.push(logsChunked({ address: FACTORY, topics: [T_CREATED, null, unknownCurves.slice(0, 400).map(pad)] }, from, headBlock))
  if (unknownTokens.length) qs.push(logsChunked({ address: FACTORY, topics: [T_CREATED, unknownTokens.slice(0, 400).map(pad)] }, from, headBlock))
  ;(await Promise.all(qs)).flat().forEach(addLaunch)
}

async function tick() {
  if (document.hidden) return
  const [head] = await batch([['eth_getBlockByNumber', ['latest', false]]])
  if (!head) return
  const hb = parseInt(head.number, 16)
  if (hb <= lastBlock) return
  headBlock = hb
  headTime = parseInt(head.timestamp, 16) * 1000
  const from = lastBlock + 1
  const [factoryLogs, trades] = await batch([
    ['eth_getLogs', [{ address: FACTORY, topics: [[T_CREATED, T_MIGRATED]], fromBlock: hex(from), toBlock: hex(hb) }]],
    ['eth_getLogs', [{ topics: [[T_BUY, T_SELL]], fromBlock: hex(from), toBlock: hex(hb) }]],
  ])
  if (!factoryLogs || !trades) return // rate limited: retry the same range next tick
  const newOnes = factoryLogs.filter((l) => l.topics[0] === T_CREATED).map(addLaunch)
  const migrations = factoryLogs.filter((l) => l.topics[0] === T_MIGRATED)
  await resolveUnknown(migrations.map((l) => addr(l.topics[1])), trades)
  trades.forEach(addTrade)
  await attachMigrations(migrations)
  const traded = [...new Set(trades.map((l) => curveToToken[l.address.toLowerCase()]))].map((k) => tokens[k]).filter(Boolean)
  loadMeta([...newOnes, ...traded.filter((t) => !t.metaLoaded && t.curveEth / t.target >= 0.2)]).then(publish)
  if (++ticks % 20 === 0) loadDev(pons.get().newIds.map((c) => tokens[curveToToken[c]]).filter(Boolean)).then(publish)
  lastBlock = hb
  publish()
}

const chunk = (a, n) => {
  const out = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out.length ? out : []
}

/* ---------------- public ---------------- */
let started = false
export function startPons() {
  if (started) return
  started = true
  boot()
    .catch((e) => pons.set({ error: e.message, ready: true }))
    .finally(() => setInterval(() => tick().catch(() => {}), 1500))
}

// Trades for a Pons curve token, in the shape the token page uses.
export function ponsTrades(poolOrCurve) {
  const tok = tokens[curveToToken[poolOrCurve]] || Object.values(tokens).find((t) => t.poolId === poolOrCurve)
  if (!tok) return null
  const e = ethUsd()
  return tok.trades
    .slice()
    .reverse()
    .map((t) => ({ id: t.id, t: t.t, side: t.side, usd: t.eth * e, tokens: t.tokens, quoteAmt: t.eth, price: t.price * e, wallet: t.wallet, tx: t.tx }))
}
export const isPonsCurve = (id) => !!curveToToken[id]
