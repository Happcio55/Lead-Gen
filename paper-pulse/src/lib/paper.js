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
const KEY = 'paperpulse:v2'

const newAccount = (start) => ({
  start,
  eth: start,
  positions: {},
  trades: [],
  orders: [],
  curve: [[Date.now(), start]],
  realized: 0,
  createdAt: Date.now(),
})

export const freshState = () => ({
  onboarded: false,
  accounts: { [ACTIVE_CHAIN.id]: newAccount(1) },
  settings: { quickBuy: { new: 0.05, trending: 0.1, top: 0.25 }, buyPresets: [0.01, 0.05, 0.1, 0.5], sellPresets: [10, 25, 50, 100], slippage: 20 },
  history: [],
})
const valid = (s) => s && s.accounts && s.settings

// Guests persist under KEY; a signed-in wallet persists under its own key (and in the cloud).
let storeKey = KEY
const saved = storage.get(KEY, null)
export const paper = createStore(valid(saved) ? saved : freshState())
paper.subscribe(() => storage.set(storeKey, paper.get()))

// Switch whose paper account is loaded. `state` wins when given, else the cached copy for that key.
export function switchIdentity(address, state) {
  storeKey = address ? KEY + ':' + address : KEY
  const next = valid(state) ? state : storage.get(storeKey, null)
  paper.set(valid(next) ? next : address ? { ...paper.get() } : freshState())
}

export const account = (s = paper.get()) => {
  const a = s.accounts[ACTIVE_CHAIN.id] || newAccount(1)
  return a.orders ? a : { ...a, orders: [], curve: a.curve || [[a.createdAt, a.start]] }
}

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
export const ethUsd = () => market.get().ethUsd || 0

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

/* -------------------- market orders -------------------- */
const snapshot = (pool) => ({
  pool: pool.pool,
  tokenAddress: pool.tokenAddress,
  symbol: pool.symbol,
  name: pool.name,
  image: pool.image || null,
})

const fmt4 = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 4 })

export function buy(pool, ethIn, via = 'market', { force = false } = {}) {
  const acct = account()
  const slip = paper.get().settings.slippage
  if (!(ethIn > 0)) return { ok: false, msg: 'Enter an ETH amount to buy.' }
  if (ethIn > acct.eth + 1e-12) return { ok: false, msg: `Insufficient balance. You have ${fmt4(acct.eth)} ETH available.` }
  const q = quoteBuy(pool, ethIn)
  if (!q) return { ok: false, msg: 'Price not loaded yet. Try again in a second.' }
  if (!force && q.impact * 100 > slip)
    return { ok: false, slippage: true, impact: q.impact, msg: `Price impact ${(q.impact * 100).toFixed(1)}% exceeds your ${slip}% slippage. Buy less, raise slippage, or execute anyway.` }
  const t = { id: Date.now() + Math.random(), t: Date.now(), side: 'buy', via, eth: ethIn, tokens: q.tokens, price: q.fillPrice, mc: q.mcAtFill, impact: q.impact, ...snapshot(pool) }
  setAccount((a) => {
    const p = a.positions[pool.pool] || { ...snapshot(pool), tokens: 0, cost: 0, bought: 0, sold: 0, realized: 0, openedAt: Date.now(), entryMc: 0, boughtTokens: 0 }
    const np = {
      ...p,
      ...snapshot(pool),
      tokens: p.tokens + q.tokens,
      cost: p.cost + ethIn,
      entryMc: (p.entryMc * p.bought + q.mcAtFill * ethIn) / (p.bought + ethIn),
      bought: p.bought + ethIn,
      boughtTokens: (p.boughtTokens || 0) + q.tokens,
      lastPriceUsd: pool.priceUsd,
      lastMc: pool.mc,
      closedAt: null,
    }
    return { ...a, eth: a.eth - ethIn, positions: { ...a.positions, [pool.pool]: np }, trades: [t, ...a.trades].slice(0, 1000) }
  })
  recordEquity()
  return { ok: true, trade: t }
}

