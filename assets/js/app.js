/* Sherwood — UI, router and views. */
(function () {
  const M = window.Market;
  const P = window.Portfolio;
  const ASSETS = window.ASSETS;
  const STOCKS = ASSETS.filter((a) => a.cls === 'stock');
  const COINS = ASSETS.filter((a) => a.cls === 'crypto');
  const BY = Object.fromEntries(ASSETS.map((a) => [a.sym, a]));
  const LWC = window.LightweightCharts;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const app = $('#app');
  const TZ = -new Date().getTimezoneOffset() * 60; // charts render UTC; shift to local
  const PALETTE = ['#6f9a4a', '#c9a227', '#d4793f', '#7aa6b8', '#b5452f', '#9c7bb0', '#e0a458', '#5f8f7a', '#a3593a', '#8a6d4b', '#c2884f', '#d9b26f', '#b07c6e', '#4f7a45'];
  const colorOf = (sym) => BY[sym].color || PALETTE[ASSETS.indexOf(BY[sym]) % PALETTE.length];

  /* ================= formatting ================= */
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

  function priceDigits(p) {
    if (p == null || !Number.isFinite(p)) return '—';
    const neg = p < 0;
    p = Math.abs(p);
    let s;
    if (p === 0) s = '0.00';
    else if (p >= 1) s = nf2.format(p);
    else {
      const zeros = -Math.floor(Math.log10(p)) - 1;
      if (zeros >= 4) {
        const digits = Math.round(p * 10 ** (zeros + 4));
        if (digits >= 10000) return (neg ? '-' : '') + priceDigits(digits / 10 ** (zeros + 4));
        s = '0.0' + String(zeros).split('').map((d) => SUB[d]).join('') + String(digits).padStart(4, '0');
      } else s = p.toFixed(zeros + 4);
    }
    return (neg ? '-' : '') + s;
  }
  const fmtPrice = (p) => (p == null || !Number.isFinite(p) ? '—' : (p < 0 ? '-$' + priceDigits(-p) : '$' + priceDigits(p)));
  const fmtSignedPrice = (d, ref) => (d == null || !Number.isFinite(d) ? '—' : (d >= 0 ? '+$' : '-$') + (ref >= 1 || Math.abs(d) >= 0.01 ? nf2.format(Math.abs(d)) : priceDigits(Math.abs(d))));
  const fmtUsd = (v, sign) => {
    if (v == null || !Number.isFinite(v)) return '—';
    const s = '$' + nf2.format(Math.abs(v));
    if (sign) return (v >= 0 ? '+' : '-') + s;
    return v < 0 ? '-' + s : s;
  };
  const fmtCompact = (v) => (v == null || !Number.isFinite(v) ? '—' : '$' + compact.format(v));
  const fmtNum = (v) => (v == null || !Number.isFinite(v) ? '—' : compact.format(v));
  const fmtPct = (v) => (v == null || !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%');
  const fmtQty = (q) => {
    if (q == null || !Number.isFinite(q)) return '—';
    if (q >= 1000) return q.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (q >= 1) return q.toLocaleString('en-US', { maximumFractionDigits: 4 });
    return q.toLocaleString('en-US', { maximumSignificantDigits: 6 });
  };
  const fmtTime = (ms) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const cls = (v) => (v == null ? '' : v >= 0 ? 'up' : 'down');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rgba = (hex, a) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };
  const isStock = (sym) => BY[sym] && BY[sym].cls === 'stock';
  const unitName = (sym, n) => (isStock(sym) ? (n === 1 ? 'share' : 'shares') : sym);
  const logo = (a, size = 40) => `<img class="logo${a.cls === 'stock' ? ' logo--sq' : ''}" src="${a.logo}" width="${size}" height="${size}" alt="${esc(a.name)} logo" loading="lazy" />`;
  const tagFor = (a) => (a.cls === 'stock'
    ? `<span class="chain${a.kind === 'ETF' ? ' chain--etf' : ''}">${esc(a.kind)}</span>`
    : `<span class="chain${a.chain === 'Robinhood Chain' ? ' chain--rh' : ''}">${esc(a.chain)}</span>`);
  const rhUrl = (a) => (a.cls === 'stock' ? `https://robinhood.com/us/en/stocks/${a.sym}/` : `https://robinhood.com/us/en/crypto/${a.sym}/`);
  const href = (sym) => `#/asset/${encodeURIComponent(sym)}`;
  const starSvg = '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/></svg>';
  const extSvg = '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
  const swapSvg = '<svg viewBox="0 0 24 24"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>';

  /* ================= live painting ================= */
  const dirty = new Set();
  let raf = 0;
  let view = null; // { onTick(syms), onPortfolio(), retheme(), destroy() }
  const sparkPainted = {};

  M.on((sym) => {
    dirty.add(sym);
    if (!raf) raf = requestAnimationFrame(flush);
  });

  function flush() {
    raf = 0;
    const syms = Array.from(dirty);
    dirty.clear();
    for (const s of syms) paintSym(s);
    paintAccount();
    if (view && view.onTick) view.onTick(syms);
  }

  function paintSym(sym, root = document) {
    const s = M.state[sym];
    const q = (k) => $$(`[data-${k}="${CSS.escape(sym)}"]`, root);
    for (const el of q('px')) {
      const t = fmtPrice(s.price);
      if (el.textContent !== t) {
        const was = el.textContent;
        el.textContent = t;
        if (was && was !== '—' && s.dir && el.classList.contains('price')) {
          el.classList.remove('flash-up', 'flash-down');
          void el.offsetWidth;
          el.classList.add(s.dir > 0 ? 'flash-up' : 'flash-down');
        }
      }
    }
    for (const el of q('chg')) {
      el.textContent = fmtPct(s.change24);
      el.classList.toggle('up', s.change24 >= 0);
      el.classList.toggle('down', s.change24 < 0);
    }
    for (const el of q('mcap')) el.textContent = fmtCompact(s.mcap);
    for (const el of q('vol')) el.textContent = isStock(sym) ? fmtNum(s.volume) : fmtCompact(s.vol24);
    for (const el of q('range')) {
      if (s.low24 == null || s.high24 == null || s.price == null) continue;
      const lo = Math.min(s.low24, s.price), hi = Math.max(s.high24, s.price);
      const pct = hi > lo ? ((s.price - lo) / (hi - lo)) * 100 : 50;
      el.querySelector('.range__dot').style.left = Math.max(0, Math.min(100, pct)) + '%';
      el.querySelector('.lo').textContent = priceDigits(lo);
      el.querySelector('.hi').textContent = priceDigits(hi);
    }
    const now = Date.now();
    if (!sparkPainted[sym] || now - sparkPainted[sym] > 3000) {
      const sv = q('spark');
      if (sv.length) { sparkPainted[sym] = now; sv.forEach((el) => drawSpark(el, sym)); }
    }
  }

  function drawSpark(svg, sym) {
    const base = M.sparks[sym];
    if (!base || base.length < 2) return;
    const pts = base.slice();
    const s = M.state[sym];
    if (s.price != null && (!isStock(sym) || M.isStockSessionLive())) pts.push(s.price);
    const w = 128, h = 40, pad = 3;
    const ref = isStock(sym) && s.open24 ? s.open24 : pts[0];
    const min = Math.min(...pts, ref), max = Math.max(...pts, ref);
    const span = max - min || 1;
    const y = (v) => (pad + (1 - (v - min) / span) * (h - pad * 2)).toFixed(1);
    const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * w).toFixed(1)},${y(v)}`).join('');
    const up = pts[pts.length - 1] >= ref;
    const path = svg.querySelector('path');
    path.setAttribute('d', d);
    path.style.stroke = up ? 'var(--up)' : 'var(--down)';
    const base0 = svg.querySelector('line');
    if (base0) { base0.setAttribute('y1', y(ref)); base0.setAttribute('y2', y(ref)); }
  }

  let lastAcct = 0, acctTimer = 0;
  function paintAccount(force) {
    const now = Date.now();
    if (!force && now - lastAcct < 250) {
      if (!acctTimer) acctTimer = setTimeout(() => { acctTimer = 0; paintAccount(true); }, 260);
      return;
    }
    lastAcct = now;
    const st = P.state;
    const eq = P.equity();
    const day = P.dayChange();
    const all = eq - st.start;
    $$('[data-cash]').forEach((el) => (el.textContent = fmtUsd(st.cash)));
    $$('[data-equity]').forEach((el) => (el.textContent = fmtUsd(eq)));
    $$('[data-holdings]').forEach((el) => (el.textContent = fmtUsd(P.holdingsValue())));
    $$('[data-daychg]').forEach((el) => {
      const base = eq - day;
      el.textContent = `${fmtUsd(day, true)} (${fmtPct(base ? (day / base) * 100 : 0)})`;
      el.className = cls(day);
    });
    $$('[data-allchg]').forEach((el) => {
      el.textContent = `${fmtUsd(all, true)} (${fmtPct((all / st.start) * 100)})`;
      el.className = cls(all);
    });
    if (view && view.onPortfolio) view.onPortfolio();
  }
  P.on((evt) => {
    paintAccount(true);
    if (evt.type === 'filled' && evt.triggered) {
      const o = evt.order;
      toast(BY[o.sym], `Limit ${o.side} filled`, `${fmtQty(o.qty)} ${unitName(o.sym, o.qty)} of ${o.sym} at ${fmtPrice(o.price)}`);
    }
  });

  /* ================= chrome: tape, status, search, theme ================= */
  function buildTape() {
    const item = (a) => `<a class="tape__item" href="${href(a.sym)}">${logo(a, 18)}<b>${a.sym}</b><span class="mono" data-px="${a.sym}">—</span><span class="mono" data-chg="${a.sym}">—</span></a>`;
    const list = [...STOCKS.filter((s) => s.kind !== 'ETF').slice(0, 24), ...COINS.slice(0, 4)];
    const html = list.map(item).join('');
    $('#tape').innerHTML = html + html;
  }

  function paintStatus(status, session) {
    const pill = $('#livePill');
    pill.classList.remove('is-live', 'is-demo', 'is-ext');
    const label = pill.querySelector('.label');
    if (session.state === 'preview') {
      pill.classList.add('is-demo');
      label.textContent = 'Preview';
      pill.title = 'Real snapshot with simulated ticks';
      return;
    }
    if (status.robinhood === 'reconnecting' && session.state !== 'closed') { label.textContent = 'Reconnecting'; return; }
    if (session.state === 'regular') pill.classList.add('is-live');
    else if (['pre', 'after', 'overnight'].includes(session.state)) pill.classList.add('is-ext');
    label.textContent = session.label;
    pill.title = session.state === 'closed' && session.next
      ? `US market opens ${new Date(session.next).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })} your time. Crypto trades 24/7.`
      : `Robinhood market data: ${status.robinhood} · Crypto: Coinbase ${status.coinbase}, Kraken ${status.kraken}, Robinhood Chain ${status.dex}`;
  }

  function setupSearch() {
    const input = $('#search');
    const box = $('#searchResults');
    let idx = 0, results = [];
    const render = () => {
      const q = input.value.trim().toLowerCase();
      const scored = ASSETS.map((a) => {
        const s = a.sym.toLowerCase(), n = a.name.toLowerCase();
        let score = !q ? 1 : s === q ? 100 : s.startsWith(q) ? 60 : n.startsWith(q) ? 40 : n.includes(q) ? 20 : s.includes(q) ? 15 : 0;
        return [score, a];
      }).filter(([sc]) => sc > 0);
      scored.sort((x, y) => y[0] - x[0]);
      results = scored.slice(0, 8).map(([, a]) => a);
      idx = Math.min(idx, Math.max(0, results.length - 1));
      box.innerHTML = results.length
        ? results.map((a, i) => `<a class="search__item${i === idx ? ' is-active' : ''}" href="${href(a.sym)}" role="option">${logo(a, 32)}<span class="name"><b>${esc(a.name)}</b><small>${a.sym} · ${esc(a.cls === 'stock' ? a.kind : 'Crypto')}</small></span><span class="px"><span class="mono" data-px="${a.sym}">${fmtPrice(M.price(a.sym))}</span><br><span class="mono" data-chg="${a.sym}" style="font-size:12px"></span></span></a>`).join('')
        : `<div class="search__empty">Nothing matches “${esc(input.value)}”. Sherwood lists Robinhood’s 100 most popular stocks and ETFs, plus the memecoins on Robinhood Crypto.</div>`;
      results.forEach((a) => paintSym(a.sym, box));
      box.hidden = false;
    };
    const close = () => { box.hidden = true; };
    input.addEventListener('focus', render);
    input.addEventListener('input', () => { idx = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { idx = Math.min(results.length - 1, idx + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && results[idx]) { location.hash = href(results[idx].sym); input.value = ''; input.blur(); close(); }
      else if (e.key === 'Escape') { input.blur(); close(); }
    });
    box.addEventListener('click', () => { input.value = ''; close(); input.blur(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
    });
  }

  const currentTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  $('#themeBtn').addEventListener('click', () => {
    const t = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('sw.theme', t); } catch (e) {}
    $('meta[name="theme-color"]') && ($('meta[name="theme-color"]').content = cssVar('--bg'));
    if (view && view.retheme) view.retheme();
  });

  /* ================= toasts & confirm ================= */
  function toast(asset, title, sub) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${asset ? logo(asset, 34) : ''}<div><b>${esc(title)}</b><small>${esc(sub || '')}</small></div>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 4200);
  }
  function confirmBox(title, body, okLabel = 'Confirm') {
    const d = $('#confirmModal');
    $('#confirmTitle').textContent = title;
    $('#confirmBody').textContent = body;
    $('#confirmOk').textContent = okLabel;
    return new Promise((res) => {
      d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true });
      d.showModal();
    });
  }

  /* ================= charts ================= */
  function chartTheme() {
    return { text: cssVar('--muted'), line: cssVar('--line'), up: cssVar('--up'), down: cssVar('--down'), surface3: cssVar('--surface-3'), text1: cssVar('--text') };
  }
  function makeChart(el, opts = {}) {
    const t = chartTheme();
    return LWC.createChart(el, {
      autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: t.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: t.line } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.16 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 3, fixLeftEdge: true },
      crosshair: {
        mode: LWC.CrosshairMode.Normal,
        vertLine: { color: t.text, width: 1, style: LWC.LineStyle.Dashed, labelBackgroundColor: t.surface3 },
        horzLine: { color: t.text, width: 1, style: LWC.LineStyle.Dashed, labelBackgroundColor: t.surface3 },
      },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
      localization: { locale: 'en-US' },
      ...opts,
    });
  }
  const priceFormat = (ref) => {
    if (ref >= 1) return { type: 'price', precision: 2, minMove: 0.01 };
    const mag = ref > 0 ? Math.floor(Math.log10(ref)) : 0;
    return { type: 'custom', minMove: 10 ** Math.min(-2, mag - 4), formatter: (p) => priceDigits(p) };
  };
  function equitySeriesData(range) {
    const h = P.state.history;
    const now = Date.now();
    const spans = { '1D': 864e5, '1W': 6048e5, '1M': 2592e6, ALL: Infinity };
    const from = now - spans[range];
    const out = [];
    for (const [t, v] of h) {
      if (t < from) continue;
      const time = Math.floor(t / 1000) + TZ;
      if (out.length && out[out.length - 1].time >= time) out[out.length - 1].value = v;
      else out.push({ time, value: v });
    }
    const live = { time: Math.floor(now / 1000) + TZ, value: P.equity() };
    if (!out.length || out[out.length - 1].time < live.time) out.push(live);
    if (out.length === 1) out.unshift({ time: out[0].time - 60, value: P.state.start });
    return out;
  }

  function equitySvg(w = 600, h = 170) {
    const h0 = P.state.history.map((x) => x[1]);
    h0.push(P.equity());
    const pts = h0.length > 1 ? h0.slice(-240) : [P.state.start, P.state.start];
    const min = Math.min(...pts), max = Math.max(...pts);
    const span = max - min || Math.max(1, max * 0.01);
    const y = (v) => 18 + (1 - (v - (max - min ? min : min - span / 2)) / span) * (h - 36);
    const step = w / (pts.length - 1);
    let d = `M0,${y(pts[0]).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const x0 = (i - 1) * step, x1 = i * step, cx = (x0 + x1) / 2;
      d += ` C${cx.toFixed(1)},${y(pts[i - 1]).toFixed(1)} ${cx.toFixed(1)},${y(pts[i]).toFixed(1)} ${x1.toFixed(1)},${y(pts[i]).toFixed(1)}`;
    }
    const col = pts[pts.length - 1] >= P.state.start ? 'var(--up)' : 'var(--down)';
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="eqg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w},${h} L0,${h} Z" fill="url(#eqg)"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function heroChart() {
    const fresh = !Object.keys(P.state.positions).length && !P.state.orders.length;
    return equitySvg() + (fresh ? `<div class="hero__hint"><span>Your equity curve grows here.</span><a href="${href('NVDA')}">Buy your first share of NVIDIA →</a></div>` : '');
  }

  /* ================= views ================= */
  const ui = { filter: 'all', cfilter: 'all', sort: 'rank', dir: 1, movers: 'gainers', chartType: 'area', range: '1D', eqRange: 'ALL', actFilter: 'all' };
  try { Object.assign(ui, JSON.parse(localStorage.getItem('sw.ui2') || '{}')); } catch (e) {}
  const saveUi = () => { try { localStorage.setItem('sw.ui2', JSON.stringify(ui)); } catch (e) {} };

  const SECTORS = {
    tech: ['Electronic Technology', 'Technology Services'],
    finance: ['Finance'],
    consumer: ['Retail Trade', 'Consumer Durables', 'Consumer Services', 'Consumer Non-Durables'],
    health: ['Health Technology'],
  };
  const sectorOf = (a) => M.state[a.sym].sector || a.sector;

  /* ---------- Markets (stocks or crypto) ---------- */
  function MarketsView(klass) {
    const stocks = klass === 'stock';
    const list0 = stocks ? STOCKS : COINS;
    const fkey = stocks ? 'filter' : 'cfilter';
    const seen = (() => { try { return localStorage.getItem('sw.welcome2') === '1'; } catch (e) { return true; } })();
    const filters = stocks
      ? [['all', 'All'], ['watch', '★ Watchlist'], ['gainers', 'Gainers'], ['losers', 'Losers'], ['stocks', 'Stocks'], ['etf', 'ETFs'], ['tech', 'Tech'], ['finance', 'Finance'], ['consumer', 'Consumer'], ['health', 'Health']]
      : [['all', 'All'], ['watch', '★ Watchlist'], ['gainers', 'Gainers'], ['losers', 'Losers'], ['Solana', 'Solana'], ['Ethereum', 'Ethereum'], ['Robinhood Chain', 'Robinhood Chain']];
    if (!filters.some(([k]) => k === ui[fkey])) ui[fkey] = 'all';
    const chgLabel = stocks ? 'Today' : '24h';

    app.innerHTML = `
      <div class="view">
        ${M.demo ? `<div class="banner banner--demo"><span><b>Preview.</b> This hosted preview can’t reach Robinhood or the exchanges, so prices start from a real market snapshot taken ${esc(fmtTime(M.snapshotAt))} and move with simulated ticks. Run Sherwood from the repo for real live prices. Trading, charts and your portfolio work as normal.</span></div>` : ''}
        ${seen ? '' : `<div class="banner" id="welcome"><svg width="22" height="22" viewBox="0 0 32 32" style="color:var(--honey);flex-shrink:0"><use href="#mark"/></svg><span><b>Welcome to Sherwood.</b> You have <b>$10,000</b> in paper money to trade Robinhood’s most popular stocks and ETFs, plus Robinhood’s memecoins. Fractional shares, real quotes, zero risk.</span><button class="btn btn--ghost btn--sm" id="welcomeX">Got it</button></div>`}
        <section class="hero">
          <div class="card hero__main">
            <span class="eyebrow">Your portfolio</span>
            <div class="hero__title" data-equity>${fmtUsd(P.equity())}</div>
            <div class="hero__delta"><span><span data-daychg></span><span class="muted">Today</span></span><span><span data-allchg></span><span class="muted">All time</span></span></div>
            <div class="hero__meta">
              <div><span class="eyebrow">Buying power</span><b class="mono" data-cash></b></div>
              <div><span class="eyebrow">Holdings</span><b class="mono" data-holdings></b></div>
              <div><span class="eyebrow">Positions</span><b class="mono" id="posCount">${Object.keys(P.state.positions).length}</b></div>
            </div>
            <div class="hero__chart" id="heroChart">${heroChart()}</div>
          </div>
          <div class="card movers">
            <div class="movers__tabs">
              <span class="eyebrow">${stocks ? 'Today’s movers' : '24h movers'}</span>
              <div class="seg" id="moverSeg"><button data-m="gainers">Gainers</button><button data-m="losers">Losers</button></div>
            </div>
            <div id="movers"></div>
          </div>
        </section>

        <div class="section-head">
          <div>
            <h2>${stocks ? 'Robinhood’s 100 most popular' : 'Memecoins on Robinhood'}</h2>
            <p>${stocks ? 'Ranked by how many Robinhood customers own them · real Robinhood quotes · fractional shares' : `${COINS.length} coins · prices stream live · trade 24/7`}</p>
          </div>
          <div class="filters" id="filters">${filters.map(([k, l]) => `<button class="filter" data-f="${k}">${l}</button>`).join('')}</div>
        </div>
        <div class="card table" id="table"></div>
      </div>`;

    const wx = $('#welcomeX');
    if (wx) wx.onclick = () => { try { localStorage.setItem('sw.welcome2', '1'); } catch (e) {} $('#welcome').remove(); };

    const renderMovers = () => {
      $$('#moverSeg button').forEach((b) => b.classList.toggle('is-active', b.dataset.m === ui.movers));
      const list = list0.filter((a) => M.state[a.sym].change24 != null && (!stocks || a.kind !== 'ETF'))
        .sort((a, b) => (ui.movers === 'gainers' ? -1 : 1) * (M.state[a.sym].change24 - M.state[b.sym].change24))
        .slice(0, 5);
      const key = ui.movers + list.map((a) => a.sym).join();
      if ($('#movers').dataset.key === key) return;
      $('#movers').dataset.key = key;
      $('#movers').innerHTML = list.length
        ? list.map((a) => `<a class="mover" href="${href(a.sym)}">${logo(a, 40)}<div><b>${esc(a.name)}</b><small>${a.sym}</small></div><div class="right"><div class="mono" data-px="${a.sym}" style="font-weight:600"></div><span class="chip" data-chg="${a.sym}"></span></div></a>`).join('')
        : Array.from({ length: 5 }, () => `<div class="mover"><span class="skel" style="width:40px;height:40px;border-radius:12px"></span><span class="skel" style="width:110px"></span><span class="skel"></span></div>`).join('');
      list.forEach((a) => paintSym(a.sym, $('#movers')));
    };
    $('#moverSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; ui.movers = b.dataset.m; saveUi(); renderMovers(); };

    const sorters = {
      rank: (a) => ASSETS.indexOf(a),
      name: (a) => a.name.toLowerCase(),
      price: (a) => M.state[a.sym].price ?? -1,
      chg: (a) => M.state[a.sym].change24 ?? -999,
      mcap: (a) => M.state[a.sym].mcap ?? -1,
      vol: (a) => (stocks ? M.state[a.sym].volume * (M.state[a.sym].price || 0) : M.state[a.sym].vol24) || -1,
    };
    const head = (key, label, extra = '') => {
      const on = ui.sort === key;
      return `<div class="${extra}"><button data-sort="${key}" class="${on ? 'is-sorted' : ''}">${label}${on ? (ui.dir > 0 ? ' ↑' : ' ↓') : ''}</button></div>`;
    };
    const renderTable = () => {
      $$('#filters .filter').forEach((b) => b.classList.toggle('is-active', b.dataset.f === ui[fkey]));
      let list = list0.slice();
      const f = ui[fkey];
      if (f === 'watch') list = list.filter((a) => P.isWatched(a.sym));
      else if (f === 'gainers') list = list.filter((a) => (M.state[a.sym].change24 ?? 0) > 0);
      else if (f === 'losers') list = list.filter((a) => (M.state[a.sym].change24 ?? 0) < 0);
      else if (f === 'stocks') list = list.filter((a) => a.kind !== 'ETF');
      else if (f === 'etf') list = list.filter((a) => a.kind === 'ETF');
      else if (SECTORS[f]) list = list.filter((a) => a.kind !== 'ETF' && SECTORS[f].includes(sectorOf(a)));
      else if (f !== 'all') list = list.filter((a) => a.chain === f);
      const fn = sorters[ui.sort] || sorters.rank;
      list.sort((a, b) => { const x = fn(a), y = fn(b); return (x > y ? 1 : x < y ? -1 : 0) * ui.dir; });

      const rows = list.map((a) => `
        <div class="trow trow--body" data-go="${a.sym}">
          <div class="col-star"><button class="star ${P.isWatched(a.sym) ? 'is-on' : ''}" data-star="${a.sym}" aria-label="Watch ${esc(a.name)}">${starSvg}</button></div>
          <div class="coin-cell">${logo(a, 40)}<div class="t"><b>${esc(a.name)}</b><small>${stocks ? `<span class="rank">#${ASSETS.indexOf(a) + 1}</span>` : ''}${a.sym} ${tagFor(a)}</small></div></div>
          <div class="r"><span class="price mono" data-px="${a.sym}">—</span></div>
          <div class="r col-chg"><span class="chip" data-chg="${a.sym}">—</span></div>
          <div class="col-range"><div class="range" data-range="${a.sym}"><div class="range__bar"><span class="range__dot" style="left:50%"></span></div><div class="range__ends"><span class="lo">—</span><span class="hi">—</span></div></div></div>
          <div class="r col-mcap mono" data-mcap="${a.sym}">—</div>
          <div class="r col-vol mono" data-vol="${a.sym}">—</div>
          <div class="col-spark"><svg class="spark" data-spark="${a.sym}" viewBox="0 0 128 40" preserveAspectRatio="none">${stocks ? '<line x1="0" x2="128" class="spark__base"/>' : ''}<path/></svg></div>
          <div class="r col-act"><button class="btn btn--buy btn--sm" data-trade="${a.sym}">Trade</button></div>
        </div>`).join('');

      $('#table').innerHTML = `
        <div class="trow trow--head">
          <div class="col-star"></div>${head('name', stocks ? 'Name' : 'Coin')}${head('price', 'Price', 'r')}${head('chg', chgLabel, 'r col-chg')}
          <div class="col-range">${stocks ? 'Day range' : '24h range'}</div>${head('mcap', 'Market cap', 'r col-mcap')}${head('vol', stocks ? 'Volume' : 'Volume 24h', 'r col-vol')}
          <div class="col-spark">${stocks ? 'Last trading day' : 'Last 24h'}</div><div class="r col-act"></div>
        </div>
        ${rows || `<div class="empty"><svg viewBox="0 0 32 32"><use href="#mark"/></svg><h3>Nothing here yet</h3><p>${f === 'watch' ? 'Star anything to add it to your watchlist.' : 'Nothing matches this filter right now.'}</p></div>`}`;
      list.forEach((a) => { sparkPainted[a.sym] = 0; paintSym(a.sym, $('#table')); });
    };
    $('#filters').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; ui[fkey] = b.dataset.f; saveUi(); renderTable(); };
    $('#table').addEventListener('click', (e) => {
      const s = e.target.closest('[data-sort]');
      if (s) {
        const k = s.dataset.sort;
        if (ui.sort === k) ui.dir *= -1; else { ui.sort = k; ui.dir = k === 'name' ? 1 : -1; }
        saveUi(); renderTable(); return;
      }
      const star = e.target.closest('[data-star]');
      if (star) { e.stopPropagation(); P.toggleWatch(star.dataset.star); star.classList.toggle('is-on', P.isWatched(star.dataset.star)); if (ui[fkey] === 'watch') renderTable(); return; }
      const row = e.target.closest('[data-go],[data-trade]');
      if (row) location.hash = href(row.dataset.go || row.dataset.trade);
    });

    renderMovers();
    renderTable();
    paintAccount(true);

    let lastMovers = Date.now(), lastHero = 0;
    return {
      onTick() {
        const now = Date.now();
        if (now - lastMovers > 6000 || !$('#movers .mover b')) { lastMovers = now; renderMovers(); }
      },
      onPortfolio() {
        const now = Date.now();
        if (now - lastHero > 5000) { lastHero = now; $('#heroChart').innerHTML = heroChart(); $('#posCount').textContent = Object.keys(P.state.positions).length; }
      },
    };
  }

  /* ---------- Asset detail ---------- */
  const RANGE_LABEL = { '1H': 'Past hour', '1D': 'Today', '1W': 'Past week', '1M': 'Past month', '3M': 'Past 3 months', '1Y': 'Past year', '5Y': 'Past 5 years' };

  function AssetView(sym) {
    const a = BY[sym];
    if (!a) { location.hash = '#/'; return null; }
    const stock = a.cls === 'stock';
    const ranges = M.rangesFor(sym);
    let range = ranges.includes(ui.range) ? ui.range : '1D';
    document.title = `${a.sym} · ${a.name} · Sherwood`;
    const rangeLabel = (r) => (r === '1D' && !stock ? 'Past day' : RANGE_LABEL[r]);

    const statsHtml = stock
      ? [['Market cap', `data-mcap="${sym}"`], ['P/E ratio', 'id="st-pe"'], ['Dividend yield', 'id="st-div"'], ['Volume', `data-vol="${sym}"`], ['Average volume', 'id="st-avgvol"'], ['Open', 'id="st-open"'],
         ['Today’s high', 'id="hi24"'], ['Today’s low', 'id="lo24"'], ['52 Week high', 'id="st-hi52"'], ['52 Week low', 'id="st-lo52"'], ['Bid', 'id="st-bid"'], ['Ask', 'id="st-ask"']]
      : [['Market cap', `data-mcap="${sym}"`], ['Volume (24h)', `data-vol="${sym}"`], ['24h change', `data-chg="${sym}"`], ['24h high', 'id="hi24"'], ['24h low', 'id="lo24"'], ['Circulating supply', 'id="supply"']];

    app.innerHTML = `
      <div class="view" id="assetView">
        <nav class="crumbs"><a href="${stock ? '#/' : '#/crypto'}">${stock ? 'Stocks' : 'Crypto'}</a><span>/</span><span>${esc(a.name)}</span></nav>
        <div class="coin-layout">
          <div>
            <div class="coin-head">
              ${logo(a, 60)}
              <div>
                <h1>${esc(a.name)}</h1>
                <div class="sub"><span class="mono">${esc(a.sym)}</span>${tagFor(a)}<span id="subline"></span></div>
              </div>
              <div class="actions">
                <button class="btn btn--ghost btn--sm" id="watchBtn"><span class="star ${P.isWatched(sym) ? 'is-on' : ''}" style="width:auto;height:auto">${starSvg}</span><span>${P.isWatched(sym) ? 'Watching' : 'Watch'}</span></button>
                <a class="btn btn--ghost btn--sm ext" href="${rhUrl(a)}" target="_blank" rel="noopener">View on Robinhood ${extSvg}</a>
              </div>
            </div>

            <div class="quote">
              <div class="quote__px" id="qpx">${fmtPrice(M.price(sym))}</div>
              <div class="quote__chg"><span id="qchg" class="mono"></span><span class="when" id="qwhen">${rangeLabel(range)}</span><span class="live-dot" id="qlive"></span></div>
              <div class="quote__chg quote__ext" id="qext" hidden></div>
            </div>

            <div class="card chart-card">
              <div class="chart" id="chart"><div class="chart__loading" id="chartLoading">Loading chart…</div></div>
              <div class="chart-bar">
                <div class="ranges" id="ranges">${ranges.map((r) => `<button data-r="${r}">${r}</button>`).join('')}</div>
                <div class="seg" id="typeSeg"><button data-t="area">Line</button><button data-t="candles">Candles</button></div>
              </div>
            </div>

            <div class="stats">${statsHtml.map(([l, attr]) => `<div class="stat"><span>${l}</span><b class="mono" ${attr}>—</b></div>`).join('')}</div>

            <div class="card about">
              <h3>About ${esc(stock ? a.name : a.name)}</h3>
              <p id="aboutText">${esc(stock ? (M.state[sym].description || '') : a.desc)}</p>
              ${stock ? `<div class="facts" id="facts"></div>` : ''}
              <p class="src">${stock
                ? `Company profile, quotes and charts from <a href="${rhUrl(a)}" target="_blank" rel="noopener">Robinhood’s ${esc(a.sym)} page</a> data.`
                : `Description from <a href="${rhUrl(a)}" target="_blank" rel="noopener">Robinhood’s ${a.sym} page</a>. Live data via ${a.src.type === 'coinbase' ? 'Coinbase Exchange' : a.src.type === 'kraken' ? 'Kraken' : 'DexScreener & GeckoTerminal (Robinhood Chain)'}.`}</p>
            </div>
            ${stock ? `<div class="card about" id="ratingsCard" hidden></div>` : ''}
          </div>

          <a class="btn btn--buy trade-fab" href="#ticket" onclick="event.preventDefault();document.querySelector('.side').scrollIntoView({behavior:'smooth'})">Trade ${esc(a.sym)}</a>
          <aside class="side">
            <div class="card ticket" id="ticket"></div>
            <div class="card side-card" id="position"></div>
            <div class="card side-card" id="assetOrders"></div>
          </aside>
        </div>
      </div>`;

    $('#watchBtn').onclick = () => {
      P.toggleWatch(sym);
      const on = P.isWatched(sym);
      $('#watchBtn .star').classList.toggle('is-on', on);
      $('#watchBtn span:last-child').textContent = on ? 'Watching' : 'Watch';
    };

    /* ----- chart ----- */
    const root = $('#assetView');
    const chartEl = $('#chart');
    let chart, series, volSeries, bars = [], bucket = 60, prevClose = null, hovering = false, lastUp = null, loadToken = 0;
    const baseline = () => (range === '1D' && stock && prevClose ? prevClose : bars.length ? bars[0].open : M.state[sym].open24);

    function setAccent(up) {
      if (up === lastUp) return;
      lastUp = up;
      const t = chartTheme();
      const col = up ? t.up : t.down;
      root.style.setProperty('--accent', col);
      if (series && ui.chartType === 'area') series.applyOptions({ lineColor: col, topColor: rgba(col, 0.28), bottomColor: rgba(col, 0), crosshairMarkerBackgroundColor: col });
    }

    function buildChart() {
      if (chart) chart.remove();
      chart = makeChart(chartEl);
      const t = chartTheme();
      const ref = M.price(sym) || (bars[0] && bars[0].close) || 1;
      if (ui.chartType === 'area') {
        series = chart.addAreaSeries({ lineWidth: 2, priceFormat: priceFormat(ref), priceLineStyle: LWC.LineStyle.Dotted, crosshairMarkerRadius: 5, crosshairMarkerBorderColor: t.text1 });
      } else {
        series = chart.addCandlestickSeries({ upColor: t.up, downColor: t.down, borderUpColor: t.up, borderDownColor: t.down, wickUpColor: t.up, wickDownColor: t.down, priceFormat: priceFormat(ref), priceLineStyle: LWC.LineStyle.Dotted });
      }
      volSeries = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
      lastUp = null;
      chart.subscribeCrosshairMove((p) => {
        const d = p && p.time && series ? p.seriesData.get(series) : null;
        if (!d) { hovering = false; paintQuote(); return; }
        hovering = true;
        paintQuote(d.value != null ? d.value : d.close, (p.time - TZ) * 1000);
      });
      setSeriesData();
    }

    function setSeriesData() {
      if (!series) return;
      const t = chartTheme();
      if (ui.chartType === 'area') series.setData(bars.map((b) => ({ time: b.time, value: b.close })));
      else series.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
      volSeries.setData(bars.map((b) => ({ time: b.time, value: b.volume || 0, color: rgba(b.close >= b.open ? t.up : t.down, 0.32) })));
      if (range === '1D' && stock && prevClose) {
        series.createPriceLine({ price: prevClose, color: t.text, lineWidth: 1, lineStyle: LWC.LineStyle.Dotted, axisLabelVisible: false, title: 'Prev close' });
      }
      chart.timeScale().fitContent();
      if (bars.length) setAccent((M.price(sym) ?? bars[bars.length - 1].close) >= baseline());
    }

    async function loadRange() {
      const token = ++loadToken;
      $$('#ranges button').forEach((b) => b.classList.toggle('is-active', b.dataset.r === range));
      $$('#typeSeg button').forEach((b) => b.classList.toggle('is-active', b.dataset.t === ui.chartType));
      $('#qwhen').textContent = rangeLabel(range);
      const loading = $('#chartLoading');
      if (loading) { loading.textContent = 'Loading chart…'; loading.style.display = ''; }
      try {
        const h = await M.history(sym, range);
        if (token !== loadToken) return;
        bucket = h.bucket;
        prevClose = h.prevClose;
        bars = h.bars.map((b) => ({ ...b, time: b.time + TZ }));
        const px = M.price(sym);
        if (px != null && bars.length) liveBar(px, false);
        if (loading) loading.style.display = 'none';
        buildChart();
        paintQuote();
      } catch (e) {
        if (token !== loadToken) return;
        if (loading) { loading.textContent = 'Chart data is temporarily unavailable. Retrying…'; loading.style.display = ''; }
        setTimeout(() => { if (token === loadToken) loadRange(); }, 5000);
      }
    }

    function liveBar(p, push = true) {
      if (!bars.length) return;
      if (stock && !M.isStockSessionLive()) return;
      const t = Math.floor(Date.now() / 1000 / bucket) * bucket + TZ;
      let last = bars[bars.length - 1];
      if (t - last.time > bucket * 3 && !(M.demo && !stock)) return; // stale series (e.g. a weekend) — don't draw a gap
      if (t > last.time) {
        last = { time: t, open: last.close, high: p, low: p, close: p, volume: 0 };
        bars.push(last);
      } else {
        last.close = p;
        if (p > last.high) last.high = p;
        if (p < last.low) last.low = p;
      }
      if (push && series) {
        series.update(ui.chartType === 'area' ? { time: last.time, value: p } : { time: last.time, open: last.open, high: last.high, low: last.low, close: last.close });
        setAccent(p >= baseline());
      }
    }

    function paintQuote(hoverVal, hoverMs) {
      const s = M.state[sym];
      const live = s.price;
      const el = $('#qpx');
      if (!el) return;
      // On 1D, stocks show the regular-session change and a separate extended-hours line, like Robinhood.
      const showExt = stock && range === '1D' && !hoverMs && s.extended && s.regPrice != null;
      const v = hoverVal != null ? hoverVal : live;
      const head = showExt ? s.regPrice : v;
      const base = baseline();
      el.textContent = fmtPrice(v);
      if (head != null && base) {
        const d = head - base;
        $('#qchg').textContent = `${fmtSignedPrice(d, base)} (${fmtPct((d / base) * 100)})`;
        $('#qchg').className = 'mono ' + cls(d);
      }
      $('#qwhen').textContent = hoverMs ? fmtTime(hoverMs) : rangeLabel(range);
      const ext = $('#qext');
      if (showExt) {
        const d = live - s.regPrice;
        ext.hidden = false;
        ext.innerHTML = `<span class="mono ${cls(d)}">${fmtSignedPrice(d, s.regPrice)} (${fmtPct((d / s.regPrice) * 100)})</span><span class="when">${M.session.state === 'pre' ? 'Pre-market' : M.session.state === 'overnight' ? '24 Hour Market' : 'After hours'}</span>`;
      } else ext.hidden = true;
      const ql = $('#qlive');
      const liveNow = M.demo || !stock || M.isStockSessionLive();
      ql.textContent = M.demo ? 'Simulated' : liveNow ? 'Live' : 'Market closed';
      ql.classList.toggle('is-closed', !liveNow);
      ql.style.visibility = hoverMs ? 'hidden' : 'visible';
    }

    $('#ranges').onclick = (e) => { const b = e.target.closest('[data-r]'); if (!b || b.dataset.r === range) return; range = ui.range = b.dataset.r; saveUi(); loadRange(); };
    $('#typeSeg').onclick = (e) => {
      const b = e.target.closest('[data-t]');
      if (!b || b.dataset.t === ui.chartType) return;
      ui.chartType = b.dataset.t; saveUi();
      $$('#typeSeg button').forEach((x) => x.classList.toggle('is-active', x.dataset.t === ui.chartType));
      buildChart();
    };

    function paintStats() {
      const s = M.state[sym];
      const set = (id, v) => { const el = $('#' + id); if (el) el.textContent = v; };
      set('hi24', fmtPrice(s.high24));
      set('lo24', fmtPrice(s.low24));
      if (stock) {
        set('st-pe', s.pe ? s.pe.toFixed(2) : '—');
        set('st-div', s.divYield ? s.divYield.toFixed(2) + '%' : '—');
        set('st-avgvol', fmtNum(s.avgVolume));
        set('st-open', fmtPrice(s.dayOpen));
        set('st-hi52', fmtPrice(s.hi52));
        set('st-lo52', fmtPrice(s.lo52));
        set('st-bid', fmtPrice(s.bid));
        set('st-ask', fmtPrice(s.ask));
        set('subline', [sectorOf(a), s.industry].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i && x !== 'Miscellaneous').join(' · '));
        const about = $('#aboutText');
        if (about && s.description && about.textContent !== s.description) about.textContent = s.description;
        const facts = $('#facts');
        if (facts) {
          const f = [['CEO', s.ceo], ['Employees', s.employees ? s.employees.toLocaleString('en-US') : null], ['Headquarters', s.hq], ['Founded', s.founded], ['Industry', s.industry]].filter(([, v]) => v);
          facts.innerHTML = f.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
        }
      } else {
        set('supply', s.supply ? compact.format(s.supply) + ' ' + sym : '—');
        set('subline', s.rank ? `#${s.rank} by market cap` : '');
      }
    }

    async function loadRatings() {
      if (!stock || a.kind === 'ETF') return;
      const r = await M.ratings(sym);
      const card = $('#ratingsCard');
      if (!card || !r || !r.summary) return;
      const { num_buy_ratings: b = 0, num_hold_ratings: h = 0, num_sell_ratings: sl = 0 } = r.summary;
      const total = b + h + sl;
      if (!total) return;
      const pct = (n) => Math.round((n / total) * 100);
      const bull = (r.ratings || []).find((x) => x.type === 'buy');
      const bear = (r.ratings || []).find((x) => x.type === 'sell');
      card.hidden = false;
      card.innerHTML = `
        <h3>Analyst ratings</h3>
        <div class="ratings">
          <div class="ratings__big"><b>${pct(b)}%</b><span>of ${total} analysts rate it a Buy</span></div>
          <div class="ratings__bars">
            ${[['Buy', b, 'up'], ['Hold', h, 'hold'], ['Sell', sl, 'down']].map(([l, n, c]) => `<div class="rbar"><span>${l}</span><div class="rbar__track"><i class="rbar--${c}" style="width:${pct(n)}%"></i></div><b class="mono">${pct(n)}%</b></div>`).join('')}
          </div>
        </div>
        ${r.summary.mean_price_target ? `<p class="target">Mean price target <b class="mono">${fmtPrice(+r.summary.mean_price_target)}</b> · range <span class="mono">${fmtPrice(+r.summary.low_price_target)} – ${fmtPrice(+r.summary.high_price_target)}</span></p>` : ''}
        ${bull || bear ? `<div class="cases">${bull ? `<div class="case case--bull"><span>Bull case</span><p>${esc(bull.text)}</p></div>` : ''}${bear ? `<div class="case case--bear"><span>Bear case</span><p>${esc(bear.text)}</p></div>` : ''}</div>` : ''}
        <p class="src">Ratings via Robinhood (Morningstar research).</p>`;
    }

    /* ----- trade ticket ----- */
    const tk = { side: 'buy', type: 'market', unit: 'usd', amount: '', limit: '', review: false, error: '' };
    const unitLabel = () => (stock ? 'Shares' : sym);

    function tkQty() {
      const px = M.price(sym);
      const amt = parseFloat(tk.amount);
      if (!(amt > 0)) return 0;
      if (tk.unit === 'coin') return amt;
      const ref = tk.type === 'limit' ? parseFloat(tk.limit) : px;
      if (!(ref > 0)) return 0;
      let q = amt / ref;
      if (tk.side === 'sell') { const av = P.available(sym); if (q > av && q < av * 1.005) q = av; }
      return q;
    }

    function sessionNote() {
      if (M.demo) return 'Paper trade · $0 commission · fills at the simulated price';
      if (!stock) return 'Paper trade · $0 commission · crypto trades 24/7';
      if (M.session.state === 'regular') return 'Paper trade · $0 commission · market open';
      if (['pre', 'after', 'overnight'].includes(M.session.state)) return `Paper trade · $0 commission · ${M.session.label.toLowerCase()} price`;
      return 'Market closed · paper orders fill at the last price';
    }

    function renderTicket() {
      const buy = tk.side === 'buy';
      $('#ticket').innerHTML = `
        <div class="ticket__tabs">
          <button data-side="buy" class="${buy ? 'is-buy' : ''}">Buy ${esc(sym)}</button>
          <button data-side="sell" class="${!buy ? 'is-sell' : ''}">Sell ${esc(sym)}</button>
        </div>
        <div class="field">
          <div class="field__row"><span>Order type</span>
            <div class="seg" id="otype"><button data-type="market" class="${tk.type === 'market' ? 'is-active' : ''}">Market</button><button data-type="limit" class="${tk.type === 'limit' ? 'is-active' : ''}">Limit</button></div>
          </div>
        </div>
        ${tk.type === 'limit' ? `
        <div class="field">
          <div class="field__row"><span>Limit price (USD)</span><span class="mono">Now ${fmtPrice(M.price(sym))}</span></div>
          <label class="amount"><input id="limitIn" inputmode="decimal" placeholder="0.00" value="${esc(tk.limit)}" aria-label="Limit price" /></label>
        </div>` : ''}
        <div class="field">
          <div class="field__row"><span>${buy ? 'Buy' : 'Sell'} in ${tk.unit === 'usd' ? 'dollars' : stock ? 'shares' : sym}</span></div>
          <label class="amount">
            <input id="amtIn" inputmode="decimal" placeholder="${tk.unit === 'usd' ? '$0.00' : '0'}" value="${esc(tk.amount)}" aria-label="Amount" />
            <button class="unit" id="unitBtn" type="button" title="Switch unit">${tk.unit === 'usd' ? 'USD' : unitLabel()} ${swapSvg}</button>
          </label>
          <div class="quick">${[0.25, 0.5, 0.75, 1].map((f) => `<button data-q="${f}">${f === 1 ? 'Max' : f * 100 + '%'}</button>`).join('')}</div>
        </div>
        <div class="summary" id="tkSummary"></div>
        <div class="ticket__err" id="tkErr">${esc(tk.error)}</div>
        <div id="tkAction"></div>
        <div class="ticket__foot" id="tkFoot">${sessionNote()}</div>`;
      paintTicket();
    }

    function paintTicket() {
      if (!$('#tkSummary')) return;
      const buy = tk.side === 'buy';
      const px = M.price(sym);
      const q = tkQty();
      const fillPx = tk.type === 'limit' ? parseFloat(tk.limit) : px;
      const total = q * (fillPx || 0);
      const avail = P.available(sym);
      $('#tkSummary').innerHTML = `
        <div><span>${tk.type === 'limit' ? 'Limit price' : 'Market price'}</span><b class="mono">${fmtPrice(fillPx)}</b></div>
        <div><span>${tk.unit === 'usd' ? (stock ? 'Est. shares' : 'Est. quantity') : buy ? 'Est. cost' : 'Est. credit'}</span><b class="mono">${tk.unit === 'usd' ? (q ? fmtQty(q) + ' ' + (stock ? unitName(sym, q) : sym) : '—') : total ? fmtUsd(total) : '—'}</b></div>
        <hr />
        ${buy
          ? `<div><span>Buying power</span><b class="mono">${fmtUsd(P.state.cash)}</b></div>`
          : `<div><span>Available</span><b class="mono">${fmtQty(avail)} ${stock ? unitName(sym, avail) : sym}</b></div><div><span>Worth</span><b class="mono">${fmtUsd(avail * (px || 0))}</b></div>`}`;
      $('#tkErr').textContent = tk.error;
      const foot = $('#tkFoot');
      if (foot) foot.textContent = sessionNote();
      const ok = q > 0 && fillPx > 0;
      if (!ok) tk.review = false;
      const btnCls = buy ? 'btn--buy' : 'btn--sell';
      // Rebuild buttons only when their state changes, so live ticks never swallow a click.
      const key = [tk.review, ok, tk.side, tk.type].join('|');
      const action = $('#tkAction');
      if (action.dataset.key === key && !action.dataset.dirty) return;
      action.dataset.key = key;
      delete action.dataset.dirty;
      if (tk.review && ok) {
        const verb = buy ? 'buy' : 'sell';
        action.innerHTML = `
          <p style="margin:0 0 12px;font-size:14px;color:var(--text-2)">You’re placing a <b>${tk.type}</b> order to ${verb} <b class="mono">${fmtQty(q)} ${stock ? unitName(sym, q) + ' of ' + esc(sym) : esc(sym)}</b> for about <b class="mono">${fmtUsd(total)}</b>${tk.type === 'limit' ? ` when the price ${buy ? 'drops to' : 'rises to'} <b class="mono">${fmtPrice(fillPx)}</b>` : ''}.</p>
          <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px"><button class="btn btn--ghost" id="tkEdit">Edit</button><button class="btn ${btnCls}" id="tkGo">Confirm ${verb}</button></div>`;
      } else {
        action.innerHTML = `<button class="btn btn--block ${btnCls}" id="tkReview" ${ok ? '' : 'disabled'}>Review order</button>`;
      }
    }

    $('#ticket').addEventListener('click', (e) => {
      const t = e.target;
      const side = t.closest('[data-side]');
      if (side) { tk.side = side.dataset.side; tk.review = false; tk.error = ''; tk.amount = ''; tk.unit = tk.side === 'sell' ? 'coin' : 'usd'; renderTicket(); return; }
      const ty = t.closest('[data-type]');
      if (ty) { tk.type = ty.dataset.type; tk.review = false; if (tk.type === 'limit' && !tk.limit && M.price(sym) != null) tk.limit = String(+M.price(sym).toPrecision(6)); renderTicket(); return; }
      if (t.closest('#unitBtn')) {
        e.preventDefault();
        const q = tkQty();
        const ref = tk.type === 'limit' ? parseFloat(tk.limit) : M.price(sym);
        if (tk.unit === 'usd') { tk.unit = 'coin'; tk.amount = q ? String(+q.toPrecision(8)) : ''; }
        else { tk.unit = 'usd'; tk.amount = q && ref ? (q * ref).toFixed(2) : ''; }
        tk.review = false; renderTicket(); return;
      }
      const qb = t.closest('[data-q]');
      if (qb) {
        const f = +qb.dataset.q;
        const px = tk.type === 'limit' ? parseFloat(tk.limit) : M.price(sym);
        if (tk.side === 'buy') {
          const usd = Math.floor(P.state.cash * f * 100) / 100;
          if (tk.unit === 'usd') tk.amount = usd.toFixed(2);
          else tk.amount = px ? String(+(usd / px).toPrecision(8)) : '';
        } else {
          tk.unit = 'coin';
          const av = P.available(sym);
          tk.amount = f === 1 ? String(av) : String(+(av * f).toPrecision(8));
        }
        tk.review = false; tk.error = ''; renderTicket(); return;
      }
      if (t.closest('#tkReview')) { tk.review = true; tk.error = ''; $('#tkAction').dataset.dirty = '1'; paintTicket(); return; }
      if (t.closest('#tkEdit')) { tk.review = false; paintTicket(); return; }
      if (t.closest('#tkGo')) {
        const q = tkQty();
        const r = P.place({ sym, side: tk.side, type: tk.type, qty: q, limit: parseFloat(tk.limit) });
        if (!r.ok) { tk.error = r.error; tk.review = false; paintTicket(); return; }
        const o = r.order;
        const what = `${fmtQty(o.qty)} ${stock ? unitName(sym, o.qty) + ' of ' + sym : sym}`;
        if (o.status === 'filled') toast(a, `${o.side === 'buy' ? 'Bought' : 'Sold'} ${what}`, `at ${fmtPrice(o.price)} · ${fmtUsd(o.total)}${o.pnl != null ? ` · P&L ${fmtUsd(o.pnl, true)}` : ''}`);
        else toast(a, `Limit ${o.side} placed`, `${what} at ${fmtPrice(o.limit)}`);
        tk.amount = ''; tk.review = false; tk.error = '';
        renderTicket();
      }
    });
    $('#ticket').addEventListener('input', (e) => {
      if (e.target.id === 'amtIn') tk.amount = e.target.value.replace(/[^0-9.]/g, '');
      if (e.target.id === 'limitIn') tk.limit = e.target.value.replace(/[^0-9.]/g, '');
      tk.review = false; tk.error = '';
      paintTicket();
    });

    /* ----- position + orders ----- */
    function paintPosition() {
      const p = P.state.positions[sym];
      const px = M.price(sym);
      const s = M.state[sym];
      if (!p || p.qty <= 0) {
        $('#position').innerHTML = `<h3>Your position</h3><p class="empty-note">You don’t own any ${esc(sym)} yet. ${stock ? 'Fractional shares mean even $1 buys a slice.' : 'Buy a slice above — even $1 works.'}</p>`;
        return;
      }
      const val = p.qty * (px || 0);
      const ret = val - p.cost;
      const day = s.open24 ? p.qty * (px - s.open24) : null;
      const eq = P.equity();
      $('#position').innerHTML = `
        <h3>Your position</h3>
        <div class="pos-grid">
          <div><span>${stock ? 'Shares' : 'Quantity'}</span><b class="mono">${fmtQty(p.qty)}</b></div>
          <div><span>Market value</span><b class="mono">${fmtUsd(val)}</b></div>
          <div><span>Average cost</span><b class="mono">${fmtPrice(p.cost / p.qty)}</b></div>
          <div><span>Portfolio diversity</span><b class="mono">${eq ? ((val / eq) * 100).toFixed(1) : 0}%</b></div>
          <div><span>Today’s return</span><b class="mono ${cls(day)}">${day == null ? '—' : fmtUsd(day, true)}</b></div>
          <div><span>Total return</span><b class="mono ${cls(ret)}">${fmtUsd(ret, true)} <small style="font-size:12px">${fmtPct(p.cost ? (ret / p.cost) * 100 : 0)}</small></b></div>
        </div>`;
    }
    function renderOrders() {
      const list = P.state.orders.filter((o) => o.sym === sym).slice(0, 8);
      $('#assetOrders').innerHTML = `<h3>Orders</h3>` + (list.length ? `<div class="order-list">${list.map(orderItem).join('')}</div>` : `<p class="empty-note">No ${esc(sym)} orders yet.</p>`);
    }
    $('#assetOrders').addEventListener('click', (e) => { const b = e.target.closest('[data-cancel]'); if (b) P.cancel(b.dataset.cancel); });
    const offP = P.on(() => { renderOrders(); paintPosition(); paintTicket(); });
    const offS = M.onStatus(() => paintQuote());

    renderTicket();
    paintPosition();
    renderOrders();
    paintStats();
    paintSym(sym);
    loadRange();
    loadRatings();

    let lastSide = 0, sideTrail = 0;
    const paintSide = () => { lastSide = Date.now(); paintStats(); paintPosition(); paintTicket(); };
    return {
      onTick(syms) {
        if (!syms.includes(sym)) return;
        const p = M.price(sym);
        if (p != null) liveBar(p);
        if (!hovering) paintQuote();
        const el = $('#qpx');
        const s = M.state[sym];
        if (el && s.dir && !hovering) {
          el.style.color = s.dir > 0 ? 'var(--up)' : 'var(--down)';
          clearTimeout(el._t);
          el._t = setTimeout(() => (el.style.color = ''), 500);
        }
        const now = Date.now();
        clearTimeout(sideTrail);
        if (now - lastSide > 700) paintSide();
        else sideTrail = setTimeout(paintSide, 700 - (now - lastSide));
      },
      retheme() { lastUp = null; buildChart(); },
      destroy() { offP(); offS(); clearTimeout(sideTrail); loadToken++; if (chart) chart.remove(); document.title = 'Sherwood'; },
    };
  }

  function orderItem(o) {
    const a = BY[o.sym];
    const px = o.status === 'filled' ? o.price : o.limit;
    return `<div class="order-item">
      <div><b class="side-tag ${o.side === 'buy' ? 'up' : 'down'}">${o.side}</b> <span class="mono">${fmtQty(o.qty)} ${a.cls === 'stock' ? unitName(o.sym, o.qty) : esc(a.sym)}</span>
        <small>${a.cls === 'stock' ? esc(a.sym) + ' · ' : ''}${o.type === 'limit' ? 'Limit' : 'Market'} · ${fmtTime(o.closedAt || o.createdAt)}</small></div>
      <div style="text-align:right"><span class="status status--${o.status}">${o.status}</span>
        <small class="mono">${o.status === 'filled' ? fmtUsd(o.total) + ' @ ' + fmtPrice(px) : o.status === 'open' ? '@ ' + fmtPrice(px) : ''}${o.status === 'open' ? ` · <button class="link-btn" data-cancel="${o.id}">Cancel</button>` : ''}</small></div>
    </div>`;
  }

  /* ---------- Portfolio ---------- */
  function PortfolioView() {
    app.innerHTML = `
      <div class="view">
        <section class="pf-top">
          <div class="card pf-equity">
            <span class="eyebrow">Total equity</span>
            <div class="hero__title" data-equity>${fmtUsd(P.equity())}</div>
            <div class="hero__delta"><span><span data-allchg></span><span class="muted">All time</span></span><span><span data-daychg></span><span class="muted">Today</span></span></div>
            <div class="chart" id="eqChart"></div>
            <div class="chart-bar" style="padding:6px 0 12px"><div class="ranges" id="eqRanges">${['1D', '1W', '1M', 'ALL'].map((r) => `<button data-r="${r}">${r}</button>`).join('')}</div></div>
          </div>
          <div class="card alloc"><span class="eyebrow">Allocation</span><div id="alloc"></div></div>
        </section>
        <div class="kpis">
          <div class="card kpi"><span>Buying power</span><b data-cash></b></div>
          <div class="card kpi"><span>Holdings value</span><b data-holdings></b></div>
          <div class="card kpi"><span>Unrealized P&amp;L</span><b id="unreal"></b></div>
          <div class="card kpi"><span>Realized P&amp;L</span><b id="realized"></b></div>
        </div>
        <div class="section-head">
          <div><h2>Holdings</h2><p>Your paper positions, valued at live prices.</p></div>
          <button class="btn btn--ghost btn--sm" id="resetBtn">Reset account</button>
        </div>
        <div class="card" id="holdings"></div>
        <div id="openOrders"></div>
      </div>`;

    let chart, series;
    const eqEl = $('#eqChart');
    const buildEq = () => {
      if (chart) chart.remove();
      chart = makeChart(eqEl, { timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true } });
      const data = equitySeriesData(ui.eqRange);
      const t = chartTheme();
      const col = data[data.length - 1].value >= data[0].value ? t.up : t.down;
      series = chart.addAreaSeries({ lineWidth: 2, lineColor: col, topColor: rgba(col, 0.26), bottomColor: rgba(col, 0), priceFormat: { type: 'price', precision: 2, minMove: 0.01 }, crosshairMarkerBackgroundColor: col });
      series.setData(data);
      chart.timeScale().fitContent();
      $$('#eqRanges button').forEach((b) => b.classList.toggle('is-active', b.dataset.r === ui.eqRange));
      $('.pf-equity').style.setProperty('--accent', col);
    };
    $('#eqRanges').onclick = (e) => { const b = e.target.closest('[data-r]'); if (!b) return; ui.eqRange = b.dataset.r; saveUi(); buildEq(); };

    const renderAlloc = () => {
      const eq = P.equity();
      const parts = Object.entries(P.state.positions).map(([s, p]) => ({ label: s, color: colorOf(s), value: p.qty * (M.price(s) ?? p.cost / p.qty) }));
      parts.sort((x, y) => y.value - x.value);
      parts.push({ label: 'Cash', color: 'var(--surface-3)', value: P.state.cash + P.reservedCash() });
      const R = 80, C = 2 * Math.PI * R;
      let off = 0;
      const arcs = parts.filter((p) => p.value > 0).map((p) => {
        const len = (p.value / eq) * C;
        const arc = `<circle r="${R}" cx="105" cy="105" stroke="${p.color}" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}"/>`;
        off += len;
        return arc;
      }).join('');
      $('#alloc').innerHTML = `
        <div class="donut-wrap"><svg viewBox="0 0 210 210"><circle r="${R}" cx="105" cy="105" stroke="var(--surface-2)"/>${arcs}</svg>
          <div class="donut-center"><div><b>${parts.length - 1}</b><span>${parts.length - 1 === 1 ? 'position' : 'positions'}</span></div></div></div>
        <div class="legend">${parts.map((p) => `<div><i style="background:${p.color}"></i><span>${p.label === 'Cash' ? 'Cash' : esc(BY[p.label].name)}</span><span class="mono">${fmtUsd(p.value)}</span><span class="pct">${eq ? ((p.value / eq) * 100).toFixed(1) : 0}%</span></div>`).join('')}</div>`;
    };

    const renderHoldings = () => {
      const pos = Object.entries(P.state.positions);
      let unreal = 0;
      for (const [s, p] of pos) unreal += p.qty * (M.price(s) ?? 0) - p.cost;
      $('#unreal').textContent = fmtUsd(unreal, true);
      $('#unreal').className = cls(unreal);
      $('#realized').textContent = fmtUsd(P.state.realized, true);
      $('#realized').className = cls(P.state.realized);
      const box = $('#holdings');
      if (!pos.length) {
        box.dataset.key = '';
        box.innerHTML = `<div class="empty"><svg viewBox="0 0 32 32"><use href="#mark"/></svg><h3>Your quiver is empty</h3><p>Pick a stock, buy a fractional share with paper money, and watch it move with real Robinhood quotes.</p><a class="btn btn--buy" href="#/">Browse stocks</a></div>`;
        return;
      }
      const key = pos.map(([s, p]) => s + ':' + p.qty).sort().join();
      if (box.dataset.key === key) {
        for (const [s, p] of pos) {
          const val = p.qty * (M.price(s) || 0);
          const ret = val - p.cost;
          const v = box.querySelector(`[data-hval="${CSS.escape(s)}"]`);
          const r = box.querySelector(`[data-hret="${CSS.escape(s)}"]`);
          if (v) v.textContent = fmtUsd(val);
          if (r) { r.className = 'r mono ' + cls(ret); r.innerHTML = `${fmtUsd(ret, true)}<br><small>${fmtPct(p.cost ? (ret / p.cost) * 100 : 0)}</small>`; }
        }
        return;
      }
      box.dataset.key = key;
      pos.sort((x, y) => y[1].qty * (M.price(y[0]) || 0) - x[1].qty * (M.price(x[0]) || 0));
      box.innerHTML = `
        <div class="hrow hrow--head"><div>Name</div><div class="r col-px">Price</div><div class="r col-qty">Quantity</div><div class="r col-avg">Avg cost</div><div class="r">Value</div><div class="r">Return</div><div class="col-act"></div></div>
        ${pos.map(([s, p]) => {
          const a = BY[s];
          const px = M.price(s);
          const val = p.qty * (px || 0);
          const ret = val - p.cost;
          return `<div class="hrow hrow--body" data-go="${s}">
            <div class="coin-cell">${logo(a, 36)}<div class="t"><b>${esc(a.name)}</b><small>${esc(s)} <span class="mono" data-chg="${s}"></span></small></div></div>
            <div class="r col-px mono" data-px="${s}">${fmtPrice(px)}</div>
            <div class="r col-qty mono">${fmtQty(p.qty)}</div>
            <div class="r col-avg mono">${fmtPrice(p.cost / p.qty)}</div>
            <div class="r mono" style="font-weight:600" data-hval="${s}">${fmtUsd(val)}</div>
            <div class="r mono ${cls(ret)}" data-hret="${s}">${fmtUsd(ret, true)}<br><small>${fmtPct(p.cost ? (ret / p.cost) * 100 : 0)}</small></div>
            <div class="r col-act"><button class="btn btn--ghost btn--sm" data-go="${s}">Trade</button></div>
          </div>`;
        }).join('')}`;
      pos.forEach(([s]) => paintSym(s, box));
    };

    const renderOpen = () => {
      const open = P.state.orders.filter((o) => o.status === 'open');
      $('#openOrders').innerHTML = open.length
        ? `<div class="section-head"><div><h2>Open orders</h2><p>Limit orders fill automatically when the live price crosses your limit.</p></div></div><div class="card side-card"><div class="order-list">${open.map(orderItem).join('')}</div></div>`
        : '';
    };

    app.querySelector('.view').addEventListener('click', (e) => {
      const c = e.target.closest('[data-cancel]');
      if (c) { P.cancel(c.dataset.cancel); return; }
      const g = e.target.closest('[data-go]');
      if (g) location.hash = href(g.dataset.go);
    });
    $('#resetBtn').onclick = async () => {
      if (await confirmBox('Reset your account?', 'This clears all positions, orders and history and gives you a fresh $10,000 in paper money.', 'Reset')) {
        P.reset();
        toast(null, 'Account reset', 'Fresh $10,000 of paper money. Good hunting.');
        route();
      }
    };

    buildEq();
    renderAlloc();
    renderHoldings();
    renderOpen();
    paintAccount(true);
    const offP = P.on(() => { renderAlloc(); renderHoldings(); renderOpen(); });

    let last = 0, lastEq = 0, trail = 0;
    const refresh = () => { last = Date.now(); renderAlloc(); renderHoldings(); };
    return {
      onPortfolio() {
        const now = Date.now();
        clearTimeout(trail);
        if (now - last > 1000) refresh();
        else trail = setTimeout(refresh, 1000 - (now - last));
        if (series && now - lastEq > 2000) {
          lastEq = now;
          try { series.update({ time: Math.floor(now / 1000) + TZ, value: P.equity() }); } catch (e) {}
        }
      },
      retheme: buildEq,
      destroy() { offP(); clearTimeout(trail); if (chart) chart.remove(); },
    };
  }

  /* ---------- Activity ---------- */
  function ActivityView() {
    app.innerHTML = `
      <div class="view">
        <div class="section-head" style="margin-top:8px">
          <div><h2>Activity</h2><p>Every paper order you’ve placed.</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <div class="seg" id="actSeg">${['all', 'filled', 'open', 'canceled'].map((k) => `<button data-a="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
            ${M.demo ? '' : '<button class="btn btn--ghost btn--sm" id="csvBtn">Export CSV</button>'}
          </div>
        </div>
        <div class="card" id="actList"></div>
      </div>`;
    const render = () => {
      $$('#actSeg button').forEach((b) => b.classList.toggle('is-active', b.dataset.a === ui.actFilter));
      const list = P.state.orders.filter((o) => BY[o.sym] && (ui.actFilter === 'all' || o.status === ui.actFilter));
      if (!list.length) {
        $('#actList').innerHTML = `<div class="empty"><svg viewBox="0 0 32 32"><use href="#mark"/></svg><h3>No orders yet</h3><p>Your trades show up here the moment you place them.</p><a class="btn btn--buy" href="#/">Start trading</a></div>`;
        return;
      }
      $('#actList').innerHTML = `
        <div class="arow arow--head"><div class="col-time">Time</div><div>Name</div><div class="col-side">Side</div><div class="col-type">Type</div><div class="r col-qty">Quantity</div><div class="r col-px">Price</div><div class="r">Total</div><div class="r">Status</div></div>
        ${list.map((o) => {
          const a = BY[o.sym];
          const px = o.status === 'filled' ? o.price : o.limit;
          return `<div class="arow">
            <div class="col-time muted">${fmtTime(o.closedAt || o.createdAt)}</div>
            <div class="coin-cell">${logo(a, 30)}<div class="t"><b>${esc(a.name)}</b><small class="mono">${esc(o.sym)}</small></div></div>
            <div class="col-side side-tag ${o.side === 'buy' ? 'up' : 'down'}">${o.side}</div>
            <div class="col-type muted">${o.type}</div>
            <div class="r col-qty mono">${fmtQty(o.qty)}</div>
            <div class="r col-px mono">${fmtPrice(px)}</div>
            <div class="r mono">${o.status === 'filled' ? fmtUsd(o.total) : fmtUsd(o.qty * px)}${o.pnl != null ? `<br><small class="${cls(o.pnl)}">${fmtUsd(o.pnl, true)}</small>` : ''}</div>
            <div class="r"><span class="status status--${o.status}">${o.status}</span>${o.status === 'open' ? `<br><button class="link-btn" data-cancel="${o.id}">Cancel</button>` : ''}</div>
          </div>`;
        }).join('')}`;
    };
    $('#actSeg').onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; ui.actFilter = b.dataset.a; saveUi(); render(); };
    $('#actList').addEventListener('click', (e) => { const b = e.target.closest('[data-cancel]'); if (b) P.cancel(b.dataset.cancel); });
    if ($('#csvBtn')) $('#csvBtn').onclick = () => {
      const rows = [['time', 'symbol', 'side', 'type', 'status', 'quantity', 'price', 'total', 'pnl']];
      for (const o of P.state.orders) rows.push([new Date(o.closedAt || o.createdAt).toISOString(), o.sym, o.side, o.type, o.status, o.qty, o.status === 'filled' ? o.price : o.limit, o.total ?? '', o.pnl ?? '']);
      const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'sherwood-activity.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };
    render();
    const offP = P.on(render);
    return { destroy: offP };
  }

  /* ================= router ================= */
  function route() {
    if (view && view.destroy) view.destroy();
    view = null;
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent);
    let nav = 'stocks';
    if (parts[0] === 'asset' || parts[0] === 'coin') { view = AssetView((parts[1] || '').toUpperCase()); nav = BY[(parts[1] || '').toUpperCase()]?.cls === 'crypto' ? 'crypto' : 'stocks'; }
    else if (parts[0] === 'crypto') { view = MarketsView('crypto'); nav = 'crypto'; }
    else if (parts[0] === 'portfolio') { view = PortfolioView(); nav = 'portfolio'; }
    else if (parts[0] === 'activity') { view = ActivityView(); nav = 'activity'; }
    else view = MarketsView('stock');
    $$('[data-nav]').forEach((el) => el.classList.toggle('is-active', el.dataset.nav === nav));
    window.scrollTo({ top: 0 });
    ASSETS.forEach((a) => paintSym(a.sym));
    paintAccount(true);
  }

  /* ================= boot ================= */
  buildTape();
  setupSearch();
  M.onStatus(paintStatus);
  paintStatus(M.status, M.session);
  window.addEventListener('hashchange', route);
  route();
  M.start();
  M.loadSparks((sym) => {
    sparkPainted[sym] = 0;
    paintSym(sym);
  });
})();
