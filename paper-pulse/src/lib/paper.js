import { createStore, storage } from './store.js'
import { market } from './api.js'
import { ACTIVE_CHAIN } from './chains.js'

/*
  Paper trading engine.
  Fills use the live price plus a constant-product price impact sized from the
  pool's real liquidity, and a 1% swap fee. A big buy into a thin pool fills
  badly here, the same way it would on-chain.
*/

export const FEE = 0.01
export const START_OPTIONS = [0.1, 1, 10, 100]
const KEY = 'paperpulse:v1'

const newAccount = (start) => ({ start, eth: start, positions: {}, trades: [], realized: 0, createdAt: Date.now() })

const saved = storage.get(KEY, null)
export const paper = createStore(
  saved && saved.accounts
    ? saved
    : {
        onboarded: false,
        accounts: { [ACTIVE_CHAIN.id]: newAccount(1) },
        settings: { quickBuy: 0.05, buyPresets: [0.01, 0.05, 0.1, 0.5], sellPresets: [25, 50, 100], slippage: 20 },
        history: [],
      },
)
paper.subscribe(() => storage.set(KEY, paper.get()))

export const account = (s = paper.get()) => s.accounts[ACTIVE_CHAIN.id] || newAccount(1)

function setAccount(fn) {
  paper.set((s) => ({ ...s, accounts: { ...s.accounts, [ACTIVE_CHAIN.id]: fn(account(s)) } }))
}

export function resetAccount(start) {
  paper.set((s) => {
    const prev = account(s)
    const summary = { at: Date.now(), start: prev.start, end: equityEth(prev), trades: prev.trades.length }
    return {
      ...s,
      onboarded: true,
      history: prev.trades.length ? [summary, ...(s.history || [])].slice(0, 20) : s.history || [],
      accounts: { ...s.accounts, [ACTIVE_CHAIN.id]: newAccount(start) },
    }
  })
}

