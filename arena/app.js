/* Qubit Royale: arena engine + UI. */
(function () {
  'use strict';
  const { AGENTS } = Q;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STORE = 'qubit-royale-v1';
  const TICK_MS = 30000;
  const HEAD_MS = 5000;
  const START_ETH = 1;
  const FEE = 0.003;
  const SIZE = 0.22;
  const MAX_POS = 4;
  const MAX_IMPACT = 0.03;
  const COOLDOWN = 10 * 60 * 1000;

  /* ---------- formatting ---------- */
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  function fmtPrice(x) {
    if (!(x > 0)) return '—';
    if (x >= 1) return '$' + x.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (x >= 0.001) return '$' + x.toPrecision(4);
    const s = x.toFixed(20).split('.')[1];
    const z = s.match(/^0*/)[0].length;
    const sig = s.slice(z, z + 4).replace(/0+$/, '');
    return '$0.0' + String(z).split('').map((d) => SUB[d]).join('') + sig;
  }
  function fmtUsd(x) {
    if (!Number.isFinite(x)) return '—';
    const a = Math.abs(x);
    if (a >= 1e9) return '$' + (x / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (x / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + (x / 1e3).toFixed(1) + 'K';
    return '$' + x.toFixed(0);
  }
  const fmtEth = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  function fmtPct(x, d = 1) {
    if (!Number.isFinite(x)) return '<span class="muted">—</span>';
    const cls = x > 0 ? 'up' : x < 0 ? 'down' : 'muted';
    const sign = x > 0 ? '+' : x < 0 ? '−' : '';
    return `<span class="${cls}">${sign}${Math.abs(x).toFixed(d)}%</span>`;
  }
  const plainPct = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + '%';
  const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function fmtAge(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s % 60) + 's';
    const h = Math.floor(m / 60);
    if (h < 48) return h + 'h ' + (m % 60) + 'm';
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  }
  const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
  const avatar = (id) => {
    const paths = {
      flux: '<path d="M3 17l5-6 4 3 7-9" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 5h4v4" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
      vex: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
      echo: '<path d="M2 8c3 0 4 8 7 8s3-5 5-5 3 7 8 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="14" cy="11" r="2" fill="currentColor"/>',
      anchor: '<circle cx="12" cy="5" r="2.2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 7v14M5 13c0 4 3 8 7 8s7-4 7-8M8 11h8" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>'
    };
    return `<svg viewBox="0 0 24 24" style="color:#fff">${paths[id]}</svg>`;
  };

  /* ---------- state ---------- */
  function freshRound() {
    const agents = {};
    for (const a of AGENTS) agents[a.id] = { cash: START_ETH, pos: {}, trades: 0, wins: 0, closed: 0, last: 'Warming up its circuits…', cool: {} };
    return { v: 1, start: Date.now(), agents, series: { t: [], ...Object.fromEntries(AGENTS.map((a) => [a.id, []])) }, journal: [] };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (s && s.v === 1 && s.agents && AGENTS.every((a) => s.agents[a.id])) return s;
    } catch (e) { /* storage unavailable */ }
    return freshRound();
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  let state = load();
  let market = { tokens: [], ethUsd: 0, at: 0 };
  let byAddr = new Map();
  let evals = {}; // agentId -> addr -> eval
  let uStats = null;
  let chainHead = null;
  let lastTick = 0;
  let prevPrices = new Map();
  const ui = { range: 0, desk: AGENTS[0].id, jFilter: 'all', sortK: 'vol', sortDir: -1, search: '', labAgent: AGENTS[0].id, labToken: null, labOverride: null, showTable: false, wallet: null };

  /* ---------- engine ---------- */
  function equity(id) {
    const ag = state.agents[id];
    let e = ag.cash;
    for (const [addr, p] of Object.entries(ag.pos)) {
      const t = byAddr.get(addr);
      e += p.qty * (t ? t.priceEth : p.last);
    }
    return e;
  }

  function buyReason(a, t) {
    switch (a.id) {
      case 'flux': return `Momentum: 5m ${plainPct(t.m5)}, 1h ${plainPct(t.h1)}, with ${t.buys1h} buys vs ${t.sells1h} sells in the last hour`;
      case 'vex': return `Strength: 24h ${plainPct(t.h24)} vs a board mean of ${plainPct(uStats.mean24)}`;
      case 'echo': return `Pullback: 24h trend ${plainPct(t.h24)} with a 1h dip of ${plainPct(t.h1)}`;
      default: return `Liquidity: ${fmtUsd(t.liq)} pool turning over ${(t.vol / t.liq).toFixed(2)}× a day`;
    }
  }

  function runAgents(head) {
    const now = Date.now();
    for (const [ai, a] of AGENTS.entries()) {
      const ag = state.agents[a.id];
      const ev = evals[a.id];
      // mark + exits
      for (const [addr, p] of Object.entries(ag.pos)) {
        const t = byAddr.get(addr);
        if (!t) continue;
        p.last = t.priceEth;
        const pnl = t.priceEth / p.entry - 1;
        const e = ev[addr];
        let why = null;
        if (pnl <= a.stop) why = `Stop-loss: ${plainPct(pnl * 100)} from entry`;
        else if (pnl >= a.take) why = `Take-profit: ${plainPct(pnl * 100)} from entry`;
        else if (e && e.score <= a.sellAt) why = `Signal flipped to ${e.score.toFixed(2)}; |00⟩ avoid at ${(e.probs[0] * 100).toFixed(0)}%`;
        if (!why) continue;
        const impact = Math.min(0.2, (p.qty * t.priceEth * market.ethUsd) / Math.max(t.liq / 2, 1));
        const proceeds = p.qty * t.priceEth * (1 - impact) * (1 - FEE);
        ag.cash += proceeds;
        const realized = proceeds / p.cost - 1;
        ag.closed++; if (realized > 0) ag.wins++;
        ag.trades++;
        delete ag.pos[addr];
        ag.cool[addr] = now;
        ag.last = `Sold ${t.sym} ${plainPct(realized * 100)}`;
        log({ agent: a.id, side: 'sell', t, size: proceeds, realized, why, e, head });
        Hero.pulse(ai);
      }
      // entries
      const eq = equity(a.id);
      const cands = market.tokens
        .filter((t) => !ag.pos[t.addr] && t.buys1h + t.sells1h >= 3 && ev[t.addr] && ev[t.addr].score >= a.buyAt && !(ag.cool[t.addr] && now - ag.cool[t.addr] < COOLDOWN))
        .sort((x, y) => ev[y.addr].score - ev[x.addr].score);
      for (const t of cands) {
        if (Object.keys(ag.pos).length >= MAX_POS || ag.cash < 0.02) break;
        let size = Math.min(ag.cash, eq * SIZE);
        const maxByPool = (MAX_IMPACT * (t.liq / 2)) / Math.max(market.ethUsd, 1);
        size = Math.min(size, maxByPool);
        if (size < 0.01) continue;
        const impact = (size * market.ethUsd) / (t.liq / 2);
        const exec = t.priceEth * (1 + impact);
        const qty = (size * (1 - FEE)) / exec;
        ag.cash -= size;
        ag.pos[t.addr] = { qty, entry: exec, cost: size, last: t.priceEth, sym: t.sym, at: now };
        ag.trades++;
        ag.last = `Bought ${t.sym} at score ${ev[t.addr].score.toFixed(2)}`;
        log({ agent: a.id, side: 'buy', t, size, why: buyReason(a, t), e: ev[t.addr], head });
        Hero.pulse(ai);
      }
      if (ag.last === 'Warming up its circuits…') ag.last = 'Scanning. Nothing clears its threshold yet.';
    }
  }

  function log({ agent, side, t, size, realized, why, e, head }) {
    state.journal.unshift({
      ts: Date.now(), agent, side, sym: t.sym, addr: t.addr, url: t.url,
      size, priceUsd: t.priceUsd, realized: realized ?? null, why,
      p11: e ? e.probs[3] : null, score: e ? e.score : null,
      block: head ? head.number : null
    });
    if (state.journal.length > 400) state.journal.length = 400;
  }

  function record() {
    const s = state.series;
    s.t.push(Date.now());
    for (const a of AGENTS) s[a.id].push(+equity(a.id).toFixed(6));
    if (s.t.length > 3000) {
      for (const k of Object.keys(s)) s[k] = s[k].filter((_, i) => i % 2 === 0 || i === s[k].length - 1);
    }
  }

  function evaluateAll() {
    uStats = Q.universeStats(market.tokens);
    evals = {};
    for (const a of AGENTS) {
      evals[a.id] = {};
      for (const t of market.tokens) evals[a.id][t.addr] = Q.evaluate(a, t, uStats);
    }
  }

  let ticking = false;
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const held = [...new Set(AGENTS.flatMap((a) => Object.keys(state.agents[a.id].pos)))];
      const [m, h] = await Promise.all([Chain.loadMarket(held), Chain.head().catch(() => chainHead)]);
      if (h) chainHead = h;
      prevPrices = new Map(market.tokens.map((t) => [t.addr, t.priceUsd]));
      market = m;
      byAddr = new Map(m.tokens.map((t) => [t.addr, t]));
      evaluateAll();
      runAgents(chainHead);
      record();
      save();
      lastTick = Date.now();
      renderAll();
    } catch (e) {
      console.error(e);
      toast('Market scan failed: ' + e.message + '. Retrying in 30s.');
    } finally {
      ticking = false;
      renderStatus();
    }
  }

  async function headLoop() {
    try {
      chainHead = await Chain.head();
      $('#pulseDot').className = 'pulse on';
      $('#pillBlock').textContent = '#' + chainHead.number.toLocaleString('en-US');
      $('#chainPill').href = `${Chain.CHAIN.explorer}/block/${chainHead.number}`;
      $('#statBlock').textContent = chainHead.number.toLocaleString('en-US');
      $('#statGas').textContent = chainHead.gasGwei < 1 ? chainHead.gasGwei.toFixed(4) + ' gwei' : chainHead.gasGwei.toFixed(2) + ' gwei';
    } catch (e) {
      $('#pulseDot').className = 'pulse err';
      $('#pillBlock').textContent = 'RPC offline';
    }
    renderStatus();
  }

  /* ---------- rendering ---------- */
  function renderAll() {
    renderStats(); renderTicker(); renderBoard(); renderChart(); renderDesk(); renderLabOptions(); renderLab(); renderMarkets(); renderJournal();
  }

  function renderStats() {
    $('#statEth').textContent = market.ethUsd ? '$' + market.ethUsd.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
    $('#statTokens').textContent = market.tokens.length || '—';
    $('#mUpdated').textContent = market.at ? 'updated ' + fmtTime(market.at) : '';
  }

  function renderTicker() {
    const items = market.tokens.slice(0, 24).map((t) => `<span><b>${esc(t.sym)}</b>${fmtPrice(t.priceUsd)} ${fmtPct(t.h24)}</span>`).join('');
    $('#ticker').innerHTML = items + items;
  }

  function ranked() {
    return AGENTS.map((a) => ({ a, eq: equity(a.id) })).sort((x, y) => y.eq - x.eq);
  }

  function sparkPath(arr, w, h) {
    if (arr.length < 2) return '';
    const xs = arr.slice(-60);
    const mn = Math.min(...xs), mx = Math.max(...xs), r = mx - mn || 1e-9;
    return xs.map((v, i) => `${i ? 'L' : 'M'}${(i / (xs.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`).join('');
  }

  function renderBoard() {
    const r = ranked();
    $('#board').innerHTML = r.map(({ a, eq }, i) => {
      const ag = state.agents[a.id];
      const ret = (eq / START_ETH - 1) * 100;
      const winRate = ag.closed ? Math.round(ag.wins / ag.closed * 100) + '%' : '—';
      return `<article class="agent-card ${i === 0 ? 'leader' : ''}" style="--c:${a.color};--glow:${a.glow}" data-desk="${a.id}" tabindex="0" aria-label="${a.name} desk">
        <div class="ac-top">
          <span class="rank">#${i + 1}</span>
          <span class="avatar">${avatar(a.id)}</span>
          <div><div class="ac-name">${a.name}</div><div class="ac-style">${a.style}</div></div>
          ${i === 0 ? '<span class="crown">♛ leader</span>' : ''}
        </div>
        <svg class="ac-spark" viewBox="0 0 90 34" aria-hidden="true"><path d="${sparkPath(state.series[a.id], 90, 34)}" fill="none" stroke="${a.color}" stroke-width="2" stroke-linecap="round"/></svg>
        <div class="ac-equity">${fmtEth(eq)}<small>ETH</small></div>
        <div class="ac-ret">${fmtPct(ret, 2)} <span class="muted">· ${market.ethUsd ? fmtUsd(eq * market.ethUsd) : ''}</span></div>
        <div class="ac-grid">
          <div>Trades<b>${ag.trades}</b></div>
          <div>Open<b>${Object.keys(ag.pos).length}/${MAX_POS}</b></div>
          <div>Win rate<b>${winRate}</b></div>
        </div>
        <div class="ac-last">${esc(ag.last)}</div>
      </article>`;
    }).join('');
  }

  /* equity chart */
  function renderChart() {
    const svg = $('#equityChart');
    const wrap = $('#chartWrap');
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const s = state.series;
    let i0 = 0;
    if (ui.range) { const cut = Date.now() - ui.range * 1000; i0 = s.t.findIndex((t) => t >= cut); if (i0 < 0) i0 = s.t.length; }
    const ts = s.t.slice(i0);
    $('#legend').innerHTML = AGENTS.map((a) => `<span><i style="background:${a.color}"></i>${a.name}</span>`).join('');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    if (ts.length < 2) {
      svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" fill="#7e7499" text-anchor="middle" font-size="14" font-family="Space Grotesk">The equity curve starts after the second market scan (about 30s).</text>`;
      renderEquityTable(i0);
      return;
    }
    const m = { l: 56, r: 74, t: 14, b: 28 };
    const vals = AGENTS.flatMap((a) => s[a.id].slice(i0)).concat([START_ETH]);
    let mn = Math.min(...vals), mx = Math.max(...vals);
    const pad = Math.max((mx - mn) * 0.12, 0.002);
    mn -= pad; mx += pad;
    const t0 = ts[0], t1 = ts[ts.length - 1];
    const X = (t) => m.l + (t - t0) / (t1 - t0 || 1) * (W - m.l - m.r);
    const Y = (v) => m.t + (1 - (v - mn) / (mx - mn)) * (H - m.t - m.b);
    const ticks = niceTicks(mn, mx, 5);
    let g = '';
    for (const v of ticks) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.06)"/><text x="${m.l - 10}" y="${Y(v) + 4}" fill="#7e7499" font-size="11" text-anchor="end" font-family="JetBrains Mono">${v.toFixed(3)}</text>`;
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(START_ETH)}" y2="${Y(START_ETH)}" stroke="rgba(255,255,255,.28)" stroke-dasharray="4 4"/>`;
    const nx = Math.max(2, Math.min(6, Math.floor(W / 140)));
    for (let k = 0; k <= nx; k++) {
      const t = t0 + (t1 - t0) * k / nx;
      g += `<text x="${X(t)}" y="${H - 8}" fill="#7e7499" font-size="11" text-anchor="${k === 0 ? 'start' : k === nx ? 'end' : 'middle'}" font-family="JetBrains Mono">${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>`;
    }
    const ends = [];
    for (const a of AGENTS) {
      const ys = s[a.id].slice(i0);
      const d = ys.map((v, i) => `${i ? 'L' : 'M'}${X(ts[i]).toFixed(1)},${Y(v).toFixed(1)}`).join('');
      g += `<path d="${d}" fill="none" stroke="${a.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      ends.push({ a, y: Y(ys[ys.length - 1]), x: X(t1) });
    }
    ends.sort((p, q) => p.y - q.y);
    ends[0].ly = ends[0].y;
    for (let k = 1; k < ends.length; k++) ends[k].ly = Math.max(ends[k].y, ends[k - 1].ly + 15);
    for (const e of ends) {
      const ly = e.ly ?? e.y;
      g += `<circle cx="${e.x}" cy="${e.y}" r="4" fill="${e.a.color}" stroke="#0b0714" stroke-width="2"/><text x="${e.x + 10}" y="${ly + 4}" fill="#b9aed6" font-size="11.5" font-weight="600" font-family="Space Grotesk">${e.a.name}</text>`;
    }
    g += `<line id="xh" y1="${m.t}" y2="${H - m.b}" stroke="rgba(255,255,255,.35)" visibility="hidden"/><g id="xhDots"></g><rect id="hit" x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent"/>`;
    svg.innerHTML = g;
    const tip = $('#chartTip');
    const hit = $('#hit');
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const tt = t0 + (px - m.l) / (W - m.l - m.r) * (t1 - t0);
      let best = 0, bd = Infinity;
      ts.forEach((t, i) => { const d = Math.abs(t - tt); if (d < bd) { bd = d; best = i; } });
      const x = X(ts[best]);
      const xh = $('#xh'); xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
      const rows = AGENTS.map((a) => ({ a, v: s[a.id][i0 + best] })).sort((p, q) => q.v - p.v);
      $('#xhDots').innerHTML = rows.map((rw) => `<circle cx="${x}" cy="${Y(rw.v)}" r="4.5" fill="${rw.a.color}" stroke="#0b0714" stroke-width="2"/>`).join('');
      tip.hidden = false;
      tip.innerHTML = `<div class="t-h">${fmtTime(ts[best])}</div>` + rows.map((rw) => `<div class="t-row"><span class="swatch" style="background:${rw.a.color}"></span>${rw.a.name}<b>${rw.v.toFixed(4)} ETH</b></div>`).join('');
      const tx = x + 16 + 200 > W ? x - 216 : x + 16;
      tip.style.left = tx + 'px'; tip.style.top = '12px';
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; $('#xh').setAttribute('visibility', 'hidden'); $('#xhDots').innerHTML = ''; });
    renderEquityTable(i0);
  }
  function niceTicks(a, b, n) {
    const step0 = (b - a) / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) || step0;
    const out = [];
    for (let v = Math.ceil(a / step) * step; v <= b + 1e-12; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function renderEquityTable(i0) {
    const el = $('#equityTable');
    el.hidden = !ui.showTable;
    if (!ui.showTable) return;
    const s = state.series;
    const idx = [];
    for (let i = s.t.length - 1; i >= i0 && idx.length < 30; i -= Math.max(1, Math.floor((s.t.length - i0) / 30))) idx.push(i);
    el.innerHTML = `<table><thead><tr><th>Time</th>${AGENTS.map((a) => `<th>${a.name}</th>`).join('')}</tr></thead><tbody>${idx.map((i) => `<tr><td>${fmtTime(s.t[i])}</td>${AGENTS.map((a) => `<td>${s[a.id][i].toFixed(4)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  /* desks */
  function renderDeskTabs() {
    $('#deskTabs').innerHTML = AGENTS.map((a) => `<button type="button" role="tab" class="desk-tab ${ui.desk === a.id ? 'on' : ''}" style="--c:${a.color}" data-desk="${a.id}"><span class="avatar" style="--c:${a.color}">${avatar(a.id)}</span><span>${a.name}<small>${a.style}</small></span></button>`).join('');
  }
  function scoreBar(v, color) {
    const w = Math.abs(v) * 50;
    const left = v >= 0 ? 50 : 50 - w;
    return `<div class="scorebar" title="${v.toFixed(3)}"><i style="left:${left}%;width:${w}%;background:${v >= 0 ? color : '#ff5c7a'}"></i></div>`;
  }
  function renderDesk() {
    renderDeskTabs();
    const a = AGENTS.find((x) => x.id === ui.desk);
    const ag = state.agents[a.id];
    const eq = equity(a.id);
    const pos = Object.entries(ag.pos);
    const ev = evals[a.id] || {};
    const watch = market.tokens.filter((t) => ev[t.addr]).sort((x, y) => ev[y.addr].score - ev[x.addr].score).slice(0, 8);
    $('#desk').innerHTML = `
      <div class="panel" style="--c:${a.color}">
        <h3>${a.style}</h3>
        <p class="big">${a.name} · ${fmtEth(eq)} ETH ${fmtPct((eq / START_ETH - 1) * 100, 2)}</p>
        <p class="desk-bio">${a.bio}</p>
        <div class="rules">${a.rules.map((r) => `<span>${r}</span>`).join('')}<span>buy ≥ ${a.buyAt}</span><span>${Math.round(a.w * 100)}% classical / ${Math.round((1 - a.w) * 100)}% quantum</span></div>
        <h3>Open positions · cash ${fmtEth(ag.cash)} ETH</h3>
        ${pos.length ? `<table class="dtable"><thead><tr><th>Token</th><th class="r">Value ETH</th><th class="r">PnL</th><th class="r">Held</th></tr></thead><tbody>
          ${pos.map(([addr, p]) => { const t = byAddr.get(addr); const px = t ? t.priceEth : p.last; return `<tr><td>${t ? `<a href="${t.url}" target="_blank" rel="noopener">${esc(p.sym)}</a>` : esc(p.sym)}</td><td class="r">${fmtEth(p.qty * px)}</td><td class="r">${fmtPct((px * p.qty / p.cost - 1) * 100)}</td><td class="r">${fmtAge(Date.now() - p.at)}</td></tr>`; }).join('')}
        </tbody></table>` : '<p class="empty">Flat. No open positions.</p>'}
      </div>
      <div class="panel">
        <h3>Live watchlist</h3>
        <p class="desk-bio">The top scores right now. Final score = classical × ${a.w} + quantum × ${(1 - a.w).toFixed(2)}.</p>
        ${watch.length ? `<table class="dtable"><thead><tr><th>Token</th><th>Classical</th><th>Quantum</th><th class="r">Score</th><th></th></tr></thead><tbody>
          ${watch.map((t) => { const e = ev[t.addr]; return `<tr><td>${esc(t.sym)}</td><td>${scoreBar(e.classical, a.color)}</td><td>${scoreBar(e.quantum, a.color)}</td><td class="r">${e.score >= a.buyAt ? '<span class="up">' : ''}${e.score.toFixed(2)}${e.score >= a.buyAt ? '</span>' : ''}</td><td class="r"><button type="button" class="link-btn" data-lab="${a.id}|${t.addr}">circuit</button></td></tr>`; }).join('')}
        </tbody></table>` : '<p class="empty">Waiting for the first market scan…</p>'}
      </div>`;
  }

  /* circuit lab */
  function renderLabOptions() {
    const sa = $('#labAgent'), st = $('#labToken');
    if (!sa.options.length) sa.innerHTML = AGENTS.map((a) => `<option value="${a.id}">${a.name} · ${a.style}</option>`).join('');
    sa.value = ui.labAgent;
    if (!ui.labToken || !byAddr.has(ui.labToken)) {
      const ev = evals[ui.labAgent] || {};
      const top = market.tokens.slice().sort((x, y) => (ev[y.addr]?.score ?? -9) - (ev[x.addr]?.score ?? -9))[0];
      ui.labToken = top ? top.addr : null;
    }
    const opts = market.tokens.map((t) => `<option value="${t.addr}">${esc(t.sym)} · ${fmtUsd(t.liq)} liq</option>`).join('');
    if (st.dataset.sig !== String(market.at)) { st.innerHTML = opts; st.dataset.sig = market.at; }
    if (ui.labToken) st.value = ui.labToken;
  }

  function circuitSVG(p, color) {
    const deg = (r) => (r * 180 / Math.PI).toFixed(0) + '°';
    const gate = (x, y, label, val, c = color) => `<g><rect x="${x - 34}" y="${y - 20}" width="68" height="40" rx="9" fill="#170f29" stroke="${c}" stroke-width="1.5"/><text x="${x}" y="${y - 2}" text-anchor="middle" fill="#f3eeff" font-size="13" font-weight="600" font-family="Space Grotesk">${label}</text><text x="${x}" y="${y + 13}" text-anchor="middle" fill="#b9aed6" font-size="10.5" font-family="JetBrains Mono">${val}</text></g>`;
    const y0 = 50, y1 = 130;
    return `<svg viewBox="0 0 640 180" role="img" aria-label="Two-qubit circuit diagram">
      <text x="14" y="${y0 + 4}" fill="#b9aed6" font-family="JetBrains Mono" font-size="13">q₀ |0⟩</text>
      <text x="14" y="${y1 + 4}" fill="#b9aed6" font-family="JetBrains Mono" font-size="13">q₁ |0⟩</text>
      <line x1="76" x2="600" y1="${y0}" y2="${y0}" stroke="rgba(255,255,255,.25)"/>
      <line x1="76" x2="600" y1="${y1}" y2="${y1}" stroke="rgba(255,255,255,.25)"/>
      ${gate(130, y0, 'RY', 'θa ' + deg(p.thetaA))}
      ${gate(130, y1, 'RY', 'θb ' + deg(p.thetaB))}
      <line x1="230" x2="230" y1="${y0}" y2="${y1 + 14}" stroke="#f3eeff" stroke-width="1.5"/>
      <circle cx="230" cy="${y0}" r="6" fill="#f3eeff"/>
      <circle cx="230" cy="${y1}" r="14" fill="none" stroke="#f3eeff" stroke-width="1.5"/>
      <line x1="216" x2="244" y1="${y1}" y2="${y1}" stroke="#f3eeff" stroke-width="1.5"/>
      ${gate(320, y1, 'RZ', 'φ ' + deg(p.phi), '#ff4fd8')}
      ${gate(420, y1, 'H', 'mix', '#5fe0ff')}
      ${gate(420, y0, 'RY', 'β ' + deg(p.beta), '#ffb45c')}
      ${[y0, y1].map((y) => `<g><rect x="528" y="${y - 18}" width="44" height="36" rx="8" fill="#0b0714" stroke="rgba(255,255,255,.4)"/><path d="M536 ${y + 8} q14 -18 28 0" fill="none" stroke="#f3eeff" stroke-width="1.5"/><line x1="550" y1="${y + 8}" x2="561" y2="${y - 10}" stroke="#f3eeff" stroke-width="1.5"/></g>`).join('')}
      <text x="230" y="172" text-anchor="middle" fill="#7e7499" font-size="11" font-family="Space Grotesk">entangle</text>
      <text x="320" y="172" text-anchor="middle" fill="#7e7499" font-size="11" font-family="Space Grotesk">order-flow phase</text>
      <text x="550" y="172" text-anchor="middle" fill="#7e7499" font-size="11" font-family="Space Grotesk">measure</text>
    </svg>`;
  }

  function renderLab() {
    const a = AGENTS.find((x) => x.id === ui.labAgent);
    const t = byAddr.get(ui.labToken);
    if (!t) { $('#circuit').innerHTML = '<p class="empty" style="padding:20px">Waiting for live market data…</p>'; return; }
    const e = Q.evaluate(a, t, uStats, ui.labOverride);
    const p = e.params;
    $('#circuit').innerHTML = circuitSVG(p, a.color);
    const sl = [
      ['thetaA', 'θa · ' + featName(a, 'a'), 0, Math.PI],
      ['thetaB', 'θb · ' + featName(a, 'b'), 0, Math.PI],
      ['phi', 'φ · buy/sell phase', -Math.PI, Math.PI],
      ['beta', 'β · temperament', -Math.PI, Math.PI]
    ];
    const box = $('#sliders');
    if (box.dataset.sig !== a.id + t.addr + (ui.labOverride ? 'o' : 'l')) {
      box.innerHTML = sl.map(([k, l, mn, mx]) => `<label><span>${l}<b id="v_${k}"></b></span><input type="range" min="${mn}" max="${mx}" step="0.01" data-k="${k}" value="${p[k]}"></label>`).join('');
      box.dataset.sig = a.id + t.addr + (ui.labOverride ? 'o' : 'l');
    }
    sl.forEach(([k]) => { $('#v_' + k).textContent = (p[k] * 180 / Math.PI).toFixed(0) + '°'; const inp = box.querySelector(`[data-k=${k}]`); if (document.activeElement !== inp) inp.value = p[k]; });
    const labels = ['|00⟩', '|01⟩', '|10⟩', '|11⟩'];
    const meaning = ['avoid', 'lean avoid', 'lean buy', 'conviction buy'];
    $('#probs').innerHTML = [3, 2, 1, 0].map((i) => `<div class="prob"><span class="lbl">${labels[i]}</span><div class="bar"><i style="width:${(e.probs[i] * 100).toFixed(1)}%;background:${i >= 2 ? a.color : 'rgba(255,255,255,.28)'}"></i></div><span class="r">${(e.probs[i] * 100).toFixed(1)}%</span><span class="meaning">${meaning[i]}</span></div>`).join('');
    // phase wheel
    let w = '<circle r="100" fill="none" stroke="rgba(255,255,255,.12)"/><circle r="50" fill="none" stroke="rgba(255,255,255,.06)"/><line x1="-104" x2="104" stroke="rgba(255,255,255,.1)"/><line y1="-104" y2="104" stroke="rgba(255,255,255,.1)"/><text x="98" y="-4" fill="#7e7499" font-size="9" text-anchor="end" font-family="JetBrains Mono">Re</text><text x="4" y="-94" fill="#7e7499" font-size="9" font-family="JetBrains Mono">Im</text>';
    e.state.forEach((amp, i) => {
      const x = amp.re * 100, y = -amp.im * 100;
      const strong = i >= 2;
      w += `<line x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${strong ? a.color : '#b9aed6'}" stroke-width="2.2" stroke-linecap="round"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${strong ? a.color : '#b9aed6'}" stroke="#110b1e" stroke-width="2"/><text x="${(x * 1.12 + (x >= 0 ? 6 : -6)).toFixed(1)}" y="${(y * 1.12 + 4).toFixed(1)}" fill="#f3eeff" font-size="10" text-anchor="${x >= 0 ? 'start' : 'end'}" font-family="JetBrains Mono">${labels[i]}</text>`;
    });
    $('#phaseWheel').innerHTML = w;
    const v = e.score >= a.buyAt ? ['buy', 'BUY SIGNAL'] : e.score <= a.sellAt ? ['sell', 'AVOID / SELL'] : ['hold', 'HOLD'];
    $('#readout').innerHTML = `<span class="muted">${esc(t.sym)} · ${a.name}${ui.labOverride ? ' · <b style="color:#ffb45c">manual angles</b>' : ''}</span>
      <span class="qs">${e.score >= 0 ? '+' : ''}${e.score.toFixed(3)}</span>
      classical ${e.classical.toFixed(3)} · quantum ${e.quantum.toFixed(3)}<br>
      <span class="verdict ${v[0]}">${v[0] === 'buy' ? '▲' : v[0] === 'sell' ? '▼' : '■'} ${v[1]}</span>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">Live inputs: 1h ${plainPct(t.h1)}, 24h ${plainPct(t.h24)}, ${t.buys1h} buys vs ${t.sells1h} sells, ${fmtUsd(t.liq)} pool.</p>`;
  }
  function featName(a, k) {
    return ({ flux: { a: '1h+5m momentum', b: '6h momentum' }, vex: { a: '24h z-score', b: '6h z-score' }, echo: { a: '24h trend', b: '1h dip depth' }, anchor: { a: 'pool depth', b: 'turnover' } })[a.id][k];
  }

  /* markets */
  function consensus(t) {
    return AGENTS.reduce((s, a) => s + (evals[a.id]?.[t.addr]?.score ?? 0), 0) / AGENTS.length;
  }
  function renderMarkets() {
    const q = ui.search.trim().toLowerCase();
    let rows = market.tokens.filter((t) => !q || t.sym.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.addr.includes(q));
    const key = { sym: (t) => t.sym.toLowerCase(), priceUsd: (t) => t.priceUsd, m5: (t) => t.m5, h1: (t) => t.h1, h24: (t) => t.h24, liq: (t) => t.liq, vol: (t) => t.vol, mcap: (t) => t.mcap, flow: (t) => Q.flowRatio(t), consensus }[ui.sortK];
    rows = rows.slice().sort((x, y) => { const a = key(x), b = key(y); return (a > b ? 1 : a < b ? -1 : 0) * ui.sortDir; });
    document.querySelectorAll('#mtable th').forEach((th) => th.classList.toggle('sorted', th.dataset.k === ui.sortK));
    $('#mtable tbody').innerHTML = rows.map((t) => {
      const prev = prevPrices.get(t.addr);
      const fl = prev && prev !== t.priceUsd ? (t.priceUsd > prev ? 'flash-up' : 'flash-down') : '';
      const fr = Q.flowRatio(t);
      const dots = AGENTS.map((a) => { const e = evals[a.id]?.[t.addr]; if (!e) return ''; const cls = e.score >= a.buyAt ? 'b' : e.score <= a.sellAt ? 's' : ''; return `<i class="${cls}" style="--c:${a.color}" title="${a.name}: ${e.score.toFixed(2)}${cls === 'b' ? ' (buy)' : cls === 's' ? ' (avoid)' : ''}"></i>`; }).join('');
      const img = t.img ? `<img src="${esc(t.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ph">${esc(t.sym.slice(0, 2).toUpperCase())}</span>`;
      return `<tr class="${fl}">
        <td><div class="tok">${img}<span><b>${esc(t.sym)}</b><small title="${esc(t.addr)}">${esc(t.name)} · ${short(t.addr)}</small></span></div></td>
        <td class="r">${fmtPrice(t.priceUsd)}</td>
        <td class="r">${fmtPct(t.m5)}</td><td class="r">${fmtPct(t.h1)}</td><td class="r">${fmtPct(t.h24)}</td>
        <td class="r">${fmtUsd(t.liq)}</td><td class="r">${fmtUsd(t.vol)}</td><td class="r">${t.mcap ? fmtUsd(t.mcap) : '—'}</td>
        <td><div class="flow" title="${t.buys1h} buys / ${t.sells1h} sells"><i style="width:${fr * 100}%;background:var(--up)"></i><i style="width:${(1 - fr) * 100}%;background:var(--down)"></i></div><div class="flow-n">${t.buys1h}B / ${t.sells1h}S</div></td>
        <td><div class="cons">${dots}</div></td>
        <td><a class="trade-link" href="${t.url}" target="_blank" rel="noopener">Chart ↗</a></td>
      </tr>`;
    }).join('') || `<tr><td colspan="11" class="empty" style="padding:24px">${market.at ? 'No tokens match.' : 'Scanning Robinhood Chain…'}</td></tr>`;
  }

  /* journal */
  function renderJournal() {
    $('#jFilter').innerHTML = [['all', 'All agents', null], ...AGENTS.map((a) => [a.id, a.name, a.color])].map(([id, l, c]) => `<button type="button" data-j="${id}" class="${ui.jFilter === id ? 'on' : ''}">${c ? `<span class="swatch" style="background:${c}"></span>` : ''}${l}</button>`).join('');
    const items = state.journal.filter((j) => ui.jFilter === 'all' || j.agent === ui.jFilter).slice(0, 120);
    $('#journalList').innerHTML = items.map((j) => {
      const a = AGENTS.find((x) => x.id === j.agent);
      return `<li class="jrow">
        <span class="jtime">${fmtTime(j.ts)}</span>
        <span class="jagent"><span class="swatch" style="background:${a.color}"></span>${a.name}</span>
        <span class="side ${j.side}">${j.side === 'buy' ? '▲ BUY' : '▼ SELL'}</span>
        <span class="jbody"><b><a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.sym)}</a></b> · ${fmtEth(j.size)} ETH @ ${fmtPrice(j.priceUsd)}${j.realized != null ? ' · ' + fmtPct(j.realized * 100, 2) : ''}${j.p11 != null ? ` · P|11⟩ ${(j.p11 * 100).toFixed(0)}%` : ''}<span class="why">${esc(j.why)}</span></span>
        <span class="jblock">${j.block ? `<a href="${Chain.CHAIN.explorer}/block/${j.block}" target="_blank" rel="noopener" title="Decided at this Robinhood Chain mainnet block">block #${j.block.toLocaleString('en-US')}</a>` : '<span class="muted">no block</span>'}</span>
      </li>`;
    }).join('') || '<li class="empty">No trades yet. The agents trade once a token clears their buy threshold, and each scan runs every 30 seconds.</li>';
  }

  /* wallet */
  async function scanWallet(addr) {
    if (!Chain.isAddr(addr)) { toast('That does not look like a 0x address.'); return; }
    ui.wallet = addr;
    $('#walletInput').value = addr;
    const out = $('#walletOut');
    out.innerHTML = '<p class="muted">Reading Robinhood Chain mainnet…</p>';
    try {
      const [bal, txs] = await Promise.all([Chain.walletBalances(addr, [{ addr: Chain.CHAIN.weth, sym: 'WETH', name: 'Wrapped Ether', priceEth: 1, h24: 0, url: `${Chain.CHAIN.explorer}/token/${Chain.CHAIN.weth}` }, ...market.tokens]), Chain.walletTxs(addr)]);
      const memeEth = bal.holdings.reduce((s, h) => s + h.valueEth, 0);
      const total = bal.eth + memeEth;
      const r = ranked();
      out.innerHTML = `
        <div class="w-head">
          <div><div class="addr"><a href="${Chain.CHAIN.explorer}/address/${addr}" target="_blank" rel="noopener">${addr} ↗</a></div>
          <div class="val">${fmtEth(total)} ETH</div>
          <div class="muted">${market.ethUsd ? fmtUsd(total * market.ethUsd) + ' · ' : ''}${fmtEth(bal.eth)} ETH + ${fmtEth(memeEth)} ETH in WETH and meme coins</div></div>
          <div class="w-vs">${r.map(({ a, eq }) => `<span><i class="swatch" style="background:${a.color}"></i>${a.name} ${fmtEth(eq, 3)}</span>`).join('')}</div>
        </div>
        <div class="w-cols">
          <div><h3 class="muted" style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:500">WETH and meme holdings</h3>
            ${bal.holdings.length ? `<table class="dtable"><thead><tr><th>Token</th><th class="r">Amount</th><th class="r">Value ETH</th><th class="r">24h</th></tr></thead><tbody>${bal.holdings.map((h) => `<tr><td><a href="${h.token.url}" target="_blank" rel="noopener">${esc(h.token.sym)}</a></td><td class="r">${h.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td><td class="r">${fmtEth(h.valueEth)}</td><td class="r">${fmtPct(h.token.h24)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">None of the tokens on the board are in this wallet.</p>'}
          </div>
          <div><h3 class="muted" style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:500">Recent transactions</h3>
            ${txs ? (txs.length ? `<table class="dtable"><tbody>${txs.map((x) => `<tr><td><a href="${Chain.CHAIN.explorer}/tx/${x.hash}" target="_blank" rel="noopener">${short(x.hash)}</a></td><td>${esc((x.method || (x.transaction_types || [])[0] || 'tx').toString().slice(0, 18))}</td><td class="r">${x.timestamp ? new Date(x.timestamp).toLocaleString() : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No transactions yet.</p>') : `<p class="empty">The explorer API is not reachable from here. <a href="${Chain.CHAIN.explorer}/address/${addr}" target="_blank" rel="noopener">Open the address on Blockscout ↗</a></p>`}
          </div>
        </div>`;
    } catch (e) {
      out.innerHTML = `<p class="down">Couldn't read the wallet: ${esc(e.message)}</p>`;
    }
    renderStatus();
  }

  function renderStatus() {
    const s = Chain.status;
    const f = (v, l) => `<span class="${v === true ? 'ok' : v === false ? 'bad' : ''}">${l}</span>`;
    $('#statusRow').innerHTML = f(s.rpc, 'RPC ' + (s.rpcUrl ? new URL(s.rpcUrl).host : '')) + f(s.dex, 'DexScreener') + f(s.explorer, 'Blockscout') + `<span>last scan ${lastTick ? fmtTime(lastTick) : '—'}</span><span>round started ${new Date(state.start).toLocaleString()}</span>`;
  }

  let toastT;
  function toast(msg) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => el.remove(), 5000);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-desk]');
    if (d) {
      ui.desk = d.dataset.desk; renderDesk();
      if (d.classList.contains('agent-card')) $('#desks').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const l = e.target.closest('[data-lab]');
    if (l) {
      const [aid, addr] = l.dataset.lab.split('|');
      ui.labAgent = aid; ui.labToken = addr; ui.labOverride = null;
      renderLabOptions(); renderLab();
      $('#lab').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const j = e.target.closest('[data-j]');
    if (j) { ui.jFilter = j.dataset.j; renderJournal(); return; }
    const r = e.target.closest('[data-range]');
    if (r) {
      ui.range = +r.dataset.range;
      document.querySelectorAll('#rangeSeg button').forEach((b) => b.classList.toggle('on', b === r));
      renderChart();
      return;
    }
    const th = e.target.closest('#mtable th[data-k]');
    if (th) {
      if (ui.sortK === th.dataset.k) ui.sortDir *= -1; else { ui.sortK = th.dataset.k; ui.sortDir = th.dataset.k === 'sym' ? 1 : -1; }
      renderMarkets();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.agent-card')) e.target.click();
  });
  $('#tableToggle').addEventListener('click', () => {
    ui.showTable = !ui.showTable;
    $('#tableToggle').textContent = ui.showTable ? 'Hide table' : 'Table view';
    renderChart();
  });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Start a new round? Every agent goes back to 1.00 ETH and the journal is cleared.')) return;
    state = freshRound(); save();
    if (market.tokens.length) { runAgents(chainHead); record(); save(); }
    renderAll(); renderStatus();
  });
  $('#labAgent').addEventListener('change', (e) => { ui.labAgent = e.target.value; ui.labOverride = null; renderLab(); });
  $('#labToken').addEventListener('change', (e) => { ui.labToken = e.target.value; ui.labOverride = null; renderLab(); });
  $('#sliders').addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const a = AGENTS.find((x) => x.id === ui.labAgent);
    const t = byAddr.get(ui.labToken); if (!t) return;
    const base = ui.labOverride || Q.circuitParams(a, t, uStats);
    ui.labOverride = { ...base, [k]: +e.target.value };
    renderLab();
  });
  $('#labReset').addEventListener('click', () => { ui.labOverride = null; renderLab(); });
  $('#mSearch').addEventListener('input', (e) => { ui.search = e.target.value; renderMarkets(); });
  $('#walletForm').addEventListener('submit', (e) => { e.preventDefault(); scanWallet($('#walletInput').value.trim()); });
  $('#connectBtn').addEventListener('click', async () => {
    try {
      const acct = await Chain.connect();
      const b = $('#connectBtn');
      b.textContent = short(acct); b.classList.add('connected');
      $('#wallet').scrollIntoView({ behavior: 'smooth' });
      scanWallet(acct);
    } catch (err) { toast(err.message || 'Wallet connection was cancelled.'); }
  });
  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on('accountsChanged', (accs) => { if (accs && accs[0]) { $('#connectBtn').textContent = short(accs[0]); scanWallet(accs[0]); } });
  }
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderChart, 120); });

  /* ---------- boot ---------- */
  setInterval(() => {
    $('#statRound').textContent = fmtAge(Date.now() - state.start);
    if (lastTick) $('#tickMeta').textContent = `next scan in ${Math.max(0, Math.ceil((lastTick + TICK_MS - Date.now()) / 1000))}s · ${state.series.t.length} snapshots`;
  }, 1000);
  renderAll();
  renderStatus();
  headLoop();
  setInterval(headLoop, HEAD_MS);
  tick();
  setInterval(tick, TICK_MS);
})();
