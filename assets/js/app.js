/* Sherwood — UI, router and views. */
(function () {
  const COINS = window.COINS;
  const M = window.Market;
  const P = window.Portfolio;
  const LWC = window.LightweightCharts;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const app = $('#app');
  const TZ = -new Date().getTimezoneOffset() * 60; // charts render UTC; shift to local

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
    else if (p >= 1000) s = nf2.format(p);
    else if (p >= 1) s = p.toFixed(4);
    else {
      const zeros = -Math.floor(Math.log10(p)) - 1;
      if (zeros >= 4) {
        let digits = Math.round(p * 10 ** (zeros + 4));
        if (digits >= 10000) return (neg ? '-' : '') + priceDigits(digits / 10 ** (zeros + 4));
        s = '0.0' + String(zeros).split('').map((d) => SUB[d]).join('') + String(digits).padStart(4, '0');
      } else s = p.toFixed(zeros + 4);
    }
    return (neg ? '-' : '') + s;
  }
  const fmtPrice = (p) => (p == null || !Number.isFinite(p) ? '—' : (p < 0 ? '-$' + priceDigits(-p) : '$' + priceDigits(p)));
  const fmtUsd = (v, sign) => {
    if (v == null || !Number.isFinite(v)) return '—';
    const s = '$' + nf2.format(Math.abs(v));
    if (sign) return (v >= 0 ? '+' : '-') + s;
    return v < 0 ? '-' + s : s;
  };
  const fmtCompact = (v) => (v == null || !Number.isFinite(v) ? '—' : '$' + compact.format(v));
  const fmtPct = (v) => (v == null || !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%');
  const fmtQty = (q) => {
    if (q == null || !Number.isFinite(q)) return '—';
    if (q >= 1000) return q.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (q >= 1) return q.toLocaleString('en-US', { maximumFractionDigits: 4 });
    return q.toLocaleString('en-US', { maximumSignificantDigits: 6 });
  };
  const fmtTime = (ms) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const cls = (v) => (v == null ? '' : v >= 0 ? 'up' : 'down');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rgba = (hex, a) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };
  const logo = (c, size = 40) => `<img class="logo" src="${c.logo}" width="${size}" height="${size}" alt="${esc(c.name)} logo" loading="lazy" />`;
  const chainTag = (c) => `<span class="chain${c.chain === 'Robinhood Chain' ? ' chain--rh' : ''}">${esc(c.chain)}</span>`;
  const starSvg = '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/></svg>';
  const extSvg = '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
  const swapSvg = '<svg viewBox="0 0 24 24"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>';
  const BY = Object.fromEntries(COINS.map((c) => [c.sym, c]));

  /* ================= live painting ================= */
  const dirty = new Set();
  let raf = 0;
  let view = null; // { onTick(syms), onPortfolio(), destroy() }
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
    for (const el of $$(`[data-px="${sym}"]`, root)) {
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
    for (const el of $$(`[data-chg="${sym}"]`, root)) {
      el.textContent = fmtPct(s.change24);
      el.classList.toggle('up', s.change24 >= 0);
      el.classList.toggle('down', s.change24 < 0);
    }
    for (const el of $$(`[data-mcap="${sym}"]`, root)) el.textContent = fmtCompact(s.mcap);
    for (const el of $$(`[data-vol="${sym}"]`, root)) el.textContent = fmtCompact(s.vol24);
    for (const el of $$(`[data-range="${sym}"]`, root)) {
      if (s.low24 == null || s.high24 == null) continue;
      const pct = s.high24 > s.low24 ? ((s.price - s.low24) / (s.high24 - s.low24)) * 100 : 50;
      el.querySelector('.range__dot').style.left = Math.max(0, Math.min(100, pct)) + '%';
      el.querySelector('.lo').textContent = priceDigits(s.low24);
      el.querySelector('.hi').textContent = priceDigits(s.high24);
    }
    const now = Date.now();
    if (!sparkPainted[sym] || now - sparkPainted[sym] > 3000) {
      const sv = $$(`[data-spark="${sym}"]`, root);
      if (sv.length) { sparkPainted[sym] = now; sv.forEach((el) => drawSpark(el, sym)); }
    }
  }

  function drawSpark(svg, sym) {
    const base = M.sparks[sym];
    if (!base || base.length < 2) return;
    const pts = base.slice();
    const px = M.state[sym].price;
    if (px != null) pts.push(px);
    const w = 128, h = 40, pad = 3;
    const min = Math.min(...pts), max = Math.max(...pts);
    const span = max - min || 1;
    const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * w).toFixed(1)},${(pad + (1 - (v - min) / span) * (h - pad * 2)).toFixed(1)}`).join('');
    const up = pts[pts.length - 1] >= pts[0];
    const path = svg.querySelector('path');
    path.setAttribute('d', d);
    path.style.stroke = up ? 'var(--up)' : 'var(--down)';
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
      toast(BY[o.sym], `Limit ${o.side} filled`, `${fmtQty(o.qty)} ${o.sym} at ${fmtPrice(o.price)}`);
    }
  });

  /* ================= chrome: tape, status, search, theme ================= */
  function buildTape() {
    const item = (c) => `<a class="tape__item" href="#/coin/${c.sym}">${logo(c, 18)}<b>${c.sym}</b><span class="mono" data-px="${c.sym}">—</span><span class="mono" data-chg="${c.sym}">—</span></a>`;
    const html = COINS.map(item).join('');
    $('#tape').innerHTML = html + html;
  }

  function paintStatus(s) {
    const pill = $('#livePill');
    const vals = Object.values(s);
    if (vals.includes('demo')) {
      pill.classList.remove('is-live');
      pill.classList.add('is-demo');
      pill.querySelector('.label').textContent = 'Preview';
      pill.title = 'Real snapshot with simulated ticks';
      return;
    }
    const live = vals.includes('live');
    pill.classList.toggle('is-live', live);
    pill.querySelector('.label').textContent = live ? 'Live' : vals.includes('reconnecting') ? 'Reconnecting' : 'Connecting';
    pill.title = `Coinbase: ${s.coinbase} · Kraken: ${s.kraken} · Robinhood Chain: ${s.dex}`;
  }

  function setupSearch() {
    const input = $('#search');
    const box = $('#searchResults');
    let idx = 0, results = [];
    const render = () => {
      const q = input.value.trim().toLowerCase();
      results = COINS.filter((c) => !q || c.sym.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.chain.toLowerCase().includes(q));
      idx = Math.min(idx, Math.max(0, results.length - 1));
      box.innerHTML = results.length
        ? results.map((c, i) => `<a class="search__item${i === idx ? ' is-active' : ''}" href="#/coin/${c.sym}" role="option">${logo(c, 32)}<span class="name"><b>${esc(c.name)}</b><small>${c.sym} · ${esc(c.chain)}</small></span><span class="px"><span class="mono" data-px="${c.sym}">${fmtPrice(M.price(c.sym))}</span><br><span class="mono" data-chg="${c.sym}" style="font-size:12px"></span></span></a>`).join('')
        : `<div class="search__empty">No memecoin matches “${esc(input.value)}”. Sherwood lists the memecoins tradable on Robinhood.</div>`;
      results.forEach((c) => paintSym(c.sym, box));
      box.hidden = false;
    };
    const close = () => { box.hidden = true; };
    input.addEventListener('focus', render);
    input.addEventListener('input', () => { idx = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { idx = Math.min(results.length - 1, idx + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && results[idx]) { location.hash = '#/coin/' + results[idx].sym; input.value = ''; input.blur(); close(); }
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
    $('meta[name="theme-color"]').content = cssVar('--bg');
    if (view && view.retheme) view.retheme();
  });

  /* ================= toasts & confirm ================= */
  function toast(coin, title, sub) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${coin ? logo(coin, 34) : ''}<div><b>${esc(title)}</b><small>${esc(sub || '')}</small></div>`;
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
    return {
      text: cssVar('--muted'),
      line: cssVar('--line'),
      up: cssVar('--up'),
      down: cssVar('--down'),
      surface3: cssVar('--surface-3'),
      text1: cssVar('--text'),
    };
  }
  function makeChart(el, opts = {}) {
    const t = chartTheme();
    return LWC.createChart(el, {
      autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: t.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: t.line } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.16 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 3, fixLeftEdge: true, fixRightEdge: false },
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
    if (pts.length === 1) pts.unshift(P.state.start);
    const min = Math.min(...pts), max = Math.max(...pts);
    const span = max - min || Math.max(1, max * 0.01);
    const y = (v) => 18 + (1 - (v - (max - min ? min : min - span / 2)) / span) * (h - 36);
    const step = w / (pts.length - 1);
    let d = `M0,${y(pts[0]).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const x0 = (i - 1) * step, x1 = i * step;
      const cx = (x0 + x1) / 2;
      d += ` C${cx.toFixed(1)},${y(pts[i - 1]).toFixed(1)} ${cx.toFixed(1)},${y(pts[i]).toFixed(1)} ${x1.toFixed(1)},${y(pts[i]).toFixed(1)}`;
    }
    const up = pts[pts.length - 1] >= P.state.start;
    const col = up ? 'var(--up)' : 'var(--down)';
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="eqg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w},${h} L0,${h} Z" fill="url(#eqg)"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function heroChart() {
    const fresh = !Object.keys(P.state.positions).length && !P.state.orders.length;
    return equitySvg() + (fresh ? `<div class="hero__hint"><span>Your equity curve grows here.</span><a href="#/coin/${COINS[0].sym}">Make your first trade →</a></div>` : '');
  }

  /* ================= views ================= */
  const ui = { filter: 'all', sort: 'rank', dir: 1, movers: 'gainers', chartType: 'area', range: '1D', eqRange: 'ALL', actFilter: 'all' };
  try { Object.assign(ui, JSON.parse(localStorage.getItem('sw.ui') || '{}')); } catch (e) {}
  const saveUi = () => { try { localStorage.setItem('sw.ui', JSON.stringify(ui)); } catch (e) {} };

  /* ---------- Markets ---------- */
  function MarketsView() {
    const seen = (() => { try { return localStorage.getItem('sw.welcome') === '1'; } catch (e) { return true; } })();
    app.innerHTML = `
      <div class="view">
        ${M.demo ? `<div class="banner banner--demo"><span><b>Preview.</b> This hosted preview can’t reach the exchanges, so prices start from a real market snapshot taken ${esc(fmtTime(M.snapshotAt))} and move with simulated ticks. Run Sherwood from the repo for real live prices. Trading, charts and your portfolio work as normal.</span></div>` : ''}
        ${seen ? '' : `<div class="banner" id="welcome"><svg width="22" height="22" viewBox="0 0 32 32" style="color:var(--honey);flex-shrink:0"><use href="#mark"/></svg><span><b>Welcome to Sherwood.</b> You have <b>$10,000</b> in paper money and live prices for every memecoin on Robinhood. Nothing here is real — trade boldly.</span><button class="btn btn--ghost btn--sm" id="welcomeX">Got it</button></div>`}
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
              <span class="eyebrow">24h movers</span>
              <div class="seg" id="moverSeg"><button data-m="gainers">Gainers</button><button data-m="losers">Losers</button></div>
            </div>
            <div id="movers"></div>
          </div>
        </section>

        <div class="section-head">
          <div>
            <h2>Every memecoin on Robinhood</h2>
            <p>${COINS.length} coins · prices stream live · tap any coin to trade</p>
          </div>
          <div class="filters" id="filters">
            ${[['all', 'All'], ['watch', '★ Watchlist'], ['gainers', 'Gainers'], ['losers', 'Losers'], ['Solana', 'Solana'], ['Ethereum', 'Ethereum'], ['Robinhood Chain', 'Robinhood Chain']]
              .map(([k, l]) => `<button class="filter" data-f="${k}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="card table" id="table"></div>
      </div>`;

    const wx = $('#welcomeX');
    if (wx) wx.onclick = () => { try { localStorage.setItem('sw.welcome', '1'); } catch (e) {} $('#welcome').remove(); };

    const renderMovers = () => {
      $$('#moverSeg button').forEach((b) => b.classList.toggle('is-active', b.dataset.m === ui.movers));
      const list = COINS.filter((c) => M.state[c.sym].change24 != null)
        .sort((a, b) => (ui.movers === 'gainers' ? -1 : 1) * (M.state[a.sym].change24 - M.state[b.sym].change24))
        .slice(0, 5);
      const key = ui.movers + list.map((c) => c.sym).join();
      if ($('#movers').dataset.key === key) return;
      $('#movers').dataset.key = key;
      $('#movers').innerHTML = list.length
        ? list.map((c) => `<a class="mover" href="#/coin/${c.sym}">${logo(c, 40)}<div><b>${esc(c.name)}</b><small>${c.sym}</small></div><div class="right"><div class="mono" data-px="${c.sym}" style="font-weight:600"></div><span class="chip" data-chg="${c.sym}"></span></div></a>`).join('')
        : Array.from({ length: 5 }, () => `<div class="mover"><span class="skel" style="width:40px;height:40px;border-radius:50%"></span><span class="skel" style="width:110px"></span><span class="skel"></span></div>`).join('');
      list.forEach((c) => paintSym(c.sym, $('#movers')));
    };
    $('#moverSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; ui.movers = b.dataset.m; saveUi(); renderMovers(); };

    const sorters = {
      rank: (c) => COINS.indexOf(c),
      name: (c) => c.name.toLowerCase(),
      price: (c) => M.state[c.sym].price ?? -1,
      chg: (c) => M.state[c.sym].change24 ?? -999,
      mcap: (c) => M.state[c.sym].mcap ?? -1,
      vol: (c) => M.state[c.sym].vol24 ?? -1,
    };
    const head = (key, label, extra = '') => {
      const on = ui.sort === key;
      return `<div class="${extra}"><button data-sort="${key}" class="${on ? 'is-sorted' : ''}">${label}${on ? (ui.dir > 0 ? ' ↑' : ' ↓') : ''}</button></div>`;
    };
    const renderTable = () => {
      $$('#filters .filter').forEach((b) => b.classList.toggle('is-active', b.dataset.f === ui.filter));
      let list = COINS.slice();
      const f = ui.filter;
      if (f === 'watch') list = list.filter((c) => P.isWatched(c.sym));
      else if (f === 'gainers') list = list.filter((c) => (M.state[c.sym].change24 ?? 0) > 0);
      else if (f === 'losers') list = list.filter((c) => (M.state[c.sym].change24 ?? 0) < 0);
      else if (f !== 'all') list = list.filter((c) => c.chain === f);
      const fn = sorters[ui.sort] || sorters.rank;
      list.sort((a, b) => { const x = fn(a), y = fn(b); return (x > y ? 1 : x < y ? -1 : 0) * ui.dir; });

      const rows = list.map((c) => `
        <div class="trow trow--body" data-go="${c.sym}">
          <div class="col-star"><button class="star ${P.isWatched(c.sym) ? 'is-on' : ''}" data-star="${c.sym}" aria-label="Watch ${esc(c.name)}">${starSvg}</button></div>
          <div class="coin-cell">${logo(c, 40)}<div class="t"><b>${esc(c.name)}</b><small>${c.sym} ${chainTag(c)}</small></div></div>
          <div class="r"><span class="price mono" data-px="${c.sym}">—</span></div>
          <div class="r col-chg"><span class="chip" data-chg="${c.sym}">—</span></div>
          <div class="col-range"><div class="range" data-range="${c.sym}"><div class="range__bar"><span class="range__dot" style="left:50%"></span></div><div class="range__ends"><span class="lo">—</span><span class="hi">—</span></div></div></div>
          <div class="r col-mcap mono" data-mcap="${c.sym}">—</div>
          <div class="r col-vol mono" data-vol="${c.sym}">—</div>
          <div class="col-spark"><svg class="spark" data-spark="${c.sym}" viewBox="0 0 128 40" preserveAspectRatio="none"><path/></svg></div>
          <div class="r col-act"><button class="btn btn--buy btn--sm" data-trade="${c.sym}">Trade</button></div>
        </div>`).join('');

      $('#table').innerHTML = `
        <div class="trow trow--head">
          <div class="col-star"></div>${head('name', 'Coin')}${head('price', 'Price', 'r')}${head('chg', '24h', 'r col-chg')}
          <div class="col-range">24h range</div>${head('mcap', 'Market cap', 'r col-mcap')}${head('vol', 'Volume 24h', 'r col-vol')}
          <div class="col-spark">Last 24h</div><div class="r col-act"></div>
        </div>
        ${rows || `<div class="empty"><svg viewBox="0 0 32 32"><use href="#mark"/></svg><h3>Nothing here yet</h3><p>${f === 'watch' ? 'Star a coin to add it to your watchlist.' : 'No coins match this filter right now.'}</p></div>`}`;
      list.forEach((c) => { sparkPainted[c.sym] = 0; paintSym(c.sym, $('#table')); });
    };
    $('#filters').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; ui.filter = b.dataset.f; saveUi(); renderTable(); };
    $('#table').addEventListener('click', (e) => {
      const s = e.target.closest('[data-sort]');
      if (s) {
        const k = s.dataset.sort;
        if (ui.sort === k) ui.dir *= -1; else { ui.sort = k; ui.dir = k === 'name' ? 1 : -1; }
        saveUi(); renderTable(); return;
      }
      const star = e.target.closest('[data-star]');
      if (star) { e.stopPropagation(); P.toggleWatch(star.dataset.star); star.classList.toggle('is-on', P.isWatched(star.dataset.star)); if (ui.filter === 'watch') renderTable(); return; }
      const row = e.target.closest('[data-go],[data-trade]');
      if (row) location.hash = '#/coin/' + (row.dataset.go || row.dataset.trade);
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
      sparksReady(sym) { sparkPainted[sym] = 0; paintSym(sym); },
    };
  }

  /* ---------- Coin detail ---------- */
  const RANGE_LABEL = { '1H': 'Past hour', '1D': 'Past day', '1W': 'Past week', '1M': 'Past month', '3M': 'Past 3 months' };

  function CoinView(sym) {
    const c = BY[sym];
    if (!c) { location.hash = '#/'; return null; }
    const robinhoodUrl = `https://robinhood.com/us/en/crypto/${c.sym}/`;
    document.title = `${c.name} (${c.sym}) · Sherwood`;

    app.innerHTML = `
      <div class="view" id="coinView">
        <nav class="crumbs"><a href="#/">Markets</a><span>/</span><span>${esc(c.name)}</span></nav>
        <div class="coin-layout">
          <div>
            <div class="coin-head">
              ${logo(c, 60)}
              <div>
                <h1>${esc(c.name)}</h1>
                <div class="sub"><span class="mono">${c.sym}</span>${chainTag(c)}<span id="rank"></span></div>
              </div>
              <div class="actions">
                <button class="btn btn--ghost btn--sm" id="watchBtn"><span class="star ${P.isWatched(sym) ? 'is-on' : ''}" style="width:auto;height:auto">${starSvg}</span><span>${P.isWatched(sym) ? 'Watching' : 'Watch'}</span></button>
                <a class="btn btn--ghost btn--sm ext" href="${robinhoodUrl}" target="_blank" rel="noopener">View on Robinhood ${extSvg}</a>
              </div>
            </div>

            <div class="quote">
              <div class="quote__px" id="qpx">${fmtPrice(M.price(sym))}</div>
              <div class="quote__chg"><span id="qchg" class="mono"></span><span class="when" id="qwhen">${RANGE_LABEL[ui.range]}</span><span class="live-dot" id="qlive">${M.demo ? 'Simulated' : 'Live'}</span></div>
            </div>

            <div class="card chart-card">
              <div class="chart" id="chart"><div class="chart__loading" id="chartLoading">Loading chart…</div></div>
              <div class="chart-bar">
                <div class="ranges" id="ranges">${Object.keys(M.RANGES).map((r) => `<button data-r="${r}">${r}</button>`).join('')}</div>
                <div class="seg" id="typeSeg"><button data-t="area">Line</button><button data-t="candles">Candles</button></div>
              </div>
            </div>

            <div class="stats">
              <div class="stat"><span>Market cap</span><b class="mono" data-mcap="${sym}">—</b></div>
              <div class="stat"><span>Volume (24h)</span><b class="mono" data-vol="${sym}">—</b></div>
              <div class="stat"><span>24h change</span><b class="mono" data-chg="${sym}">—</b></div>
              <div class="stat"><span>24h high</span><b class="mono" id="hi24">—</b></div>
              <div class="stat"><span>24h low</span><b class="mono" id="lo24">—</b></div>
              <div class="stat"><span>Circulating supply</span><b class="mono" id="supply">—</b></div>
            </div>

            <div class="card about">
              <h3>About ${esc(c.name)}</h3>
              <p>${esc(c.desc)}</p>
              <p class="src">Description from <a href="${robinhoodUrl}" target="_blank" rel="noopener">Robinhood’s ${c.sym} page</a>. Live data via ${c.src.type === 'coinbase' ? 'Coinbase Exchange' : c.src.type === 'kraken' ? 'Kraken' : 'DexScreener & GeckoTerminal (Robinhood Chain)'}. Memecoins are extremely volatile — which is exactly why you practice here first.</p>
            </div>
          </div>

          <a class="btn btn--buy trade-fab" href="#ticket" onclick="event.preventDefault();document.querySelector('.side').scrollIntoView({behavior:'smooth'})">Trade ${c.sym}</a>
          <aside class="side">
            <div class="card ticket" id="ticket"></div>
            <div class="card side-card" id="position"></div>
            <div class="card side-card" id="coinOrders"></div>
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
    const root = $('#coinView');
    const chartEl = $('#chart');
    let chart, series, volSeries, bars = [], bucket = 60, hovering = false, lastUp = null, loadToken = 0;

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
        series = chart.addAreaSeries({ lineWidth: 2, priceFormat: priceFormat(ref), lastValueVisible: true, priceLineVisible: true, priceLineStyle: LWC.LineStyle.Dotted, crosshairMarkerRadius: 5, crosshairMarkerBorderColor: t.text1 });
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
        const v = d.value != null ? d.value : d.close;
        paintQuote(v, (p.time - TZ) * 1000);
      });
      setSeriesData();
    }

    function setSeriesData() {
      if (!series) return;
      const t = chartTheme();
      if (ui.chartType === 'area') series.setData(bars.map((b) => ({ time: b.time, value: b.close })));
      else series.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
      volSeries.setData(bars.map((b) => ({ time: b.time, value: b.volume || 0, color: rgba(b.close >= b.open ? t.up : t.down, 0.32) })));
      chart.timeScale().fitContent();
      const ref = M.price(sym) || (bars.length ? bars[bars.length - 1].close : 1);
      series.applyOptions({ priceFormat: priceFormat(ref) });
      if (bars.length) setAccent((M.price(sym) ?? bars[bars.length - 1].close) >= bars[0].open);
    }

    async function loadRange() {
      const token = ++loadToken;
      $$('#ranges button').forEach((b) => b.classList.toggle('is-active', b.dataset.r === ui.range));
      $$('#typeSeg button').forEach((b) => b.classList.toggle('is-active', b.dataset.t === ui.chartType));
      $('#qwhen').textContent = RANGE_LABEL[ui.range];
      const loading = $('#chartLoading');
      if (loading) { loading.textContent = 'Loading chart…'; loading.style.display = ''; }
      try {
        const h = await M.history(sym, ui.range);
        if (token !== loadToken) return;
        bucket = h.bucket;
        bars = h.bars.map((b) => ({ ...b, time: b.time + TZ }));
        const px = M.price(sym);
        if (px != null && bars.length) liveBar(px, false);
        if (loading) loading.style.display = 'none';
        buildChart();
        paintQuote();
      } catch (e) {
        if (token !== loadToken) return;
        if (loading) { loading.textContent = 'Chart data is temporarily unavailable — retrying…'; loading.style.display = ''; }
        setTimeout(() => { if (token === loadToken) loadRange(); }, 5000);
      }
    }

    function liveBar(p, push = true) {
      if (!bars.length) return;
      const t = Math.floor(Date.now() / 1000 / bucket) * bucket + TZ;
      let last = bars[bars.length - 1];
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
        setAccent(p >= bars[0].open);
      }
    }

    function paintQuote(hoverVal, hoverMs) {
      const live = M.price(sym);
      const v = hoverVal != null ? hoverVal : live;
      const base = bars.length ? bars[0].open : M.state[sym].open24;
      const el = $('#qpx');
      if (!el) return;
      el.textContent = fmtPrice(v);
      if (v != null && base) {
        const d = v - base;
        $('#qchg').textContent = `${fmtPrice(d).replace(/^(-?)\$/, (m, s) => (s ? '-$' : '+$'))} (${fmtPct((d / base) * 100)})`;
        $('#qchg').className = 'mono ' + cls(d);
      }
      $('#qwhen').textContent = hoverMs ? fmtTime(hoverMs) : RANGE_LABEL[ui.range];
      $('#qlive').style.visibility = hoverMs ? 'hidden' : 'visible';
    }

    $('#ranges').onclick = (e) => { const b = e.target.closest('[data-r]'); if (!b || b.dataset.r === ui.range) return; ui.range = b.dataset.r; saveUi(); loadRange(); };
    $('#typeSeg').onclick = (e) => {
      const b = e.target.closest('[data-t]');
      if (!b || b.dataset.t === ui.chartType) return;
      ui.chartType = b.dataset.t; saveUi();
      $$('#typeSeg button').forEach((x) => x.classList.toggle('is-active', x.dataset.t === ui.chartType));
      buildChart();
    };

    function paintStats() {
      const s = M.state[sym];
      $('#hi24').textContent = fmtPrice(s.high24);
      $('#lo24').textContent = fmtPrice(s.low24);
      $('#supply').textContent = s.supply ? compact.format(s.supply) + ' ' + sym : '—';
      $('#rank').textContent = s.rank ? `#${s.rank} by market cap` : '';
    }

    /* ----- trade ticket ----- */
    const tk = { side: 'buy', type: 'market', unit: 'usd', amount: '', limit: '', review: false, error: '' };

    function tkQty() {
      const px = M.price(sym);
      const a = parseFloat(tk.amount);
      if (!(a > 0)) return 0;
      if (tk.unit === 'coin') return a;
      const ref = tk.type === 'limit' ? parseFloat(tk.limit) : px;
      if (!(ref > 0)) return 0;
      let q = a / ref;
      if (tk.side === 'sell') { const av = P.available(sym); if (q > av && q < av * 1.005) q = av; }
      return q;
    }

    function renderTicket() {
      const buy = tk.side === 'buy';
      $('#ticket').innerHTML = `
        <div class="ticket__tabs">
          <button data-side="buy" class="${buy ? 'is-buy' : ''}">Buy ${sym}</button>
          <button data-side="sell" class="${!buy ? 'is-sell' : ''}">Sell ${sym}</button>
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
          <div class="field__row"><span>${buy ? 'Amount' : 'Sell'} in ${tk.unit === 'usd' ? 'dollars' : sym}</span></div>
          <label class="amount">
            <input id="amtIn" inputmode="decimal" placeholder="${tk.unit === 'usd' ? '$0.00' : '0'}" value="${esc(tk.amount)}" aria-label="Amount" />
            <button class="unit" id="unitBtn" type="button" title="Switch unit">${tk.unit === 'usd' ? 'USD' : sym} ${swapSvg}</button>
          </label>
          <div class="quick">${[0.25, 0.5, 0.75, 1].map((f) => `<button data-q="${f}">${f === 1 ? 'Max' : f * 100 + '%'}</button>`).join('')}</div>
        </div>
        <div class="summary" id="tkSummary"></div>
        <div class="ticket__err" id="tkErr">${esc(tk.error)}</div>
        <div id="tkAction"></div>
        <div class="ticket__foot">Paper trade · $0 commission · fills at the live price</div>`;
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
        <div><span>${tk.unit === 'usd' ? 'Est. quantity' : buy ? 'Est. cost' : 'Est. credit'}</span><b class="mono">${tk.unit === 'usd' ? (q ? fmtQty(q) + ' ' + sym : '—') : total ? fmtUsd(total) : '—'}</b></div>
        <hr />
        ${buy
          ? `<div><span>Buying power</span><b class="mono">${fmtUsd(P.state.cash)}</b></div>`
          : `<div><span>Available</span><b class="mono">${fmtQty(avail)} ${sym}</b></div><div><span>Worth</span><b class="mono">${fmtUsd(avail * (px || 0))}</b></div>`}`;
      $('#tkErr').textContent = tk.error;
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
        $('#tkAction').innerHTML = `
          <p style="margin:0 0 12px;font-size:14px;color:var(--text-2)">You’re placing a <b>${tk.type}</b> order to ${verb} <b class="mono">${fmtQty(q)} ${sym}</b> for about <b class="mono">${fmtUsd(total)}</b>${tk.type === 'limit' ? ` when the price ${buy ? 'drops to' : 'rises to'} <b class="mono">${fmtPrice(fillPx)}</b>` : ''}.</p>
          <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px"><button class="btn btn--ghost" id="tkEdit">Edit</button><button class="btn ${btnCls}" id="tkGo">Confirm ${verb}</button></div>`;
      } else {
        $('#tkAction').innerHTML = `<button class="btn btn--block ${btnCls}" id="tkReview" ${ok ? '' : 'disabled'}>Review order</button>`;
      }
    }

    $('#ticket').addEventListener('click', (e) => {
      const t = e.target;
      const side = t.closest('[data-side]');
      if (side) { tk.side = side.dataset.side; tk.review = false; tk.error = ''; tk.amount = ''; if (tk.side === 'sell') tk.unit = 'coin'; else tk.unit = 'usd'; renderTicket(); return; }
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
        if (o.status === 'filled') toast(c, `${o.side === 'buy' ? 'Bought' : 'Sold'} ${fmtQty(o.qty)} ${sym}`, `at ${fmtPrice(o.price)} · ${fmtUsd(o.total)}${o.pnl != null ? ` · P&L ${fmtUsd(o.pnl, true)}` : ''}`);
        else toast(c, `Limit ${o.side} placed`, `${fmtQty(o.qty)} ${sym} at ${fmtPrice(o.limit)}`);
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
        $('#position').innerHTML = `<h3>Your position</h3><p class="empty-note">You don’t own any ${sym} yet. Buy a slice above — even $1 works.</p>`;
      } else {
        const val = p.qty * (px || 0);
        const ret = val - p.cost;
        const day = s.open24 ? p.qty * (px - s.open24) : null;
        const eq = P.equity();
        $('#position').innerHTML = `
          <h3>Your position</h3>
          <div class="pos-grid">
            <div><span>Quantity</span><b class="mono">${fmtQty(p.qty)}</b></div>
            <div><span>Market value</span><b class="mono">${fmtUsd(val)}</b></div>
            <div><span>Average cost</span><b class="mono">${fmtPrice(p.cost / p.qty)}</b></div>
            <div><span>Portfolio share</span><b class="mono">${eq ? ((val / eq) * 100).toFixed(1) : 0}%</b></div>
            <div><span>Today’s return</span><b class="mono ${cls(day)}">${day == null ? '—' : fmtUsd(day, true)}</b></div>
            <div><span>Total return</span><b class="mono ${cls(ret)}">${fmtUsd(ret, true)} <small style="font-size:12px">${fmtPct(p.cost ? (ret / p.cost) * 100 : 0)}</small></b></div>
          </div>`;
      }
    }
    function renderOrders() {
      const list = P.state.orders.filter((o) => o.sym === sym).slice(0, 8);
      $('#coinOrders').innerHTML = `<h3>Orders</h3>` + (list.length
        ? `<div class="order-list">${list.map(orderItem).join('')}</div>`
        : `<p class="empty-note">No ${sym} orders yet.</p>`);
    }
    $('#coinOrders').addEventListener('click', (e) => { const b = e.target.closest('[data-cancel]'); if (b) P.cancel(b.dataset.cancel); });
    const offP = P.on(() => { renderOrders(); paintPosition(); paintTicket(); });

    renderTicket();
    paintPosition();
    renderOrders();
    paintStats();
    paintSym(sym);
    loadRange();

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
      destroy() { offP(); clearTimeout(sideTrail); loadToken++; if (chart) chart.remove(); document.title = 'Sherwood — Paper-trade Robinhood memecoins'; },
    };
  }

  function orderItem(o) {
    const c = BY[o.sym];
    const px = o.status === 'filled' ? o.price : o.limit;
    return `<div class="order-item">
      <div><b class="side-tag ${o.side === 'buy' ? 'up' : 'down'}">${o.side}</b> <span class="mono">${fmtQty(o.qty)} ${c.sym}</span>
        <small>${o.type === 'limit' ? 'Limit' : 'Market'} · ${fmtTime(o.closedAt || o.createdAt)}</small></div>
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
      const parts = Object.entries(P.state.positions).map(([s, p]) => ({ label: s, color: BY[s].color, value: p.qty * (M.price(s) ?? p.cost / p.qty) }));
      parts.sort((a, b) => b.value - a.value);
      parts.push({ label: 'Cash', color: 'var(--surface-3)', value: P.state.cash + P.reservedCash() });
      const R = 80, C = 2 * Math.PI * R;
      let off = 0;
      const arcs = parts.filter((p) => p.value > 0).map((p) => {
        const len = (p.value / eq) * C;
        const a = `<circle r="${R}" cx="105" cy="105" stroke="${p.color}" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}"/>`;
        off += len;
        return a;
      }).join('');
      $('#alloc').innerHTML = `
        <div class="donut-wrap"><svg viewBox="0 0 210 210"><circle r="${R}" cx="105" cy="105" stroke="var(--surface-2)"/>${arcs}</svg>
          <div class="donut-center"><div><b>${parts.length - 1}</b><span>${parts.length - 1 === 1 ? 'position' : 'positions'}</span></div></div></div>
        <div class="legend">${parts.map((p) => `<div><i style="background:${p.color}"></i><span>${p.label === 'Cash' ? 'Cash' : `${esc(BY[p.label].name)}`}</span><span class="mono">${fmtUsd(p.value)}</span><span class="pct">${eq ? ((p.value / eq) * 100).toFixed(1) : 0}%</span></div>`).join('')}</div>`;
    };

    const renderHoldings = () => {
      const pos = Object.entries(P.state.positions);
      let unreal = 0;
      for (const [s, p] of pos) unreal += p.qty * (M.price(s) ?? 0) - p.cost;
      $('#unreal').textContent = fmtUsd(unreal, true);
      $('#unreal').className = cls(unreal);
      $('#realized').textContent = fmtUsd(P.state.realized, true);
      $('#realized').className = cls(P.state.realized);
      if (!pos.length) {
        $('#holdings').dataset.key = '';
        $('#holdings').innerHTML = `<div class="empty"><svg viewBox="0 0 32 32"><use href="#mark"/></svg><h3>Your quiver is empty</h3><p>Pick a memecoin, place your first paper trade, and watch it move in real time.</p><a class="btn btn--buy" href="#/">Browse memecoins</a></div>`;
        return;
      }
      const key = pos.map(([s, p]) => s + ':' + p.qty).sort().join();
      const box = $('#holdings');
      if (box.dataset.key === key) {
        for (const [s, p] of pos) {
          const val = p.qty * (M.price(s) || 0);
          const ret = val - p.cost;
          const v = box.querySelector(`[data-hval="${s}"]`);
          const r = box.querySelector(`[data-hret="${s}"]`);
          if (v) v.textContent = fmtUsd(val);
          if (r) { r.className = 'r mono ' + cls(ret); r.innerHTML = `${fmtUsd(ret, true)}<br><small>${fmtPct(p.cost ? (ret / p.cost) * 100 : 0)}</small>`; }
        }
        return;
      }
      box.dataset.key = key;
      pos.sort((a, b) => b[1].qty * (M.price(b[0]) || 0) - a[1].qty * (M.price(a[0]) || 0));
      $('#holdings').innerHTML = `
        <div class="hrow hrow--head"><div>Coin</div><div class="r col-px">Price</div><div class="r col-qty">Quantity</div><div class="r col-avg">Avg cost</div><div class="r">Value</div><div class="r">Return</div><div class="col-act"></div></div>
        ${pos.map(([s, p]) => {
          const c = BY[s];
          const px = M.price(s);
          const val = p.qty * (px || 0);
          const ret = val - p.cost;
          return `<div class="hrow hrow--body" data-go="${s}">
            <div class="coin-cell">${logo(c, 36)}<div class="t"><b>${esc(c.name)}</b><small>${s} <span class="mono" data-chg="${s}"></span></small></div></div>
            <div class="r col-px mono" data-px="${s}">${fmtPrice(px)}</div>
            <div class="r col-qty mono">${fmtQty(p.qty)}</div>
            <div class="r col-avg mono">${fmtPrice(p.cost / p.qty)}</div>
            <div class="r mono" style="font-weight:600" data-hval="${s}">${fmtUsd(val)}</div>
            <div class="r mono ${cls(ret)}" data-hret="${s}">${fmtUsd(ret, true)}<br><small>${fmtPct(p.cost ? (ret / p.cost) * 100 : 0)}</small></div>
            <div class="r col-act"><button class="btn btn--ghost btn--sm" data-go="${s}">Trade</button></div>
          </div>`;
        }).join('')}`;
      pos.forEach(([s]) => paintSym(s, $('#holdings')));
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
      if (g) location.hash = '#/coin/' + g.dataset.go;
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
      const list = P.state.orders.filter((o) => ui.actFilter === 'all' || o.status === ui.actFilter);
      if (!list.length) {
        $('#actList').innerHTML = `<div class="empty"><svg viewBox="0 0 32 32"><use href="#mark"/></svg><h3>No orders yet</h3><p>Your trades will show up here the moment you place them.</p><a class="btn btn--buy" href="#/">Start trading</a></div>`;
        return;
      }
      $('#actList').innerHTML = `
        <div class="arow arow--head"><div class="col-time">Time</div><div>Coin</div><div class="col-side">Side</div><div class="col-type">Type</div><div class="r col-qty">Quantity</div><div class="r col-px">Price</div><div class="r">Total</div><div class="r">Status</div></div>
        ${list.map((o) => {
          const c = BY[o.sym];
          const px = o.status === 'filled' ? o.price : o.limit;
          return `<div class="arow">
            <div class="col-time muted">${fmtTime(o.closedAt || o.createdAt)}</div>
            <div class="coin-cell">${logo(c, 30)}<div class="t"><b>${esc(c.name)}</b><small class="mono">${o.sym}</small></div></div>
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
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sherwood-activity.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    render();
    const offP = P.on(render);
    return { destroy: offP };
  }

  /* ================= router ================= */
  function route() {
    if (view && view.destroy) view.destroy();
    view = null;
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
    let nav = 'markets';
    if (parts[0] === 'coin') { view = CoinView((parts[1] || '').toUpperCase()); nav = ''; }
    else if (parts[0] === 'portfolio') { view = PortfolioView(); nav = 'portfolio'; }
    else if (parts[0] === 'activity') { view = ActivityView(); nav = 'activity'; }
    else view = MarketsView();
    $$('[data-nav]').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === nav));
    window.scrollTo({ top: 0 });
    COINS.forEach((c) => paintSym(c.sym));
    paintAccount(true);
  }

  /* ================= boot ================= */
  buildTape();
  setupSearch();
  M.onStatus(paintStatus);
  paintStatus(M.status);
  window.addEventListener('hashchange', route);
  route();
  M.start();
  M.loadSparks((sym) => {
    sparkPainted[sym] = 0;
    paintSym(sym);
  });
})();