export function updateSettings(patch) {
  paper.set((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
}

/* -------------------- pricing -------------------- */
export function ethUsd() {
  return market.get().ethUsd || 0
}

// Half the pool's USD liquidity sits on each side; tiny or unknown pools get a floor.
function depthUsd(pool) {
  const liq = pool.liq || 0
  if (liq > 0) return Math.max(liq / 2, 25)
  return Math.max((pool.mc || 0) * 0.05, 25)
}

export function quoteBuy(pool, ethIn) {
  const e = ethUsd()
  if (!pool?.priceUsd || !e || !(ethIn > 0)) return null
  const usdNet = ethIn * e * (1 - FEE)
  const R = depthUsd(pool)
  const impact = usdNet / (R + usdNet)
  const tokens = (usdNet / pool.priceUsd) * (1 - impact)
  const fillPrice = (ethIn * e) / tokens
  return { tokens, impact, fillPrice, feeEth: ethIn * FEE, mcAtFill: (pool.mc || 0) * (fillPrice / pool.priceUsd) }
}

export function quoteSell(pool, tokens) {
  const e = ethUsd()
  if (!pool?.priceUsd || !e || !(tokens > 0)) return null
  const usdGross = tokens * pool.priceUsd
  const R = depthUsd(pool)
  const impact = usdGross / (R + usdGross)
  const usdOut = usdGross * (1 - impact) * (1 - FEE)
  return { ethOut: usdOut / e, impact, fillPrice: usdOut / tokens, feeEth: (usdGross * (1 - impact) * FEE) / e }
}

/* -------------------- orders -------------------- */
const snapshot = (pool) => ({
  pool: pool.pool,
  tokenAddress: pool.tokenAddress,
  symbol: pool.symbol,
  name: pool.name,
  image: pool.image || null,
})

export function buy(pool, ethIn) {
  const acct = account()
  const slip = paper.get().settings.slippage
  if (!(ethIn > 0)) return { ok: false, msg: 'Skriv hvor meget ETH du vil købe for.' }
  if (ethIn > acct.eth + 1e-12) return { ok: false, msg: `Du har kun ${acct.eth.toFixed(4)} ETH. Nulstil eller sænk beløbet.` }
  const q = quoteBuy(pool, ethIn)
  if (!q) return { ok: false, msg: 'Prisen er ikke klar endnu. Prøv igen om et øjeblik.' }
  if (q.impact * 100 > slip)
    return { ok: false, msg: `Prisudsvinget ville være ${(q.impact * 100).toFixed(1)}%, over din slippage på ${slip}%. Køb for mindre eller hæv slippage.` }
  const t = { id: Date.now() + Math.random(), t: Date.now(), side: 'buy', eth: ethIn, tokens: q.tokens, price: q.fillPrice, mc: q.mcAtFill, impact: q.impact, ...snapshot(pool) }
  setAccount((a) => {
    const p = a.positions[pool.pool] || { ...snapshot(pool), tokens: 0, cost: 0, bought: 0, sold: 0, realized: 0, openedAt: Date.now(), entryMc: 0 }
    const np = {
      ...p,
      ...snapshot(pool),
      tokens: p.tokens + q.tokens,
      cost: p.cost + ethIn,
      entryMc: (p.entryMc * p.bought + q.mcAtFill * ethIn) / (p.bought + ethIn),
      bought: p.bought + ethIn,
      lastPriceUsd: pool.priceUsd,
      lastMc: pool.mc,
    }
    return { ...a, eth: a.eth - ethIn, positions: { ...a.positions, [pool.pool]: np }, trades: [t, ...a.trades].slice(0, 500) }
  })
  return { ok: true, trade: t }
}

export function sell(pool, tokens) {
  const acct = account()
  const pos = acct.positions[pool.pool]
  if (!pos || pos.tokens <= 0) return { ok: false, msg: `Du ejer ingen ${pool.symbol}.` }
  tokens = Math.min(tokens, pos.tokens)
  if (!(tokens > 0)) return { ok: false, msg: 'Vælg hvor meget du vil sælge.' }
  const q = quoteSell(pool, tokens)
  if (!q) return { ok: false, msg: 'Prisen er ikke klar endnu. Prøv igen om et øjeblik.' }
  const slip = paper.get().settings.slippage
  if (q.impact * 100 > slip)
    return { ok: false, msg: `Prisudsvinget ville være ${(q.impact * 100).toFixed(1)}%, over din slippage på ${slip}%. Sælg en mindre del eller hæv slippage.` }
  const frac = tokens / pos.tokens
  const costPart = pos.cost * frac
  const pnl = q.ethOut - costPart
  const t = { id: Date.now() + Math.random(), t: Date.now(), side: 'sell', eth: q.ethOut, tokens, price: q.fillPrice, mc: pool.mc, impact: q.impact, pnl, ...snapshot(pool) }
  setAccount((a) => {
    const positions = { ...a.positions }
    const rest = pos.tokens - tokens
    const closed = rest <= pos.tokens * 1e-9
    positions[pool.pool] = {
      ...pos,
      tokens: closed ? 0 : rest,
      cost: closed ? 0 : pos.cost - costPart,
      sold: pos.sold + q.ethOut,
      realized: pos.realized + pnl,
      lastPriceUsd: pool.priceUsd,
      lastMc: pool.mc,
      closedAt: closed ? Date.now() : null,
    }
    return { ...a, eth: a.eth + q.ethOut, realized: a.realized + pnl, positions, trades: [t, ...a.trades].slice(0, 500) }
  })
  return { ok: true, trade: t }
}

/* -------------------- valuation -------------------- */
export function positionValue(pos, pools = market.get().pools, e = ethUsd()) {
  const live = pools[pos.pool]
  const price = live?.priceUsd || pos.lastPriceUsd || 0
  if (!e) return { valueEth: 0, pnl: -pos.cost, pnlPct: -100, price, mc: live?.mc || pos.lastMc || 0 }
  const valueEth = (pos.tokens * price) / e
  const pnl = valueEth - pos.cost
  return { valueEth, pnl, pnlPct: pos.cost ? (pnl / pos.cost) * 100 : 0, price, mc: live?.mc || pos.lastMc || 0 }
}

export function equityEth(acct = account(), pools = market.get().pools, e = ethUsd()) {
  let v = acct.eth
  for (const p of Object.values(acct.positions)) if (p.tokens > 0) v += positionValue(p, pools, e).valueEth
  return v
}

export const openPositions = (acct = account()) => Object.values(acct.positions).filter((p) => p.tokens > 0)
