/* Paper round: the four agents trade live mainnet prices with simulated fills. */
(function (global) {
  'use strict';
  const { AGENTS } = global.Q;
  const STORE = 'model-citizens-sim-v1';
  const START_ETH = 1;
  const FEE = 0.003;
  const SIZE = 0.22;
  const MAX_POS = 4;
  const MAX_IMPACT = 0.03;
  const COOLDOWN = 10 * 60 * 1000;
  const pct = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + '%';
  const usd = (x) => (x >= 1e6 ? '$' + (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : '$' + x.toFixed(0));

  function fresh() {
    const agents = {};
    for (const a of AGENTS) agents[a.id] = { cash: START_ETH, pos: {}, trades: 0, wins: 0, closed: 0, last: 'Booting circuits…', cool: {} };
    return { v: 2, start: Date.now(), agents, series: { t: [], ...Object.fromEntries(AGENTS.map((a) => [a.id, []])) }, journal: [] };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (s && s.v === 2 && AGENTS.every((a) => s.agents[a.id])) return s;
    } catch (e) { /* storage blocked */ }
    return fresh();
  }
  let state = load();
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } };

  function equity(id, byAddr) {
    const ag = state.agents[id];
    let e = ag.cash;
    for (const [addr, p] of Object.entries(ag.pos)) { const t = byAddr.get(addr); e += p.qty * (t ? t.priceEth : p.last); }
    return e;
  }

  function why(a, t, u) {
    switch (a.id) {
      case 'gptony': return `Momentum: 5m ${pct(t.m5)}, 1h ${pct(t.h1)}, ${t.buys1h} buys vs ${t.sells1h} sells this hour`;
      case 'gemtwins': return `Both twins agree: 24h ${pct(t.h24)} and 6h ${pct(t.h6)} against the board`;
      case 'grokstar': return `Contrarian: 24h trend ${pct(t.h24)} with a 1h dip of ${pct(t.h1)}`;
      case 'mistro': return `Scalp: 5m burst ${pct(t.m5)} with ${t.buys1h} buyers this hour`;
      case 'llambo': return `Stampede: pool turned over ${(t.vol / t.liq).toFixed(2)}× today, 1h ${pct(t.h1)}`;
      case 'seeker': return `Microcap: ${usd(t.mcap)} cap backed by a ${usd(t.liq)} pool, 6h ${pct(t.h6)}`;
      default: return `Liquidity: ${usd(t.liq)} pool turning over ${(t.vol / t.liq).toFixed(2)}× a day`;
    }
  }

  /* market: {tokens, ethUsd}, byAddr: Map, evals: {agentId: {addr: eval}}, u: universe stats, head: block */
  function step(market, byAddr, evals, u, head, onTrade) {
    const now = Date.now();
    AGENTS.forEach((a, ai) => {
      const ag = state.agents[a.id];
      const ev = evals[a.id];
      for (const [addr, p] of Object.entries(ag.pos)) {
        const t = byAddr.get(addr);
        if (!t) continue;
        p.last = t.priceEth;
        const pnl = t.priceEth / p.entry - 1;
        const e = ev[addr];
        let reason = null;
        if (pnl <= a.stop) reason = `Stop-loss at ${pct(pnl * 100)} from entry`;
        else if (pnl >= a.take) reason = `Take-profit at ${pct(pnl * 100)} from entry`;
        else if (e && e.score <= a.sellAt) reason = `Signal flipped to ${e.score.toFixed(2)}; |00⟩ at ${(e.probs[0] * 100).toFixed(0)}%`;
        if (!reason) continue;
        const impact = Math.min(0.2, (p.qty * t.priceEth * market.ethUsd) / Math.max(t.liq / 2, 1));
        const proceeds = p.qty * t.priceEth * (1 - impact) * (1 - FEE);
        ag.cash += proceeds;
        const realized = proceeds / p.cost - 1;
        ag.closed++; if (realized > 0) ag.wins++;
        ag.trades++;
        delete ag.pos[addr];
        ag.cool[addr] = now;
        ag.last = `Sold ${t.sym} ${pct(realized * 100)}`;
        log(a.id, 'sell', t, proceeds, realized, reason, e, head);
        onTrade && onTrade(ai, 'sell', t);
      }
      const eq = equity(a.id, byAddr);
      const cands = market.tokens
        .filter((t) => !ag.pos[t.addr] && t.buys1h + t.sells1h >= 3 && ev[t.addr] && ev[t.addr].score >= a.buyAt && !(ag.cool[t.addr] && now - ag.cool[t.addr] < COOLDOWN))
        .sort((x, y) => ev[y.addr].score - ev[x.addr].score);
      for (const t of cands) {
        if (Object.keys(ag.pos).length >= MAX_POS || ag.cash < 0.02) break;
        let size = Math.min(ag.cash, eq * SIZE, (MAX_IMPACT * (t.liq / 2)) / Math.max(market.ethUsd, 1));
        if (size < 0.01) continue;
        const impact = (size * market.ethUsd) / (t.liq / 2);
        const exec = t.priceEth * (1 + impact);
        ag.cash -= size;
        ag.pos[t.addr] = { qty: (size * (1 - FEE)) / exec, entry: exec, cost: size, last: t.priceEth, sym: t.sym, at: now };
        ag.trades++;
        ag.last = `Bought ${t.sym} at score ${ev[t.addr].score.toFixed(2)}`;
        log(a.id, 'buy', t, size, null, why(a, t, u), ev[t.addr], head);
        onTrade && onTrade(ai, 'buy', t);
      }
      if (ag.last === 'Booting circuits…') ag.last = 'Scanning. Nothing clears its bar yet.';
    });
    state.series.t.push(now);
    for (const a of AGENTS) state.series[a.id].push(+equity(a.id, byAddr).toFixed(6));
    if (state.series.t.length > 3000) for (const k of Object.keys(state.series)) state.series[k] = state.series[k].filter((_, i, arr) => i % 2 === 0 || i === arr.length - 1);
    save();
  }

  function log(agent, side, t, size, realized, reason, e, head) {
    state.journal.unshift({
      ts: Date.now(), agent, side, sym: t.sym, addr: t.addr, url: t.url, sizeEth: size, priceUsd: t.priceUsd,
      realized, why: reason, p11: e ? e.probs[3] : null, block: head ? head.number : null, hash: null
    });
    if (state.journal.length > 400) state.journal.length = 400;
  }

  function snapshot(byAddr) {
    return {
      mode: 'sim',
      start: state.start,
      agents: AGENTS.map((a) => {
        const ag = state.agents[a.id];
        const eq = equity(a.id, byAddr);
        return {
          id: a.id, address: null, equity: eq, base: START_ETH, ret: (eq / START_ETH - 1) * 100, cash: ag.cash,
          trades: ag.trades, winRate: ag.closed ? ag.wins / ag.closed : null, last: ag.last,
          positions: Object.entries(ag.pos).map(([addr, p]) => {
            const t = byAddr.get(addr); const px = t ? t.priceEth : p.last;
            return { addr, sym: p.sym, qty: p.qty, valueEth: p.qty * px, pnl: (p.qty * px / p.cost - 1) * 100, since: p.at, url: t && t.url };
          }),
          history: state.series.t.map((t, i) => [t, state.series[a.id][i]])
        };
      }),
      journal: state.journal
    };
  }

  function reset() { state = fresh(); save(); }

  global.Sim = { step, snapshot, reset, get start() { return state.start; } };
})(window);
