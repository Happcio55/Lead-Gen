/* Live wallets: every number is rebuilt from public Robinhood Chain data (RPC + Blockscout + DexScreener). */
(function (global) {
  'use strict';
  const { AGENTS } = global.Q;
  const KEY = 'qubit-royale-wallets-v1';
  const HIST = 'qubit-royale-live-hist-v1';

  function loadWallets() {
    const base = Object.assign({}, (global.QR_CONFIG && global.QR_CONFIG.wallets) || {});
    try { Object.assign(base, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* ignore */ }
    for (const k of Object.keys(base)) if (!Chain.isAddr(base[k])) delete base[k];
    return base;
  }
  let wallets = loadWallets();
  let hist = {};
  try { hist = JSON.parse(localStorage.getItem(HIST)) || {}; } catch (e) { hist = {}; }
  const cache = {};
  let lastError = null;

  function setWallet(id, addr) {
    if (addr) wallets[id] = addr; else delete wallets[id];
    try { localStorage.setItem(KEY, JSON.stringify(wallets)); } catch (e) { /* ignore */ }
  }

  const lc = (a) => (a || '').toLowerCase();
  const wei = (v) => { try { return Number(BigInt(v || '0')) / 1e18; } catch (e) { return 0; } };
  const units = (v, d) => { try { return Number(BigInt(v || '0')) / 10 ** (+d || 18); } catch (e) { return 0; } };
  const tokenAddr = (t) => lc(t.address_hash || t.address);

  async function track(addr) {
    const me = lc(addr);
    const [act, nativeHex] = await Promise.all([Chain.addressActivity(addr), Chain.rpc('eth_getBalance', [addr, 'latest'])]);
    const native = wei(nativeHex);
    const txByHash = new Map(act.txs.map((t) => [lc(t.hash), t]));
    const internalIn = new Map();
    for (const it of act.internals) {
      if (lc(it.to && it.to.hash) !== me || it.error) continue;
      const h = lc(it.transaction_hash);
      internalIn.set(h, (internalIn.get(h) || 0) + wei(it.value));
    }

    // funding: plain ETH sent in or out by people, not by routers
    let deposits = 0, withdrawals = 0;
    for (const t of act.txs) {
      if (t.status && t.status !== 'ok') continue;
      const v = wei(t.value);
      if (!v) continue;
      const types = t.transaction_types || [];
      if (lc(t.to && t.to.hash) === me && !(t.from && t.from.is_contract)) deposits += v;
      else if (lc(t.from && t.from.hash) === me && !(t.to && t.to.is_contract) && types.includes('coin_transfer')) withdrawals += v;
    }

    // swaps from ERC-20 transfers, one leg per tx hash
    const trades = [];
    const perToken = new Map();
    for (const tr of act.transfers) {
      const h = lc(tr.transaction_hash || tr.tx_hash);
      const tok = tr.token || {};
      const ta = tokenAddr(tok);
      const sym = tok.symbol || '?';
      if (/^W?ETH$/i.test(sym)) continue;
      const amount = units(tr.total && tr.total.value, (tr.total && tr.total.decimals) || tok.decimals);
      let side = null, ethLeg = 0;
      if (lc(tr.to && tr.to.hash) === me) { side = 'buy'; const tx = txByHash.get(h); ethLeg = tx && lc(tx.from && tx.from.hash) === me ? wei(tx.value) : 0; }
      else if (lc(tr.from && tr.from.hash) === me) { side = 'sell'; ethLeg = internalIn.get(h) || 0; }
      if (!side) continue;
      const tx = txByHash.get(h);
      if (side === 'buy' && !ethLeg && !(tx && lc(tx.from && tx.from.hash) === me)) continue; // airdrop or incoming transfer, not a trade
      trades.push({ ts: Date.parse(tr.timestamp), side, sym, addr: ta, amount, sizeEth: ethLeg || null, hash: h, block: tr.block_number, method: tr.method });
      const pt = perToken.get(ta) || { sym, buyEth: 0, sellEth: 0, buys: 0, sells: 0 };
      if (side === 'buy') { pt.buyEth += ethLeg; pt.buys++; } else { pt.sellEth += ethLeg; pt.sells++; }
      perToken.set(ta, pt);
    }
    trades.sort((a, b) => b.ts - a.ts);

    const held = act.tokens.map((it) => ({ addr: tokenAddr(it.token || {}), sym: (it.token || {}).symbol || '?', qty: units(it.value, (it.token || {}).decimals) })).filter((h) => h.qty > 0);
    const prices = await Chain.tokenPrices([...held.map((h) => h.addr), ...perToken.keys()]);
    let tokenEth = 0;
    const positions = held.map((h) => {
      const p = prices.get(h.addr);
      const isWeth = h.addr === Chain.CHAIN.weth;
      const priceEth = isWeth ? 1 : p ? p.priceEth : 0;
      const valueEth = h.qty * priceEth;
      tokenEth += valueEth;
      const pt = perToken.get(h.addr);
      const pnl = pt && pt.buyEth > 0 ? ((valueEth + pt.sellEth - pt.buyEth) / pt.buyEth) * 100 : null;
      return { addr: h.addr, sym: h.sym, qty: h.qty, valueEth, pnl, priced: isWeth || !!p, url: p ? p.url : `${Chain.CHAIN.explorer}/token/${h.addr}` };
    }).sort((a, b) => b.valueEth - a.valueEth);

    let closed = 0, wins = 0;
    const heldSet = new Set(positions.filter((p) => p.valueEth > 1e-9).map((p) => p.addr));
    for (const [a, pt] of perToken) if (!heldSet.has(a) && pt.sells) { closed++; if (pt.sellEth > pt.buyEth) wins++; }

    const equity = native + tokenEth;
    const netFunding = deposits - withdrawals;
    const pnlEth = equity - netFunding;
    return {
      address: addr, native, equity, deposits, withdrawals, netFunding, pnlEth,
      ret: deposits > 0 ? (pnlEth / deposits) * 100 : null,
      positions, trades, closed, wins, prices,
      first: act.txs.length ? Date.parse(act.txs[act.txs.length - 1].timestamp) : null
    };
  }

  async function refresh() {
    lastError = null;
    await Promise.all(AGENTS.map(async (a) => {
      const addr = wallets[a.id];
      if (!addr) { delete cache[a.id]; return; }
      try {
        const r = await track(addr);
        cache[a.id] = r;
        const key = lc(addr);
        const h = hist[key] || (hist[key] = []);
        if (r.ret != null) h.push([Date.now(), +r.ret.toFixed(4)]); // return %, comparable across wallets of any size
        if (h.length > 2000) h.splice(0, h.length - 2000);
      } catch (e) { lastError = e.message; if (cache[a.id]) cache[a.id].stale = true; }
    }));
    try { localStorage.setItem(HIST, JSON.stringify(hist)); } catch (e) { /* ignore */ }
  }

  function snapshot() {
    const journal = [];
    const agents = AGENTS.map((a) => {
      const r = cache[a.id];
      if (!r) return { id: a.id, address: wallets[a.id] || null, linked: !!wallets[a.id], loading: !!wallets[a.id], equity: null, ret: null, positions: [], trades: 0, history: [], last: wallets[a.id] ? 'Reading the wallet from mainnet…' : 'No wallet linked yet.' };
      for (const t of r.trades) journal.push({ ...t, agent: a.id, priceUsd: null, why: t.sizeEth ? `${t.side === 'buy' ? 'Paid' : 'Received'} ${t.sizeEth.toFixed(6)} ETH for ${t.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${t.sym}` : `${t.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${t.sym}`, p11: null, url: (r.prices.get(t.addr) || {}).url || `${Chain.CHAIN.explorer}/token/${t.addr}` });
      const top = r.trades[0];
      return {
        id: a.id, address: r.address, linked: true, stale: !!r.stale,
        equity: r.equity, base: r.deposits, ret: r.ret, cash: r.native, pnlEth: r.pnlEth,
        deposits: r.deposits, withdrawals: r.withdrawals,
        trades: r.trades.length, winRate: r.closed ? r.wins / r.closed : null,
        last: top ? `${top.side === 'buy' ? 'Bought' : 'Sold'} ${top.sym} · confirmed` : 'No swaps yet.',
        positions: r.positions, history: hist[lc(r.address)] || []
      };
    });
    journal.sort((x, y) => y.ts - x.ts);
    return { mode: 'live', agents, journal, error: lastError };
  }

  global.Live = { refresh, snapshot, setWallet, get wallets() { return { ...wallets }; }, track };
})(window);
