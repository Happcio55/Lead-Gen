// Buy/sell execution, position bookkeeping and the TP/SL engine.
import { useCallback, useEffect, useRef } from 'react';
import { formatUnits, parseEther } from 'viem';
import { ERC20_ABI, txUrl } from '../../shared/chain.js';
import { buildBuyTx, buildSellTx, quote, sellApprovals, withSlippage } from '../../shared/v4.js';
import { chainClient, eth } from './lib.js';
import { getState, set, toast, updateToast } from './store.js';
import { useWallet } from './wallet.jsx';

const POOL_FIELDS = ['id', 'currency0', 'currency1', 'fee', 'tickSpacing', 'hooks'];

function poolOf(row) {
  return Object.fromEntries(POOL_FIELDS.map((k) => [k, row[k]]));
}

function errText(e) {
  const m = e?.shortMessage || e?.details || e?.message || String(e);
  if (/user rejected|denied|rejected the request/i.test(m)) return 'Cancelled in wallet';
  if (/insufficient funds/i.test(m)) return 'Not enough ETH for amount + gas';
  return m.slice(0, 140);
}

async function confirm(hash) {
  const r = await chainClient.waitForTransactionReceipt({ hash, timeout: 90_000, pollingInterval: 700 });
  if (r.status !== 'success') throw new Error('Transaction reverted (price moved past slippage?)');
  return r;
}

function updatePosition(address, token, fn) {
  const key = address.toLowerCase();
  set({
    positions: (all) => {
      const mine = { ...(all[key] || {}) };
      const next = fn(mine[token]);
      if (next) mine[token] = next;
      else delete mine[token];
      return { ...all, [key]: mine };
    },
  });
}

function logTrade(entry) {
  set({ trades: (t) => [{ ...entry, at: Date.now() }, ...t].slice(0, 200) });
}

async function balanceOf(token, owner) {
  return chainClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] });
}

export function useTrader() {
  const wallet = useWallet();
  const busy = useRef(new Set());

  const buy = useCallback(
    async (row, ethAmount) => {
      if (!wallet.authenticated) return wallet.login();
      const key = `buy:${row.token}`;
      if (busy.current.has(key)) return;
      busy.current.add(key);
      const t = toast(`Buying ${row.symbol} for ${ethAmount} ETH…`, { kind: 'pending', ttl: 0 });
      try {
        const pool = poolOf(row);
        const amountIn = parseEther(String(ethAmount));
        const out = await quote(chainClient, pool, { side: 'buy', amountIn });
        const slip = Math.round(getState().settings.slippage * 100);
        const hash = await wallet.send(buildBuyTx(pool, { amountIn, minOut: withSlippage(out, slip) }));
        updateToast(t, { msg: `Buying ${row.symbol}… waiting for confirmation`, link: txUrl(hash) }, 0);
        await confirm(hash);
        const bal = await balanceOf(row.token, wallet.address);
        updatePosition(wallet.address, row.token, (p) => ({
          ...pool,
          token: row.token,
          symbol: row.symbol,
          name: row.name,
          decimals: row.decimals,
          costEth: (p?.costEth || 0) + Number(ethAmount),
          openedAt: p?.openedAt || Date.now(),
          lastPriceEth: row.priceEth,
          balance: bal.toString(),
        }));
        logTrade({ side: 'buy', symbol: row.symbol, token: row.token, eth: Number(ethAmount), hash, wallet: wallet.address });
        updateToast(t, { kind: 'success', msg: `Bought ${row.symbol} for ${ethAmount} ETH`, link: txUrl(hash) });
        return hash;
      } catch (e) {
        updateToast(t, { kind: 'error', msg: `Buy failed: ${errText(e)}` });
      } finally {
        busy.current.delete(key);
      }
    },
    [wallet]
  );

  const sell = useCallback(
    async (pos, fraction, { reason } = {}) => {
      if (!wallet.authenticated) return wallet.login();
      const key = `sell:${pos.token}`;
      if (busy.current.has(key)) return;
      busy.current.add(key);
      const label = reason ? `${reason}: selling` : 'Selling';
      const t = toast(`${label} ${Math.round(fraction * 100)}% ${pos.symbol}…`, { kind: 'pending', ttl: 0 });
      try {
        const bal = await balanceOf(pos.token, wallet.address);
        const amountIn = fraction >= 1 ? bal : (bal * BigInt(Math.round(fraction * 10_000))) / 10_000n;
        if (amountIn === 0n) throw new Error('Nothing to sell');
        const approvals = await sellApprovals(chainClient, { owner: wallet.address, token: pos.token, amount: amountIn });
        for (const a of approvals) {
          updateToast(t, { msg: `${a.label}…` }, 0);
          await confirm(await wallet.send(a));
        }
        const out = await quote(chainClient, pos, { side: 'sell', amountIn });
        const slip = Math.round(getState().settings.slippage * 100);
        const hash = await wallet.send(buildSellTx(pos, { amountIn, minOut: withSlippage(out, slip) }));
        updateToast(t, { msg: `${label} ${pos.symbol}… waiting for confirmation`, link: txUrl(hash) }, 0);
        await confirm(hash);
        const received = Number(formatUnits(out, 18));
        const left = await balanceOf(pos.token, wallet.address);
        updatePosition(wallet.address, pos.token, (p) => {
          if (!p) return null;
          const soldShare = bal > 0n ? Number(amountIn) / Number(bal) : 1;
          const costOut = p.costEth * soldShare;
          const realized = (p.realizedEth || 0) + received - costOut;
          if (left === 0n) return null;
          return { ...p, costEth: p.costEth - costOut, realizedEth: realized, balance: left.toString() };
        });
        logTrade({ side: 'sell', symbol: pos.symbol, token: pos.token, eth: received, hash, wallet: wallet.address, reason });
        updateToast(t, { kind: 'success', msg: `Sold ${pos.symbol} for ~${eth(received)} ETH`, link: txUrl(hash) });
        return hash;
      } catch (e) {
        updateToast(t, { kind: 'error', msg: `Sell failed: ${errText(e)}` });
        throw e;
      } finally {
        busy.current.delete(key);
      }
    },
    [wallet]
  );

  return { buy, sell, wallet };
}

