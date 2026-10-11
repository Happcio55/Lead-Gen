/* Citizen OS: boot, menubar, window manager, apps and the data loop. */
(function () {
  'use strict';
  const { AGENTS } = Q;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const agentById = (id) => AGENTS.find((a) => a.id === id);
  const isPhone = () => innerWidth <= 760;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  /* ---------- formatting ---------- */
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  function fmtPrice(x) {
    if (!(x > 0)) return '—';
    if (x >= 1) return '$' + x.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (x >= 0.001) return '$' + x.toPrecision(4);
    const s = x.toFixed(20).split('.')[1], z = s.match(/^0*/)[0].length;
    return '$0.0' + String(z).split('').map((d) => SUB[d]).join('') + s.slice(z, z + 4).replace(/0+$/, '');
  }
  function fmtUsd(x) {
    if (!Number.isFinite(x)) return '—';
    const a = Math.abs(x);
    return a >= 1e9 ? '$' + (x / 1e9).toFixed(2) + 'B' : a >= 1e6 ? '$' + (x / 1e6).toFixed(2) + 'M' : a >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : '$' + x.toFixed(a < 10 ? 2 : 0);
  }
  function fmtEth(x, d) {
    if (!Number.isFinite(x)) return '—';
    if (d == null) d = Math.abs(x) >= 1 ? 4 : Math.abs(x) >= 0.01 ? 5 : 7;
    return x.toFixed(d);
  }
  function pct(x, d = 1) {
    if (!Number.isFinite(x)) return '<span class="muted">—</span>';
    const cls = x > 0 ? 'up' : x < 0 ? 'down' : 'muted';
    return `<span class="${cls}">${x > 0 ? '▲' : x < 0 ? '▼' : ''}${Math.abs(x).toFixed(d)}%</span>`;
  }
  const plain = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + '%';
  const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const hms = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function age(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60); if (m < 60) return m + 'm';
    const h = Math.floor(m / 60); if (h < 48) return h + 'h ' + (m % 60) + 'm';
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  }
  const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
  const EXP = Chain.CHAIN.explorer;

  /* ---------- state ---------- */
  let market = { tokens: [], ethUsd: 0, at: 0 };
  let byAddr = new Map();
  let evals = {};
  let uStats = null;
  let head = null;
  let mode = store.get('qr-mode', Object.keys(Live.wallets).length ? 'live' : 'sim');
  let snap = null;
  let lastScan = 0, lastLive = 0, rpcMs = null;
  const seen = new Set();
  const termLines = [];
  const ui = { jFilter: 'all', sortK: 'vol', sortDir: -1, search: '', labAgent: AGENTS[0].id, labToken: null, labOverride: null, resetArmed: false };

  /* ---------- terminal feed ---------- */
  function term(kind, text) {
    termLines.push({ t: Date.now(), kind, text });
    if (termLines.length > 200) termLines.shift();
    const w = wins.get('terminal');
    if (w && !w.min) APPS.terminal.update(w.body);
  }

  /* ---------- data loop ---------- */
  function evaluateAll() {
    uStats = Q.universeStats(market.tokens);
    evals = {};
    for (const a of AGENTS) { evals[a.id] = {}; for (const t of market.tokens) evals[a.id][t.addr] = Q.evaluate(a, t, uStats); }
  }
  function heldAddrs() {
    const s = Sim.snapshot(byAddr);
    return [...new Set(s.agents.flatMap((a) => a.positions.map((p) => p.addr)))];
  }
  let scanning = false;
  async function scan() {
    if (scanning) return;
    scanning = true;
    try {
      const m = await Chain.loadMarket(heldAddrs());
      market = m;
      byAddr = new Map(m.tokens.map((t) => [t.addr, t]));
      evaluateAll();
      const before = Sim.snapshot(byAddr).journal.length;
      Sim.step(market, byAddr, evals, uStats, head, (ai, side, t) => {
        if (mode !== 'sim') return;
        floorApi && floorApi.shout(ai, `${side.toUpperCase()} ${t.sym}!`);
        Sound.blip(side);
      });
      const after = Sim.snapshot(byAddr).journal.length;
      term('sys', `scan · ${m.tokens.length} meme pairs · ETH ${fmtUsd(m.ethUsd)} · block ${head ? head.number : '?'}`);
      if (mode === 'sim' && after > before) term('sys', `${after - before} paper fill(s) this scan`);
      const best = AGENTS.map((a) => { const top = market.tokens.slice().sort((x, y) => evals[a.id][y.addr].score - evals[a.id][x.addr].score)[0]; return top ? `${a.name}→${top.sym} ${evals[a.id][top.addr].score.toFixed(2)}` : ''; }).join('  ');
      term('', best);
      lastScan = Date.now();
      if (mode === 'live' && Date.now() - lastLive > 55000) await refreshLive();
      rebuild();
    } catch (e) {
      term('warn', 'scan failed: ' + e.message);
    } finally { scanning = false; }
  }
  async function refreshLive() {
    if (!Object.keys(Live.wallets).length) return;
    term('sys', 'reading agent wallets from Robinhood Chain…');
    await Live.refresh();
    lastLive = Date.now();
    const s = Live.snapshot();
    if (s.error) term('warn', s.error);
  }
  function rebuild() {
    const prev = snap;
    snap = mode === 'live' ? Live.snapshot() : Sim.snapshot(byAddr);
    // announce new journal entries
    const fresh = snap.journal.filter((j) => !seen.has(key(j)));
    snap.journal.forEach((j) => seen.add(key(j)));
    if (prev && prev.mode === snap.mode) {
      fresh.slice(0, 6).reverse().forEach((j) => {
        const a = agentById(j.agent);
        term(j.side === 'buy' ? 'buy' : 'sell', `${a.name} ${j.side.toUpperCase()} ${j.sym}${j.hash ? ' · tx ' + short(j.hash) + ' confirmed' : ' · paper fill'}`);
        if (mode === 'live') { floorApi && floorApi.shout(AGENTS.indexOf(a), `${j.side.toUpperCase()} ${j.sym}!`); Sound.blip(j.side); }
      });
    }
    renderChrome();
    renderAllWindows();
  }
  const key = (j) => (j.hash || '') + j.ts + j.agent + j.side + j.sym;

  async function headLoop() {
    const t0 = performance.now();
    try {
      head = await Chain.head();
      rpcMs = Math.round(performance.now() - t0);
      $('#led').className = 'led on';
      $('#mbBlockN').textContent = '#' + head.number.toLocaleString('en-US');
      $('#mbBlock').href = `${EXP}/block/${head.number}`;
    } catch (e) {
      $('#led').className = 'led err';
      $('#mbBlockN').textContent = 'RPC offline';
    }
    const w = wins.get('status'); if (w && !w.min) APPS.status.update(w.body);
  }

  /* ---------- chrome: mode pill, ticker, taskbar ---------- */
  function renderChrome() {
    const pill = $('#modePill');
    pill.className = 'mode-pill' + (mode === 'live' ? ' live' : '');
    pill.innerHTML = `<i></i>${mode === 'live' ? 'LIVE WALLETS' : 'SIM ROUND'}`;
    const items = (snap ? snap.journal : []).slice(0, 18).map((j) => {
      const a = agentById(j.agent);
      return `<span><span class="tag ${j.side}">${j.side.toUpperCase()}</span><b>${esc(j.sym)}</b><span class="sw" style="background:${a.color}"></span>${a.name}<span class="muted">${j.hash ? 'confirmed' : 'paper'} ${hhmm(j.ts)}</span></span>`;
    });
    if (!items.length) items.push(...market.tokens.slice(0, 16).map((t) => `<span><b>${esc(t.sym)}</b>${fmtPrice(t.priceUsd)} ${pct(t.h24)}</span>`));
    if (!items.length) items.push('<span>Scanning Robinhood Chain…</span>');
    $('#ticker').innerHTML = items.join('') + items.join('');
  }

  /* ---------- icons ---------- */
  function pixelIcon(rows, colors) {
    const h = rows.length, w = rows[0].length;
    let r = '';
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[ch]}"/>`; }));
    return `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  }
  const W = '#f3e6c8', K = '#0a0612';
  const ICONS = {
    standings: pixelIcon(['..aaaaaa..', '.aaaaaaaa.', 'aa.aaaa.aa', 'aa.aaaa.aa', '.aaaaaaaa.', '..aaaaaa..', '....aa....', '....aa....', '..wwwwww..', '..wwwwww..'], { a: '#ffb000', w: W }),
    markets: pixelIcon(['wwwwwwwwww', 'w........w', 'w......g.w', 'w.....gg.w', 'w.g..g...w', 'w.gggg...w', 'wg..r....w', 'w...rr...w', 'w........w', 'wwwwwwwwww'], { w: W, g: '#34d1bf', r: '#ff5c7a' }),
    journal: pixelIcon(['.wwwwwwww.', '.w......w.', '.w.cccc.w.', '.w......w.', '.w.cccc.w.', '.w......w.', '.w.ccc..w.', '.w......w.', '.w.hh...w.', '.wwwwwwww.'], { w: W, c: '#34d1bf', h: '#ffb000' }),
    lab: pixelIcon(['...wwww...', '....ww....', '....ww....', '...wwww...', '..wppppw..', '.wppppppw.', 'wppcppppw.', 'wpppppcpw.', 'wppppppppw', '.wwwwwwww.'], { w: W, p: '#9466ff', c: '#34d1bf' }),
    wallets: pixelIcon(['..........', '.aaaaaaaa.', 'awwwwwwwwa', 'aw......wa', 'aw...hhhwa', 'aw...hkhwa', 'aw...hhhwa', 'aw......wa', 'awwwwwwwwa', '.aaaaaaaa.'], { a: '#ffb000', w: '#3a2858', h: '#ffb000', k: K }),
    guide: pixelIcon(['.wwwwwwww.', 'w........w', 'w...hh...w', 'w..h..h..w', 'w.....h..w', 'w....h...w', 'w....h...w', 'w........w', 'w....h...w', '.wwwwwwww.'], { w: W, h: '#ffb000' }),
    terminal: pixelIcon(['wwwwwwwwww', 'wkkkkkkkkw', 'wkgkkkkkkw', 'wkkgkkkkkw', 'wkgkkkkkkw', 'wkkkkggggw', 'wkkkkkkkkw', 'wwwwwwwwww', '...wwww...', '.wwwwwwww.'], { w: W, k: K, g: '#f3e6c8' }),
    status: pixelIcon(['..........', '.g......g.', '.g...g..g.', '.g..ggg.g.', '.g.ggggggg', 'gggggggggg', '..........', 'wwwwwwwwww', 'w.r.a.g..w', 'wwwwwwwwww'], { g: '#34d1bf', w: W, r: '#ff5c7a', a: '#ffb000' })
  };

  function renderIcons() {
    const items = [
      ...AGENTS.map((a) => ({ id: 'agent:' + a.id, label: a.name + '.app', agent: a })),
      { id: 'standings', label: 'Standings' }, { id: 'markets', label: 'Markets' }, { id: 'journal', label: 'Trades' },
      { id: 'lab', label: 'Circuit lab' }, { id: 'wallets', label: 'Wallets' }, { id: 'terminal', label: 'Terminal' },
      { id: 'status', label: 'Data status' }, { id: 'guide', label: 'Guide' }
    ];
    const nav = $('#icons');
    nav.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'icon'; b.dataset.open = it.id;
      const ic = document.createElement('span'); ic.className = 'ic';
      if (it.agent) ic.appendChild(Sprites.portrait(it.agent.id, 4)); else ic.innerHTML = ICONS[it.id];
      const l = document.createElement('span'); l.textContent = it.label;
      b.append(ic, l);
      nav.appendChild(b);
    }
  }

  /* ---------- window manager ---------- */
  const wins = new Map();
  let zTop = 20, cascade = 0;
  function openWin(id) {
    Sound.blip();
    let w = wins.get(id);
    if (w) { w.min = false; w.el.hidden = false; focus(id); renderWin(id); renderTaskbar(); return w; }
    const def = appDef(id);
    if (!def) return null;
    const el = document.createElement('section');
    el.className = 'win';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', def.title);
    if (def.color) el.style.setProperty('--c', def.color);
    const dw = $('#desktop').clientWidth, dh = $('#desktop').clientHeight;
    const width = Math.min(def.w, dw - 24), height = Math.min(def.h, dh - 90);
    const pos = def.pos ? def.pos(dw, dh, width, height) : { x: Math.max(12, Math.min(dw - width - 12, 120 + cascade * 34)), y: Math.max(8, Math.min(dh - height - 80, 20 + cascade * 30)) };
    cascade = (cascade + 1) % 8;
    Object.assign(el.style, { left: pos.x + 'px', top: pos.y + 'px', width: width + 'px', height: height + 'px' });
    el.innerHTML = `<div class="titlebar"><button type="button" class="wbtn" data-act="close" aria-label="Close">×</button><span class="stripes"></span><span class="t"><i></i>${esc(def.title)}</span><span class="stripes"></span><button type="button" class="wbtn" data-act="min" aria-label="Minimise">_</button></div><div class="wbody"></div>${def.status ? '<div class="statusline"></div>' : ''}<div class="resize" aria-hidden="true"></div>`;
    $('#windows').appendChild(el);
    w = { id, el, body: $('.wbody', el), def, min: false };
    wins.set(id, w);
    el.addEventListener('pointerdown', () => focus(id));
    $('[data-act=close]', el).addEventListener('click', (e) => { e.stopPropagation(); closeWin(id); });
    $('[data-act=min]', el).addEventListener('click', (e) => { e.stopPropagation(); w.min = true; el.hidden = true; renderTaskbar(); });
    drag(el, $('.titlebar', el), 'move');
    drag(el, $('.resize', el), 'size');
    def.mount && def.mount(w.body, w);
    focus(id);
    renderWin(id);
    renderTaskbar();
    return w;
  }
  function closeWin(id) { const w = wins.get(id); if (!w) return; w.el.remove(); wins.delete(id); renderTaskbar(); }
  function focus(id) {
    for (const [k, w] of wins) w.el.classList.toggle('focus', k === id);
    const w = wins.get(id); if (w) w.el.style.zIndex = ++zTop;
    $$('.task').forEach((t) => t.classList.toggle('on', t.dataset.task === id));
  }
  function drag(el, handle, kind) {
    handle.addEventListener('pointerdown', (e) => {
      if (isPhone() || e.target.closest('.wbtn')) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY, r = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      const dw = $('#desktop').clientWidth, dh = $('#desktop').clientHeight;
      const mv = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (kind === 'move') {
          el.style.left = Math.max(-r.w + 80, Math.min(dw - 80, r.x + dx)) + 'px';
          el.style.top = Math.max(0, Math.min(dh - 30, r.y + dy)) + 'px';
        } else {
          el.style.width = Math.max(300, r.w + dx) + 'px';
          el.style.height = Math.max(180, r.h + dy) + 'px';
          if (wins.get([...wins].find(([, w]) => w.el === el)[0]).def.chart) renderWin([...wins].find(([, w]) => w.el === el)[0]);
        }
      };
      const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); };
      handle.addEventListener('pointermove', mv);
      handle.addEventListener('pointerup', up);
    });
  }
  function renderTaskbar() {
    $('#taskbar').innerHTML = [...wins.values()].map((w) => `<button type="button" class="task ${w.min ? 'min' : ''}" data-task="${w.id}" style="--c:${w.def.color || 'var(--hot)'}"><i></i>${esc(w.def.title)}</button>`).join('');
  }
  function renderWin(id) {
    const w = wins.get(id);
    if (!w || w.min) return;
    try { w.def.update(w.body, w); } catch (e) { console.error(e); }
    const sl = $('.statusline', w.el);
    if (sl && w.def.status) sl.innerHTML = w.def.status();
  }
  function renderAllWindows() { for (const id of wins.keys()) renderWin(id); }

  /* ---------- shared bits ---------- */
  function modeChip(s) {
    if (!s || s.mode === 'sim') return '<span class="chip warn">PAPER · LIVE PRICES</span>';
    return '<span class="chip ok">LIVE WALLET · ON-CHAIN</span>';
  }
  function scoreBar(v, color) {
    const w = Math.min(1, Math.abs(v)) * 50, left = v >= 0 ? 50 : 50 - w;
    return `<div class="bar" title="${v.toFixed(3)}"><i style="left:${left}%;width:${w}%;background:${v >= 0 ? color : 'var(--down)'}"></i></div>`;
  }
  function ranked() {
    if (!snap) return [];
    return snap.agents.map((s) => ({ s, a: agentById(s.id) })).sort((x, y) => (y.s.ret ?? -1e9) - (x.s.ret ?? -1e9));
  }
  function seriesOf(s) {
    // returns [[t, return %]] for either mode
    if (snap.mode === 'sim') return s.history.map(([t, eq]) => [t, (eq / 1 - 1) * 100]);
    return s.history.filter((p) => Number.isFinite(p[1]));
  }

  /* ---------- chart (return %, one axis) ---------- */
  function drawChart(box, tipEl) {
    const W0 = box.clientWidth || 500, H0 = box.clientHeight || 240;
    const series = snap.agents.map((s) => ({ a: agentById(s.id), pts: seriesOf(s) })).filter((x) => x.pts.length);
    const all = series.flatMap((x) => x.pts);
    if (all.length < 4) { box.innerHTML = `<svg viewBox="0 0 ${W0} ${H0}"><text x="${W0 / 2}" y="${H0 / 2}" text-anchor="middle" fill="#a08c66" font-family="Silkscreen" font-size="11">${snap.mode === 'live' ? 'THE CURVE FILLS IN AS WALLETS ARE SAMPLED' : 'THE CURVE STARTS AFTER TWO SCANS'}</text></svg>`; return; }
    const m = { l: 46, r: 64, t: 10, b: 22 };
    const t0 = Math.min(...all.map((p) => p[0])), t1 = Math.max(...all.map((p) => p[0]));
    let mn = Math.min(0, ...all.map((p) => p[1])), mx = Math.max(0, ...all.map((p) => p[1]));
    const pad = Math.max((mx - mn) * 0.12, 0.2); mn -= pad; mx += pad;
    const X = (t) => m.l + (t - t0) / (t1 - t0 || 1) * (W0 - m.l - m.r);
    const Y = (v) => m.t + (1 - (v - mn) / (mx - mn)) * (H0 - m.t - m.b);
    const step0 = (mx - mn) / 4, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const st = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0);
    let g = '';
    for (let v = Math.ceil(mn / st) * st; v <= mx; v += st) g += `<line x1="${m.l}" x2="${W0 - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#3a2a1855"/><text x="${m.l - 6}" y="${Y(v) + 5}" fill="#a08c66" font-size="16" text-anchor="end" font-family="VT323">${(+v.toFixed(2))}%</text>`;
    g += `<line x1="${m.l}" x2="${W0 - m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#d8c69c" stroke-dasharray="4 4" opacity=".6"/>`;
    for (let k = 0; k <= 3; k++) { const t = t0 + (t1 - t0) * k / 3; g += `<text x="${X(t)}" y="${H0 - 5}" fill="#a08c66" font-size="16" font-family="VT323" text-anchor="${k === 0 ? 'start' : k === 3 ? 'end' : 'middle'}">${hhmm(t)}</text>`; }
    const ends = [];
    for (const s of series) {
      const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
      g += `<path d="${d}" fill="none" stroke="${s.a.color}" stroke-width="2" stroke-linejoin="round"/>`;
      const l = s.pts[s.pts.length - 1];
      ends.push({ a: s.a, x: X(l[0]), y: Y(l[1]) });
    }
    ends.sort((p, q) => p.y - q.y);
    ends.forEach((e, k) => { e.ly = k ? Math.max(e.y, ends[k - 1].ly + 14) : e.y; });
    for (const e of ends) g += `<rect x="${e.x - 3}" y="${e.y - 3}" width="7" height="7" fill="${e.a.color}" stroke="#0a0602" stroke-width="2"/><text x="${e.x + 8}" y="${e.ly + 4}" fill="#d8c69c" font-size="10" font-family="Silkscreen">${e.a.name}</text>`;
    g += `<line class="xh" y1="${m.t}" y2="${H0 - m.b}" stroke="#f3e6c8" stroke-dasharray="2 3" visibility="hidden"/><g class="xd"></g><rect class="hit" x="${m.l}" y="0" width="${W0 - m.l - m.r}" height="${H0}" fill="transparent"/>`;
    box.innerHTML = `<svg viewBox="0 0 ${W0} ${H0}" role="img" aria-label="Return per agent over time">${g}</svg>`;
    box.appendChild(tipEl);
    const svg = $('svg', box), hit = $('.hit', box);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const tt = t0 + ((ev.clientX - r.left) * (W0 / r.width) - m.l) / (W0 - m.l - m.r) * (t1 - t0);
      const rows = series.map((s) => { let b = s.pts[0]; for (const p of s.pts) if (Math.abs(p[0] - tt) < Math.abs(b[0] - tt)) b = p; return { a: s.a, p: b }; }).sort((x, y) => y.p[1] - x.p[1]);
      const x = X(rows[0].p[0]);
      const xh = $('.xh', box); xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
      $('.xd', box).innerHTML = rows.map((rw) => `<rect x="${X(rw.p[0]) - 4}" y="${Y(rw.p[1]) - 4}" width="9" height="9" fill="${rw.a.color}" stroke="#0a0602" stroke-width="2"/>`).join('');
      tipEl.hidden = false;
      tipEl.innerHTML = `<div class="muted">${hms(rows[0].p[0])}</div>` + rows.map((rw) => `<div class="row2"><span class="sw" style="background:${rw.a.color}"></span>${rw.a.name}<b>${plain(rw.p[1], 2)}</b></div>`).join('');
      const px = x * (r.width / W0);
      tipEl.style.left = (px + 180 > r.width ? px - 180 : px + 12) + 'px'; tipEl.style.top = '8px';
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { tipEl.hidden = true; $('.xh', box).setAttribute('visibility', 'hidden'); $('.xd', box).innerHTML = ''; });
  }

  /* ---------- apps ---------- */
  const APPS = {
    standings: {
      title: 'Standings', w: 640, h: 600, chart: true,
      pos: (dw, dh, w, h) => ({ x: Math.max(12, dw - w - 130), y: 16 }),
      status: () => `<span>${snap && snap.mode === 'live' ? 'funding-adjusted · on-chain' : 'paper round · started ' + new Date(Sim.start).toLocaleString()}</span><span>${market.tokens.length} pairs</span>`,
      mount(b) {
        b.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px"><p class="h" style="margin:0">Ranked by ${'<span id="rankBy"></span>'}</p><span class="mchip"></span></div><div class="lb"></div><p class="h">Return over time</p><div class="legend"></div><div class="chart"></div><p class="muted" style="font-size:13px;margin:10px 0 0" class="cap"></p>`;
        this.tip = document.createElement('div'); this.tip.className = 'tip'; this.tip.hidden = true;
      },
      update(b) {
        if (!snap) return;
        $('#rankBy', b).textContent = snap.mode === 'live' ? 'funding-adjusted return' : 'round return';
        $('.mchip', b).innerHTML = modeChip(snap);
        const r = ranked();
        $('.lb', b).innerHTML = r.map(({ s, a }, i) => `<div class="lb-row ${i === 0 && s.ret != null ? 'first' : ''}" style="--c:${a.color}" data-open="agent:${a.id}" tabindex="0">
          <span class="lb-rank">${s.ret != null ? '#' + (i + 1) : '–'}</span><span class="pslot" data-portrait="${a.id}"></span>
          <span class="lb-name">${a.name}<small>${a.style}${snap.mode === 'live' ? ' · ' + (s.address ? short(s.address) : 'no wallet') : ''}</small></span>
          <span class="lb-eq">${s.equity != null ? fmtEth(s.equity) + ' <small class="muted">ETH</small>' : '<small class="muted">' + (s.loading ? 'loading…' : 'unlinked') + '</small>'}</span>
          <span class="lb-ret">${pct(s.ret, 2)}</span></div>`).join('');
        $$('[data-portrait]', b).forEach((el) => el.replaceWith(Sprites.portrait(el.dataset.portrait, 3)));
        $('.legend', b).innerHTML = AGENTS.map((a) => `<span><span class="sw" style="background:${a.color}"></span>${a.name}</span>`).join('');
        drawChart($('.chart', b), this.tip);
        b.lastElementChild.textContent = snap.mode === 'live'
          ? 'Return = (wallet equity − net deposits) ÷ deposits. Deposits and withdrawals never count as trading gains. Every input is read from Robinhood Chain.'
          : 'Each agent started this round with 1.00 ETH of paper capital. Fills use live prices, pool-depth slippage and a 0.30% fee.';
      }
    },

    markets: {
      title: 'Markets', w: 900, h: 540,
      status: () => `<span>DexScreener · robinhood · ETH pairs only</span><span>${market.at ? 'updated ' + hms(market.at) : 'scanning…'}</span>`,
      mount(b) {
        b.innerHTML = `<div class="row" style="margin-bottom:10px"><input class="px" id="mSearch" type="search" placeholder="search symbol, name or 0x…" aria-label="Search tokens" style="max-width:340px"><span class="muted" style="font-size:13px">Dots: each agent's live verdict. Filled = buy, dotted = avoid.</span></div><div class="scroll-x"><table class="tbl"><thead><tr>
          <th data-k="sym">Token</th><th data-k="priceUsd" class="r">Price</th><th data-k="m5" class="r">5m</th><th data-k="h1" class="r">1h</th><th data-k="h24" class="r">24h</th><th data-k="liq" class="r">Liquidity</th><th data-k="vol" class="r">Vol 24h</th><th data-k="mcap" class="r">Mcap</th><th data-k="flow">Flow 1h</th><th data-k="cons">Agents</th><th></th></tr></thead><tbody></tbody></table></div>`;
        $('#mSearch', b).value = ui.search;
        $('#mSearch', b).addEventListener('input', (e) => { ui.search = e.target.value; this.update(b); });
        $('thead', b).addEventListener('click', (e) => {
          const th = e.target.closest('th[data-k]'); if (!th) return;
          if (ui.sortK === th.dataset.k) ui.sortDir *= -1; else { ui.sortK = th.dataset.k; ui.sortDir = th.dataset.k === 'sym' ? 1 : -1; }
          this.update(b);
        });
      },
      update(b) {
        const q = ui.search.trim().toLowerCase();
        const cons = (t) => AGENTS.reduce((s, a) => s + (evals[a.id]?.[t.addr]?.score ?? 0), 0);
        const keyf = { sym: (t) => t.sym.toLowerCase(), priceUsd: (t) => t.priceUsd, m5: (t) => t.m5, h1: (t) => t.h1, h24: (t) => t.h24, liq: (t) => t.liq, vol: (t) => t.vol, mcap: (t) => t.mcap, flow: (t) => Q.flowRatio(t), cons }[ui.sortK];
        const rows = market.tokens.filter((t) => !q || t.sym.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.addr.includes(q))
          .sort((x, y) => { const a = keyf(x), c = keyf(y); return (a > c ? 1 : a < c ? -1 : 0) * ui.sortDir; });
        $$('th', b).forEach((th) => th.classList.toggle('sorted', th.dataset.k === ui.sortK));
        $('tbody', b).innerHTML = rows.map((t) => {
          const fr = Q.flowRatio(t);
          const dots = AGENTS.map((a) => { const e = evals[a.id]?.[t.addr]; if (!e) return ''; const c = e.score >= a.buyAt ? 'b' : e.score <= a.sellAt ? 's' : ''; return `<i class="${c}" style="--c:${a.color}" title="${a.name} ${e.score.toFixed(2)}"></i>`; }).join('');
          return `<tr><td class="txt"><div class="tok">${t.img ? `<img src="${esc(t.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ph">${esc(t.sym.slice(0, 2).toUpperCase())}</span>`}<span><b>${esc(t.sym)}</b><small>${esc(t.name.slice(0, 22))} · ${short(t.addr)}</small></span></div></td>
            <td class="r">${fmtPrice(t.priceUsd)}</td><td class="r">${pct(t.m5)}</td><td class="r">${pct(t.h1)}</td><td class="r">${pct(t.h24)}</td>
            <td class="r">${fmtUsd(t.liq)}</td><td class="r">${fmtUsd(t.vol)}</td><td class="r">${t.mcap ? fmtUsd(t.mcap) : '—'}</td>
            <td><div class="flow" title="${t.buys1h} buys / ${t.sells1h} sells"><i style="flex:${fr || 0.001};background:var(--up)"></i><i style="flex:${1 - fr || 0.001};background:var(--down)"></i></div><small class="muted">${t.buys1h}B/${t.sells1h}S</small></td>
            <td><div class="cons">${dots}</div></td>
            <td><a href="${t.url}" target="_blank" rel="noopener" class="link">chart ↗</a></td></tr>`;
        }).join('') || `<tr><td colspan="11" class="empty">${market.at ? 'No tokens match.' : 'Scanning Robinhood Chain…'}</td></tr>`;
      }
    },

    journal: {
      title: 'Trade journal', w: 760, h: 540,
      status: () => `<span>${snap && snap.mode === 'live' ? 'confirmed swaps · Blockscout receipts' : 'paper fills · stamped with mainnet blocks'}</span><span>${snap ? snap.journal.length : 0} entries</span>`,
      mount(b) {
        b.innerHTML = `<div class="row" style="margin-bottom:12px" id="jf"></div><ol class="jl"></ol>`;
        $('#jf', b).addEventListener('click', (e) => { const x = e.target.closest('[data-j]'); if (x) { ui.jFilter = x.dataset.j; this.update(b); } });
      },
      update(b) {
        if (!snap) return;
        $('#jf', b).innerHTML = [['all', 'All', null], ...AGENTS.map((a) => [a.id, a.name, a.color])].map(([id, l, c]) => `<button type="button" class="px-btn small ${ui.jFilter === id ? 'hot' : 'ghost'}" data-j="${id}">${c ? `<span class="sw" style="background:${c}"></span> ` : ''}${l}</button>`).join('') + modeChip(snap);
        const items = snap.journal.filter((j) => ui.jFilter === 'all' || j.agent === ui.jFilter).slice(0, 150);
        $('.jl', b).innerHTML = items.map((j) => {
          const a = agentById(j.agent);
          const proof = j.hash
            ? `<a href="${EXP}/tx/${j.hash}" target="_blank" rel="noopener" title="Transaction receipt">tx ${short(j.hash)} ↗</a><br><span class="muted">block ${(+j.block).toLocaleString('en-US')}</span>`
            : j.block ? `<a href="${EXP}/block/${j.block}" target="_blank" rel="noopener" title="Decided at this mainnet block">block ${j.block.toLocaleString('en-US')} ↗</a><br><span class="muted">paper fill</span>` : '<span class="muted">paper fill</span>';
          const size = j.sizeEth ? `${fmtEth(j.sizeEth)} ETH` : '';
          return `<li class="jr"><span class="tm">${hhmm(j.ts)}<br>${new Date(j.ts).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
            <span class="who"><span class="sw" style="background:${a.color}"></span>${a.name}</span>
            <span class="tag ${j.side}" style="font:11px var(--f-label);padding:3px 6px;text-align:center">${j.side.toUpperCase()}</span>
            <span class="what"><b><a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.sym)}</a></b> ${size}${j.priceUsd ? ' @ ' + fmtPrice(j.priceUsd) : ''}${j.realized != null ? ' · ' + pct(j.realized * 100, 2) : ''}${j.p11 != null ? ` · P|11⟩ ${(j.p11 * 100).toFixed(0)}%` : ''}<small>${esc(j.why || '')}</small></span>
            <span class="proof">${proof}</span></li>`;
        }).join('') || `<li class="empty">${snap.mode === 'live' ? 'No confirmed swaps in the linked wallets yet.' : 'No fills yet. Agents trade once a token clears their bar. A scan runs every 30 seconds.'}</li>`;
      }
    },

    lab: {
      title: 'Circuit lab', w: 860, h: 620, color: '#9466ff',
      status: () => '<span>statevector simulation · 2 qubits · runs locally</span><span>experimental input, not a forecast</span>',
      mount(b) {
        b.innerHTML = `<div class="split"><div>
            <div class="row" style="margin-bottom:10px"><select class="px" id="labAgent" aria-label="Agent" style="flex:1"></select><select class="px" id="labToken" aria-label="Token" style="flex:1"></select></div>
            <div class="circuit"></div><div class="sliders"></div>
            <button type="button" class="px-btn small ghost" id="labReset">Reset to live data</button>
          </div><div><p class="h">Measurement</p><div class="probs"></div><div style="margin-top:16px" class="readout"></div></div></div>`;
        $('#labAgent', b).innerHTML = AGENTS.map((a) => `<option value="${a.id}">${a.name} · ${a.style}</option>`).join('');
        $('#labAgent', b).addEventListener('change', (e) => { ui.labAgent = e.target.value; ui.labOverride = null; this.update(b); });
        $('#labToken', b).addEventListener('change', (e) => { ui.labToken = e.target.value; ui.labOverride = null; this.update(b); });
        $('#labReset', b).addEventListener('click', () => { ui.labOverride = null; this.update(b); });
        $('.sliders', b).addEventListener('input', (e) => {
          const k = e.target.dataset.k; if (!k) return;
          const a = agentById(ui.labAgent), t = byAddr.get(ui.labToken); if (!t) return;
          ui.labOverride = { ...(ui.labOverride || Q.circuitParams(a, t, uStats)), [k]: +e.target.value };
          this.update(b);
        });
      },
      update(b) {
        const a = agentById(ui.labAgent);
        const sa = $('#labAgent', b), st = $('#labToken', b);
        sa.value = a.id;
        if (!ui.labToken || !byAddr.has(ui.labToken)) {
          const ev = evals[a.id] || {};
          const top = market.tokens.slice().sort((x, y) => (ev[y.addr]?.score ?? -9) - (ev[x.addr]?.score ?? -9))[0];
          ui.labToken = top ? top.addr : null;
        }
        if (st.dataset.sig !== String(market.at)) { st.innerHTML = market.tokens.map((t) => `<option value="${t.addr}">${esc(t.sym)} · ${fmtUsd(t.liq)} pool</option>`).join(''); st.dataset.sig = market.at; }
        const t = byAddr.get(ui.labToken);
        if (!t) { $('.circuit', b).innerHTML = '<p class="empty">Waiting for live market data…</p>'; return; }
        st.value = t.addr;
        const e = Q.evaluate(a, t, uStats, ui.labOverride);
        const p = e.params;
        $('.circuit', b).innerHTML = circuitSVG(p, a.color);
        const sl = [['thetaA', 'θa · ' + feat(a, 'a'), 0, Math.PI], ['thetaB', 'θb · ' + feat(a, 'b'), 0, Math.PI / 2], ['phi', 'φ · buy share phase', 0, Math.PI], ['beta', 'β · temperament', -Math.PI, Math.PI]];
        const box = $('.sliders', b), sig = a.id + t.addr + (ui.labOverride ? 1 : 0);
        if (box.dataset.sig !== sig) { box.innerHTML = sl.map(([k, l, mn, mx]) => `<label><span>${l}<b id="v_${k}"></b></span><input type="range" min="${mn}" max="${mx}" step="0.01" data-k="${k}" value="${p[k]}" aria-label="${l}"></label>`).join(''); box.dataset.sig = sig; }
        sl.forEach(([k]) => { $('#v_' + k, b).textContent = (p[k] * 180 / Math.PI).toFixed(0) + '°'; const inp = $(`[data-k=${k}]`, box); if (document.activeElement !== inp) inp.value = p[k]; });
        const lab = ['|00⟩', '|01⟩', '|10⟩', '|11⟩'], mean = ['avoid', 'lean avoid', 'lean buy', 'conviction buy'];
        $('.probs', b).innerHTML = [3, 2, 1, 0].map((i) => `<div class="prob"><span>${lab[i]}</span><div class="pb"><i style="width:${(e.probs[i] * 100).toFixed(1)}%;background:${i >= 2 ? a.color : 'var(--line-2)'}"></i></div><span class="r">${(e.probs[i] * 100).toFixed(1)}%</span><small>${mean[i]}</small></div>`).join('');
        const v = e.score >= a.buyAt ? ['buy', 'BUY SIGNAL'] : e.score <= a.sellAt ? ['sell', 'AVOID'] : ['hold', 'HOLD'];
        $('.readout', b).innerHTML = `<p class="h">${esc(t.sym)} · ${a.name}${ui.labOverride ? ' · <span style="color:var(--amber)">manual angles</span>' : ''}</p><div class="score">${e.score >= 0 ? '+' : ''}${e.score.toFixed(3)}</div>
          <div class="mono muted">classical ${e.classical.toFixed(3)} × ${a.w} + quantum ${e.quantum.toFixed(3)} × ${(1 - a.w).toFixed(2)}</div><span class="verdict ${v[0]}">${v[1]}</span>
          <p class="muted" style="font-size:13px">Live inputs: 5m ${plain(t.m5)}, 1h ${plain(t.h1)}, 24h ${plain(t.h24)} · ${t.buys1h} buys / ${t.sells1h} sells · ${fmtUsd(t.liq)} pool. Buy bar ≥ ${a.buyAt}.</p>`;
      }
    },

    wallets: {
      title: 'Live wallets', w: 680, h: 620, color: '#ffb000',
      status: () => `<span>read-only · nothing here signs a transaction</span><span>${lastLive ? 'read ' + hms(lastLive) : ''}</span>`,
      mount(b) {
        b.innerHTML = `<p class="h">Agent wallets</p><p class="muted" style="margin:0 0 10px;font-size:14px">Link the public address each agent trades from. The arena then rebuilds everything from Robinhood Chain: balances, confirmed swaps, deposits and withdrawals. The addresses are saved in this browser; put them in <code>config.js</code> to make them the default for everyone.</p>
          <div id="wl" style="display:grid;gap:8px"></div>
          <div class="row" style="margin-top:12px"><button type="button" class="px-btn hot" id="wSave">Save and go live</button><button type="button" class="px-btn ghost" id="wSim">Back to the paper round</button></div>
          <hr style="border:0;border-top:2px dashed var(--line);margin:18px 0">
          <p class="h">Inspect any wallet</p>
          <form class="row" id="wScanF"><input class="px" id="wScan" placeholder="0x… address" spellcheck="false" autocomplete="off" style="flex:1;min-width:200px"><button type="submit" class="px-btn">Scan</button><button type="button" class="px-btn ghost" id="wConnect">Use my wallet</button></form>
          <div id="wOut" style="margin-top:12px"></div>`;
        const ws = Live.wallets;
        $('#wl', b).innerHTML = AGENTS.map((a) => `<label class="row" style="flex-wrap:nowrap"><span class="pslot" data-portrait="${a.id}"></span><span style="width:74px;font:12px var(--f-label)">${a.name}</span><input class="px" data-w="${a.id}" value="${esc(ws[a.id] || '')}" placeholder="0x… public address" spellcheck="false" autocomplete="off"></label>`).join('');
        $$('[data-portrait]', b).forEach((el) => el.replaceWith(Sprites.portrait(el.dataset.portrait, 3)));
        $('#wSave', b).addEventListener('click', async () => {
          let bad = 0;
          $$('[data-w]', b).forEach((inp) => { const v = inp.value.trim(); if (v && !Chain.isAddr(v)) { bad++; inp.style.borderColor = 'var(--down)'; } else { inp.style.borderColor = ''; Live.setWallet(inp.dataset.w, v || null); } });
          if (bad) { toast('One address is not a valid 0x address. Fix the red field and save again.'); return; }
          if (!Object.keys(Live.wallets).length) { toast('Add at least one wallet address to go live.'); return; }
          setMode('live');
          toast('Live wallets saved. Reading them from mainnet…');
          lastLive = 0; await refreshLive(); rebuild();
        });
        $('#wSim', b).addEventListener('click', () => { setMode('sim'); toast('Showing the paper round.'); });
        $('#wScanF', b).addEventListener('submit', (e) => { e.preventDefault(); inspect($('#wScan', b).value.trim(), $('#wOut', b)); });
        $('#wConnect', b).addEventListener('click', async () => {
          try { const acct = await Chain.connect(); $('#wScan', b).value = acct; inspect(acct, $('#wOut', b)); }
          catch (err) { toast(err.message || 'Wallet connection was cancelled.'); }
        });
      },
      update() {}
    },

    guide: {
      title: 'Agent guide', w: 640, h: 600,
      mount(b) {
        b.innerHTML = `
          <p class="h">The round</p>
          <p>Seven citizens compete on Robinhood Chain meme coins. Each is a trading persona inspired by a language-model family. Every 30 seconds the market is scanned: every ETH-paired meme pool on DexScreener, minus tokenized stocks and spoofed liquidity, is scored by each citizen.</p>
          <p class="note"><b>Inspired by, not run by.</b> In the paper round every decision comes from the citizen's own strategy plus the circuit. The model names describe each persona's temperament. Connect a model's API to the trading engine and that model makes the call itself.</p>
          <div class="rules">${AGENTS.map((a) => `<span class="chip" style="border-color:${a.color}"><span class="sw" style="background:${a.color}"></span>${a.name} · ${a.style} · inspired by ${a.inspired}</span>`).join('')}</div>
          <p class="h">How a decision is made</p>
          <p>Score = classical × w + quantum × (1 − w). The classical part is the agent's own strategy. The quantum part is a real 2‑qubit statevector circuit: two market features become RY angles, a CNOT entangles them, the 1‑hour buy share becomes an RZ phase, then an H gate and the agent's temperament rotation. The measurement turns into P|11⟩ + ½P|10⟩ − ½P|01⟩ − P|00⟩. The circuit runs locally and no quantum hardware is involved. It is an experimental input, not a forecast.</p>
          <p class="h">Two ways to watch</p>
          <p><b style="color:var(--amber)">SIM ROUND</b>: each agent trades 1.00 ETH of paper capital on live prices, with pool-depth slippage and a 0.30% fee. Every fill is stamped with the mainnet block it was decided on.</p>
          <p><b style="color:var(--phos)">LIVE WALLETS</b>: link the four agent wallets and the arena reads them straight from the chain. Returns are funding-adjusted, so a deposit never counts as a trading gain: return = (equity − deposits + withdrawals) ÷ deposits. Every swap in the journal links to its receipt on Blockscout.</p>
          <p class="h">Add your own bot</p>
          <p>Any wallet can enter. Point your bot at Robinhood Chain (chain id 4663) and paste its public address into <button type="button" class="link" data-open="wallets">Live wallets</button>, or add it to <code>config.js</code> so every visitor sees it. The site never asks for a private key and never signs anything.</p>
          <div class="note"><b>Risk.</b> Meme coins can go to zero within minutes. Nothing on this page is financial advice.</div>`;
      },
      update() {}
    },

    terminal: {
      title: 'Terminal', w: 560, h: 320, color: '#f3e6c8',
      pos: (dw, dh, w, h) => ({ x: 40, y: Math.max(16, dh - h - 100) }),
      mount(b) { b.innerHTML = '<div class="term"></div>'; },
      update(b) {
        const el = $('.term', b);
        const atBottom = b.scrollTop + b.clientHeight >= b.scrollHeight - 30;
        el.innerHTML = termLines.slice(-120).map((l) => `<div><span class="t-time">[${hms(l.t)}]</span> <span class="t-${l.kind || 'x'}">${esc(l.text)}</span></div>`).join('') + '<div>&gt; <span class="cursor"></span></div>';
        if (atBottom) b.scrollTop = b.scrollHeight;
      }
    },

    status: {
      title: 'Data status', w: 460, h: 420, color: '#34d1bf',
      mount(b) { b.innerHTML = '<div class="st"></div><div class="row" style="margin-top:14px"><button type="button" class="px-btn small ghost" id="resetSim">Reset paper round</button></div>'; $('#resetSim', b).addEventListener('click', (e) => resetRound(e.target)); },
      update(b) {
        const s = Chain.status;
        const chip = (ok, l) => `<span class="chip ${ok === true ? 'ok' : ok === false ? 'bad' : 'warn'}">${ok === true ? '● ' : ok === false ? '✕ ' : '… '}${l}</span>`;
        $('.st', b).innerHTML = `<div class="kpis">
            <div class="kpi"><small>LATEST BLOCK</small><b>${head ? head.number.toLocaleString('en-US') : '—'}</b></div>
            <div class="kpi"><small>GAS</small><b>${head ? head.gasGwei.toFixed(4) : '—'}</b><small>GWEI</small></div>
            <div class="kpi"><small>RPC LATENCY</small><b>${rpcMs ?? '—'}</b><small>MS</small></div>
            <div class="kpi"><small>ETH</small><b>${market.ethUsd ? '$' + market.ethUsd.toFixed(0) : '—'}</b></div></div>
          <div class="row">${chip(s.rpc, 'RPC ' + (s.rpcUrl ? new URL(s.rpcUrl).host : ''))}${chip(s.dex, 'DexScreener')}${chip(s.explorer, 'Blockscout')}</div>
          <table class="tbl" style="margin-top:12px"><tbody>
            <tr><td class="txt">Mode</td><td>${mode === 'live' ? 'live wallets' : 'paper round'}</td></tr>
            <tr><td class="txt">Last market scan</td><td>${lastScan ? hms(lastScan) : '—'}</td></tr>
            <tr><td class="txt">Last wallet read</td><td>${lastLive ? hms(lastLive) : '—'}</td></tr>
            <tr><td class="txt">Paper round started</td><td>${new Date(Sim.start).toLocaleString()}</td></tr>
            <tr><td class="txt">Chain</td><td>Robinhood Chain · 4663</td></tr></tbody></table>`;
      }
    }
  };

  function agentApp(a) {
    return {
      title: a.name + '.app', w: 700, h: 620, color: a.color,
      status: () => { const s = snap && snap.agents.find((x) => x.id === a.id); return `<span>${s && s.address ? 'wallet ' + short(s.address) : snap && snap.mode === 'live' ? 'no wallet linked' : 'paper wallet'}</span><span>${a.style}</span>`; },
      mount(b) {
        b.innerHTML = `<div class="desk-head" style="--c:${a.color}"><span class="pslot"></span><div><p class="h">${a.style.toUpperCase()} · INSPIRED BY ${a.inspired.toUpperCase()}</p><p class="big">${a.name}</p><div class="row hd"></div></div></div><div class="kpis"></div>
          <p style="color:var(--ink-2);margin:0 0 6px">${a.bio}</p><div class="rules">${a.rules.map((r) => `<span class="chip">${r}</span>`).join('')}<span class="chip">buy ≥ ${a.buyAt}</span><span class="chip">${Math.round(a.w * 100)}% classical / ${Math.round((1 - a.w) * 100)}% quantum</span></div>
          <div class="split"><div><p class="h">Holdings</p><div class="pos"></div></div><div><p class="h">Live watchlist</p><div class="watch"></div></div></div>
          <p class="h" style="margin-top:16px">Latest trades</p><div class="recent"></div>`;
        $('.pslot', b).replaceWith(Sprites.portrait(a.id, 6));
      },
      update(b) {
        if (!snap) return;
        const s = snap.agents.find((x) => x.id === a.id);
        $('.hd', b).innerHTML = modeChip(snap) + (s.address ? ` <a class="addr" href="${EXP}/address/${s.address}" target="_blank" rel="noopener">${short(s.address)} ↗</a>` : snap.mode === 'live' ? ' <button type="button" class="link" data-open="wallets">Link a wallet</button>' : '');
        const k = [
          ['EQUITY', s.equity != null ? fmtEth(s.equity) : '—', 'ETH'],
          [snap.mode === 'live' ? 'RETURN (ADJ.)' : 'ROUND RETURN', s.ret != null ? plain(s.ret, 2) : '—', ''],
          [snap.mode === 'live' ? 'ETH AVAILABLE' : 'CASH', s.cash != null ? fmtEth(s.cash) : '—', 'ETH'],
          ['TRADES', s.trades ?? 0, s.winRate != null ? 'WIN ' + Math.round(s.winRate * 100) + '%' : '']
        ];
        if (snap.mode === 'live' && s.deposits != null) k.push(['NET DEPOSITS', fmtEth(s.deposits - s.withdrawals), 'ETH']);
        $('.kpis', b).innerHTML = k.map(([l, v, u]) => `<div class="kpi"><small>${l}</small><b>${v}</b><small>${u}</small></div>`).join('');
        $('.pos', b).innerHTML = s.positions.length ? `<table class="tbl"><thead><tr><th>Token</th><th class="r">Value ETH</th><th class="r">PnL</th></tr></thead><tbody>${s.positions.slice(0, 12).map((p) => `<tr><td class="txt">${p.url ? `<a href="${p.url}" target="_blank" rel="noopener">${esc(p.sym)}</a>` : esc(p.sym)}</td><td class="r">${p.priced === false ? '<span class="muted">unpriced</span>' : fmtEth(p.valueEth)}</td><td class="r">${pct(p.pnl)}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">${s.loading ? 'Reading wallet…' : 'Flat. No open positions.'}</p>`;
        const ev = evals[a.id] || {};
        const watch = market.tokens.filter((t) => ev[t.addr]).sort((x, y) => ev[y.addr].score - ev[x.addr].score).slice(0, 7);
        $('.watch', b).innerHTML = watch.length ? `<table class="tbl"><thead><tr><th>Token</th><th>Classic</th><th>Quantum</th><th class="r">Score</th></tr></thead><tbody>${watch.map((t) => { const e = ev[t.addr]; return `<tr><td class="txt"><button type="button" class="link" data-lab="${a.id}|${t.addr}" title="Open in circuit lab">${esc(t.sym)}</button></td><td>${scoreBar(e.classical, a.color)}</td><td>${scoreBar(e.quantum, a.color)}</td><td class="r ${e.score >= a.buyAt ? 'up' : ''}">${e.score.toFixed(2)}</td></tr>`; }).join('')}</tbody></table>` : '<p class="empty">Waiting for the first scan…</p>';
        const rec = snap.journal.filter((j) => j.agent === a.id).slice(0, 6);
        $('.recent', b).innerHTML = rec.length ? `<table class="tbl"><tbody>${rec.map((j) => `<tr><td>${hhmm(j.ts)}</td><td><span class="tag ${j.side}" style="font:11px var(--f-label);padding:2px 5px">${j.side.toUpperCase()}</span></td><td class="txt">${esc(j.sym)}</td><td class="r">${j.sizeEth ? fmtEth(j.sizeEth) + ' ETH' : ''}</td><td class="r">${j.hash ? `<a href="${EXP}/tx/${j.hash}" target="_blank" rel="noopener" class="link">receipt ↗</a>` : '<span class="muted">paper</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No trades yet.</p>';
      }
    };
  }
  function appDef(id) {
    if (APPS[id]) return APPS[id];
    if (id.startsWith('agent:')) { const a = agentById(id.slice(6)); if (!a) return null; return (APPS[id] = agentApp(a)); }
    return null;
  }

  function feat(a, k) { return ({ gptony: { a: '1h+5m momentum', b: '6h momentum' }, gemtwins: { a: '24h z-score', b: '6h z-score' }, grokstar: { a: '24h trend', b: '1h dip' }, claudius: { a: 'pool depth', b: 'turnover' }, mistro: { a: '5m burst', b: 'buy pressure' }, llambo: { a: 'turnover', b: '1h move' }, seeker: { a: 'smallness', b: '6h strength' } })[a.id][k]; }
  function circuitSVG(p, color) {
    const deg = (r) => (r * 180 / Math.PI).toFixed(0) + '°';
    const gate = (x, y, l, v, c = color) => `<rect x="${x - 32}" y="${y - 19}" width="64" height="38" fill="#22180d" stroke="${c}" stroke-width="2"/><text x="${x}" y="${y - 2}" text-anchor="middle" fill="#f3e6c8" font-size="11" font-family="Silkscreen">${l}</text><text x="${x}" y="${y + 13}" text-anchor="middle" fill="#d8c69c" font-size="15" font-family="VT323">${v}</text>`;
    const y0 = 46, y1 = 122;
    return `<svg viewBox="0 0 620 170" role="img" aria-label="Two-qubit circuit">
      <text x="8" y="${y0 + 5}" fill="#d8c69c" font-family="VT323" font-size="18">q0 |0⟩</text><text x="8" y="${y1 + 5}" fill="#d8c69c" font-family="VT323" font-size="18">q1 |0⟩</text>
      <line x1="66" x2="586" y1="${y0}" y2="${y0}" stroke="#5a4325" stroke-width="2"/><line x1="66" x2="586" y1="${y1}" y2="${y1}" stroke="#5a4325" stroke-width="2"/>
      ${gate(116, y0, 'RY', 'θa ' + deg(p.thetaA))}${gate(116, y1, 'RY', 'θb ' + deg(p.thetaB))}
      <line x1="214" x2="214" y1="${y0}" y2="${y1 + 13}" stroke="#f3e6c8" stroke-width="2"/><rect x="208" y="${y0 - 6}" width="12" height="12" fill="#f3e6c8"/>
      <rect x="201" y="${y1 - 13}" width="26" height="26" fill="none" stroke="#f3e6c8" stroke-width="2"/><line x1="201" x2="227" y1="${y1}" y2="${y1}" stroke="#f3e6c8" stroke-width="2"/>
      ${gate(304, y1, 'RZ', 'φ ' + deg(p.phi), '#ffb000')}${gate(400, y1, 'H', 'mix', '#34d1bf')}${gate(400, y0, 'RY', 'β ' + deg(p.beta), '#ffb000')}
      ${[y0, y1].map((y) => `<rect x="500" y="${y - 17}" width="44" height="34" fill="#0a0602" stroke="#f3e6c8" stroke-width="2"/><path d="M508 ${y + 8} q14 -18 28 0" fill="none" stroke="#f3e6c8" stroke-width="2"/><line x1="522" y1="${y + 8}" x2="532" y2="${y - 9}" stroke="#f3e6c8" stroke-width="2"/>`).join('')}
      <text x="214" y="162" text-anchor="middle" fill="#a08c66" font-size="9" font-family="Silkscreen">ENTANGLE</text><text x="304" y="162" text-anchor="middle" fill="#a08c66" font-size="9" font-family="Silkscreen">FLOW PHASE</text><text x="522" y="162" text-anchor="middle" fill="#a08c66" font-size="9" font-family="Silkscreen">MEASURE</text></svg>`;
  }

  async function inspect(addr, out) {
    if (!Chain.isAddr(addr)) { toast('That is not a valid 0x address.'); return; }
    out.innerHTML = '<p class="muted">Reading Robinhood Chain…</p>';
    try {
      const r = await Live.track(addr);
      out.innerHTML = `<div class="kpis">
          <div class="kpi"><small>EQUITY</small><b>${fmtEth(r.equity)}</b><small>ETH ${market.ethUsd ? '· ' + fmtUsd(r.equity * market.ethUsd) : ''}</small></div>
          <div class="kpi"><small>ETH</small><b>${fmtEth(r.native)}</b></div>
          <div class="kpi"><small>DEPOSITED</small><b>${fmtEth(r.deposits)}</b><small>OUT ${fmtEth(r.withdrawals)}</small></div>
          <div class="kpi"><small>TRADING P&amp;L</small><b class="${r.pnlEth >= 0 ? 'up' : 'down'}">${fmtEth(r.pnlEth)}</b><small>${r.ret != null ? plain(r.ret, 2) : ''}</small></div></div>
        <p class="h">Holdings</p>${r.positions.length ? `<table class="tbl"><tbody>${r.positions.slice(0, 15).map((p) => `<tr><td class="txt"><a href="${p.url}" target="_blank" rel="noopener">${esc(p.sym)}</a></td><td class="r">${p.qty.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td><td class="r">${p.priced ? fmtEth(p.valueEth) + ' ETH' : '<span class="muted">unpriced</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No ERC-20 tokens.</p>'}
        <p class="h" style="margin-top:12px">Swaps (${r.trades.length})</p>${r.trades.length ? `<table class="tbl"><tbody>${r.trades.slice(0, 12).map((t) => `<tr><td>${hhmm(t.ts)}</td><td><span class="tag ${t.side}" style="font:11px var(--f-label);padding:2px 5px">${t.side.toUpperCase()}</span></td><td class="txt">${esc(t.sym)}</td><td class="r">${t.sizeEth ? fmtEth(t.sizeEth) + ' ETH' : ''}</td><td class="r"><a class="link" href="${EXP}/tx/${t.hash}" target="_blank" rel="noopener">receipt ↗</a></td></tr>`).join('')}</tbody></table>` : '<p class="empty">No swaps found.</p>'}
        <p><a class="link" href="${EXP}/address/${addr}" target="_blank" rel="noopener">Open on Blockscout ↗</a></p>`;
    } catch (e) { out.innerHTML = `<p class="down">Couldn't read this wallet: ${esc(e.message)}. Try again in a minute.</p>`; }
  }

  /* ---------- menus ---------- */
  function menuItems(name) {
    const ck = (b) => (b ? '✓ ' : ' ');
    switch (name) {
      case 'system': return [['About Citizens', 'open:guide'], ['Data status', 'open:status'], ['Back to the front page', 'intro'], ['-'], ['Reset paper round…', 'reset']];
      case 'agents': return [...AGENTS.map((a) => [`<span><span class="sw" style="background:${a.color}"></span>${a.name}.app</span><kbd>${a.style}</kbd>`, 'open:agent:' + a.id]), ['-'], ['All standings', 'open:standings']];
      case 'arena': return [['Standings', 'open:standings'], ['Markets', 'open:markets'], ['Trade journal', 'open:journal'], ['Circuit lab', 'open:lab'], ['Live wallets', 'open:wallets'], ['Terminal', 'open:terminal']];
      case 'view': return [[ck(mode === 'sim') + 'Paper round', 'mode:sim'], [ck(mode === 'live') + 'Live wallets', 'mode:live'], ['-'], [ck(!document.body.classList.contains('no-crt')) + 'CRT scanlines', 'crt'], [ck(Sound.music) + 'Music', 'music'], [ck(!$('#heroCard').hidden) + 'Welcome card', 'hero'], ['-'], ['Close all windows', 'closeall']];
      case 'help': return [['Agent guide', 'open:guide'], ['Robinhood Chain explorer ↗', 'href:' + EXP], ['DexScreener · Robinhood ↗', 'href:https://dexscreener.com/robinhood']];
    }
    return [];
  }
  function showMenu(btn) {
    const m = $('#menu');
    const name = btn.dataset.menu;
    if (!m.hidden && m.dataset.for === name) { hideMenu(); return; }
    $$('[data-menu]').forEach((b) => b.setAttribute('aria-expanded', b === btn ? 'true' : 'false'));
    m.innerHTML = menuItems(name).map(([l, act]) => l === '-' ? '<hr>' : act.startsWith('href:') ? `<a href="${act.slice(5)}" target="_blank" rel="noopener" role="menuitem">${l}</a>` : `<button type="button" role="menuitem" data-act="${act}">${l}</button>`).join('');
    m.dataset.for = name;
    m.style.left = Math.min(btn.getBoundingClientRect().left, innerWidth - 250) + 'px';
    m.hidden = false;
  }
  function hideMenu() { $('#menu').hidden = true; $$('[data-menu]').forEach((b) => b.setAttribute('aria-expanded', 'false')); }
  function doAct(act, src) {
    hideMenu();
    if (act.startsWith('open:')) openWin(act.slice(5));
    else if (act.startsWith('mode:')) setMode(act.slice(5));
    else if (act === 'crt') { document.body.classList.toggle('no-crt'); store.set('qr-crt', !document.body.classList.contains('no-crt')); }
    else if (act === 'music') toggleMusic();
    else if (act === 'hero') { $('#heroCard').hidden = !$('#heroCard').hidden; store.set('qr-hero', !$('#heroCard').hidden); }
    else if (act === 'closeall') [...wins.keys()].forEach(closeWin);
    else if (act === 'intro') leaveOS();
    else if (act === 'reset') { openWin('status'); toast('Press "Reset paper round" in Data status twice to confirm.'); }
  }
  function resetRound(btn) {
    if (!ui.resetArmed) { ui.resetArmed = true; btn.textContent = 'Press again to reset'; btn.classList.add('hot'); setTimeout(() => { ui.resetArmed = false; btn.textContent = 'Reset paper round'; btn.classList.remove('hot'); }, 4000); return; }
    ui.resetArmed = false;
    Sim.reset(); seen.clear(); term('warn', 'paper round reset · every agent back to 1.00 ETH');
    btn.textContent = 'Reset paper round'; btn.classList.remove('hot');
    rebuild(); toast('New paper round started.');
  }
  function setMode(m) {
    if (m === 'live' && !Object.keys(Live.wallets).length) { openWin('wallets'); toast('Link at least one agent wallet to go live.'); return; }
    mode = m; store.set('qr-mode', m);
    seen.clear();
    term('sys', 'mode → ' + (m === 'live' ? 'live wallets' : 'paper round'));
    if (m === 'live' && !lastLive) refreshLive().then(rebuild); else rebuild();
  }
  function toggleMusic() {
    const on = Sound.setMusic(!Sound.music);
    const b = $('#musicBtn'); b.textContent = on ? '♪ on' : '♪ off'; b.setAttribute('aria-pressed', on);
    $$('.music-float').forEach((m) => { m.textContent = on ? '■ MUSIC OFF' : '▶ MUSIC ON'; m.setAttribute('aria-pressed', on); });
  }

  let toastT;
  function toast(msg) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 4500);
  }

  /* ---------- global events ---------- */
  document.addEventListener('click', (e) => {
    const mb = e.target.closest('[data-menu]');
    if (mb) { showMenu(mb); return; }
    const act = e.target.closest('#menu [data-act]');
    if (act) { doAct(act.dataset.act, act); return; }
    if (!e.target.closest('#menu')) hideMenu();
    const op = e.target.closest('[data-open]');
    if (op) { openWin(op.dataset.open); return; }
    const lab = e.target.closest('[data-lab]');
    if (lab) { const [aid, addr] = lab.dataset.lab.split('|'); ui.labAgent = aid; ui.labToken = addr; ui.labOverride = null; openWin('lab'); renderWin('lab'); return; }
    const task = e.target.closest('[data-task]');
    if (task) { const w = wins.get(task.dataset.task); if (w.min) openWin(w.id); else if (w.el.classList.contains('focus')) { w.min = true; w.el.hidden = true; renderTaskbar(); } else focus(w.id); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideMenu(); const top = [...wins.values()].filter((w) => !w.min).sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex)[0]; if (top && !e.target.closest('input,select')) closeWin(top.id); }
    if (e.key === 'Enter' && e.target.matches('.lb-row')) e.target.click();
  });
  $('#modePill').addEventListener('click', () => setMode(mode === 'live' ? 'sim' : 'live'));
  $('#musicBtn').addEventListener('click', toggleMusic);
  if (window.ethereum && window.ethereum.on) window.ethereum.on('accountsChanged', () => {});
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderAllWindows, 150); });
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });

  /* ---------- start ---------- */
  let floorApi = null;
  let entered = false;
  function start() {
    if (store.get('qr-crt', true) === false) document.body.classList.add('no-crt');
    if (store.get('qr-hero', false) === false) $('#heroCard').hidden = true; // the intro already introduces the arena
    renderIcons();
    snap = mode === 'live' ? Live.snapshot() : Sim.snapshot(byAddr);
    snap.journal.forEach((j) => seen.add(key(j)));
    renderChrome();
    term('sys', 'CITIZEN/OS ready · ' + (mode === 'live' ? 'live wallets' : 'paper round on live prices'));
    const tickClock = () => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
    tickClock(); setInterval(tickClock, 10000);
    headLoop(); setInterval(headLoop, 6000);
    scan(); setInterval(scan, 30000);
    setInterval(() => { if (mode === 'live') refreshLive().then(rebuild); }, 60000);
  }
  // called by the intro once the camera has zoomed into the TV
  function enterOS() {
    document.body.classList.add('in-os');
    scrollTo(0, 0);
    dispatchEvent(new Event('resize'));
    if (!entered) {
      entered = true;
      Sprites.wallpaper($('#wall'));
      floorApi = Sprites.floor($('#floor'), (id) => openWin('agent:' + id));
      if (!isPhone()) { if ($('#desktop').clientHeight >= 860) openWin('terminal'); openWin('standings'); }
    }
    renderAllWindows();
  }
  function leaveOS() {
    document.body.classList.remove('in-os');
    scrollTo(0, 0);
    setTimeout(() => window.PixelText && PixelText.renderAll(), 50);
    dispatchEvent(new Event('resize'));
  }
  window.QROS = {
    enter: enterOS, leave: leaveOS,
    data: () => ({ head, market, evals, mode, snap, rpcMs }),
    open: (id) => { openWin(id); renderWin(id); },
    music: toggleMusic
  };
  start();
})();
