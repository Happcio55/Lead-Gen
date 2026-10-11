import { market, applyLivePrice } from './api.js'

/*
  Real-time prices straight from Robinhood Chain.
  Every second we ask the public RPC for new swap events on the pools we care
  about (the open token and any held positions) and price the token from the
  pool state in the newest swap. Indexers like DexScreener lag 10-30 s behind;
  this follows the chain block by block.
*/

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951' // Uniswap v4
const T_SWAP_V4 = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f'
const T_SWAP_V3 = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'
const T_SYNC_V2 = '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1'
const LOOKBACK = 2400 // blocks (~10 min) to find the last swap when we start watching a pool
const ETH_LIKE = /^W?ETH$/i
const STABLE = /^(USD.*|SUSD|DAI)$/i

let id = 0
async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  return j.result
}

const word = (data, i) => BigInt('0x' + data.slice(2 + i * 64, 2 + (i + 1) * 64))
const Q96 = 2 ** 96

// Price of the token in its quote currency from a log, or null if we can't tell.
// Token order in the pool is checked against the price we already know, so a wrong guess is never shown.
function priceFromLog(pool, log, knownInQuote) {
  const tokenDec = pool.decimals ?? 18
  const quoteDec = pool.quoteDecimals ?? (ETH_LIKE.test(pool.quote || '') ? 18 : STABLE.test(pool.quote || '') ? 6 : 18)
  let raw // amount1 per amount0, raw units
  if (log.topics[0] === T_SYNC_V2) {
    const r0 = Number(word(log.data, 0)), r1 = Number(word(log.data, 1))
    if (!r0 || !r1) return null
    raw = r1 / r0
  } else {
    const sqrt = Number(word(log.data, 2)) / Q96 // sqrtPriceX96 is the 3rd word for both v3 and v4 swaps
    raw = sqrt * sqrt
  }
  if (!(raw > 0) || !isFinite(raw)) return null
  const asToken0 = raw * 10 ** (tokenDec - quoteDec) // token is currency0: quote per token
  const asToken1 = 1 / (raw * 10 ** (quoteDec - tokenDec)) // token is currency1
  if (!(knownInQuote > 0)) return null
  const off = (v) => Math.abs(Math.log(v / knownInQuote))
  const best = off(asToken0) < off(asToken1) ? asToken0 : asToken1
  return off(best) < Math.log(4) ? best : null
}

function quoteUsd(pool) {
  if (ETH_LIKE.test(pool.quote || '')) return market.get().ethUsd || 0
  if (STABLE.test(pool.quote || '')) return 1
  return pool.quoteUsd || 0
}

/* ---------- watcher ---------- */
let watched = new Set()
let fromBlock = null
let running = false
const lastLogKey = {}

export function watchPools(ids) {
  const next = new Set(ids.map((x) => x.toLowerCase()))
  const added = [...next].some((x) => !watched.has(x))
  watched = next
  if (added) fromBlock = null // look back again so a newly watched pool gets its last price
}

async function poll() {
  if (running || !watched.size || document.hidden) return
  running = true
  try {
    const head = parseInt(await rpc('eth_blockNumber', []), 16)
    const start = fromBlock ?? Math.max(0, head - LOOKBACK)
    if (start > head) return
    const pools = market.get().pools
    const v4 = [...watched].filter((p) => p.length === 66)
    const pairs = [...watched].filter((p) => p.length === 42)
    const calls = []
    if (v4.length) calls.push(rpc('eth_getLogs', [{ address: POOL_MANAGER, topics: [T_SWAP_V4, v4], fromBlock: '0x' + start.toString(16), toBlock: '0x' + head.toString(16) }]))
    if (pairs.length) calls.push(rpc('eth_getLogs', [{ address: pairs, topics: [[T_SWAP_V3, T_SYNC_V2]], fromBlock: '0x' + start.toString(16), toBlock: '0x' + head.toString(16) }]))
    const logs = (await Promise.all(calls)).flat()
    // newest log per pool wins
    const latest = {}
    for (const l of logs) {
      const key = l.topics[0] === T_SWAP_V4 ? l.topics[1].toLowerCase() : l.address.toLowerCase()
      const pos = parseInt(l.blockNumber, 16) * 1e5 + parseInt(l.logIndex, 16)
      if (!latest[key] || latest[key].pos < pos) latest[key] = { log: l, pos }
    }
    for (const [key, { log, pos }] of Object.entries(latest)) {
      if (lastLogKey[key] === pos) continue
      lastLogKey[key] = pos
      const pool = pools[key]
      if (!pool) continue
      const q = quoteUsd(pool)
      if (!q || !pool.priceUsd) continue
      const inQuote = priceFromLog(pool, log, pool.priceUsd / q)
      if (inQuote) applyLivePrice(key, inQuote * q)
    }
    fromBlock = head + 1
  } catch {
    /* RPC hiccup: DexScreener polling keeps prices moving */
  } finally {
    running = false
  }
}

setInterval(poll, 1000)