// Keep on-chain balances of tracked positions fresh; drop positions sold elsewhere.
export function useBalanceSync() {
  const wallet = useWallet();
  useEffect(() => {
    if (!wallet.address) return;
    let stop = false;
    const tick = async () => {
      const key = wallet.address.toLowerCase();
      const mine = getState().positions[key] || {};
      const tokens = Object.keys(mine);
      if (tokens.length) {
        try {
          const res = await chainClient.multicall({
            contracts: tokens.map((t) => ({ address: t, abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet.address] })),
            allowFailure: true,
          });
          if (stop) return;
          set({
            positions: (all) => {
              const cur = { ...(all[key] || {}) };
              tokens.forEach((t, i) => {
                if (res[i].status !== 'success' || !cur[t]) return;
                if (res[i].result === 0n) delete cur[t];
                else cur[t] = { ...cur[t], balance: res[i].result.toString() };
              });
              return { ...all, [key]: cur };
            },
          });
          fetch('/api/pin', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: tokens.map((t) => mine[t].id) }),
          }).catch(() => {});
        } catch {
          // transient RPC error; retry next tick
        }
      }
    };
    tick();
    const iv = setInterval(tick, 12_000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [wallet.address]);
}

// Position valuation against the live board price.
export function valuePosition(p, row, ethUsd) {
  const qty = Number(p.balance || 0) / 10 ** p.decimals;
  const priceEth = row?.priceEth ?? p.lastPriceEth ?? 0;
  const valueEth = qty * priceEth;
  const pnlEth = valueEth - p.costEth;
  const pnlPct = p.costEth > 0 ? (pnlEth / p.costEth) * 100 : 0;
  return { qty, priceEth, valueEth, valueUsd: valueEth * ethUsd, pnlEth, pnlPct, entryEth: qty > 0 ? p.costEth / qty : 0 };
}

export function setRule(address, token, rule) {
  const key = address.toLowerCase();
  set({
    rules: (all) => {
      const mine = { ...(all[key] || {}) };
      if (rule) mine[token] = { ...rule, peak: rule.peak ?? 0 };
      else delete mine[token];
      return { ...all, [key]: mine };
    },
  });
}

// TP/SL engine: evaluates rules on every board update while the tab is open.
// Evaluated in the browser so keys stay with the user (non-custodial); with an embedded
// Privy wallet the sell goes through without a popup.
export function useAutomation(rowsByToken, ethUsd) {
  const { sell, wallet } = useTrader();
  const firing = useRef(new Set());

  useEffect(() => {
    if (!wallet.address) return;
    const key = wallet.address.toLowerCase();
    const { positions, rules } = getState();
    const mine = positions[key] || {};
    const myRules = rules[key] || {};
    for (const [token, rule] of Object.entries(myRules)) {
      const p = mine[token];
      if (!p || !rule.armed || firing.current.has(token)) continue;
      if (rule.retryAt && Date.now() < rule.retryAt) continue;
      const row = rowsByToken.get(token);
      if (!row) continue;
      const v = valuePosition(p, row, ethUsd);
      if (v.qty <= 0 || p.costEth <= 0) continue;
      const peak = Math.max(rule.peak || 0, v.pnlPct);
      if (peak !== rule.peak) setRule(wallet.address, token, { ...rule, peak });

      let trigger = null;
      if (rule.tp != null && v.pnlPct >= rule.tp) trigger = { reason: `Take profit +${rule.tp}%`, fraction: (rule.tpSell ?? 100) / 100, kind: 'tp' };
      else if (rule.sl != null && v.pnlPct <= -rule.sl) trigger = { reason: `Stop loss -${rule.sl}%`, fraction: 1, kind: 'sl' };
      else if (rule.trail != null && peak > 0 && v.pnlPct <= peak - rule.trail) trigger = { reason: `Trailing stop ${rule.trail}%`, fraction: 1, kind: 'trail' };
      if (!trigger) continue;

      firing.current.add(token);
      sell(p, trigger.fraction, { reason: trigger.reason })
        .then(() => {
          const next = { ...rule, peak: 0, retryAt: 0 };
          if (trigger.kind === 'tp' && trigger.fraction < 1) next.tp = null; // partial TP fires once
          else next.armed = false;
          setRule(wallet.address, token, next);
        })
        // Back off after a failed attempt instead of retrying on every board tick.
        .catch(() => setRule(wallet.address, token, { ...rule, peak, retryAt: Date.now() + 30_000 }))
        .finally(() => firing.current.delete(token));
    }
  }, [rowsByToken, ethUsd, wallet.address, sell]);
}
