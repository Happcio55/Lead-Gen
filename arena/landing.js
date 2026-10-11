/* Landing page: live widgets on cream paper, agent strips, crimson ivy, and the competitor picker. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const { AGENTS } = Q;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const EXP = Chain.CHAIN.explorer;
  const pct = (x, d = 1) => Number.isFinite(x) ? `<span class="${x > 0 ? 'up' : x < 0 ? 'down' : ''}">${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}%</span>` : '—';
  const usd = (x) => !Number.isFinite(x) ? '—' : x >= 1e6 ? '$' + (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : '$' + x.toFixed(0);
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  function price(x) {
    if (!(x > 0)) return '—';
    if (x >= 0.001) return '$' + (x >= 1 ? x.toFixed(2) : x.toPrecision(4));
    const s = x.toFixed(20).split('.')[1], z = s.match(/^0*/)[0].length;
    return '$0.0' + String(z).split('').map((d) => SUB[d]).join('') + s.slice(z, z + 4).replace(/0+$/, '');
  }
  const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);

  // agent strip in every preview window
  $$('.wp-agents').forEach((row) => {
    for (const a of AGENTS) {
      const d = document.createElement('div'); d.className = 'wpa';
      const c = Sprites.portrait(a.id, 2);
      const t = document.createElement('div');
      t.innerHTML = `<b>${a.name}</b><small>${a.style.toUpperCase()}</small>`;
      d.append(c, t); row.appendChild(d);
    }
  });

  /* ---------- widgets ---------- */
  function markets(d) {
    const el = $('#wMarkets');
    const toks = (d.market.tokens || []).slice().sort((a, b) => b.vol - a.vol).slice(0, 7);
    if (!toks.length) { el.innerHTML = '<div class="ph"><span>MARKET OBSERVATORY</span><span>ROBINHOOD CHAIN</span></div><p class="empty">Scanning every meme pool on Robinhood Chain…</p>'; return; }
    el.innerHTML = `<div class="ph"><span>MARKET OBSERVATORY</span><span>ETH $${Math.round(d.market.ethUsd).toLocaleString('en-US')}</span></div>
      <h4><span>Meme board / ETH pairs</span><span>${d.market.tokens.length} pools</span></h4>
      <table><thead><tr><th>TOKEN</th><th class="r">PRICE</th><th class="r">1H</th><th class="r">24H</th><th class="r">LIQ</th><th>FLOW</th></tr></thead><tbody>
      ${toks.map((t) => { const fr = Q.flowRatio(t); return `<tr><td><b>${esc(t.sym)}</b></td><td class="r">${price(t.priceUsd)}</td><td class="r">${pct(t.h1)}</td><td class="r">${pct(t.h24, 0)}</td><td class="r">${usd(t.liq)}</td><td><div class="flowbar"><i style="flex:${fr || 0.001};background:#1f7a45"></i><i style="flex:${1 - fr || 0.001};background:#b3123a"></i></div></td></tr>`; }).join('')}
      </tbody></table><p class="note">SORTED BY 24H VOLUME · REFRESHED EVERY 30 SECONDS</p>`;
  }

  let decideIdx = 0;
  function decide(d) {
    const el = $('#wDecide');
    const a = AGENTS[decideIdx % AGENTS.length];
    const ev = d.evals && d.evals[a.id];
    const toks = d.market.tokens || [];
    if (!ev || !toks.length) { el.innerHTML = '<div class="ph"><span>THE MIND</span><span>CALIBRATING</span></div><p class="empty">Waiting for the first market scan…</p>'; return; }
    const t = toks.slice().sort((x, y) => ev[y.addr].score - ev[x.addr].score)[0];
    const e = ev[t.addr];
    const v = e.score >= a.buyAt ? ['buy', 'BUY SIGNAL'] : e.score <= a.sellAt ? ['sell', 'AVOID'] : ['', 'HOLD'];
    const lab = ['|00⟩', '|01⟩', '|10⟩', '|11⟩'];
    el.innerHTML = `<div class="ph"><span>THE MIND / ${a.name}</span><span>${a.style.toUpperCase()}</span></div>
      <h4><span>${esc(t.sym)}: best pick right now</span></h4>
      <div class="qcols"><div>
        ${[3, 2, 1, 0].map((i) => `<div class="qprob"><span>${lab[i]}</span><div class="pb"><i class="${i >= 2 ? 'hi' : ''}" style="width:${(e.probs[i] * 100).toFixed(1)}%"></i></div><span class="r">${(e.probs[i] * 100).toFixed(1)}%</span></div>`).join('')}
        <div class="qscore">${e.score >= 0 ? '+' : ''}${e.score.toFixed(3)}</div><span class="qverdict ${v[0]}">${v[1]}</span>
      </div><div class="qlog">
        <p><small>OBSERVING</small>1h ${pct(t.h1)} · 24h ${pct(t.h24, 0)} · ${t.buys1h} buys / ${t.sells1h} sells</p>
        <p><small>CLASSICAL × ${a.w}</small>${e.classical.toFixed(3)}</p>
        <p><small>QUANTUM × ${(1 - a.w).toFixed(2)}</small>${e.quantum.toFixed(3)}</p>
        <p><small>BAR</small>Buys at ≥ ${a.buyAt}</p>
      </div></div><p class="note">CYCLES THROUGH THE FOUR AGENTS · LIVE INPUTS</p>`;
  }

  function standings(d) {
    const el = $('#wStandings');
    const s = d.snap;
    if (!s) return;
    $('#wMode').textContent = s.mode === 'live' ? 'LIVE WALLETS' : 'PAPER ROUND';
    const rows = s.agents.map((x) => ({ x, a: AGENTS.find((y) => y.id === x.id) })).sort((p, q) => (q.x.ret ?? -1e9) - (p.x.ret ?? -1e9));
    el.innerHTML = `<div class="ph"><span>SESSION</span><span>${s.mode === 'live' ? 'FUNDING-ADJUSTED' : 'STARTED ' + new Date(Sim.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
      <table><thead><tr><th>RANK / AGENT</th><th class="r">EQUITY</th><th class="r">RETURN</th><th class="r">TRADES</th><th class="r">OPEN</th></tr></thead><tbody>
      ${rows.map(({ x, a }, i) => `<tr><td>${String(i + 1).padStart(2, '0')} <span class="sw" style="background:${a.color}"></span><b>${a.name}</b></td><td class="r">${x.equity != null ? x.equity.toFixed(4) + ' ETH' : '—'}</td><td class="r">${pct(x.ret, 2)}</td><td class="r">${x.trades ?? 0}</td><td class="r">${x.positions ? x.positions.length : 0}</td></tr>`).join('')}
      </tbody></table><p class="note">${s.mode === 'live' ? 'EVERY NUMBER READ FROM ROBINHOOD CHAIN' : 'EACH AGENT STARTED WITH 1.00 ETH · FILLS ON LIVE PRICES'}</p>`;
  }

  function journal(d) {
    const el = $('#wJournal');
    const s = d.snap;
    if (!s) return;
    const items = s.journal.slice(0, 6);
    el.innerHTML = `<div class="ph"><span>THESIS → FILL</span><span>${s.journal.length} ENTRIES</span></div>
      ${items.length ? `<table><tbody>${items.map((j) => { const a = AGENTS.find((x) => x.id === j.agent); return `<tr><td>${hhmm(j.ts)}</td><td><span class="sw" style="background:${a.color}"></span>${a.name}</td><td><b class="${j.side === 'buy' ? 'up' : 'down'}">${j.side.toUpperCase()}</b> ${esc(j.sym)}</td><td class="r">${j.sizeEth ? j.sizeEth.toFixed(4) + ' ETH' : ''}</td><td class="r">${j.hash ? `<a href="${EXP}/tx/${j.hash}" target="_blank" rel="noopener">tx ${short(j.hash)} ↗</a>` : j.block ? `<a href="${EXP}/block/${j.block}" target="_blank" rel="noopener">#${j.block.toLocaleString('en-US')} ↗</a>` : ''}</td></tr>`; }).join('')}</tbody></table>
      <p class="note">LATEST: ${esc(items[0].why || '')}</p>` : '<p class="empty">No fills yet. The first scan runs within 30 seconds.</p>'}`;
  }

  function update() {
    if (document.body.classList.contains('in-os') || !window.QROS) return;
    const d = QROS.data();
    if (!d.market) return;
    try { markets(d); decide(d); standings(d); journal(d); } catch (e) { console.error(e); }
  }
  setInterval(update, 2000);
  setInterval(() => { decideIdx++; }, 5000);
  setTimeout(update, 600);

  /* ---------- picker ---------- */
  const sel = $('#pickSel');
  sel.innerHTML = AGENTS.map((a) => `<option value="${a.id}">${a.name} · ${a.style}</option>`).join('');
  $('#pickForm').addEventListener('submit', (e) => { e.preventDefault(); QROS.enter(); QROS.open('agent:' + sel.value); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-desk]');
    if (b && b.closest('.intro')) { QROS.enter(); QROS.open(b.dataset.desk); }
  });

  /* ---------- ivy ---------- */
  function drawIvy() {
    const pick = $('.pick');
    const box = $('.pick-box').getBoundingClientRect(), pr = pick.getBoundingClientRect();
    const side = Math.max(0, (pr.width - box.width) / 2 + parseFloat(getComputedStyle($('.land')).paddingLeft) - 10);
    $$('.ivy-l, .ivy-r').forEach((c, i) => { c.style.width = side + 'px'; c.style.height = '150px'; Sprites.ivy(c, 'band', 3 + i * 5); });
    const fr = $('.ivy-frame'); Sprites.ivy(fr, 'frame', 7);
  }
  drawIvy();
  addEventListener('resize', () => { if (!document.body.classList.contains('in-os')) drawIvy(); });
})();
