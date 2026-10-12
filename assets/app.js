/* Kairo front-end: live data from the Kairo API, swaps signed in the user's own wallet. */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RH = 4663;
  const NATIVE = '0x0000000000000000000000000000000000000000';
  const QUOTE_USER = '0x000000000000000000000000000000000000dEaD'; // placeholder used for quotes before a wallet connects
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);
  const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
  const fmtUsd = n => n == null ? '—' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + n.toFixed(n < 10 ? 2 : 0);
  const fmtPct = n => n == null ? '—' : (n >= 0 ? '+' : '') + (Math.abs(n) >= 100 ? Math.round(n) : n.toFixed(1)) + '%';
  const fmtNum = n => {
    if (!isFinite(n)) return '—';
    if (n === 0) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    return n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : n < 1000 ? 4 : 0 });
  };
  const fmtMoney = n => n == null || !isFinite(n) ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: Math.abs(n) < 1000 ? 2 : 0, maximumFractionDigits: 2 });
  const fmtPrice = n => n == null ? '—' : n >= 1 ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '$' + n.toPrecision(3);
  const scoreClass = s => s == null ? '' : s >= 7 ? 's-hi' : s >= 4 ? 's-mid' : 's-lo';
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const scoreColor = s => cssVar(s >= 7 ? '--green' : s >= 4 ? '--amber' : '--red');
  const ago = t => { if (!t) return '—'; const s = Math.max(0, Math.floor((Date.now() - t) / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
  const cleanName = n => String(n || '').replace(/\s*•\s*Robinhood Token$/i, '');
  const hues = ['#b9d08f', '#e8cf9a', '#d98b60', '#8fb8a3', '#c9a77c', '#a7c48a', '#e09a6d', '#9fb0a2'];
  const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

  function avatar(t, cls = '') {
    const img = safeUrl(t.image || t.icon);
    if (img) return `<img class="tk ${cls}" src="${esc(img)}" alt="" loading="lazy">`;
    const h = hashStr(t.address || t.symbol || '?');
    const sym = esc(String(t.symbol || '?').slice(0, 4));
    return `<span class="tk ${cls}" style="background:linear-gradient(135deg,${hues[h % 8]},${hues[(h >> 3) % 8]})">${sym}</span>`;
  }

  // Exact decimal <-> integer conversion (no floating point for amounts sent on-chain).
  function parseUnits(str, decimals) {
    str = String(str || '').trim().replace(',', '.');
    if (!/^\d*\.?\d*$/.test(str) || str === '' || str === '.') return 0n;
    const [i, f = ''] = str.split('.');
    return BigInt((i || '0') + f.slice(0, decimals).padEnd(decimals, '0'));
  }
  function formatUnits(v, decimals) {
    v = BigInt(v);
    const neg = v < 0n; if (neg) v = -v;
    const base = 10n ** BigInt(decimals);
    const i = v / base, f = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
    return (neg ? '-' : '') + i.toString() + (f ? '.' + f : '');
  }
  const unitsToNum = (v, d) => Number(formatUnits(v, d));
  const hex = n => '0x' + BigInt(n).toString(16);

  async function api(path, opts) {
    const res = await fetch('/api' + path, opts && opts.body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts.body) } : undefined);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.message || body.error || 'Request failed'); e.status = res.status; throw e; }
    return body;
  }

  function toast(msg, ms = 3200) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  function countTo(el, to, dur = 1200) {
    if (reduced) { el.textContent = to.toLocaleString('en-US'); return; }
    const from = Number(String(el.textContent).replace(/[^\d]/g, '')) || 0;
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  // ---------- pulse ----------
  const pulse = { block: 0, at: 0, blockMs: 100, ethUsd: null };
  function setPulse(k, v) {
    $$(`[data-pulse="${k}"]`).forEach(el => {
      if (el.textContent === v) return;
      el.textContent = v;
      if (k !== 'block') { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    });
  }
  async function loadPulse() {
    try {
      const p = await api('/pulse');
      pulse.block = p.block; pulse.at = Date.now(); pulse.blockMs = p.blockMs || 100; pulse.ethUsd = p.ethUsd || pulse.ethUsd;
      setPulse('flagged', p.flagged24h.toLocaleString('en-US'));
      setPulse('tokens', p.tokens24h.toLocaleString('en-US') + (p.backfill && !p.backfill.done ? ` · indexing ${Math.round(p.backfill.progress * 100)}%` : ''));
      setPulse('blockMs', p.blockMs ? p.blockMs + ' ms' : '—');
      setPulse('stocks', String(p.stocks));
      countTo($('#statScored'), p.scored24h);
      countTo($('#statStocks'), p.stocks);
      $('#stockMore').textContent = Math.max(0, p.stocks - 2) + '';
    } catch { /* keep last values */ }
  }
  // Between polls the block number advances at the measured block time.
  setInterval(() => {
    if (!pulse.block) return;
    const est = pulse.block + Math.floor((Date.now() - pulse.at) / pulse.blockMs);
    setPulse('block', est.toLocaleString('en-US'));
  }, 200);

  // ---------- feed ----------
  let feedMode = 'new';
  const feedRows = $('#feedRows');
  feedRows.innerHTML = Array.from({ length: 7 }, () =>
    '<div class="frow sk"><span class="fn"><span class="tk"></span><div><b>Loading token</b><small>$TOKEN</small></div></span><span class="fhide"><small>—</small></span><span class="fhide"><small>—</small></span><span><small>—</small></span><span class="fs">0</span></div>').join('');
  let lastTop = null;
  const known = new Map(); // address -> brief (for swap/token picker)

  async function loadFeed() {
    try {
      const minScore = $('#hideRisky').checked ? 4 : 0;
      const { items } = await api(`/feed?tab=${feedMode}&limit=8&minScore=${minScore}`);
      items.forEach(t => known.set(t.address, t));
      if (!items.length) { feedRows.innerHTML = '<div class="pickempty">Scanning the chain for launches…</div>'; return; }
      const top = items[0].address;
      feedRows.innerHTML = items.map(t => `
        <div class="frow${feedMode === 'new' && lastTop && t.address === top && top !== lastTop ? ' new' : ''}" data-a="${esc(t.address)}" role="button" tabindex="0">
          <span class="fn">${avatar(t)}<div><b>${esc(t.name)}</b><small>$${esc(t.symbol)}</small></div></span>
          <span class="fhide">${ago(t.createdAt)}</span>
          <span class="fhide">${t.listed ? fmtUsd(t.vol24) : 'curve'}</span>
          <span class="${(t.change24 ?? 0) >= 0 ? 'up' : 'dn'}">${fmtPct(t.change24)}</span>
          <span class="fs ${scoreClass(t.score)}">${t.score ?? '…'}</span>
        </div>`).join('');
      lastTop = top;
    } catch { /* retry next tick */ }
  }
  const openRow = e => {
    const row = e.target.closest('.frow[data-a]');
    if (!row || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    openReport(row.dataset.a);
  };
  feedRows.addEventListener('click', openRow);
  feedRows.addEventListener('keydown', openRow);
  $$('.ftabs button').forEach(b => b.addEventListener('click', () => {
    $$('.ftabs button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    feedMode = { recent: 'new', trending: 'trending', safe: 'top' }[b.dataset.feed];
    lastTop = null;
    loadFeed();
  }));
  $('#hideRisky').addEventListener('change', loadFeed);
  $('#feedMore').addEventListener('click', e => { e.preventDefault(); openSearchPicker(''); });

  // ---------- trending: marquee + try chips ----------
  let trending = [];
  async function loadTrending() {
    try {
      const { items } = await api('/feed?tab=trending&limit=16');
      trending = items;
      items.forEach(t => known.set(t.address, t));
      const mq = items.slice(0, 14).map(t =>
        `<span class="mi">${avatar(t)}<b>$${esc(t.symbol)}</b><i class="${(t.change24 ?? 0) >= 0 ? 'up' : 'dn'}">${fmtPct(t.change24)}</i><span class="fs ${scoreClass(t.score)}">${t.score ?? '…'}</span></span>`).join('');
      $('#marq').innerHTML = mq + mq;
      const seen = new Set();
      const chips = items.filter(t => { const k = t.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      $('#tryChips').innerHTML = chips.slice(0, 3).map(t =>
        `<button class="trychip" type="button" data-a="${esc(t.address)}">${avatar(t)}${esc(t.name.slice(0, 18))}<span class="sc ${scoreClass(t.score)}">${t.score ?? '…'}</span></button>`).join('');
    } catch { /* ignore */ }
  }
  $('#tryChips').addEventListener('click', e => {
    const b = e.target.closest('.trychip');
    if (!b) return;
    $('#heroCa').value = b.dataset.a;
    openReport(b.dataset.a);
  });

  // ---------- score card ----------
  const ARC = 2 * Math.PI * 22 * 0.75;
  const typers = {};
  function scoreCardHTML(id) {
    return `<div class="scorevis">
      <div class="dialbox">
        <svg viewBox="0 0 52 52" aria-hidden="true">
          <circle class="trk" cx="26" cy="26" r="22" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="${ARC} 999"/>
          <circle class="val" id="${id}Arc" cx="26" cy="26" r="22" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="${ARC} 999" stroke-dashoffset="${ARC}"/>
        </svg>
        <div class="n"><span id="${id}N">—</span><small>/ 10</small></div>
      </div>
      <div class="sright">
        <div class="stok" id="${id}Tok"></div>
        <span class="slabel" id="${id}Lab"></span>
        <ul class="flags" id="${id}Flags"></ul>
      </div>
      ${id === 'rp' ? chartHTML(id) : ''}
      <div class="sai">
        <div class="aih"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" fill="currentColor"/></svg>Kairo AI</div>
        <p id="${id}Ai"><span class="skl w100"></span><span class="skl w70"></span></p>
      </div>
      <div class="rstats" id="${id}Stats"></div>
      ${id === 'rp' ? `<div class="tradelist" id="${id}Trades" hidden></div>` : ''}
      <div class="rlinks" id="${id}Links"></div>
      <p class="snote">Computed from public on-chain data at the time shown. Not financial advice.</p>
    </div>`;
  }
  function typeText(el, text, key) {
    clearInterval(typers[key]);
    if (!text) { el.textContent = ''; return; }
    if (reduced) { el.textContent = text; return; }
    let i = 0;
    el.innerHTML = '<span class="caret"></span>';
    typers[key] = setInterval(() => {
      i += 2;
      el.innerHTML = esc(text.slice(0, i)) + '<span class="caret"></span>';
      if (i >= text.length) { clearInterval(typers[key]); el.textContent = text; }
    }, 16);
  }
  function fillScore(id, t) {
    const arc = $('#' + id + 'Arc'), n = $('#' + id + 'N');
    const s = t.score ?? 0;
    arc.style.stroke = scoreColor(s); arc.style.color = scoreColor(s);
    arc.style.strokeDashoffset = ARC;
    requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = ARC * (1 - s / 10); }));
    n.textContent = '0'; countTo(n, s, 900);
    $('#' + id + 'Tok').innerHTML = avatar(t, 'lg') + `<div><b>${esc(t.name)}</b><small>$${esc(t.symbol)} · ${short(t.address)} · ${ago(t.createdAt)} old</small></div>`;
    const lab = $('#' + id + 'Lab');
    lab.textContent = t.label || ''; lab.className = 'slabel ' + scoreClass(s);
    const icon = { bad: '!', warn: '~', ok: '✓' };
    $('#' + id + 'Flags').innerHTML = (t.flags || []).map(f => `<li class="${esc(f.level)}"><i>${icon[f.level] || ''}</i>${esc(f.text)}</li>`).join('');
    typeText($('#' + id + 'Ai'), t.ai, id);
    const stat = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
    $('#' + id + 'Stats').innerHTML = [
      stat('Liquidity', t.listed ? fmtUsd(t.liquidityUsd) : 'On curve'),
      stat('Volume 24h', t.listed ? fmtUsd(t.vol24) : '—'),
      stat('Mkt cap', fmtUsd(t.marketCap)),
      stat('Holders', t.holders != null ? t.holders.toLocaleString('en-US') : '—'),
      stat('Creator holds', t.creatorHoldPct != null ? t.creatorHoldPct.toFixed(1) + '%' : '—'),
      stat('Snipers hold', t.sniperPct != null ? t.sniperPct.toFixed(1) + '%' : '—')
    ].join('');
    const links = [];
    if (safeUrl(t.explorer)) links.push(`<a href="${esc(t.explorer)}" target="_blank" rel="noopener">Explorer ↗</a>`);
    if (t.market && safeUrl(t.market.url)) links.push(`<a href="${esc(t.market.url)}" target="_blank" rel="noopener">DexScreener ↗</a>`);
    if (t.scoredAt) links.push(`<span style="color:var(--dim)">Scored ${ago(t.scoredAt)} ago</span>`);
    $('#' + id + 'Links').innerHTML = links.join('');
  }

  // ---------- live chart (TradingView Lightweight Charts, fed by our own on-chain candles) ----------
  const TFS = [['1s', 1], ['1m', 60], ['5m', 300], ['15m', 900], ['1h', 3600]];
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  // Tiny prices the way traders read them: 0.0₅4297 = 0.000004297.
  function fmtSmall(p) {
    if (!isFinite(p)) return '';
    const a = Math.abs(p);
    if (a >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (a >= 1) return p.toFixed(a >= 100 ? 2 : 3);
    if (a === 0) return '0';
    const zeros = Math.floor(-Math.log10(a)); // zeros between the decimal point and the first digit
    if (zeros < 4) return p.toPrecision(4);
    const digits = Math.round(a * 10 ** (zeros + 4)).toString().slice(0, 4).replace(/0+$/, '') || '0';
    return '0.0' + String(zeros).split('').map(d => SUB[d]).join('') + digits;
  }
  const rgba = (hexColor, a) => { const h = hexColor.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
  function chartHTML(id) {
    return `<div class="chartbox"><div class="ctool">
      <div class="seg" data-tf>${TFS.map(([l, v]) => `<button type="button" data-v="${v}"${v === 60 ? ' class="on"' : ''}>${l}</button>`).join('')}</div>
      <span class="live"><i class="dot"></i>Live from chain</span>
      <div class="seg" data-mode><button type="button" data-v="price" class="on">Price</button><button type="button" data-v="mc">MCap</button></div>
    </div><div class="chart" id="${id}Chart"></div></div>`;
  }
  let live = null;
  function stopChart() {
    if (!live) return;
    clearTimeout(live.timer);
    try { live.chart.remove(); } catch { /* already gone */ }
    live = null;
  }
  function startChart(id, address, explorer) {
    stopChart();
    const el = $('#' + id + 'Chart');
    if (!el || !window.LightweightCharts) return;
    const L = window.LightweightCharts;
    const up = cssVar('--green'), down = cssVar('--red');
    const chart = L.createChart(el, {
      autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: cssVar('--mute'), fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(255,240,215,.04)' }, horzLines: { color: 'rgba(255,240,215,.04)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: L.CrosshairMode.Normal },
      localization: { locale: 'en-US', priceFormatter: fmtSmall }
    });
    const candles = chart.addCandlestickSeries({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceFormat: { type: 'custom', formatter: fmtSmall, minMove: 1e-12 } });
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    live = { id, address, explorer, tf: 60, mode: 'price', chart, candles, vol, fitted: false, seen: new Set(), timer: null, up, down };
    const box = el.closest('.chartbox');
    const seg = (sel, fn) => box.querySelector(sel).addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || !live) return;
      $$('button', b.parentNode).forEach(x => x.classList.toggle('on', x === b));
      fn(b.dataset.v);
      live.fitted = false;
      pollChart();
    });
    seg('[data-tf]', v => { live.tf = Number(v); chart.applyOptions({ timeScale: { secondsVisible: live.tf < 60 } }); });
    seg('[data-mode]', v => { live.mode = v; });
    pollChart();
  }
  async function pollChart() {
    if (!live) return;
    const cur = live;
    clearTimeout(cur.timer);
    try {
      const d = await api(`/chart/${cur.address}?tf=${cur.tf}`);
      if (live !== cur) return;
      const k = cur.mode === 'mc' && d.supply ? d.supply : 1;
      const el = $('#' + cur.id + 'Chart');
      const empty = el.querySelector('.chartempty');
      if (!d.candles.length && !empty) el.insertAdjacentHTML('beforeend', '<div class="chartempty">No trades on-chain yet — the chart starts with the first buy.</div>');
      if (d.candles.length && empty) empty.remove();
      cur.candles.setData(d.candles.map(c => ({ time: c.time, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })));
      cur.vol.setData(d.candles.map(c => ({ time: c.time, value: c.volume, color: rgba(c.close >= c.open ? cur.up : cur.down, 0.35) })));
      if (!cur.fitted && d.candles.length) { cur.chart.timeScale().fitContent(); cur.fitted = true; }
      renderTrades(cur, d.trades);
    } catch { /* keep the last frame; retry next tick */ }
    if (live === cur) cur.timer = setTimeout(pollChart, 3000);
  }
  function renderTrades(cur, trades) {
    const box = $('#' + cur.id + 'Trades');
    if (!box) return;
    box.hidden = !trades.length;
    if (!trades.length) return;
    const base = safeUrl(cur.explorer) ? new URL(cur.explorer).origin : null;
    box.innerHTML = '<div class="trow2 head"><span>Age</span><span>Side</span><span>USD</span><span>Amount</span><span>Tx</span></div>' + trades.map(tr => {
      const fresh = !cur.seen.has(tr.tx) && cur.seen.size > 0;
      return `<div class="trow2${fresh ? ' new' : ''}"><span>${ago(tr.time * 1000)}</span><span class="${tr.buy ? 'b' : 's'}">${tr.buy ? 'Buy' : 'Sell'}</span>
        <span>${tr.usd != null ? '$' + fmtNum(tr.usd) : fmtNum(tr.eth) + ' ETH'}</span><span>${fmtNum(tr.tokens)}</span>
        <span>${base ? `<a href="${esc(base)}/tx/${esc(tr.tx)}" target="_blank" rel="noopener">${esc(short(tr.trader || tr.tx))}</a>` : ''}</span></div>`;
    }).join('');
    trades.forEach(tr => cur.seen.add(tr.tx));
  }

  // Landing showcase
  $('#scoreCard').innerHTML = scoreCardHTML('sc');
  let showIdx = 0;
  function showSection(t) {
    fillScore('sc', t);
    $('#sLaunch').textContent = (t.launch ?? '—') + '/10';
    $('#sMarket').textContent = (t.marketScore ?? '—') + '/10';
    $('#sLaunchBar').style.width = (t.launch || 0) * 10 + '%';
    $('#sMarketBar').style.width = (t.marketScore || 0) * 10 + '%';
  }
  async function loadHighlight() {
    try { const t = await api('/highlight'); if (t) showSection(t); } catch { /* ignore */ }
  }
  $('#nextScore').addEventListener('click', async e => {
    e.preventDefault();
    const pool = trending.length ? trending : [];
    if (!pool.length) return;
    const pick = pool[++showIdx % pool.length];
    try { showSection(await api('/token/' + pick.address)); } catch (err) { toast(err.message); }
  });

  // ---------- report modal ----------
  const modal = $('#report');
  let current = null, lastFocus = null;
  function openModal(m) {
    lastFocus = document.activeElement;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    const x = $('[data-close]', m); if (x) x.focus();
  }
  function closeModal(m) {
    if (m.hidden) return;
    m.hidden = true;
    if (m === modal) stopChart();
    if (modal.hidden && picker.hidden && $('#portfolio').hidden) document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  async function openReport(address) {
    address = address.toLowerCase();
    current = null;
    $('#repBody').innerHTML = '<div class="scanning"><div class="spin"></div><div>Reading the chain…<br><small>holders, snipers, creator wallet, contract and liquidity</small></div></div>';
    $('#repTitle').textContent = 'Token report';
    $('.sheet', modal).classList.add('wide');
    openModal(modal);
    try {
      const t = await api('/token/' + address);
      if (modal.hidden) return;
      current = t;
      known.set(t.address, t);
      if (t.stock) {
        const m = t.market || {};
        $('#repTitle').textContent = 'Stock token';
        $('#repBody').innerHTML = `<div class="scorevis"><div class="sright" style="grid-column:1/-1">
          <div class="stok">${avatar(t, 'lg')}<div><b>${esc(cleanName(t.name))}</b><small>$${esc(t.symbol)} · ${short(t.address)}</small></div></div>
          <span class="slabel s-hi">Issued by Robinhood · not scored</span></div>
          <div class="rstats"><div><span>Price</span><b>${fmtPrice(m.priceUsd)}</b></div><div><span>24h</span><b class="${(m.change24 ?? 0) >= 0 ? 'up' : 'dn'}">${fmtPct(m.change24)}</b></div><div><span>Volume 24h</span><b>${fmtUsd(m.vol24)}</b></div></div>
          <div class="rlinks">${safeUrl(t.explorer) ? `<a href="${esc(t.explorer)}" target="_blank" rel="noopener">Explorer ↗</a>` : ''}${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">Chart ↗</a>` : ''}</div>
          ${chartHTML('rp')}<div class="tradelist" id="rpTrades" hidden></div>
          <p class="snote">Stock tokens are not available to persons in the United States and are restricted in other countries.</p></div>`;
        startChart('rp', t.address, t.explorer);
      } else {
        $('#repBody').innerHTML = scoreCardHTML('rp');
        fillScore('rp', t);
        startChart('rp', t.address, t.explorer);
      }
    } catch (e) {
      closeModal(modal);
      toast(e.status === 404 ? 'That address is not a token on Robinhood Chain' : 'Could not scan that token: ' + e.message);
    }
  }
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(modal); });
  $('#repCopy').addEventListener('click', () => {
    if (!current) return;
    (navigator.clipboard ? navigator.clipboard.writeText(current.address) : Promise.reject())
      .then(() => toast('Address copied'), () => toast(current.address));
  });
  $('#repBuy').addEventListener('click', () => {
    if (!current) return;
    setTarget(current);
    closeModal(modal);
    $('#hero').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });

  // ---------- picker (tokens / chains / wallets) ----------
  const picker = $('#picker');
  let pickCfg = null, pickTimer = null;
  function openPicker(cfg) {
    pickCfg = cfg;
    $('#pickTitle').textContent = cfg.title;
    const q = $('#pickQ');
    q.value = cfg.query || '';
    q.placeholder = cfg.placeholder || 'Search';
    $('.picksearch', picker).hidden = !cfg.search;
    openModal(picker);
    if (cfg.search) q.focus();
    renderPick(q.value);
  }
  async function renderPick(q) {
    const list = $('#pickList');
    const cfg = pickCfg;
    try {
      const html = await cfg.render(q.trim());
      if (cfg === pickCfg) list.innerHTML = html || '<div class="pickempty">Nothing found</div>';
    } catch (e) { list.innerHTML = `<div class="pickempty">${esc(e.message)}</div>`; }
  }
  $('#pickQ').addEventListener('input', e => { clearTimeout(pickTimer); pickTimer = setTimeout(() => renderPick(e.target.value), 220); });
  picker.addEventListener('click', e => {
    if (e.target === picker || e.target.closest('[data-close]')) return closeModal(picker);
    const row = e.target.closest('.pickrow');
    if (row && pickCfg) { const cfg = pickCfg; closeModal(picker); cfg.pick(row.dataset.v); }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!picker.hidden) closeModal(picker); else if (!modal.hidden) closeModal(modal); else if (!$('#portfolio').hidden) closeModal($('#portfolio'));
  });

  const tokenRow = t => `<button class="pickrow" type="button" data-v="${esc(t.address)}">${avatar(t)}<div><b>${esc(cleanName(t.name))}</b><small>$${esc(t.symbol)}${t.stock ? ' · stock' : t.createdAt ? ' · ' + ago(t.createdAt) : ''}</small></div>${t.score != null ? `<span class="fs ${scoreClass(t.score)}">${t.score}</span>` : ''}</button>`;
  let stocks = [];
  async function tokenListHTML(q) {
    if (/^0x[0-9a-fA-F]{40}$/.test(q)) return tokenRow({ address: q.toLowerCase(), name: 'Token at ' + short(q), symbol: '?' });
    if (q) {
      const { items } = await api('/search?q=' + encodeURIComponent(q));
      items.forEach(t => known.set(t.address, t));
      return items.map(tokenRow).join('');
    }
    return '<div class="picklab">Trending on Robinhood Chain</div>' + trending.slice(0, 8).map(tokenRow).join('') +
      '<div class="picklab">Stock tokens</div>' + stocks.slice(0, 10).map(s => tokenRow({ ...s, stock: true })).join('');
  }
  function openSearchPicker(q) {
    openPicker({ title: 'Find a token', placeholder: 'Name, ticker or 0x address', search: true, query: q, render: tokenListHTML, pick: a => openReport(a) });
  }

  // ---------- search forms ----------
  async function handleQuery(q, input) {
    q = q.trim();
    if (!q) { input.focus(); toast('Paste a token address or type a ticker'); return; }
    if (/^0x[0-9a-fA-F]{40}$/.test(q)) return openReport(q);
    if (/^0x/i.test(q)) return toast('That doesn’t look like a full address (0x + 40 characters)');
    try {
      const { items } = await api('/search?q=' + encodeURIComponent(q));
      if (items.length === 1) return openReport(items[0].address);
      if (!items.length) return toast(`No Robinhood Chain token matching "${q}"`);
      openSearchPicker(q);
    } catch (e) { toast(e.message); }
  }
  ['#heroCheck', '#ctaCheck', '#navSearch'].forEach(sel => {
    const f = $(sel);
    f.addEventListener('submit', e => { e.preventDefault(); const i = $('input', f); handleQuery(i.value, i); });
  });

  // ---------- chains ----------
  let origins = [], dest = null;
  const chainById = id => (id === RH ? rhChain() : origins.find(c => c.id === id));
  const rhChain = () => ({ id: RH, name: 'Robinhood Chain', symbol: 'ETH', decimals: 18, icon: dest && dest.icon, rpc: dest && dest.rpc, explorer: dest && dest.explorer });
  const chainIcon = c => safeUrl(c.icon) ? `<img class="ci" src="${esc(c.icon)}" alt="" loading="lazy">` : `<span class="ci" style="background:${hues[hashStr(c.name) % 8]}">${esc(c.name.slice(0, 2))}</span>`;

  async function loadChains() {
    try {
      const r = await api('/chains');
      origins = r.origins; dest = r.destination;
      $$('[data-chains]').forEach(el => { el.textContent = origins.length; });
      renderChains();
      // Default to paying with ETH already on Robinhood Chain; users pick another chain if their funds are elsewhere.
      if (!swap.origin) setOrigin(RH);
    } catch { /* retry later */ setTimeout(loadChains, 5000); }
  }
  function renderChains() {
    const shown = origins.slice(0, 14);
    const more = origins.length - shown.length;
    $('#chainGrid').innerHTML = shown.map(c =>
      `<button type="button" class="chain${swap.origin === c.id ? ' on' : ''}" data-i="${c.id}">${chainIcon(c)}${esc(c.name)}</button>`).join('') +
      (more > 0 ? `<button type="button" class="chain" data-more="1"><span class="ci" style="background:rgba(255,255,255,.08);color:var(--text)">+${more}</span>more</button>` : '') +
      `<button type="button" class="chain dest" data-i="${RH}">${chainIcon(rhChain())}Robinhood Chain · destination</button>`;
    const c = chainById(swap.origin);
    if (c) $('#routeLine').innerHTML = `<b>${esc(c.symbol)}</b> on ${esc(c.name)}<span class="pipe"></span><b>${swap.eta != null ? (swap.eta <= 1 ? '~1 s' : '~' + swap.eta + ' s') : '…'}</b><span class="pipe"></span>Robinhood Chain`;
  }
  function openChainPicker() {
    const list = [rhChain(), ...origins];
    openPicker({
      title: swap.mode === 'buy' ? 'Pay from' : 'Receive on', search: true, placeholder: 'Search chains',
      render: q => list.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase())).map(c =>
        `<button class="pickrow" type="button" data-v="${c.id}">${chainIcon(c).replace('class="ci"', 'class="tk"')}<div><b>${esc(c.name)}</b><small>${esc(c.symbol)}${c.id === RH ? ' · already on Robinhood Chain' : ''}</small></div></button>`).join(''),
      pick: v => setOrigin(Number(v))
    });
  }
  $('#chainGrid').addEventListener('click', e => {
    const b = e.target.closest('.chain');
    if (!b) return;
    if (b.dataset.more) return openChainPicker();
    setOrigin(Number(b.dataset.i));
    toast(Number(b.dataset.i) === RH ? 'Paying with ETH already on Robinhood Chain' : `Paying from ${chainById(Number(b.dataset.i)).name}`);
  });

  // ---------- stocks ----------
  function spark(m) {
    if (m.priceUsd == null) return '';
    // Reconstruct price points from DexScreener's 24h / 6h / 1h / 5m changes.
    const p = m.priceUsd, back = c => (c == null ? null : p / (1 + c / 100));
    const pts = [back(m.change24), back(m.change6h), back(m.change1h), back(m.change5m), p].filter(v => v != null);
    if (pts.length < 2) return '';
    const min = Math.min(...pts), max = Math.max(...pts), r = max - min || 1;
    const xs = [0, 48, 61, 63.5, 64].slice(5 - pts.length);
    const d = pts.map((v, i) => `${(xs[i] ?? (i / (pts.length - 1)) * 64).toFixed(1)},${(24 - ((v - min) / r) * 22).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 64 26" aria-hidden="true"><polyline points="${d}" fill="none" stroke="${(m.change24 ?? 0) >= 0 ? '#3ee59a' : '#ff5470'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  async function loadStocks() {
    try {
      const { items } = await api('/stocks');
      stocks = items;
      items.forEach(s => known.set(s.address, { ...s, stock: true }));
      $('#stockGrid').innerHTML = items.slice(0, 8).map(s => `
        <button type="button" class="stile" data-a="${esc(s.address)}" style="text-align:left">
          ${safeUrl(s.image) ? `<img class="tk" src="${esc(s.image)}" alt="" loading="lazy">` : `<span class="tk" style="background:linear-gradient(135deg,#2a2620,#3a342a);color:var(--text)">${esc(s.symbol.slice(0, 5))}</span>`}
          <b>${esc(s.symbol)}</b><span class="nm">${esc(cleanName(s.name))}</span>
          <span class="px">${fmtPrice(s.priceUsd)}</span><span class="ch ${(s.change24 ?? 0) >= 0 ? 'up' : 'dn'}">${fmtPct(s.change24)}</span>${spark(s)}
        </button>`).join('');
    } catch { /* ignore */ }
  }
  $('#stockGrid').addEventListener('click', e => { const t = e.target.closest('.stile[data-a]'); if (t) openReport(t.dataset.a); });

  // ---------- wallet (EIP-6963 discovery, EIP-1193 calls) ----------
  const wallets = new Map();
  const wallet = { provider: null, address: null, chainId: null, info: null };
  window.addEventListener('eip6963:announceProvider', e => {
    const d = e.detail;
    if (d && d.info && d.provider && !wallets.has(d.info.uuid)) { wallets.set(d.info.uuid, d); renderWalletList(); }
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  function renderWalletList() {
    if (!wallets.size) return;
    $('#walletList').innerHTML = [...wallets.values()].slice(0, 4).map(w =>
      `<div class="${wallet.info && wallet.info.uuid === w.info.uuid ? 'on' : ''}">${/^data:image\//.test(w.info.icon) ? `<img src="${esc(w.info.icon)}" alt="">` : '<i></i>'}${esc(w.info.name)}</div>`).join('');
  }

  async function connect() {
    const list = [...wallets.values()];
    if (list.length > 1) {
      return openPicker({
        title: 'Connect a wallet', search: false,
        render: () => list.map(w => `<button class="pickrow" type="button" data-v="${esc(w.info.uuid)}">${/^data:image\//.test(w.info.icon) ? `<img class="tk" src="${esc(w.info.icon)}" alt="">` : '<span class="tk"></span>'}<div><b>${esc(w.info.name)}</b><small>Browser wallet</small></div></button>`).join(''),
        pick: uuid => useProvider(wallets.get(uuid).provider, wallets.get(uuid).info)
      });
    }
    if (list.length === 1) return useProvider(list[0].provider, list[0].info);
    if (window.ethereum) return useProvider(window.ethereum, null);
    if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
      toast('Opening in the MetaMask app…');
      location.href = 'https://metamask.app.link/dapp/' + location.host + location.pathname;
    } else {
      toast('No wallet found. Install MetaMask, Rabby or Coinbase Wallet and reload.', 5000);
    }
  }
  async function useProvider(provider, info) {
    try {
      const accs = await provider.request({ method: 'eth_requestAccounts' });
      if (!accs || !accs[0]) return;
      if (wallet.provider && wallet.provider !== provider && wallet.provider.removeListener) {
        wallet.provider.removeListener('accountsChanged', onAccounts);
        wallet.provider.removeListener('chainChanged', onChain);
      }
      wallet.provider = provider; wallet.info = info;
      wallet.address = accs[0].toLowerCase();
      wallet.chainId = parseInt(await provider.request({ method: 'eth_chainId' }), 16);
      if (provider.on) { provider.on('accountsChanged', onAccounts); provider.on('chainChanged', onChain); }
      onConnected();
    } catch (e) {
      toast(e && e.code === 4001 ? 'Connection rejected in wallet' : 'Could not connect: ' + (e.message || e));
    }
  }
  function onAccounts(accs) { if (!accs || !accs[0]) return disconnect(); wallet.address = accs[0].toLowerCase(); onConnected(); }
  function onChain(id) { wallet.chainId = parseInt(id, 16); }
  function onConnected() {
    $('#navConnect').hidden = true;
    $('#navAcct').hidden = false;
    $('#acctAddr').textContent = short(wallet.address);
    $('#wc2Label').textContent = 'Connected · ' + short(wallet.address);
    $$('.navport').forEach(a => { a.hidden = false; });
    renderWalletList();
    refreshBalance();
    requestQuote();
  }
  function disconnect() {
    wallet.provider = null; wallet.address = null; wallet.info = null;
    $('#navConnect').hidden = false; $('#navAcct').hidden = true;
    $('#wc2Label').textContent = 'Connect wallet';
    $$('.navport').forEach(a => { a.hidden = true; });
    swap.balance = null;
    renderWalletList(); renderSwap();
    toast('Disconnected');
  }
  $('#navConnect').addEventListener('click', connect);
  $('#walletConnect2').addEventListener('click', () => (wallet.address ? toast('Already connected') : connect()));
  $('#navAcct').addEventListener('click', disconnect);

  async function ensureChain(chainId) {
    const current = parseInt(await wallet.provider.request({ method: 'eth_chainId' }), 16);
    if (current === chainId) return;
    try {
      await wallet.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex(chainId) }] });
    } catch (e) {
      if (e.code !== 4902 && !(e.data && e.data.originalError && e.data.originalError.code === 4902)) throw e;
      const c = chainById(chainId);
      await wallet.provider.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: hex(chainId), chainName: c.name, nativeCurrency: { name: c.symbol, symbol: c.symbol, decimals: c.decimals || 18 }, rpcUrls: [c.rpc], blockExplorerUrls: c.explorer ? [c.explorer] : [] }]
      });
    }
    wallet.chainId = chainId;
  }
  async function waitReceipt(hash) {
    for (let i = 0; i < 180; i++) {
      const r = await wallet.provider.request({ method: 'eth_getTransactionReceipt', params: [hash] }).catch(() => null);
      if (r) { if (r.status !== '0x1') throw new Error('Transaction failed on-chain'); return r; }
      await sleep(1500);
    }
    throw new Error('Timed out waiting for confirmation');
  }
  async function sendTx(tx) {
    await ensureChain(Number(tx.chainId));
    const params = { from: wallet.address, to: tx.to, data: tx.data || '0x', value: hex(tx.value || 0) };
    if (tx.gas) params.gas = hex(tx.gas);
    return wallet.provider.request({ method: 'eth_sendTransaction', params: [params] });
  }

  // ---------- swap ----------
  const swap = { mode: 'buy', origin: null, target: null, slip: 100, balance: null, quote: null, quoting: false, busy: false, error: null, eta: null, seq: 0 };
  const SLIPS = [50, 100, 200, 500];
  const payInput = $('#payAmt');
  payInput.value = '0.01';

  const sel = (av, sym, sub) => `${av}<span>${esc(sym)}${sub ? `<br><span class="chainbadge">${esc(sub)}</span>` : ''}</span><svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;
  const coinAv = c => (safeUrl(c.icon) ? `<img class="tk" src="${esc(c.icon)}" alt="">` : `<span class="tk" style="background:#a8b3ff">${esc(c.symbol)}</span>`);
  // Buys are paid from swap.origin; sells pay out on swap.origin (bridged there if needed).
  const payoutChain = () => swap.origin;

  function setOrigin(id) {
    swap.origin = id;
    swap.balance = null;
    renderChains();
    refreshBalance();
    requestQuote();
  }
  function setTarget(t) {
    swap.target = { address: t.address, name: cleanName(t.name), symbol: t.symbol, decimals: t.decimals ?? 18, stock: Boolean(t.stock), score: t.score ?? null, label: t.label, topFlag: t.topFlag || (t.flags && t.flags[0]) || null, image: t.image || null, priceUsd: t.priceUsd ?? (t.market && t.market.priceUsd) ?? null };
    if (swap.mode === 'sell') swap.balance = null;
    refreshBalance();
    requestQuote();
  }
  function setMode(m) {
    swap.mode = m;
    $$('.swtabs button').forEach(b => { b.classList.toggle('on', b.dataset.mode === m); b.setAttribute('aria-selected', b.dataset.mode === m); });
    $('#payLab').textContent = m === 'buy' ? 'You pay' : 'You sell';
    $('#getLab').textContent = m === 'buy' ? 'You receive' : 'You get';
    swap.balance = null;
    refreshBalance();
    requestQuote();
  }

  async function refreshBalance() {
    if (!wallet.address || !swap.origin) return renderSwap();
    const seq = ++swap.seq;
    try {
      const q = swap.mode === 'buy'
        ? `/balance?chainId=${swap.origin}&address=${wallet.address}`
        : swap.target ? `/balance?chainId=${RH}&address=${wallet.address}&token=${swap.target.address}` : null;
      if (!q) return;
      const { balance } = await api(q);
      if (seq === swap.seq) swap.balance = BigInt(balance);
    } catch { swap.balance = null; }
    renderSwap();
  }

  const inDecimals = () => (swap.mode === 'buy' ? (chainById(swap.origin) || {}).decimals || 18 : swap.target ? swap.target.decimals : 18);

  let quoteTimer = null;
  function requestQuote() {
    clearTimeout(quoteTimer);
    if (!swap.busy) note('');
    swap.quote = null; swap.error = null;
    renderSwap();
    if (!swap.target || !swap.origin || parseUnits(payInput.value, inDecimals()) === 0n) return;
    swap.quoting = true;
    renderSwap();
    quoteTimer = setTimeout(fetchQuote, 450);
  }

  // Asks the server for the best route: Relay, the launch curve or Uniswap, as steps to sign.
  const routeBody = user => ({ user, chainId: swap.origin, token: swap.target.address, side: swap.mode, amount: parseUnits(payInput.value, inDecimals()).toString(), slippageBps: swap.slip });
  async function fetchQuote() {
    const seq = ++swap.seq;
    try {
      const plan = await api('/route', { body: routeBody(wallet.address || QUOTE_USER) });
      if (seq !== swap.seq) return;
      swap.quote = { ...plan, out: BigInt(plan.amountOut) };
      swap.eta = plan.eta; swap.error = null;
    } catch (e) {
      if (seq !== swap.seq) return;
      swap.quote = null;
      swap.error = /blocks public trading/i.test(e.message) ? 'Pool blocks public trading'
        : /not tradable|no curve|no route|unsupported|no liquidity/i.test(e.message) ? 'Not tradable yet — no liquidity for this token'
        : e.message;
      if (/blocks public trading/i.test(e.message)) note('This token\u2019s pool only lets specific contracts trade it, usually bots. No public app can buy it right now.');
    }
    swap.quoting = false;
    renderSwap();
    renderChains();
  }
  const VENUE = { relay: 'Relay', curve: 'launch curve', uniswap: 'Uniswap', 'uniswap-v4': 'Uniswap v4' };

  function renderSwap() {
    const c = chainById(swap.origin) || { name: '…', symbol: 'ETH', decimals: 18 };
    const payout = chainById(payoutChain()) || c;
    const t = swap.target;
    const tokBtn = t ? sel(avatar(t), t.symbol, t.stock ? 'Stock · Robinhood' : 'Robinhood Chain') : sel('<span class="tk"></span>', 'Select', '');
    if (swap.mode === 'buy') {
      $('#paySel').innerHTML = sel(coinAv(c), c.symbol, c.name);
      $('#getSel').innerHTML = tokBtn;
      $('#getChain').textContent = 'on Robinhood Chain';
    } else {
      $('#paySel').innerHTML = tokBtn;
      $('#getSel').innerHTML = sel(coinAv(payout), payout.symbol, payout.name);
      $('#getChain').textContent = 'on ' + payout.name;
    }
    const q = swap.quote;
    $('#getAmt').value = swap.quoting ? '…' : q && q.out != null ? fmtNum(unitsToNum(q.out, q.outDecimals)) : '';
    const amt = parseUnits(payInput.value, inDecimals());
    const outUsd = q ? (q.outUsd ?? (swap.mode === 'buy' && t && t.priceUsd && q.out != null ? unitsToNum(q.out, q.outDecimals) * t.priceUsd : null)) : null;
    const signatures = q ? q.steps.filter(x => x.type !== 'bridge').length + (q.steps.some(x => x.type === 'bridge') ? 1 : 0) : 0;
    const inUsd = q ? (q.inUsd ?? (swap.mode === 'sell' && t && t.priceUsd ? unitsToNum(amt, t.decimals) * t.priceUsd : null)) : null;
    $('#payUsd').textContent = inUsd != null ? '$' + inUsd.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
    $('#getUsd').textContent = outUsd != null ? '≈ $' + outUsd.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
    const payDec = inDecimals();
    $('#payBal').textContent = wallet.address
      ? 'Balance ' + (swap.balance != null ? fmtNum(unitsToNum(swap.balance, payDec)) : '…') + ' ' + (swap.mode === 'buy' ? c.symbol : t ? t.symbol : '')
      : 'Balance —';
    $('#rate').textContent = q && q.out != null && amt > 0n
      ? (swap.mode === 'buy' ? `1 ${c.symbol} ≈ ${fmtNum(unitsToNum(q.out, q.outDecimals) / unitsToNum(amt, payDec))} ${t.symbol}` : `1 ${t.symbol} ≈ ${fmtNum(unitsToNum(q.out, q.outDecimals) / unitsToNum(amt, payDec))} ${payout.symbol}`)
      : '';
    const via = q ? VENUE[q.venue] || q.venue : null;
    const routeTxt = !t ? '—' : swap.mode === 'buy'
      ? (swap.origin === RH ? `Robinhood${via ? ' · ' + via : ''}` : `${c.name} → Robinhood${via ? ' · ' + via : ''}`)
      : (swap.origin === RH ? `Robinhood${via ? ' · ' + via : ''}` : `Robinhood${via ? ' · ' + via : ''} → ${c.name}`);
    $('#dRoute').textContent = routeTxt + (signatures > 1 ? ` · ${signatures} signatures` : '');
    $('#dTime').textContent = q && q.eta != null ? (q.eta <= 1 ? '~1 s' : '~' + q.eta + ' s') : '—';
    $('#dSlip').textContent = (swap.slip / 100).toFixed(1) + '%';
    $('#dFee').textContent = q && q.feesUsd != null ? '$' + q.feesUsd.toFixed(2) : q ? 'network gas only' : '—';

    const sc = $('#swScore');
    if (!t) sc.innerHTML = '<p>Pick a token to see its Kairo score before you buy.</p>';
    else if (t.stock) sc.innerHTML = `<span class="sc s-hi">STOCK</span><p><b>${esc(t.name)}.</b> Tokenized stock issued on Robinhood Chain.</p>`;
    else sc.innerHTML = `<span class="sc ${scoreClass(t.score)}">${t.score != null ? t.score + '/10' : '…'}</span><p><b>${esc(t.label || 'Scoring…')}.</b> ${t.topFlag ? esc(t.topFlag.text) + '.' : ''}</p>`;

    const go = $('#swGo');
    go.disabled = false;
    if (swap.busy) { go.disabled = true; return; }
    if (!wallet.address) { go.textContent = 'Connect wallet'; return; }
    if (!t) { go.textContent = 'Select a token'; go.disabled = true; return; }
    if (!amt) { go.textContent = 'Enter an amount'; go.disabled = true; return; }
    if (swap.balance != null && amt > swap.balance) { go.textContent = `Not enough ${swap.mode === 'buy' ? c.symbol : t.symbol}`; go.disabled = true; return; }
    if (swap.quoting) { go.textContent = 'Getting best price…'; go.disabled = true; return; }
    if (swap.error) { go.textContent = swap.error.length > 48 ? 'No route available' : swap.error; go.disabled = true; return; }
    if (!q) { go.textContent = 'Getting best price…'; go.disabled = true; return; }
    go.textContent = swap.mode === 'sell' ? `Sell ${t.symbol}` : t.score != null && t.score < 4 ? `Buy anyway (score ${t.score})` : `Buy ${t.symbol}`;
  }
  if (!$('#swNote')) $('#swGo').insertAdjacentHTML('afterend', '<p class="swnote" id="swNote" hidden></p>');
  function note(msg) { const n = $('#swNote'); if (!n) return; n.hidden = !msg; n.innerHTML = msg || ''; }

  payInput.addEventListener('input', e => { e.target.value = e.target.value.replace(/[^0-9.,]/g, ''); requestQuote(); });
  $('#paySel').addEventListener('click', () => (swap.mode === 'buy' ? openChainPicker() : openTokenPicker()));
  $('#getSel').addEventListener('click', () => (swap.mode === 'buy' ? openTokenPicker() : openChainPicker()));
  function openTokenPicker() {
    openPicker({ title: 'Select a token', placeholder: 'Name, ticker or 0x address', search: true, render: tokenListHTML, pick: async a => {
      const k = known.get(a);
      if (k && (k.stock || k.score != null)) return setTarget(k);
      try { setTarget(await api('/token/' + a)); } catch (e) { toast(e.message); }
    } });
  }
  $('#flipBtn').addEventListener('click', () => setMode(swap.mode === 'buy' ? 'sell' : 'buy'));
  $$('.swtabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#maxBtn').addEventListener('click', () => {
    if (!wallet.address) return toast('Connect a wallet to use MAX');
    if (swap.balance == null) return;
    const d = inDecimals();
    // Leave a little native coin for gas.
    const reserve = swap.mode === 'buy' ? 10n ** BigInt(d) / 500n : 0n;
    const v = swap.balance > reserve ? swap.balance - reserve : 0n;
    payInput.value = formatUnits(v, d);
    requestQuote();
  });
  $('#slipBtn').addEventListener('click', () => {
    swap.slip = SLIPS[(SLIPS.indexOf(swap.slip) + 1) % SLIPS.length];
    toast(`Max slippage ${(swap.slip / 100).toFixed(1)}%`);
    requestQuote();
  });

  // Progress shown in the wallet section's step list.
  function stepUI(n, state, text) {
    const li = $$('#steps li')[n - 1];
    if (!li) return;
    li.className = state;
    if (text) $('[data-step]', li).textContent = text;
  }
  function resetSteps() { $$('#steps li').forEach(li => { li.className = ''; }); }

  async function runRelay(quote) {
    for (const step of quote.steps) {
      for (const item of step.items) {
        if (item.status === 'complete') continue;
        if (step.kind === 'transaction') {
          $('#swGo').innerHTML = '<span class="spin"></span> Confirm in wallet';
          const hash = await sendTx(item.data);
          stepUI(1, 'done', 'Signed');
          stepUI(2, 'now', 'Funds on their way to Robinhood Chain…');
          $('#swGo').innerHTML = '<span class="spin"></span> Processing';
          if (item.check) await pollRelay(step.requestId || quote.steps[0].requestId);
          else await waitReceipt(hash);
        } else if (step.kind === 'signature') {
          const s = item.data.sign;
          const sig = s.signatureKind === 'eip712'
            ? await wallet.provider.request({ method: 'eth_signTypedData_v4', params: [wallet.address, JSON.stringify({ domain: s.domain, types: s.types, primaryType: s.primaryType, message: s.value })] })
            : await wallet.provider.request({ method: 'personal_sign', params: [s.message, wallet.address] });
          const p = item.data.post;
          await api('/relay/step', { body: { endpoint: p.endpoint + (p.endpoint.includes('?') ? '&' : '?') + 'signature=' + sig, body: p.body } });
          if (item.check) await pollRelay(step.requestId);
        }
      }
    }
  }
  async function pollRelay(requestId) {
    for (let i = 0; i < 200; i++) {
      const s = await api('/relay/status?requestId=' + requestId).catch(() => ({}));
      if (s.status === 'success') return s;
      if (s.status === 'failure') throw new Error('The swap failed; nothing was charged except gas');
      if (s.status === 'refund') throw new Error('The route could not complete and your funds were refunded');
      await sleep(1200);
    }
    throw new Error('Still processing — check your wallet in a minute');
  }

  const rhEth = async user => BigInt((await api(`/balance?chainId=${RH}&address=${user}`)).balance);
  const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
  const rhWeth = async user => BigInt((await api(`/balance?chainId=${RH}&address=${user}&token=${WETH}`)).balance);

  async function execute() {
    if (!wallet.address) return connect();
    const t = swap.target;
    const amountIn = parseUnits(payInput.value, inDecimals());
    swap.busy = true; renderSwap(); note('');
    resetSteps();
    stepUI(1, 'now', 'Sign in your wallet');
    try {
      const user = wallet.address;
      // Fresh plan for the real wallet right before signing.
      const plan = await api('/route', { body: routeBody(user) });
      let ethBefore = null, wethBefore = null;
      for (const step of plan.steps) {
        if (step.type === 'relay') {
          await runRelay(step.quote);
        } else if (step.type === 'tx') {
          if (step.label === 'Sell' && plan.steps.some(x => x.type === 'bridge')) ethBefore = await rhEth(user);
          if (step.label === 'Sell' && plan.steps.some(x => x.type === 'unwrap')) wethBefore = await rhWeth(user);
          $('#swGo').innerHTML = `<span class="spin"></span> ${esc(step.label)} in wallet`;
          stepUI(1, 'now', step.label === 'Approve' || step.label === 'Approve router' ? 'Approve the token in your wallet' : 'Confirm the trade in your wallet');
          const hash = await sendTx(step.tx);
          $('#swGo').innerHTML = '<span class="spin"></span> Confirming';
          await waitReceipt(hash);
        } else if (step.type === 'unwrap') {
          // Turn the WETH this sale paid out into plain ETH.
          const gained = (await rhWeth(user)) - (wethBefore ?? 0n);
          if (gained > 0n) {
            stepUI(2, 'now', 'Unwrapping WETH to ETH — confirm in wallet');
            $('#swGo').innerHTML = '<span class="spin"></span> Unwrap in wallet';
            await waitReceipt(await sendTx({ to: WETH, data: '0x2e1a7d4d' + gained.toString(16).padStart(64, '0'), value: 0, chainId: RH }));
          }
        } else if (step.type === 'bridge') {
          // Move the ETH this sell produced to the chain the user picked.
          stepUI(2, 'now', 'Bridging your ETH — confirm in wallet');
          const gained = (await rhEth(user)) - (ethBefore ?? 0n);
          const reserve = 10n ** 14n; // keep a little ETH for gas on Robinhood Chain
          if (gained > reserve) {
            const b = await api('/quote', { body: { user, chainId: step.chainId, token: NATIVE, amount: (gained - reserve).toString(), side: 'sell', slippageBps: swap.slip } });
            await runRelay(b);
          }
        }
      }
      const outSym = swap.mode === 'buy' ? t.symbol : (chainById(swap.origin) || {}).symbol || 'ETH';
      const receivedText = `${fmtNum(unitsToNum(BigInt(plan.amountOut), plan.outDecimals))} ${outSym}`;
      stepUI(1, 'done', 'Signed');
      stepUI(2, 'done', 'Settled on-chain');
      stepUI(3, 'now', `~${receivedText} landed in your wallet`);
      // Remember what this trade cost / returned so the portfolio can show profit and loss.
      const outAmount = unitsToNum(BigInt(plan.amountOut), plan.outDecimals);
      if (swap.mode === 'buy') {
        const usd = plan.inUsd ?? (swap.origin === RH && pulse.ethUsd ? unitsToNum(amountIn, 18) * pulse.ethUsd : null);
        logTrade({ side: 'buy', token: t.address, usd, tokens: outAmount });
      } else {
        const usd = plan.outUsd ?? (pulse.ethUsd && (chainById(swap.origin) || {}).symbol === 'ETH' ? outAmount * pulse.ethUsd : null);
        logTrade({ side: 'sell', token: t.address, usd, tokens: unitsToNum(amountIn, t.decimals) });
      }
      toast(`Done — about ${receivedText} in your wallet`, 5000);
      payInput.value = '';
    } catch (e) {
      const msg = e && e.code === 4001 ? 'Transaction rejected in wallet' : (e && e.message) || 'Swap failed';
      stepUI(1, 'fail', msg);
      toast(msg, 5000);
      note(esc(msg));
    }
    swap.busy = false;
    refreshBalance();
    requestQuote();
  }
  $('#swGo').addEventListener('click', () => (wallet.address ? execute() : connect()));

  // ---------- portfolio ----------
  const pfModal = $('#portfolio');
  const tradeKey = () => 'kairo.trades.' + (wallet.address || 'none');
  function readTrades() { try { return JSON.parse(localStorage.getItem(tradeKey()) || '[]'); } catch { return []; } }
  function logTrade(entry) {
    try {
      const list = readTrades();
      list.push({ ...entry, at: Date.now() });
      localStorage.setItem(tradeKey(), JSON.stringify(list.slice(-500)));
    } catch { /* storage unavailable: PnL just won't show */ }
  }
  // Net USD put into a token through Kairo (buys minus sells), or null if we never traded it here.
  function netInvested(address) {
    const mine = readTrades().filter(x => x.token === address && x.usd != null);
    if (!mine.length) return null;
    return mine.reduce((sum, x) => sum + (x.side === 'buy' ? x.usd : -x.usd), 0);
  }
  async function openPortfolio() {
    if (!wallet.address) return connect();
    $('#pfBody').innerHTML = '<div class="scanning"><div class="spin"></div><div>Reading your wallet on Robinhood Chain…</div></div>';
    openModal(pfModal);
    const extra = [...new Set(readTrades().map(x => x.token))].slice(0, 50).join(',');
    try {
      const p = await api(`/portfolio?address=${wallet.address}${extra ? '&extra=' + extra : ''}`);
      if (pfModal.hidden) return;
      const rows = p.items.map(it => {
        const inv = netInvested(it.address);
        const pnl = inv != null && it.valueUsd != null ? it.valueUsd - inv : null;
        return `<div class="pfrow" data-a="${esc(it.address)}">
          <span class="fn">${avatar(it)}<div><b>${esc(cleanName(it.name))}</b><small>${fmtNum(it.amount)} ${esc(it.symbol)}${it.stock ? ' · stock' : ''}</small></div></span>
          <span>${fmtMoney(it.valueUsd)}${pnl != null ? `<small class="pnl ${pnl >= 0 ? 'up' : 'dn'}">${pnl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(pnl))} via Kairo</small>` : ''}</span>
          <span class="${(it.change24 ?? 0) >= 0 ? 'up' : 'dn'}">${fmtPct(it.change24)}</span>
          <span class="acts"><button type="button" data-act="report">Report</button><button type="button" data-act="sell">Sell</button></span>
        </div>`;
      }).join('');
      $('#pfBody').innerHTML = `
        <div class="pfhead"><div><small>Total on Robinhood Chain</small><div class="tot">${fmtMoney(p.totalUsd || 0)}</div></div>
          <small>${fmtNum(p.eth.amount)} ETH${p.eth.valueUsd != null ? ' · ' + fmtMoney(p.eth.valueUsd) : ''} · ${short(p.address)}</small></div>
        <div class="pflist">
          <div class="pfrow head"><span>Token</span><span>Value</span><span>24h</span><span></span></div>
          ${rows || '<div class="pickempty">No tokens found yet. Buy something and it shows up here.</div>'}
        </div>`;
      pfModal._items = p.items;
    } catch (e) {
      $('#pfBody').innerHTML = `<div class="pickempty">${esc(e.message)}</div>`;
    }
  }
  pfModal.addEventListener('click', e => {
    if (e.target === pfModal || e.target.closest('[data-close]')) return closeModal(pfModal);
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('.pfrow[data-a]');
    if (!btn || !row) return;
    const it = (pfModal._items || []).find(x => x.address === row.dataset.a);
    if (!it) return;
    closeModal(pfModal);
    if (btn.dataset.act === 'report') return openReport(it.address);
    // Sell: load the token into the swap box with the full balance filled in.
    setTarget({ ...it, stock: it.stock });
    setMode('sell');
    payInput.value = formatUnits(BigInt(it.balance), it.decimals);
    requestQuote();
    $('#hero').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });
  $$('.navport').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openPortfolio(); }));

  // ---------- chrome: nav, menu, shortcuts, fx ----------
  const nav = $('#topnav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const mBtn = $('#mBtn'), mSheet = $('#mSheet');
  mBtn.addEventListener('click', () => { const open = mSheet.hidden; mSheet.hidden = !open; mBtn.setAttribute('aria-expanded', open); });
  mSheet.addEventListener('click', e => { if (e.target.closest('a')) { mSheet.hidden = true; mBtn.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) || !modal.hidden || !picker.hidden) return;
    e.preventDefault();
    const q = $('#navQ');
    (q.offsetParent ? q : $('#heroCa')).focus();
  });
  if (!reduced) {
    const spot = $('.spot');
    addEventListener('pointermove', e => { spot.style.setProperty('--mx', e.clientX + 'px'); spot.style.setProperty('--my', e.clientY + 'px'); }, { passive: true });
    $$('.cpanel').forEach(p => p.addEventListener('pointermove', e => {
      const r = p.getBoundingClientRect();
      p.style.setProperty('--px', e.clientX - r.left + 'px');
      p.style.setProperty('--py', e.clientY - r.top + 'px');
    }));
    const sw = $('#swap');
    if (matchMedia('(hover: hover)').matches) {
      sw.addEventListener('pointermove', e => {
        if (e.target.closest('input,button')) return;
        const r = sw.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        sw.style.transform = `perspective(1000px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg)`;
      });
      sw.addEventListener('pointerleave', () => { sw.style.transform = ''; });
    }
  }
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.15 }) : null;
  $$('.rv').forEach(el => (io ? io.observe(el) : el.classList.add('in')));

  // ---------- boot ----------
  renderSwap();
  loadPulse(); setInterval(loadPulse, 3000);
  loadChains();
  loadStocks(); setInterval(loadStocks, 60000);
  // Preload the swap with the best-scored trending token that can actually be traded right now.
  async function pickDefaultTarget() {
    // Prefer scored, liquid tokens; unscored trending tokens rank as neutral until their score arrives.
    const ranked = trending.filter(t => (t.liquidityUsd || 0) >= 10000)
      .sort((a, b) => (b.score ?? 6) - (a.score ?? 6) || (b.liquidityUsd || 0) - (a.liquidityUsd || 0)).slice(0, 6);
    for (const t of ranked) {
      if (swap.target) return;
      try {
        await api('/route', { body: { user: QUOTE_USER, chainId: swap.origin || RH, token: t.address, side: 'buy', amount: (10n ** 16n).toString(), slippageBps: swap.slip } });
        if (!swap.target) setTarget(t);
        return;
      } catch { /* try the next one */ }
    }
    if (!swap.target && ranked.length) setTarget(ranked[0]);
  }
  loadTrending().then(pickDefaultTarget);
  setInterval(loadTrending, 30000);
  loadFeed(); setInterval(loadFeed, 5000);
  loadHighlight();
})();