export function sell(pool, tokens, via = 'market', { force = false } = {}) {
  const acct = account()
  const pos = acct.positions[pool.pool]
  if (!pos || pos.tokens <= 0) return { ok: false, msg: `You don't hold any ${pool.symbol}.` }
  tokens = Math.min(tokens, pos.tokens)
  if (!(tokens > 0)) return { ok: false, msg: 'Choose how much to sell.' }
  const q = quoteSell(pool, tokens)
  if (!q) return { ok: false, msg: 'Price not loaded yet. Try again in a second.' }
  const slip = paper.get().settings.slippage
  // selling the whole bag always fills: you can always exit, just at a worse price
  const all = tokens >= pos.tokens * 0.999999
  if (!force && !all && q.impact * 100 > slip)
    return { ok: false, slippage: true, impact: q.impact, msg: `Price impact ${(q.impact * 100).toFixed(1)}% exceeds your ${slip}% slippage. Sell less, raise slippage, or execute anyway.` }
  const frac = tokens / pos.tokens
  const costPart = pos.cost * frac
  const pnl = q.ethOut - costPart
  const t = { id: Date.now() + Math.random(), t: Date.now(), side: 'sell', via, eth: q.ethOut, tokens, price: q.fillPrice, mc: pool.mc, impact: q.impact, pnl, pnlPct: costPart ? (pnl / costPart) * 100 : 0, ...snapshot(pool) }
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
      exitMc: pool.mc,
      lastPriceUsd: pool.priceUsd,
      lastMc: pool.mc,
      closedAt: closed ? Date.now() : null,
    }
    const orders = closed ? a.orders.filter((o) => !(o.pool === pool.pool && o.side === 'sell')) : a.orders
    return { ...a, eth: a.eth + q.ethOut, realized: a.realized + pnl, positions, orders, trades: [t, ...a.trades].slice(0, 1000) }
  })
  recordEquity()
  return { ok: true, trade: t }
}

/* -------------------- limit orders (trigger on market cap) -------------------- */
export function placeLimit(pool, side, triggerMc, amount) {
  if (!(triggerMc > 0)) return { ok: false, msg: 'Enter a trigger market cap.' }
  const acct = account()
  if (side === 'buy') {
    if (!(amount > 0)) return { ok: false, msg: 'Enter an ETH amount to buy.' }
    if (amount > acct.eth + 1e-12) return { ok: false, msg: `Insufficient balance. You have ${fmt4(acct.eth)} ETH available.` }
  } else {
    if (!acct.positions[pool.pool]?.tokens) return { ok: false, msg: `You don't hold any ${pool.symbol}.` }
    if (!(amount > 0 && amount <= 100)) return { ok: false, msg: 'Choose a percentage between 1 and 100.' }
  }
  const o = { id: Date.now() + Math.random(), t: Date.now(), side, triggerMc, amount, mcAtPlace: pool.mc, ...snapshot(pool) }
  setAccount((a) => ({ ...a, orders: [o, ...a.orders] }))
  return { ok: true, order: o }
}

export function cancelOrder(id) {
  setAccount((a) => ({ ...a, orders: a.orders.filter((o) => o.id !== id) }))
}

// Called whenever market data changes. Returns fill/cancel events for toasts.
export function checkOrders(pools) {
  const acct = account()
  if (!acct.orders.length) return []
  const events = []
  for (const o of acct.orders) {
    const pool = pools[o.pool]
    if (!pool?.mc) continue
    const hit = o.side === 'buy' ? pool.mc <= o.triggerMc : pool.mc >= o.triggerMc
    if (!hit) continue
    cancelOrder(o.id)
    const pos = account().positions[o.pool]
    const r = o.side === 'buy' ? buy(pool, o.amount, 'limit') : sell(pool, ((pos?.tokens || 0) * o.amount) / 100, 'limit')
    events.push({ order: o, ...r })
  }
  return events
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

// Equity curve for the portfolio chart. Skips points while prices are still loading.
export function recordEquity() {
  if (!ethUsd()) return
  const acct = account()
  const held = openPositions(acct)
  const pools = market.get().pools
  if (held.some((p) => !pools[p.pool]?.priceUsd && !p.lastPriceUsd)) return
  const v = equityEth(acct)
  setAccount((a) => {
    const curve = [...(a.curve || []), [Date.now(), v]]
    return { ...a, curve: curve.length > 3000 ? curve.filter((_, i) => i % 2 === 0) : curve }
  })
}
