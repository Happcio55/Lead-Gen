// Picks how to fill a trade and returns a plan the browser executes step by step.
//
// Buy:  Relay straight into the token when it can (DEX-listed tokens, one signature from any chain).
//       Otherwise the launch curve or Uniswap V3 (stock tokens). From another chain those run as a
//       Relay destination call, so it is still a single signature; on Robinhood Chain it's one tx.
// Sell: Relay when it can (token -> native coin on the chosen chain). Otherwise curve/Uniswap to ETH on
//       Robinhood Chain (approve + swap), plus a Relay bridge step when the user wants funds elsewhere.
import * as relay from './relay.js';
import { buildSwap } from './uniswap.js';
import { buildV4Trade } from './uniswap4.js';
import { buildCurveTrade, findCurve } from './curve.js';
import { db } from './store.js';
import { config } from './config.js';

const RH = config.chainId;
const NATIVE = '0x0000000000000000000000000000000000000000';
const s = v => (v == null ? null : BigInt(v).toString());
const hexv = v => '0x' + BigInt(v || 0).toString(16);
const txJson = t => t && { to: t.to, data: t.data, value: hexv(t.value), chainId: RH };

function relaySummary(q) {
  const d = q.details || {};
  const f = q.fees || {};
  const fees = ['gas', 'relayer', 'app'].reduce((a, k) => a + (Number(f[k]?.amountUsd) || 0), 0);
  return { eta: d.timeEstimate ?? null, feesUsd: fees || null, inUsd: d.currencyIn?.amountUsd ? Number(d.currencyIn.amountUsd) : null, outUsd: d.currencyOut?.amountUsd ? Number(d.currencyOut.amountUsd) : null };
}

async function relayQuote(q) {
  const r = await relay.quote(q);
  if (r.status !== 200 || !r.body.steps) {
    const e = new Error(r.body.message || 'Relay could not route this');
    e.code = r.body.errorCode;
    throw e;
  }
  return r.body;
}

// On-chain trade (curve or Uniswap) for a token on Robinhood Chain.
async function onChainTrade(token, args) {
  const isStock = Boolean(db.stocks[token]);
  if (!isStock) {
    const curveTrade = await buildCurveTrade({ token, ...args }).catch(e => { if (/rejected/.test(e.message)) return null; throw e; });
    if (curveTrade) return { venue: 'curve', ...curveTrade };
  }
  const uni = await buildSwap({ token, ...args }).catch(() => null);
  if (uni) return { venue: 'uniswap', ...uni };
  const v4 = await buildV4Trade({ token, ...args });
  if (v4) return { venue: 'uniswap-v4', ...v4 };
  return null;
}

export async function buildRoute({ user, chainId, token, side, amount, slippageBps = 100 }) {
  chainId = Number(chainId);
  token = token.toLowerCase();
  const amt = BigInt(amount);
  const isStock = Boolean(db.stocks[token]);
  const meta = db.tokens[token] || db.stocks[token] || {};
  const decimals = meta.decimals ?? 18;

  if (side !== 'sell') {
    // 1. Relay directly into the token. If it can't (unsupported, no route, too much impact) we fall back
    //    to the curve/Uniswap and only surface Relay's reason if nothing else works either.
    let relayErr = null;
    if (!isStock) {
      try {
        const q = await relayQuote({ user, chainId, token, amount: s(amt), side: 'buy', slippageBps });
        return { venue: 'relay', steps: [{ type: 'relay', quote: q }], amountOut: q.details.currencyOut.amount, outDecimals: q.details.currencyOut.currency.decimals, ...relaySummary(q) };
      } catch (e) {
        relayErr = e;
      }
    }
    const noRoute = () => new Error(relayErr ? relayErr.message : isStock ? 'No liquidity for this stock token right now' : 'Not tradable yet: no curve or pool found');
    // 2. Curve or Uniswap, already on Robinhood Chain.
    if (chainId === RH) {
      const t = await onChainTrade(token, { user, side: 'buy', amount: amt, slippageBps }).catch(() => null);
      if (!t) throw noRoute();
      return { venue: t.venue, steps: [{ type: 'tx', label: 'Buy', tx: txJson(t.tx) }], amountOut: s(t.amountOut), minOut: s(t.minOut), outDecimals: decimals, eta: 1, feesUsd: null };
    }
    // 3. From another chain: bridge ETH and execute the curve/Uniswap buy in the same Relay request.
    const bridge = await relayQuote({ user, chainId, token: NATIVE, amount: s(amt), side: 'buy', slippageBps });
    const arriving = BigInt(bridge.details.currencyOut.minimumAmount || bridge.details.currencyOut.amount);
    const callValue = arriving * 995n / 1000n;
    const t = await onChainTrade(token, { user, side: 'buy', amount: callValue, slippageBps, recipient: user }).catch(() => null);
    if (!t) throw noRoute();
    const q = await relayQuote({ user, chainId, token: NATIVE, amount: s(amt), side: 'buy', slippageBps, txs: [{ to: t.tx.to, value: s(callValue), data: t.tx.data }] });
    return { venue: t.venue, steps: [{ type: 'relay', quote: q }], amountOut: s(t.amountOut), minOut: s(t.minOut), outDecimals: decimals, ...relaySummary(q), outUsd: null };
  }

  // ---- sell ----
  let sellErr = null;
  if (!isStock) {
    try {
      const q = await relayQuote({ user, chainId, token, amount: s(amt), side: 'sell', slippageBps });
      return { venue: 'relay', steps: [{ type: 'relay', quote: q }], amountOut: q.details.currencyOut.amount, outDecimals: q.details.currencyOut.currency.decimals, ...relaySummary(q) };
    } catch (e) {
      sellErr = e;
    }
  }
  const t = await onChainTrade(token, { user, side: 'sell', amount: amt, slippageBps }).catch(e => { sellErr = sellErr || e; return null; });
  if (!t) throw new Error(sellErr ? sellErr.message : 'No curve or pool to sell into');
  const steps = [];
  if (t.approve) steps.push({ type: 'tx', label: 'Approve', tx: txJson(t.approve) });
  if (t.approve2) steps.push({ type: 'tx', label: 'Approve router', tx: txJson(t.approve2) });
  steps.push({ type: 'tx', label: 'Sell', tx: txJson(t.tx), ethOut: s(t.minOut) });
  let amountOut = s(t.amountOut), extra = {};
  if (chainId !== RH) {
    // The bridge leg is re-quoted with the exact ETH received once the sell has settled.
    steps.push({ type: 'bridge', chainId });
    try {
      const b = await relayQuote({ user, chainId, token: NATIVE, amount: s(t.minOut), side: 'sell', slippageBps });
      amountOut = b.details.currencyOut.amount;
      extra = relaySummary(b);
    } catch { /* estimate stays in ETH on Robinhood Chain */ }
  }
  return { venue: t.venue, steps, amountOut, minOut: s(t.minOut), outDecimals: 18, eta: (extra.eta || 0) + 2, feesUsd: extra.feesUsd ?? null };
}

export { findCurve };
