/* Ruckus — a social trading desk for Solana coins, hosted by Rudy the raccoon.
   No build step, no framework, no server of its own.
   Live mode: coin data and charts from Jupiter, swaps through Jupiter Ultra,
   signed in the user's own wallet. Ruckus never holds anyone's funds.
   Demo mode: if live data can't be reached (offline, sandboxed preview),
   markets are simulated and trades use a paper balance. */
(() => {
  'use strict';

  // Change these before going live. See README.md.
  const CONFIG = {
    jupBase: 'https://lite-api.jup.ag',   // use 'https://api.jup.ag' together with jupApiKey
    jupApiKey: '',                        // free key from https://portal.jup.ag
    dataBase: 'https://datapi.jup.ag',    // charts and recent trades
    web3Url: 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.98.0/lib/index.iife.min.js',
    xUrl: 'https://x.com',                // your project's X profile
    refBase: '',                          // e.g. 'https://ruckus.example/' (defaults to this page)
    solReserve: 0.01,                     // SOL kept back for network fees when you press Max
    maxImpactDefault: 5,                  // % price impact above which a trade is blocked
    startingCash: 1000,                   // demo mode paper balance (USD)
  };
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const JUP = CONFIG.jupBase;
  const DATA = CONFIG.dataBase;
  const ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const view = $('#view');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('ruckus:' + k); return v == null ? d : JSON.parse(v); }
      catch { return d; }
    },
    set(k, v) { try { localStorage.setItem('ruckus:' + k, JSON.stringify(v)); } catch { /* storage off */ } },
  };

  // ---------- network ----------
  async function http(url, { method = 'GET', body, timeout = 12000 } = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const headers = {};
      if (CONFIG.jupApiKey && url.startsWith(JUP)) headers['x-api-key'] = CONFIG.jupApiKey;
      if (body) headers['content-type'] = 'application/json';
      const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        err.body = await res.json().catch(() => null);
        throw err;
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
  class UserError extends Error {}

  // ---------- randomness (demo mode) ----------
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = rng(Date.now() % 1e9);
  function gauss(r = rand) {
    let u = 0, v = 0;
    while (!u) u = r();
    while (!v) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // ---------- formatting ----------
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  function fmtPrice(p) {
    if (!isFinite(p) || p <= 0) return '–';
    if (p >= 1) { const dp = p >= 1000 ? 0 : 2; return '$' + p.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
    if (p >= 0.001) return '$' + p.toPrecision(4);
    // DEX-style: 0.000061 -> $0.0₄61
    const [mant, ex] = p.toExponential(3).split('e');
    const zeros = -parseInt(ex, 10) - 1;
    const digits = mant.replace('.', '').replace(/0+$/, '') || '0';
    return '$0.0' + [...String(zeros)].map((d) => SUB[d]).join('') + digits;
  }
  function fmtUsd(n, dp = 2) {
    if (!isFinite(n)) return '–';
    if (Math.abs(n) < 0.5 * 10 ** -dp) n = 0;
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return (n < 0 ? '-$' : '$') + s;
  }
  function fmtCompact(n, prefix = '$') {
    if (!isFinite(n)) return '–';
    const a = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (a >= 1e9) return sign + prefix + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return sign + prefix + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return sign + prefix + (a / 1e3).toFixed(1) + 'K';
    return sign + prefix + a.toFixed(a < 10 ? 2 : 0);
  }
  const fmtQty = (n) => fmtCompact(n, '');
  const fmtPct = (x) => (isFinite(x) ? (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%' : '–');
  const cls = (x) => (x >= 0 ? 'up' : 'down');
  function fmtAgo(sec) {
    if (!isFinite(sec)) return '–';
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h';
    return Math.floor(sec / 86400) + 'd';
  }
  const ageOf = (t) => (t.born ? (Date.now() - t.born) / 1000 : NaN);
  const shortAddr = (a) => (a && a.length > 10 ? a.slice(0, 4) + '…' + a.slice(-4) : a || '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PALETTE = ['#ffb38a', '#c5ccd6', '#9fd0f5', '#f1d39a', '#ffd76b', '#a8dc8b', '#d4c2f5', '#f5a29a', '#9fe0d3', '#f8b3d0', '#c9d18a', '#ffd9a8'];
  function colorFor(id) {
    let h = 7;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  const solscanTx = (sig) => `https://solscan.io/tx/${sig}`;
  const solscanAcct = (a) => `https://solscan.io/account/${a}`;
  const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // ---------- Rudy the raccoon ----------
  // Gradients live in one hidden <svg> so every Rudy on the page can share them.
  function ensureRudyDefs() {
    if ($('#rudy-defs')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="rudy-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
      <radialGradient id="rd-fur" cx="38%" cy="28%" r="80%"><stop offset="0" style="stop-color:var(--fur-hi)"></stop><stop offset="0.55" style="stop-color:var(--fur)"></stop><stop offset="1" style="stop-color:var(--fur-lo)"></stop></radialGradient>
      <linearGradient id="rd-mask" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--mask-hi)"></stop><stop offset="1" style="stop-color:var(--mask)"></stop></linearGradient>
      <radialGradient id="rd-cheek" cx="50%" cy="30%" r="75%"><stop offset="0" style="stop-color:#ffffff"></stop><stop offset="1" style="stop-color:var(--cheek)"></stop></radialGradient>
      <radialGradient id="rd-nose" cx="40%" cy="30%" r="70%"><stop offset="0" style="stop-color:#4b525e"></stop><stop offset="1" style="stop-color:#101216"></stop></radialGradient>
      <radialGradient id="rd-gloss" cx="35%" cy="20%" r="60%"><stop offset="0" style="stop-color:#ffffff;stop-opacity:0.55"></stop><stop offset="1" style="stop-color:#ffffff;stop-opacity:0"></stop></radialGradient>
    </defs></svg>`;
    document.body.prepend(holder.firstElementChild);
  }
  const MOOD_WORD = { neutral: 'calm', happy: 'pleased', cheer: 'thrilled', worried: 'nervous' };
  function rudy(mood = 'neutral', { track = false, blink = true } = {}) {
    return `<svg class="rudy mood-${mood}${blink ? ' blink' : ''}" ${track ? 'data-track="1"' : ''} viewBox="0 0 200 200" role="img" aria-label="Rudy the raccoon, looking ${MOOD_WORD[mood]}">
  <g class="r-head">
    <g class="r-spark" stroke="var(--accent)" stroke-width="6" stroke-linecap="round"><path d="M26 44 L12 32"></path><path d="M174 44 L188 32"></path><path d="M100 18 L100 4"></path></g>
    <path d="M40 74 C30 44 40 18 60 20 C74 22 84 42 86 60 Z" fill="url(#rd-fur)"></path>
    <path d="M160 74 C170 44 160 18 140 20 C126 22 116 42 114 60 Z" fill="url(#rd-fur)"></path>
    <path d="M50 62 C46 44 51 32 60 33 C68 35 73 46 74 56 Z" fill="var(--mask)"></path>
    <path d="M150 62 C154 44 149 32 140 33 C132 35 127 46 126 56 Z" fill="var(--mask)"></path>
    <path d="M100 38 C152 38 180 66 180 114 C180 160 147 186 100 186 C53 186 20 160 20 114 C20 66 48 38 100 38 Z" fill="url(#rd-fur)"></path>
    <path d="M100 42 C93 54 92 66 100 78 C108 66 107 54 100 42 Z" fill="var(--fur-lo)" opacity="0.75"></path>
    <path d="M30 106 C34 82 60 74 82 86 C90 91 96 96 100 100 C104 96 110 91 118 86 C140 74 166 82 170 106 C172 124 156 134 136 128 C122 124 110 120 100 120 C90 120 78 124 64 128 C44 134 28 124 30 106 Z" fill="url(#rd-mask)"></path>
    <g class="r-brow-worry" stroke="var(--mask)" stroke-width="6" stroke-linecap="round"><path d="M54 74 L82 84"></path><path d="M146 74 L118 84"></path></g>
    <circle cx="72" cy="105" r="19" fill="#ffffff"></circle>
    <circle cx="128" cy="105" r="19" fill="#ffffff"></circle>
    <g class="r-pupils">
      <circle cx="74" cy="107" r="10.5" fill="#121418"></circle>
      <circle cx="126" cy="107" r="10.5" fill="#121418"></circle>
      <circle cx="78.5" cy="102" r="3.6" fill="#ffffff"></circle>
      <circle cx="130.5" cy="102" r="3.6" fill="#ffffff"></circle>
    </g>
    <circle class="r-lid" cx="72" cy="105" r="20" fill="var(--mask)"></circle>
    <circle class="r-lid" cx="128" cy="105" r="20" fill="var(--mask)"></circle>
    <ellipse cx="48" cy="146" rx="12" ry="7" fill="var(--blush)" opacity="0.35"></ellipse>
    <ellipse cx="152" cy="146" rx="12" ry="7" fill="var(--blush)" opacity="0.35"></ellipse>
    <path d="M62 146 C62 126 80 120 100 120 C120 120 138 126 138 146 C138 166 120 176 100 176 C80 176 62 166 62 146 Z" fill="url(#rd-cheek)"></path>
    <path d="M87 132 C87 124 113 124 113 132 C113 140 105 145 100 145 C95 145 87 140 87 132 Z" fill="url(#rd-nose)"></path>
    <ellipse cx="95" cy="129" rx="5" ry="2.4" fill="#ffffff" opacity="0.55"></ellipse>
    <g stroke="var(--mask)" stroke-width="4.5" stroke-linecap="round" fill="none">
      <path class="r-mouth r-m-neutral" d="M90 157 Q100 162 110 157"></path>
      <path class="r-mouth r-m-happy" d="M84 153 Q100 169 116 153"></path>
      <path class="r-mouth r-m-worried" d="M88 163 Q100 155 112 163"></path>
    </g>
    <path class="r-mouth r-m-cheer" d="M82 152 Q100 178 118 152 Z" fill="var(--mask)" stroke="var(--mask)" stroke-width="3" stroke-linejoin="round"></path>
    <path class="r-tongue" d="M91 162 Q100 175 109 162 Q100 157 91 162 Z" fill="var(--tongue)"></path>
    <path class="r-sweat" d="M170 70 C163 84 165 91 171 91 C177 91 179 84 170 70 Z" fill="#7cc4f2"></path>
    <path d="M100 38 C152 38 180 66 180 114 C150 80 60 70 24 100 C30 62 56 38 100 38 Z" fill="url(#rd-gloss)"></path>
  </g>
</svg>`;
  }
  // Eyes follow the pointer on the Rudies that ask for it.
  let eyeFrame = 0;
  window.addEventListener('pointermove', (e) => {
    if (reduceMotion || eyeFrame) return;
    eyeFrame = requestAnimationFrame(() => {
      eyeFrame = 0;
      for (const svg of $$('.rudy[data-track]')) {
        const r = svg.getBoundingClientRect();
        if (!r.width) continue;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height * 0.52);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 300);
        const p = svg.querySelector('.r-pupils');
        if (p) p.style.transform = `translate(${((dx / d) * 6 * k).toFixed(2)}px, ${((dy / d) * 5 * k).toFixed(2)}px)`;
      }
    });
  });

  // ---------- state ----------
  const state = {
    mode: 'loading',            // 'loading' | 'live' | 'demo'
    route: 'home',
    tok: new Map(),             // mint -> token
    lists: {},                  // tab -> [mint]
    candles: {},                // mint|tf -> [{t,o,h,l,c,v}]
    trades: {},                 // mint -> [{ts,side,usd,qty,who,sig}]
    sparks: {},                 // mint -> [closes] (24h hourly)
    selected: store.get('selected2', null),
    marketTab: store.get('marketTab', 'hot'),
    coinSort: 'hot',
    tf: store.get('tf', '15m'),
    centerTab: 'trades',
    listFilter: '',
    coinFilter: '',
    side: 'buy',
    unit: 'usd',
    amount: '25',
    sellPct: null,
    maxImpact: store.get('maxImpact', CONFIG.maxImpactDefault),
    quote: null,
    quoteSeq: 0,
    busy: '',
    watch: new Set(store.get('watch2', [])),
    following: new Set(store.get('following2', [])),
    liked: new Set(store.get('liked', [])),
    myPosts: store.get('myPosts', []),
    tasksDone: store.get('tasksDone', {}),
    counts: store.get('counts', { trades: 0, launch: 0, post: 0 }),
    refCode: store.get('refCode', null),
    majors: { SOL: { p: NaN, c: 0 }, BTC: { p: NaN, c: 0 }, ETH: { p: NaN, c: 0 } },
    provider: null,
    wallet: null,
    solBal: null,
    balances: {},               // own wallet: mint -> {raw, ui}
    viewWallet: null,           // address shown on the wallet page
    walletData: {},             // address -> {sol, bal: {mint: {raw, ui}}, at}
    cash: store.get('cash', CONFIG.startingCash),
    positions: store.get('positions', {}),
    mood: null,
    moodUntil: 0,
    launchImg: null,
    lastMarketKey: '',
    last: {},
    homeTick: 0,
  };
  if (!state.refCode) {
    const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    state.refCode = Array.from({ length: 6 }, () => a[Math.floor(rand() * a.length)]).join('');
    store.set('refCode', state.refCode);
  }
  const isLive = () => state.mode === 'live';
  const sel = () => state.tok.get(state.selected);
  const solPrice = () => state.tok.get(SOL_MINT)?.price || state.majors.SOL.p || NaN;

  function save() {
    store.set('watch2', [...state.watch]);
    store.set('following2', [...state.following]);
    store.set('liked', [...state.liked]);
    store.set('myPosts', state.myPosts);
    store.set('tasksDone', state.tasksDone);
    store.set('counts', state.counts);
    store.set('maxImpact', state.maxImpact);
    if (state.mode === 'demo') { store.set('cash', state.cash); store.set('positions', state.positions); }
  }

  // Trades made through Ruckus, per wallet, so we can show P&L on coins traded here.
  const ledgerKey = (w = state.wallet) => 'ledger:' + w;
  function ledgerAdd(mint, side, usd) {
    const l = store.get(ledgerKey(), {});
    const e = l[mint] || { bought: 0, sold: 0 };
    if (side === 'buy') e.bought += usd; else e.sold += usd;
    l[mint] = e;
    store.set(ledgerKey(), l);
  }

  // ---------- live data ----------
  function fromJup(j) {
    const s24 = j.stats24h || {}, s1 = j.stats1h || {}, s5 = j.stats5m || {};
    return {
      id: j.id,
      sym: j.symbol || '?',
      name: j.name || j.symbol || 'Unknown',
      icon: j.icon || null,
      decimals: j.decimals ?? 6,
      price: j.usdPrice || 0,
      mcap: j.mcap || j.fdv || 0,
      liq: j.liquidity || 0,
      holders: j.holderCount || 0,
      chg24: (s24.priceChange || 0) / 100,
      chg1h: (s1.priceChange || 0) / 100,
      chg5m: (s5.priceChange || 0) / 100,
      vol24: (s24.buyVolume || 0) + (s24.sellVolume || 0),
      buys24: s24.numBuys || 0,
      sells24: s24.numSells || 0,
      traders24: s24.numTraders || 0,
      holderChg24: (s24.holderChange || 0) / 100,
      born: Date.parse(j.firstPool?.createdAt || j.createdAt || '') || null,
      launchpad: j.launchpad || null,
      verified: !!j.isVerified,
      organic: j.organicScoreLabel || null,
      audit: j.audit || {},
      dev: j.dev || null,
      color: colorFor(j.id),
    };
  }
  function upsert(list) {
    if (!Array.isArray(list)) return [];
    return list.filter((j) => j && j.id).map((j) => {
      const t = fromJup(j);
      const old = state.tok.get(t.id);
      state.tok.set(t.id, old ? Object.assign(old, t) : t);
      return t.id;
    });
  }
  const LIST_URL = {
    hot: '/tokens/v2/toptrending/1h?limit=50',
    new: '/tokens/v2/recent?limit=50',
    top: '/tokens/v2/toptraded/24h?limit=50',
  };
  async function loadMints(mints) {
    for (let i = 0; i < mints.length; i += 100) {
      const chunk = mints.slice(i, i + 100);
      upsert(await http(`${JUP}/tokens/v2/search?query=${chunk.join(',')}`));
    }
    return mints.filter((m) => state.tok.has(m));
  }
  async function loadList(tab) {
    if (!isLive()) return;
    if (LIST_URL[tab]) state.lists[tab] = upsert(await http(JUP + LIST_URL[tab]));
    else if (tab === 'watchlist') state.lists.watchlist = await loadMints([...state.watch]);
    else if (tab === 'holding') state.lists.holding = await loadHoldings();
  }
  async function loadWalletData(addr) {
    const b = await http(`${JUP}/ultra/v1/balances/${addr}`);
    const bal = {};
    for (const [k, v] of Object.entries(b)) if (k !== 'SOL') bal[k] = { raw: String(v.amount), ui: v.uiAmount };
    const d = { sol: b.SOL ? b.SOL.uiAmount : 0, bal, at: Date.now() };
    state.walletData[addr] = d;
    const mints = Object.keys(bal).filter((m) => bal[m].ui > 0);
    await loadMints(mints.slice(0, 200)).catch(() => {});
    return d;
  }
  async function loadBalances() {
    if (!state.wallet || !isLive()) return;
    const d = await loadWalletData(state.wallet);
    state.solBal = d.sol;
    state.balances = d.bal;
    updWalletBtn();
  }
  async function loadHoldings() {
    if (!state.wallet) return [];
    await loadBalances();
    return Object.keys(state.balances)
      .filter((m) => state.balances[m].ui > 0 && state.tok.has(m))
      .sort((a, b) => holdingValue(b) - holdingValue(a));
  }
  const holdingValue = (m) => (state.balances[m]?.ui || 0) * (state.tok.get(m)?.price || 0);
  const TF = { '1m': '1_MINUTE', '5m': '5_MINUTE', '15m': '15_MINUTE', '1h': '1_HOUR' };
  async function loadCandles(id, tf) {
    const d = await http(`${DATA}/v2/charts/${id}?interval=${TF[tf]}&to=${Date.now()}&candles=150&type=price&quote=usd`);
    state.candles[id + '|' + tf] = (d.candles || []).map((c) => ({ t: c.time * 1000, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume || 0 }));
  }
  async function loadTrades(id) {
    const d = await http(`${DATA}/v1/txs/${id}`);
    state.trades[id] = (d.txs || [])
      .map((x) => ({ ts: Date.parse(x.timestamp), side: x.type, usd: x.usdVolume, qty: x.amount, who: x.traderAddress, sig: x.txHash }))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 60);
  }
  // SOL, BTC and ETH for the status bar, priced by Jupiter (wrapped BTC/ETH on Solana track the real thing).
  const MAJORS = { SOL: SOL_MINT, BTC: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs' };
  async function loadMajors() {
    try { await loadMints(Object.values(MAJORS)); } catch { /* keep what we have */ }
    for (const [k, mint] of Object.entries(MAJORS)) {
      const t = state.tok.get(mint);
      if (t?.price) state.majors[k] = { p: t.price, c: t.chg24 };
    }
    renderStatus();
  }

  // ----- sparklines: 24 hourly closes per coin, fetched lazily as cards scroll into view -----
  const sparkQueue = [];
  let sparkActive = 0;
  const sparkPending = new Set();
  function queueSpark(id) {
    if (state.sparks[id] || sparkPending.has(id)) return;
    if (!isLive()) { demoSpark(id); return; }
    sparkPending.add(id);
    sparkQueue.push(id);
    pumpSparks();
  }
  function pumpSparks() {
    while (sparkActive < 3 && sparkQueue.length) {
      const id = sparkQueue.shift();
      sparkActive++;
      http(`${DATA}/v2/charts/${id}?interval=1_HOUR&to=${Date.now()}&candles=24&type=price&quote=usd`)
        .then((d) => { state.sparks[id] = (d.candles || []).map((c) => c.close); })
        .catch(() => { state.sparks[id] = []; })
        .finally(() => { sparkActive--; sparkPending.delete(id); paintSparks(id); pumpSparks(); });
    }
  }
  function demoSpark(id) {
    const cs = state.candles[id + '|1m'] || [];
    state.sparks[id] = cs.slice(-48).map((k) => k.c);
    paintSparks(id);
  }
  function paintSparks(id) {
    for (const el of $$(`[data-spark="${CSS.escape(id)}"]`)) el.innerHTML = sparkSvg(state.sparks[id]);
  }
  let sparkObserver = null;
  function hydrateSparks(root = document) {
    if (!sparkObserver && 'IntersectionObserver' in window) {
      sparkObserver = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          sparkObserver.unobserve(en.target);
          queueSpark(en.target.dataset.spark);
        }
      }, { rootMargin: '200px' });
    }
    for (const el of $$('[data-spark]', root)) {
      const id = el.dataset.spark;
      if (state.sparks[id]) { if (!el.firstChild) el.innerHTML = sparkSvg(state.sparks[id]); continue; }
      if (sparkObserver) sparkObserver.observe(el); else queueSpark(id);
    }
  }
  function sparkSvg(values) {
    if (!values || values.length < 2) return '<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="M0 15 H100" stroke="var(--line)" stroke-width="2" vector-effect="non-scaling-stroke" fill="none"></path></svg>';
    let lo = Infinity, hi = -Infinity;
    for (const v of values) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const span = hi - lo || hi || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 27 - ((v - lo) / span) * 24]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
    const color = values[values.length - 1] >= values[0] ? 'var(--up)' : 'var(--down)';
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path d="${line} L100 30 L0 30 Z" fill="${color}" opacity="0.1"></path>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"></path>
      <circle cx="${last[0]}" cy="${last[1]}" r="2.4" fill="${color}" vector-effect="non-scaling-stroke"></circle></svg>`;
  }
  const sparkBox = (id, cls = 'spark-box') => `<div class="${cls}" data-spark="${esc(id)}">${state.sparks[id] ? sparkSvg(state.sparks[id]) : ''}</div>`;

  // ---------- demo data ----------
  const SUPPLY = 1e9;
  // sym, name, price, volatility per tick, age (minutes), holders, 24h change
  const SEEDS = [
    ['BINLID', 'Bin Lid', 0.00412, 0.012, 2900, 8412, 0.34],
    ['MASKED', 'Masked Bandit', 0.0187, 0.008, 12400, 21877, 0.081],
    ['NIGHTSHIFT', 'Night Shift', 0.00093, 0.015, 640, 2215, 1.12],
    ['CRUMB', 'Crumb', 0.000061, 0.02, 95, 611, 2.4],
    ['SODIUM', 'Streetlight', 0.00248, 0.01, 5100, 9930, -0.12],
    ['GRUB', 'Grub Club', 0.00731, 0.009, 8800, 14002, 0.05],
    ['PAWS', 'Wet Paws', 0.000284, 0.016, 410, 1840, -0.27],
    ['ALLEY', 'Alley Cat', 0.0412, 0.006, 30100, 40210, 0.018],
    ['RINSE', 'Rinse Cycle', 0.00119, 0.013, 1700, 3320, -0.06],
    ['TRASHTV', 'Trash TV', 0.000038, 0.022, 22, 148, 3.8],
    ['DUMPY', 'Dumpy', 0.00557, 0.011, 4300, 6120, 0.21],
    ['MOONPIE', 'Half Moonpie', 0.000176, 0.017, 260, 990, 0.62],
  ];
  function makeCandles(price, sigma, r) {
    const n = 150, steps = 6, now = Date.now();
    let lp = 0;
    const raw = [];
    for (let i = 0; i < n; i++) {
      const o = lp;
      let h = o, l = o;
      for (let s = 0; s < steps; s++) {
        lp += gauss(r) * sigma * 0.8 + sigma * 0.015;
        h = Math.max(h, lp);
        l = Math.min(l, lp);
      }
      raw.push([o, h, l, lp, 0.3 + r() * 1.7]);
    }
    const shift = Math.log(price) - lp;
    const volBase = price * SUPPLY * 0.0004;
    return raw.map(([o, h, l, c, v], i) => ({
      t: now - (n - 1 - i) * 60000, o: Math.exp(o + shift), h: Math.exp(h + shift), l: Math.exp(l + shift), c: Math.exp(c + shift), v: v * volBase,
    }));
  }
  function randomWallet() {
    const a = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    return Array.from({ length: 44 }, () => a[Math.floor(rand() * a.length)]).join('');
  }
  const DEMO_WALLETS = Array.from({ length: 10 }, randomWallet);
  function fakeTrade(t, ts = Date.now()) {
    const usd = Math.exp(Math.log(5) + rand() * Math.log(1200));
    return { ts, side: rand() < 0.53 ? 'buy' : 'sell', usd, qty: usd / t.price, who: pick(DEMO_WALLETS), sig: null };
  }
  function makeDemoToken([sym, name, price, sigma, ageMin, holders, chg24], extra = {}) {
    const r = rng(sym.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
    const t = {
      id: sym, sym, name, icon: null, decimals: 6, price, sigma, color: colorFor(sym), holders,
      mcap: price * SUPPLY, liq: price * SUPPLY * 0.08,
      born: Date.now() - ageMin * 60000,
      ref24: price / (1 + chg24), chg24, chg1h: 0, chg5m: 0,
      vol24: price * SUPPLY * (0.15 + r() * 0.5),
      buys24: 0, sells24: 0, traders24: 0, holderChg24: 0,
      verified: false, organic: null, launchpad: 'demo',
      audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 18 + r() * 30 },
      ...extra,
    };
    state.tok.set(t.id, t);
    state.candles[t.id + '|1m'] = makeCandles(price, sigma, r);
    state.trades[t.id] = Array.from({ length: 14 }, (_, i) => fakeTrade(t, Date.now() - i * 9000 * (0.5 + rand())));
    return t;
  }
  function startDemo() {
    state.mode = 'demo';
    state.tok.clear();
    SEEDS.forEach((s) => makeDemoToken(s));
    if (!state.tok.has(state.selected)) state.selected = 'BINLID';
    for (const sym of Object.keys(state.positions)) if (!state.tok.has(sym)) delete state.positions[sym];
    state.majors = { SOL: { p: 180, c: 0.021 }, BTC: { p: 110000, c: 0.006 }, ETH: { p: 4000, c: -0.004 } };
    computeDemoLists();
  }
  function computeDemoLists() {
    const all = [...state.tok.values()];
    state.lists.hot = [...all].sort((a, b) => b.vol24 - a.vol24).map((t) => t.id);
    state.lists.new = [...all].sort((a, b) => b.born - a.born).map((t) => t.id);
    state.lists.top = [...all].sort((a, b) => b.mcap - a.mcap).map((t) => t.id);
    state.lists.watchlist = all.filter((t) => state.watch.has(t.id)).map((t) => t.id);
    state.lists.holding = all.filter((t) => state.positions[t.id]?.qty > 0).map((t) => t.id);
  }
  let demoTicks = 0;
  function demoTick() {
    demoTicks++;
    for (const t of state.tok.values()) {
      t.price *= Math.exp(gauss() * t.sigma + t.sigma * 0.01);
      t.mcap = t.price * SUPPLY;
      t.chg24 = t.price / t.ref24 - 1;
      const cs = state.candles[t.id + '|1m'];
      let c = cs[cs.length - 1];
      if (demoTicks % 10 === 0) {
        c = { t: Date.now(), o: c.c, h: c.c, l: c.c, c: c.c, v: 0 };
        cs.push(c);
        if (cs.length > 240) cs.shift();
      }
      c.c = t.price;
      c.h = Math.max(c.h, t.price);
      c.l = Math.min(c.l, t.price);
      const v = t.mcap * 0.00004 * (0.3 + rand() * 1.4);
      c.v += v;
      t.vol24 += v;
      t.chg5m = t.price / cs[Math.max(0, cs.length - 5)].o - 1;
      t.chg1h = t.price / cs[Math.max(0, cs.length - 60)].o - 1;
      if (rand() < 0.08) t.holders += rand() < 0.75 ? 1 : -1;
      if (rand() < (t.id === state.selected ? 0.75 : 0.2)) {
        const tr = state.trades[t.id];
        tr.unshift(fakeTrade(t));
        if (tr.length > 40) tr.pop();
      }
    }
    if (demoTicks % 20 === 0) state.sparks = {};
    computeDemoLists();
  }

  // ---------- toasts ----------
  function toast(msg, mood = 'happy') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = rudy(mood, { blink: false }) + `<div>${msg}</div>`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 6000);
  }

  // ---------- shared bits ----------
  function coinBadge(t, size = '') {
    const inner = t.icon
      ? `<img src="${esc(t.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
      : '';
    return `<span class="coin ${size}" style="background:${t.color || '#c5ccd6'}" aria-hidden="true"><i>${esc(String(t.sym).slice(0, 2))}</i>${inner}</span>`;
  }
  const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path></svg>';
  const STAR_O = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path></svg>';
  function starBtn(id) {
    const t = state.tok.get(id);
    const on = state.watch.has(id);
    return `<button class="star" type="button" data-act="star" data-id="${esc(id)}" aria-pressed="${on}" aria-label="${on ? 'Remove' : 'Add'} ${esc(t?.sym)} ${on ? 'from' : 'to'} watchlist">${on ? STAR : STAR_O}</button>`;
  }
  function walletAvatar(addr, round = false) {
    return `<a class="avatar" href="#w-${esc(addr)}" style="background:${colorFor(addr)}${round ? ';border-radius:50%' : ''}" aria-label="Open wallet ${esc(shortAddr(addr))}">${esc(addr.slice(0, 2))}</a>`;
  }
  const walletLink = (addr) => `<a href="#w-${esc(addr)}">${esc(shortAddr(addr))}</a>`;
  function followBtn(addr) {
    const on = state.following.has(addr);
    return `<button class="btn btn-sm follow" type="button" data-act="follow" data-h="${esc(addr)}" aria-pressed="${on}">${on ? 'Following' : 'Follow'}</button>`;
  }
  function tickerLinks(text) {
    const bySym = symIndex();
    return esc(text).replace(/\$([A-Za-z0-9]{2,10})\b/g, (m, sym) => {
      const id = bySym.get(sym.toUpperCase());
      return id ? `<button type="button" class="tag" data-act="open" data-id="${esc(id)}">$${esc(sym)}</button>` : m;
    });
  }
  function symIndex() {
    const m = new Map();
    for (const t of state.tok.values()) if (!m.has(t.sym.toUpperCase())) m.set(t.sym.toUpperCase(), t.id);
    return m;
  }
  function crumbsTotal() {
    return TASKS.reduce((s, t) => s + (state.tasksDone[t.id] ? t.crumbs : 0), 0);
  }
  function loadingBlock(msg = 'Loading markets…') {
    return `<div class="empty">${rudy('neutral')}<b>${msg}</b></div>`;
  }
  const listTokens = (key) => (state.lists[key] || []).map((id) => state.tok.get(id)).filter(Boolean);
  function featured() {
    const hot = listTokens('hot').filter((t) => t.id !== SOL_MINT && !Object.values(MAJORS).includes(t.id));
    return hot[0] || null;
  }

  // ---------- status bar ----------
  function renderStatus() {
    const m = state.majors;
    const live = isLive();
    const mode = { live: 'Live', demo: 'Demo data', loading: 'Connecting' }[state.mode];
    $('#status').innerHTML = `${rudy('happy', { blink: false })}<b>ruckus</b>
      <span><span class="dot${live ? '' : ' off'}"></span> ${mode}</span>
      ${['SOL', 'BTC', 'ETH'].map((k) => `<span class="tk"><em>${k}</em>${isFinite(m[k].p) ? fmtUsd(m[k].p, m[k].p > 1000 ? 0 : 2) : '–'} <span class="${cls(m[k].c)}">${fmtPct(m[k].c)}</span></span>`).join('')}
      <span class="grow"></span>
      <span class="muted">Swaps by Jupiter · 0% ruckus fee</span>
      <span class="health${live ? '' : ' demo'}">${live ? '● Solana mainnet' : '● Paper trading'}</span>`;
  }

  // ---------- HOME ----------
  function viewHome() {
    return `<div class="home">
  <div class="stage-wrap"><div class="stage">
    <div class="orbit o1" aria-hidden="true"></div><div class="orbit o2" aria-hidden="true"></div><div class="pedestal" aria-hidden="true"></div>
    <div class="bubble" id="h-bubble" aria-live="polite">Psst. I sniff out the coins that are moving.</div>
    <div class="hero-rudy">${rudy('happy', { track: true })}</div>
    <div class="fc fc-trader floaty"><span class="eyebrow">Wallets</span><div id="h-trader">${skelRows(2)}</div></div>
    <div class="fc fc-market floaty d1"><span class="eyebrow">Markets</span><div id="h-market">${skelRows(3)}</div></div>
    <div class="fc fc-buy floaty d2"><span class="eyebrow">Trading</span><div id="h-buy">${skelRows(3)}</div></div>
    <div class="fc fc-pills" id="h-pills"></div>
    <div class="fc fc-toast" id="h-toast" hidden></div>
  </div></div>
  <div class="hero-copy">
    <h1>Find it first.<br><em>Trade it loud.</em></h1>
    <div>
      <p>Spot Solana coins as they start to move, follow the wallets that keep finding them first, and trade in one tap from your own wallet.</p>
      <div class="cta-row"><a class="btn btn-primary btn-lg" href="#trade">Open Ruckus</a><a class="btn btn-lg" href="#coins">Browse coins</a></div>
      <div class="hero-note" id="h-note"></div>
    </div>
  </div>
  <section class="section">
    <div class="section-head"><div><h2>Moving right now</h2><p>The most-traded Solana coins of the last hour. Tap one to open its chart and trade it.</p></div><a class="btn" href="#coins">All coins →</a></div>
    <div class="cgrid" id="h-grid">${skelCards(8)}</div>
  </section>
  <section class="section">
    <div class="section-head"><div><h2>How Ruckus works</h2><p>No sign-up, no deposits. Your coins stay in your wallet the whole time.</p></div></div>
    <div class="how">
      <div class="card"><div class="n">1</div><h3>Connect your wallet</h3><p>Phantom, Solflare or Backpack. Ruckus only ever asks your wallet to sign the trade you just set up.</p></div>
      <div class="card"><div class="n">2</div><h3>Find the movers</h3><p>Trending coins, brand-new launches and the wallets buying them, with safety badges on every coin.</p></div>
      <div class="card"><div class="n">3</div><h3>Trade in one tap</h3><p>Best price across Solana through Jupiter. Ruckus adds no fee, and a price-impact limit guards every trade.</p></div>
    </div>
  </section>
</div>`;
  }
  const skelRows = (n) => Array.from({ length: n }, (_, i) => `<div class="skel" style="height:${i ? 14 : 22}px;margin:${i ? 8 : 0}px 0 0;width:${90 - i * 18}%"></div>`).join('');
  const skelCards = (n) => Array.from({ length: n }, () => '<div class="card ccard"><div class="skel" style="height:44px"></div><div class="skel" style="height:58px"></div><div class="skel" style="height:40px"></div></div>').join('');

  function updHome() {
    if (state.route !== 'home') return;
    const t = featured();
    if (!t) return;
    const trades = state.trades[t.id] || [];
    const buys = trades.filter((x) => x.side === 'buy' && x.who && x.who !== 'you');
    const agg = new Map();
    for (const x of buys) agg.set(x.who, (agg.get(x.who) || 0) + x.usd);
    const topBuyer = [...agg.entries()].sort((a, b) => b[1] - a[1])[0];

    $('#h-market').innerHTML = `<div class="fc-row">${coinBadge(t, 'md')}<div style="flex:1;min-width:0"><b>$${esc(t.sym)}</b><span class="sub">${esc(t.name)} · Solana</span></div><span class="badge">24h</span></div>
      <div class="big" style="margin-top:10px">${fmtCompact(t.mcap)} <span class="num ${cls(t.chg24)}" style="font-size:0.85rem">${fmtPct(t.chg24)}</span></div>
      ${sparkBox(t.id)}
      <div class="meta"><span>Vol <b>${fmtCompact(t.vol24)}</b></span><span>Holders <b>${t.holders ? fmtQty(t.holders) : '–'}</b></span><span>Liq <b>${fmtCompact(t.liq)}</b></span></div>`;

    $('#h-trader').innerHTML = topBuyer
      ? `<div class="fc-row">${walletAvatar(topBuyer[0])}<div style="flex:1;min-width:0"><b>${walletLink(topBuyer[0])}</b><span class="sub">Buying $${esc(t.sym)}</span></div>${followBtn(topBuyer[0])}</div>
         <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:10px;display:flex;justify-content:space-between;align-items:end;gap:8px">
           <div><span class="sub muted" style="font-size:0.78rem">Bought in the last few minutes</span><div class="big up">${fmtUsd(topBuyer[1], 0)}</div></div>
           <div style="text-align:right"><span class="sub muted" style="font-size:0.78rem">Buys</span><div class="mono" style="font-weight:600">${buys.filter((x) => x.who === topBuyer[0]).length}</div></div>
         </div>`
      : `<div class="fc-row">${rudy('neutral')}<span class="sub">Watching for the next big buyer…</span></div>`;

    const usd = 100;
    $('#h-buy').innerHTML = `<div class="seg" style="margin-bottom:10px"><button type="button" class="buy" aria-pressed="true">Buy</button><button type="button" class="sell" data-act="home-trade" data-id="${esc(t.id)}" data-side="sell">Sell</button></div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px"><span class="big">$${usd}</span><span class="num muted">≈ ${fmtQty(usd / (t.price || 1))} $${esc(t.sym)}</span></div>
      <div class="chips four" style="margin:10px 0">${[10, 50, 100, 500].map((v) => `<button type="button" class="chip" data-act="home-trade" data-id="${esc(t.id)}" data-v="${v}" aria-pressed="${v === usd}">$${v}</button>`).join('')}</div>
      <button class="btn btn-primary btn-block" type="button" data-act="home-trade" data-id="${esc(t.id)}" data-v="${usd}">Buy $${esc(t.sym)}</button>`;

    const recent = buys.slice(0, 3);
    $('#h-pills').innerHTML = recent.map((x) => `<a class="mini-pill" href="#w-${esc(x.who)}"><span class="avatar" style="background:${colorFor(x.who)}">${esc(x.who.slice(0, 2))}</span>${esc(shortAddr(x.who))} <span class="up">+${fmtCompact(x.usd)}</span></a>`).join('');

    const toastEl = $('#h-toast');
    const x = trades[state.homeTick % Math.max(1, Math.min(trades.length, 8))];
    if (x) {
      toastEl.hidden = false;
      toastEl.innerHTML = `<span class="check">${x.side === 'buy' ? '✓' : '↘'}</span>${esc(shortAddr(x.who))} ${x.side === 'buy' ? 'bought' : 'sold'} ${fmtUsd(x.usd)} of $${esc(t.sym)} · ${fmtAgo((Date.now() - x.ts) / 1000)} ago`;
    }

    const hot = listTokens('hot');
    const up = hot.filter((k) => k.chg1h > 0).length;
    $('#h-note').innerHTML = hot.length ? `<span class="dot"></span>${up} of ${hot.length} trending coins are up this hour` : '';

    const tips = rudyTips(t);
    $('#h-bubble').innerHTML = tickerLinks(tips[state.homeTick % tips.length]);

    const grid = $('#h-grid');
    if (grid && (!grid.dataset.filled || state.homeTick % 6 === 0)) {
      grid.dataset.filled = '1';
      grid.innerHTML = hot.filter((k) => k.id !== SOL_MINT).slice(0, 8).map(coinCard).join('');
    } else if (grid) updCoinCards(grid);
    hydrateSparks(view);
  }
  function rudyTips(t) {
    const tips = [];
    if (t.chg1h) tips.push(`$${t.sym} is ${t.chg1h >= 0 ? 'up' : 'down'} ${Math.abs(t.chg1h * 100).toFixed(1)}% this hour. ${t.chg1h > 0.2 ? 'Spicy.' : 'Keep an eye on it.'}`);
    const fresh = listTokens('new').filter((k) => k.born && Date.now() - k.born < 3600000).length;
    if (fresh) tips.push(`${fresh} new coins launched in the last hour. Most of them won't last. Check the badges.`);
    const best = listTokens('hot').slice().sort((a, b) => b.chg1h - a.chg1h)[0];
    if (best && best.id !== t.id) tips.push(`Biggest mover right now: $${best.sym}, ${fmtPct(best.chg1h)} in an hour.`);
    tips.push('Psst. Before you buy, check the badges: mint renounced, no freeze, and who holds the supply.');
    return tips;
  }

  // ---------- coin cards (home + coins page) ----------
  function coinCard(t) {
    const src = t.launchpad && t.launchpad !== 'demo' ? `<span class="src pad">${esc(t.launchpad)}</span>` : t.verified ? '<span class="src">Verified</span>' : `<span class="src" style="color:var(--muted)">Solana</span>`;
    return `<article class="card ccard" data-act="open" data-id="${esc(t.id)}" data-card="${esc(t.id)}" tabindex="0">
      <div class="row">${coinBadge(t, 'md')}<div class="who"><b>${esc(t.sym)}</b><span>${esc(t.name)}</span></div>${starBtn(t.id)}</div>
      ${src}
      <div class="mid"><div><div class="label" style="text-transform:none;letter-spacing:0">Market cap · 24h</div><div class="mc" data-f="mc">${fmtCompact(t.mcap)}</div><div class="num ${cls(t.chg24)}" data-f="chg">${fmtPct(t.chg24)}</div></div>${sparkBox(t.id)}</div>
      <div class="figs3"><div><div class="k">Vol 24h</div><div class="v" data-f="vol">${fmtCompact(t.vol24)}</div></div><div><div class="k">Liquidity</div><div class="v">${fmtCompact(t.liq)}</div></div><div><div class="k">Holders</div><div class="v">${t.holders ? fmtQty(t.holders) : '–'}</div></div></div>
      <div class="foot"><span><span class="dot${t.chg1h >= 0 ? '' : ' off'}" style="width:7px;height:7px"></span> ${fmtAgo(ageOf(t))} old${t.organic ? ' · ' + esc(t.organic) + ' organic' : ''}</span><span class="link-btn">Trade →</span></div>
    </article>`;
  }
  function updCoinCards(root) {
    for (const el of $$('[data-card]', root)) {
      const t = state.tok.get(el.dataset.card);
      if (!t) continue;
      el.querySelector('[data-f="mc"]').textContent = fmtCompact(t.mcap);
      const c = el.querySelector('[data-f="chg"]');
      c.textContent = fmtPct(t.chg24);
      c.className = 'num ' + cls(t.chg24);
      el.querySelector('[data-f="vol"]').textContent = fmtCompact(t.vol24);
    }
  }

  // ---------- COINS ----------
  const COIN_SORTS = [['hot', 'Trending'], ['top', 'Most traded'], ['new', 'Newest'], ['mcap', 'Market cap'], ['gainers', 'Top gainers']];
  function viewCoins() {
    return `<div class="wrap">
      <section class="card coins-head">
        <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:start">
          <div><h1>Coins</h1><div class="summary" id="coins-summary" style="margin-top:10px"></div></div>
          <a class="btn btn-primary" href="#launch">Launch a coin</a>
        </div>
        <div class="coins-tools">
          <input class="input" id="coin-filter" type="search" placeholder="Filter by ticker or name" autocomplete="off" value="${esc(state.coinFilter)}" aria-label="Filter coins">
          <div class="pill-tabs" role="tablist" aria-label="Sort coins">${COIN_SORTS.map(([k, l]) => `<button type="button" role="tab" data-act="csort" data-k="${k}" aria-selected="${state.coinSort === k}">${l}</button>`).join('')}</div>
        </div>
      </section>
      <div class="cgrid" id="coin-grid">${skelCards(12)}</div>
    </div>`;
  }
  function coinIds() {
    const s = state.coinSort;
    let toks;
    if (s === 'mcap' || s === 'gainers') {
      const seen = new Map();
      for (const k of ['hot', 'top', 'new']) for (const t of listTokens(k)) seen.set(t.id, t);
      toks = [...seen.values()].sort((a, b) => (s === 'mcap' ? b.mcap - a.mcap : b.chg24 - a.chg24));
    } else toks = listTokens(s);
    const q = state.coinFilter.trim().toLowerCase();
    return toks.filter((t) => t.id !== SOL_MINT && (!q || t.sym.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)));
  }
  function renderCoins() {
    const grid = $('#coin-grid');
    if (!grid) return;
    const need = state.coinSort === 'mcap' || state.coinSort === 'gainers' ? ['hot', 'top', 'new'] : [state.coinSort];
    if (need.some((k) => !state.lists[k])) { grid.innerHTML = skelCards(12); return; }
    const toks = coinIds();
    grid.innerHTML = toks.length ? toks.map(coinCard).join('') : `<div class="card" style="grid-column:1/-1"><div class="empty">${rudy('worried')}<b>No coins match that filter.</b></div></div>`;
    const all = listTokens('hot');
    $('#coins-summary').innerHTML = `<span><b>${toks.length}</b> coins</span><span>24h volume <b>${fmtCompact(all.reduce((s, t) => s + t.vol24, 0))}</b> across trending</span><span>${isLive() ? '<span class="dot"></span> Live from Solana' : 'Demo coins'}</span>`;
    hydrateSparks(grid);
  }

  // ---------- TRADE ----------
  const MARKET_TABS = [['hot', 'Hot'], ['new', 'New'], ['top', 'Top'], ['watchlist', 'Watchlist'], ['holding', 'Holding']];
  function viewTrade() {
    return `<div class="desk fill">
  <div class="col-left panel-scroll"><section class="card" aria-label="Markets">
    <div class="mk-top">
      <div class="pill-tabs" role="tablist" aria-label="Market lists">${MARKET_TABS.map(([k, l]) => `<button type="button" role="tab" data-act="mtab" data-k="${k}" aria-selected="${state.marketTab === k}">${l}</button>`).join('')}</div>
      <input class="input" id="mk-filter" type="search" placeholder="Filter this list" autocomplete="off" value="${esc(state.listFilter)}" aria-label="Filter coins">
      <div class="mk-meta"><span id="mk-count"></span><span>MC · 24h</span></div>
    </div>
    <ul class="market-list" id="mk-list" role="listbox" aria-label="Coins">${loadingBlock()}</ul>
  </section></div>
  <div class="col-center stack">
    <section class="card">
      <div class="tok-head" id="tok-head"></div>
      <div class="badges" id="tok-badges"></div>
      <div class="chart-bar">
        <div class="pill-tabs" role="tablist" aria-label="Candle size">${Object.keys(TF).map((k) => `<button type="button" role="tab" data-act="tf" data-k="${k}" aria-selected="${state.tf === k}">${k}</button>`).join('')}</div>
        <span class="num muted" id="chart-note"></span>
      </div>
      <div class="chart-box"><canvas id="chart" role="img" aria-label="Price chart"></canvas></div>
      <div class="stat-row" id="tok-stats"></div>
    </section>
    <section class="card">
      <div class="subtabs"><div class="pill-tabs" role="tablist" aria-label="Coin details">${[['trades', 'Live trades'], ['buyers', 'Top buyers'], ['about', 'About']].map(([k, l]) => `<button type="button" role="tab" data-act="ctab" data-k="${k}" aria-selected="${state.centerTab === k}">${l}</button>`).join('')}</div><span class="label" id="tape-sym"></span></div>
      <div id="center-pane"></div>
    </section>
  </div>
  <div class="col-right panel-scroll stack">
    <section class="card ticket" aria-label="Trade ticket">
      <div class="ticket-head"><div><div class="label">Trade</div><b id="ticket-title"></b></div><div class="ticket-rudy" id="ticket-rudy"></div></div>
      <div class="seg" role="group" aria-label="Buy or sell">
        <button type="button" class="buy" data-act="side" data-side="buy" aria-pressed="${state.side === 'buy'}">Buy</button>
        <button type="button" class="sell" data-act="side" data-side="sell" aria-pressed="${state.side === 'sell'}">Sell</button>
      </div>
      <div class="amount-box">
        <label class="label" for="amt" style="text-transform:none;letter-spacing:0;font-size:0.8rem">Amount</label>
        <div class="row"><span class="cur" id="amt-cur">$</span><input id="amt" inputmode="decimal" autocomplete="off" value="${esc(state.amount)}"><button type="button" class="unit-btn" data-act="unit" id="unit-btn">USD ⇄</button></div>
        <div class="conv"><span id="conv"></span><span id="conv2"></span></div>
      </div>
      <div class="chips" id="chips"></div>
      <dl class="quote" id="quote"></dl>
      <div id="rudy-tip"></div>
      <div class="fee-line"><span class="limit"><label for="max-impact">Max price impact</label><input id="max-impact" inputmode="decimal" value="${esc(state.maxImpact)}">%</span><span>Slippage auto · 0% ruckus fee</span></div>
      <div class="err" id="ticket-err" role="alert"></div>
      <button class="btn btn-block btn-lg buy" type="button" id="ticket-go" data-act="go"></button>
    </section>
    <section class="card"><div class="card-head"><h3>Your position</h3><button class="link-btn" type="button" data-act="reset" id="reset-btn" hidden>Reset paper balance</button></div><div class="card-body"><dl class="balance" id="balance"></dl></div></section>
    <section class="card"><div class="card-head"><h3>Traders to follow</h3><a class="link-btn" href="#den">See all</a></div><ul class="people" id="people"></ul></section>
  </div>
</div>`;
  }

  function marketIds() {
    const ids = state.lists[state.marketTab];
    if (!ids) return null;
    const q = state.listFilter.trim().toLowerCase();
    return ids.filter((id) => {
      const t = state.tok.get(id);
      return t && (!q || t.sym.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
    });
  }
  function marketFigs(t) {
    return `<div class="num">${fmtCompact(t.mcap)}</div><div class="num ${cls(t.chg24)}">${fmtPct(t.chg24)}</div>`;
  }
  function updMarkets(force = false) {
    const list = $('#mk-list');
    if (!list) return;
    const ids = marketIds();
    if (!ids) { list.innerHTML = loadingBlock(); state.lastMarketKey = ''; return; }
    $('#mk-count').innerHTML = `<b>${ids.length}</b> coins · <span class="live"><span class="dot${isLive() ? '' : ' off'}" style="width:6px;height:6px"></span> ${isLive() ? 'Live' : 'Demo'}</span>`;
    const key = state.marketTab + '|' + ids.join(',') + '|' + state.selected + '|' + [...state.watch].join(',');
    if (force || key !== state.lastMarketKey) {
      state.lastMarketKey = key;
      if (!ids.length) {
        const msg = state.listFilter.trim() ? '<b>No coins match that filter.</b>Use the search at the top to look up any coin.' : {
          watchlist: '<b>No coins on your watchlist.</b>Tap the star next to a coin to keep an eye on it.',
          holding: state.wallet || !isLive() ? '<b>Rudy’s pockets are empty.</b>Buy a coin and it shows up here.' : '<b>Connect your wallet</b>to see the coins you hold.',
        }[state.marketTab] || '<b>Nothing here yet.</b>';
        list.innerHTML = `<li class="empty">${rudy(state.marketTab === 'holding' ? 'neutral' : 'worried')}${msg}</li>`;
        return;
      }
      const cap = window.innerWidth <= 780 && !state.showAllMk ? 15 : Infinity;
      list.innerHTML = ids.slice(0, cap).map((id) => {
        const t = state.tok.get(id);
        return `<li class="market-row" role="option" tabindex="0" data-act="select" data-id="${esc(id)}" aria-selected="${id === state.selected}">
          ${coinBadge(t)}<div class="who"><b>${esc(t.sym)}</b><span>${esc(t.name)}</span></div>
          ${sparkBox(id, 'mini-spark')}
          <div class="figs" data-figs="${esc(id)}">${marketFigs(t)}</div>${starBtn(id)}</li>`;
      }).join('') + (ids.length > cap ? `<li style="padding:8px"><button class="btn btn-block" type="button" data-act="mk-all">Show all ${ids.length} coins</button></li>` : '');
      hydrateSparks(list);
      return;
    }
    for (const id of ids) {
      const el = list.querySelector(`[data-figs="${CSS.escape(id)}"]`);
      if (el) el.innerHTML = marketFigs(state.tok.get(id));
    }
  }

  function badge(ok, yes, no) {
    return `<span class="badge ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '!'} ${ok ? yes : no}</span>`;
  }
  function updToken() {
    const t = sel();
    const head = $('#tok-head');
    if (!head) return;
    if (!t) { head.innerHTML = `<div class="title">${loadingBlock('Picking a coin…')}</div>`; return; }
    const links = isLive()
      ? `<span class="mono">${esc(shortAddr(t.id))}</span><button type="button" class="link-btn" data-act="copy-mint">Copy mint</button><button type="button" class="link-btn" data-act="share">Share</button><a href="${solscanAcct(t.id)}" target="_blank" rel="noopener">Solscan ↗</a><a href="https://dexscreener.com/solana/${esc(t.id)}" target="_blank" rel="noopener">DEX Screener ↗</a>`
      : '<span>demo coin</span>';
    head.innerHTML = `${coinBadge(t, 'lg')}
      <div class="title"><h1>${esc(t.name)} <small>$${esc(t.sym)}</small> ${starBtn(t.id)}</h1><div class="addr">${links}</div></div>
      <div class="tok-price"><div class="big">${fmtPrice(t.price)}</div><div class="num"><span class="${cls(t.chg1h)}">${fmtPct(t.chg1h)} 1h</span> · <span class="${cls(t.chg24)}">${fmtPct(t.chg24)} 24h</span></div></div>`;
    const a = t.audit || {};
    const top = a.topHoldersPercentage;
    $('#tok-badges').innerHTML = [
      t.verified ? '<span class="badge ok">✓ Verified</span>' : '',
      a.mintAuthorityDisabled != null ? badge(a.mintAuthorityDisabled, 'Mint renounced', 'Mint still active') : '',
      a.freezeAuthorityDisabled != null ? badge(a.freezeAuthorityDisabled, 'No freeze', 'Can freeze wallets') : '',
      top != null ? badge(top < 30, `Top holders ${top.toFixed(0)}%`, `Top holders own ${top.toFixed(0)}%`) : '',
      t.organic ? `<span class="badge">${esc(t.organic)} organic activity</span>` : '',
      t.launchpad && t.launchpad !== 'demo' ? `<span class="badge hot">${esc(t.launchpad)}</span>` : '',
    ].join('');
    $('#tok-stats').innerHTML = [
      ['Market cap', fmtCompact(t.mcap)],
      ['Liquidity', fmtCompact(t.liq)],
      ['Volume 24h', fmtCompact(t.vol24)],
      ['Holders', t.holders ? t.holders.toLocaleString('en-US') : '–'],
      ['Age', fmtAgo(ageOf(t))],
    ].map(([k, v]) => `<div><div class="label">${k}</div><div class="val">${v}</div></div>`).join('');
    $('#tape-sym').textContent = '$' + t.sym;
    $('#chart-note').textContent = isLive() ? `${state.tf} candles · USD` : '1m candles · simulated';
  }

  function updCenter() {
    const box = $('#center-pane');
    if (!box) return;
    const t = sel();
    if (!t) { box.innerHTML = ''; return; }
    if (state.centerTab === 'about') { box.innerHTML = aboutHtml(t); return; }
    if (state.centerTab === 'buyers') { box.innerHTML = `<ul class="people">${buyersHtml(t, 10)}</ul>`; return; }
    const list = state.trades[t.id];
    if (!list) { box.innerHTML = `<div class="card-body">${skelRows(4)}</div>`; return; }
    if (!list.length) { box.innerHTML = '<div class="empty">No trades in the last few minutes.</div>'; return; }
    const now = Date.now();
    box.innerHTML = `<div class="table-scroll"><table class="tape"><thead><tr><th>Age</th><th>Side</th><th class="r">USD</th><th class="r">Coins</th><th>Trader</th><th class="r">Tx</th></tr></thead><tbody>${list.slice(0, 16).map((x) => {
      const mine = x.who === 'you' || (state.wallet && x.who === state.wallet);
      const followed = state.following.has(x.who);
      const who = mine ? '<b>you</b>' : `${followed ? '★ ' : ''}${walletLink(x.who)}`;
      const tx = x.sig ? `<a href="${solscanTx(x.sig)}" target="_blank" rel="noopener" aria-label="View transaction">↗</a>` : '';
      return `<tr${followed ? ' class="followed"' : ''}><td>${fmtAgo((now - x.ts) / 1000)}</td><td><span class="side-pill ${x.side === 'buy' ? 'buy' : 'sell'}">${esc(x.side)}</span></td><td class="r">${fmtUsd(x.usd)}</td><td class="r">${fmtQty(x.qty)}</td><td>${who}</td><td class="r">${tx}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function aboutHtml(t) {
    const a = t.audit || {};
    const rows = [
      ['Mint address', isLive() ? `<span class="mono">${esc(t.id)}</span>` : 'demo coin'],
      ['Launched', t.born ? `${new Date(t.born).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · ${fmtAgo(ageOf(t))} ago` : '–'],
      ['Launchpad', t.launchpad && t.launchpad !== 'demo' ? esc(t.launchpad) : '–'],
      ['Trades 24h', t.buys24 || t.sells24 ? `${t.buys24.toLocaleString('en-US')} buys · ${t.sells24.toLocaleString('en-US')} sells` : '–'],
      ['Traders 24h', t.traders24 ? t.traders24.toLocaleString('en-US') : '–'],
      ['Holder change 24h', t.holderChg24 ? `<span class="${cls(t.holderChg24)}">${fmtPct(t.holderChg24)}</span>` : '–'],
      ['Top holders own', a.topHoldersPercentage != null ? a.topHoldersPercentage.toFixed(1) + '%' : '–'],
      ['Developer wallet', t.dev ? walletLink(t.dev) : '–'],
    ];
    return `<div class="about-grid">${rows.map(([k, v]) => `<div><div class="label">${k}</div><div class="v">${v}</div></div>`).join('')}</div>`;
  }
  function buyersHtml(t, n = 4) {
    const list = state.trades[t.id];
    if (!list) return `<li class="empty">${rudy('neutral')}Loading buyers…</li>`;
    const agg = new Map();
    for (const x of list) {
      if (x.side !== 'buy' || !x.who || x.who === 'you') continue;
      const a = agg.get(x.who) || { usd: 0, n: 0 };
      a.usd += x.usd;
      a.n++;
      agg.set(x.who, a);
    }
    const top = [...agg.entries()].sort((a, b) => b[1].usd - a[1].usd).slice(0, n);
    return top.length ? top.map(([addr, a]) => `<li class="person">${walletAvatar(addr)}
      <div><b>${walletLink(addr)}</b><span>bought ${fmtUsd(a.usd)} of $${esc(t.sym)} · ${a.n} trade${a.n > 1 ? 's' : ''}</span></div>
      ${followBtn(addr)}</li>`).join('')
      : `<li class="empty">${rudy('neutral')}No buyers in the latest trades.</li>`;
  }
  function updPeople() {
    const box = $('#people');
    const t = sel();
    if (box && t) box.innerHTML = buyersHtml(t, 4);
  }

  // ----- Rudy's safety read on the selected coin -----
  function safetyRead(t) {
    if (!t || !isLive()) return null;
    const a = t.audit || {};
    if (a.mintAuthorityDisabled === false) return { kind: 'warn', text: 'The mint is still active. The team can create more coins whenever they like.' };
    if (a.freezeAuthorityDisabled === false) return { kind: 'warn', text: 'This coin can freeze wallets. You might not be able to sell.' };
    if (a.topHoldersPercentage > 50) return { kind: 'warn', text: `The top holders own ${a.topHoldersPercentage.toFixed(0)}% of the supply. One big sell can crash it.` };
    if (t.liq && t.liq < 10000) return { kind: 'warn', text: `Only ${fmtCompact(t.liq)} of liquidity. Bigger trades will move the price a lot.` };
    if (t.born && Date.now() - t.born < 3600000) return { kind: '', text: 'Brand new, less than an hour old. Things move fast here.' };
    if (a.mintAuthorityDisabled && a.freezeAuthorityDisabled) return { kind: 'good', text: 'Mint renounced, no freeze, supply spread out. Looks clean to me.' };
    return null;
  }
  function updTip() {
    const box = $('#rudy-tip');
    if (!box) return;
    const r = safetyRead(sel());
    box.innerHTML = r ? `<div class="tip ${r.kind}">${rudy(r.kind === 'warn' ? 'worried' : 'happy', { blink: false })}<span>${esc(r.text)}</span></div>` : '';
  }

  // ----- ticket -----
  function updChips() {
    const box = $('#chips');
    if (!box) return;
    if (state.side === 'sell') {
      box.className = 'chips four';
      box.innerHTML = [25, 50, 75, 100].map((v) => `<button type="button" class="chip" data-act="pct" data-v="${v}" aria-pressed="${state.sellPct === v}">${v}%</button>`).join('');
    } else {
      box.className = 'chips';
      const vals = state.unit === 'sol' ? [0.1, 0.25, 0.5, 1] : [10, 25, 50, 100];
      box.innerHTML = vals.map((v) => `<button type="button" class="chip" data-act="chip" data-v="${v}">${state.unit === 'sol' ? v : '$' + v}</button>`).join('') + '<button type="button" class="chip" data-act="chip" data-v="max">Max</button>';
    }
  }
  function tokenBalanceUi(id) {
    if (!isLive()) return state.positions[id]?.qty || 0;
    return state.balances[id]?.ui || 0;
  }
  // The trade in USD, whatever unit the user typed in.
  function amountUsd() {
    const v = parseFloat(state.amount);
    if (!(v > 0)) return NaN;
    return state.side === 'buy' && state.unit === 'sol' ? v * solPrice() : v;
  }
  // Works out what the trade spends, in raw on-chain units.
  function swapParams() {
    const t = sel();
    if (!t) return { error: 'Pick a coin first.' };
    if (t.id === SOL_MINT) return { error: 'Pick a coin other than SOL. Trades here are coin ↔ SOL.' };
    const usd = amountUsd();
    if (state.side === 'buy') {
      if (!(usd > 0)) return { error: 'Enter an amount above zero.' };
      const sp = solPrice();
      if (!(sp > 0)) return { error: 'Waiting for the SOL price. Try again in a moment.' };
      const sol = state.unit === 'sol' ? parseFloat(state.amount) : usd / sp;
      const lamports = Math.floor(sol * 1e9);
      if (state.wallet && state.solBal != null && lamports / 1e9 > state.solBal - 0.002) {
        return { error: `Not enough SOL. You have ${state.solBal.toFixed(4)} SOL (${fmtUsd(state.solBal * sp)}) and need a little extra for fees.` };
      }
      return { inputMint: SOL_MINT, outputMint: t.id, amount: String(lamports), usd };
    }
    const bal = state.balances[t.id];
    if (!bal || !(bal.ui > 0)) return { error: `You don't hold any $${t.sym}.` };
    let raw;
    if (state.sellPct) raw = (BigInt(bal.raw) * BigInt(state.sellPct)) / 100n;
    else {
      if (!(usd > 0)) return { error: 'Enter an amount above zero.' };
      const ui = Math.min(usd / t.price, bal.ui);
      raw = BigInt(Math.floor(ui * 10 ** t.decimals));
      if (raw > BigInt(bal.raw)) raw = BigInt(bal.raw);
    }
    if (raw <= 0n) return { error: 'That amount is too small to sell.' };
    return { inputMint: t.id, outputMint: SOL_MINT, amount: raw.toString(), usd: (Number(raw) / 10 ** t.decimals) * t.price };
  }
  function impactOf(o) {
    if (o.priceImpact != null) return Math.abs(Number(o.priceImpact));
    return Math.abs(Number(o.priceImpactPct || 0) * 100);
  }
  async function fetchOrder(p, taker) {
    const q = new URLSearchParams({ inputMint: p.inputMint, outputMint: p.outputMint, amount: p.amount });
    if (taker) q.set('taker', taker);
    return http(`${JUP}/ultra/v1/order?${q}`);
  }
  let quoteTimer = null;
  function scheduleQuote() {
    clearTimeout(quoteTimer);
    state.quoteSeq++;
    state.quote = null;
    renderQuote();
    if (!isLive()) return;
    quoteTimer = setTimeout(getQuote, 450);
  }
  async function getQuote() {
    const p = swapParams();
    if (p.error) { renderQuote(); return; }
    const seq = ++state.quoteSeq;
    state.quote = { loading: true };
    renderQuote();
    try {
      const o = await fetchOrder(p, state.wallet);
      if (seq !== state.quoteSeq) return;
      state.quote = { o, p, at: Date.now() };
    } catch {
      if (seq !== state.quoteSeq) return;
      state.quote = { failed: true };
    }
    renderQuote();
  }
  function renderQuote() {
    const box = $('#quote');
    if (!box) return;
    const t = sel();
    const q = state.quote;
    if (!isLive() || !t || !q) { box.innerHTML = ''; return; }
    if (q.loading) { box.innerHTML = '<dt>Finding the best route…</dt><dd></dd>'; return; }
    if (q.failed) { box.innerHTML = '<dt class="down wide">Couldn’t get a price. Check your connection.</dt>'; return; }
    const { o } = q;
    const outSym = state.side === 'buy' ? t.sym : 'SOL';
    const outDec = state.side === 'buy' ? t.decimals : 9;
    const out = Number(o.outAmount || 0) / 10 ** outDec;
    const min = Number(o.otherAmountThreshold || o.outAmount || 0) / 10 ** outDec;
    const imp = impactOf(o);
    const fee = (o.feeBps ?? o.platformFee?.feeBps ?? 0) / 100;
    box.innerHTML = `
      <dt>You get about</dt><dd>${fmtQty(out)} ${esc(outSym)}</dd>
      <dt>At least</dt><dd>${fmtQty(min)} ${esc(outSym)}</dd>
      <dt>Price impact</dt><dd class="${imp > parseFloat(state.maxImpact) ? 'down' : ''}">${imp.toFixed(2)}%</dd>
      <dt>Fees</dt><dd>Ruckus 0% · Jupiter ${fee.toFixed(2)}%</dd>
      ${o.errorMessage ? `<dt class="down wide">${esc(o.errorMessage)}</dt>` : ''}`;
  }
  function updTicket() {
    const t = sel();
    const go = $('#ticket-go');
    if (!go) return;
    const sellSide = state.side === 'sell';
    const unit = sellSide ? 'usd' : state.unit;
    $('#amt-cur').textContent = unit === 'sol' ? '◎' : '$';
    const ub = $('#unit-btn');
    ub.hidden = sellSide;
    ub.textContent = unit === 'sol' ? 'SOL ⇄' : 'USD ⇄';
    const usd = amountUsd();
    const sp = solPrice();
    if (t && usd > 0 && t.price > 0) {
      $('#conv').textContent = `≈ ${fmtQty(usd / t.price)} ${t.sym}`;
      $('#conv2').textContent = unit === 'sol' ? fmtUsd(usd) : isFinite(sp) ? `${(usd / sp).toFixed(4)} SOL` : '';
    } else { $('#conv').textContent = 'Enter an amount'; $('#conv2').textContent = ''; }
    const verb = sellSide ? 'Sell' : 'Buy';
    $('#ticket-title').textContent = t ? `$${t.sym}` : 'Pick a coin';
    if (state.busy) go.textContent = state.busy;
    else if (isLive() && !state.wallet) go.textContent = 'Connect wallet to trade';
    else go.textContent = t ? `${verb} $${t.sym}` : verb;
    go.disabled = !!state.busy;
    go.classList.toggle('sell', sellSide);
    go.classList.toggle('buy', !sellSide);
    $('#reset-btn').hidden = isLive();
    $('#balance').innerHTML = balanceRows(t).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    updMood();
  }
  function balanceRows(t) {
    if (!isLive()) {
      let value = 0;
      for (const [id, p] of Object.entries(state.positions)) value += p.qty * (state.tok.get(id)?.price || 0);
      const pnl = state.cash + value - CONFIG.startingCash;
      const rows = [
        ['Paper cash', fmtUsd(state.cash)],
        ['In coins', fmtUsd(value)],
        ['P&L since start', `<span class="${cls(pnl)}">${fmtUsd(pnl)}</span>`],
      ];
      const pos = t && state.positions[t.id];
      if (pos?.qty > 0) rows.push([`Your $${esc(t.sym)}`, `${fmtQty(pos.qty)} · <span class="${cls(pos.qty * t.price - pos.cost)}">${fmtUsd(pos.qty * t.price)}</span>`]);
      return rows;
    }
    if (!state.wallet) return [['Wallet', '<button type="button" class="link-btn" data-act="connect">Connect to see it</button>']];
    const sp = solPrice();
    const rows = [['SOL', state.solBal == null ? '…' : `${state.solBal.toFixed(4)} · ${fmtUsd(state.solBal * sp)}`]];
    if (t && t.id !== SOL_MINT) {
      const ui = tokenBalanceUi(t.id);
      const val = ui * t.price;
      rows.push([`$${esc(t.sym)}`, ui > 0 ? `${fmtQty(ui)} · ${fmtUsd(val)}` : 'none']);
      const led = store.get(ledgerKey(), {})[t.id];
      if (led) {
        const pnl = val + led.sold - led.bought;
        rows.push(['P&L on Ruckus', `<span class="${cls(pnl)}">${fmtUsd(pnl)}</span>`]);
      }
    }
    return rows;
  }

  function currentMood() {
    if (state.mood && Date.now() < state.moodUntil) return state.mood;
    const t = sel();
    if (!t) return 'neutral';
    const s = safetyRead(t);
    if (s?.kind === 'warn') return 'worried';
    const r = t.chg5m || 0;
    return r > 0.01 ? 'happy' : r < -0.03 ? 'worried' : 'neutral';
  }
  function updMood() {
    const box = $('#ticket-rudy');
    if (!box) return;
    const mood = currentMood();
    if (box.dataset.mood !== mood) {
      box.dataset.mood = mood;
      box.innerHTML = rudy(mood, { track: true });
    }
  }
  function setMood(mood, ms = 2600) {
    state.mood = mood;
    state.moodUntil = Date.now() + ms;
    updMood();
  }
  function setBusy(msg) {
    state.busy = msg;
    updTicket();
  }

  // ----- executing trades -----
  let web3Promise = null;
  function loadWeb3() {
    if (window.solanaWeb3) return Promise.resolve(window.solanaWeb3);
    if (!web3Promise) {
      web3Promise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = CONFIG.web3Url;
        s.onload = () => (window.solanaWeb3 ? resolve(window.solanaWeb3) : reject(new UserError('Couldn’t start the Solana library. Reload the page and try again.')));
        s.onerror = () => { web3Promise = null; reject(new UserError('Couldn’t load the Solana library. Check your connection and try again.')); };
        document.head.appendChild(s);
      });
    }
    return web3Promise;
  }
  async function executeLive() {
    if (!state.wallet) { await connectWallet(); return; }
    const t = sel();
    const err = $('#ticket-err');
    err.textContent = '';
    const p = swapParams();
    if (p.error) { err.textContent = p.error; return; }
    const maxImp = parseFloat(state.maxImpact);
    if (!(maxImp > 0 && maxImp <= 50)) { err.textContent = 'Set max price impact between 0.1% and 50%.'; return; }
    const side = state.side;
    try {
      setBusy('Finding the best route…');
      const [o, web3] = await Promise.all([fetchOrder(p, state.wallet), loadWeb3()]);
      if (!o.transaction) throw new UserError(o.errorMessage || o.error || 'No route found for this trade. Try a smaller amount.');
      const imp = impactOf(o);
      if (imp > maxImp) throw new UserError(`This trade would move the price ${imp.toFixed(2)}%, above your ${maxImp}% limit. Trade less or raise the limit.`);
      setBusy('Confirm in your wallet…');
      const tx = web3.VersionedTransaction.deserialize(b64ToBytes(o.transaction));
      const signed = await state.provider.signTransaction(tx);
      setBusy('Sending…');
      const failed = (why) => new UserError(`The swap didn’t go through${why ? ': ' + why : ''}. Your coins didn’t move, apart from a possible network fee.`);
      let res;
      try {
        res = await http(`${JUP}/ultra/v1/execute`, {
          method: 'POST',
          body: { signedTransaction: bytesToB64(signed.serialize()), requestId: o.requestId },
          timeout: 60000,
        });
      } catch (e) {
        throw e.status ? failed(e.body?.error || e.body?.message) : e;
      }
      if (res.status !== 'Success') throw failed(res.error);
      const usd = Number(o.swapUsdValue || o.inUsdValue || p.usd || 0);
      ledgerAdd(t.id, side, usd);
      state.counts.trades++;
      save();
      syncAutoTasks();
      setMood(side === 'buy' ? 'cheer' : 'happy');
      toast(`${side === 'buy' ? 'Bought' : 'Sold'} ${fmtUsd(usd)} of $${esc(t.sym)}. <a href="${solscanTx(res.signature)}" target="_blank" rel="noopener">View on Solscan</a>`, side === 'buy' ? 'cheer' : 'happy');
      state.sellPct = null;
      loadBalances().then(() => { updTicket(); if (state.marketTab === 'holding') refreshList(); }).catch(() => {});
      setTimeout(() => pollSelected(true), 2500);
    } catch (e) {
      console.warn('Ruckus trade failed:', e);
      const msg = e instanceof UserError ? e.message
        : e?.code === 4001 || /reject|cancel|denied/i.test(String(e?.message)) ? 'You cancelled the trade in your wallet.'
        : 'Something went wrong sending the trade. Nothing was charged unless your wallet shows a transaction.';
      err.textContent = msg;
      setMood('worried');
    } finally {
      setBusy('');
      scheduleQuote();
    }
  }

  function executePaper() {
    const t = sel();
    const err = $('#ticket-err');
    err.textContent = '';
    let usd = amountUsd();
    const pos = state.positions[t.id] || { qty: 0, cost: 0 };
    if (state.side === 'sell' && state.sellPct) usd = pos.qty * t.price * (state.sellPct / 100);
    if (!(usd > 0)) { err.textContent = 'Enter an amount above zero.'; return; }
    const impact = usd / (t.mcap * 0.002) / 100;
    if (impact * 100 > parseFloat(state.maxImpact)) {
      err.textContent = `This trade would move the price ${(impact * 100).toFixed(1)}%, above your ${state.maxImpact}% limit.`;
      return;
    }
    let qty, spent;
    if (state.side === 'buy') {
      if (usd > state.cash + 1e-9) { err.textContent = `Not enough paper cash. You have ${fmtUsd(state.cash)}.`; return; }
      qty = usd / (t.price * (1 + impact));
      spent = usd;
      pos.qty += qty;
      pos.cost += usd;
      state.cash -= usd;
    } else {
      if (!(pos.qty > 0)) { err.textContent = `You don't hold any $${t.sym} yet.`; return; }
      const fill = t.price * (1 - impact);
      qty = Math.min(pos.qty, usd / fill);
      spent = qty * fill;
      pos.cost *= 1 - qty / pos.qty;
      pos.qty -= qty;
      state.cash += spent;
    }
    if (pos.qty * t.price < 0.01) delete state.positions[t.id];
    else state.positions[t.id] = pos;
    state.trades[t.id].unshift({ ts: Date.now(), side: state.side, usd: spent, qty, who: 'you', sig: null });
    state.counts.trades++;
    state.sellPct = null;
    save();
    syncAutoTasks();
    computeDemoLists();
    setMood(state.side === 'buy' ? 'cheer' : 'happy');
    toast(`${state.side === 'buy' ? 'Bought' : 'Sold'} ${fmtQty(qty)} $${esc(t.sym)} for ${fmtUsd(spent)} (paper).`, state.side === 'buy' ? 'cheer' : 'happy');
    refreshTrade(true);
  }

  function refreshTrade(forceList = false) {
    updMarkets(forceList);
    updToken();
    updCenter();
    updPeople();
    updTip();
    updTicket();
    drawChart();
  }

  // ---------- canvas charts ----------
  const css = () => getComputedStyle(document.documentElement);
  function fitCanvas(cv) {
    const box = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(box.width));
    const H = Math.max(1, Math.round(box.height));
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    return { g, W, H };
  }
  function drawCandles(cv, all, { timeFmt } = {}) {
    const { g, W, H } = fitCanvas(cv);
    const c = css();
    const col = (k) => c.getPropertyValue(k).trim();
    const mono = c.getPropertyValue('--font-mono');
    g.font = `11px ${mono}`;
    g.textBaseline = 'middle';
    if (!all || !all.length) {
      g.fillStyle = col('--muted');
      g.textAlign = 'center';
      g.fillText(all ? 'No chart data for this coin yet' : 'Loading chart…', W / 2, H / 2);
      g.textAlign = 'left';
      return;
    }
    const axisW = 86, padT = 16, padB = 22, volH = 48;
    const plotW = W - axisW;
    const plotH = H - padT - padB - volH;
    const n = Math.min(all.length, Math.max(24, Math.floor(plotW / 8)));
    const cs = all.slice(-n);
    let hi = -Infinity, lo = Infinity, vmax = 0;
    for (const k of cs) { hi = Math.max(hi, k.h); lo = Math.min(lo, k.l); vmax = Math.max(vmax, k.v); }
    const pad = (hi - lo) * 0.08 || hi * 0.01;
    hi += pad; lo -= pad;
    const y = (p) => padT + ((hi - p) / (hi - lo)) * plotH;
    const last = cs[cs.length - 1].c;
    const lastY = y(last);

    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const p = lo + ((hi - lo) * i) / 4;
      const yy = Math.round(y(p)) + 0.5;
      g.strokeStyle = col('--line');
      g.setLineDash([2, 4]);
      g.beginPath(); g.moveTo(0, yy); g.lineTo(plotW, yy); g.stroke();
      g.setLineDash([]);
      if (Math.abs(yy - lastY) < 16) continue; // the last-price tag sits here
      g.fillStyle = col('--muted');
      g.fillText(fmtPrice(p), plotW + 10, yy);
    }

    const step = plotW / n;
    const bw = Math.max(2, step * 0.6);
    const upC = col('--up'), dnC = col('--down');
    cs.forEach((k, i) => {
      const x = Math.round(i * step + step / 2) + 0.5;
      const color = k.c >= k.o ? upC : dnC;
      g.strokeStyle = color;
      g.fillStyle = color;
      g.beginPath(); g.moveTo(x, y(k.h)); g.lineTo(x, y(k.l)); g.stroke();
      const top = y(Math.max(k.o, k.c)), bot = y(Math.min(k.o, k.c));
      const h = Math.max(1, bot - top);
      if (g.roundRect) { g.beginPath(); g.roundRect(x - bw / 2, top, bw, h, Math.min(2, bw / 2)); g.fill(); }
      else g.fillRect(x - bw / 2, top, bw, h);
      if (vmax > 0) {
        const vh = (k.v / vmax) * (volH - 10);
        g.globalAlpha = 0.25;
        g.fillRect(x - bw / 2, H - padB - vh, bw, vh);
        g.globalAlpha = 1;
      }
    });

    const ly = Math.round(lastY) + 0.5;
    g.setLineDash([4, 4]);
    g.strokeStyle = col('--accent');
    g.beginPath(); g.moveTo(0, ly); g.lineTo(plotW, ly); g.stroke();
    g.setLineDash([]);
    const label = fmtPrice(last);
    const tw = Math.min(g.measureText(label).width + 14, axisW - 4);
    g.fillStyle = col('--accent');
    if (g.roundRect) { g.beginPath(); g.roundRect(plotW + 3, ly - 10, tw, 20, 6); g.fill(); }
    else g.fillRect(plotW + 3, ly - 10, tw, 20);
    g.fillStyle = col('--accent-ink');
    g.fillText(label, plotW + 10, ly);

    const fmt = timeFmt || ((t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    g.fillStyle = col('--muted');
    g.textAlign = 'center';
    const every = Math.max(1, Math.round(90 / step));
    for (let i = n - 1; i >= 4; i -= every) g.fillText(fmt(cs[i].t), i * step + step / 2, H - 8);
    g.textAlign = 'left';
  }
  function drawChart() {
    const cv = $('#chart');
    if (!cv) return;
    const t = sel();
    const tf = isLive() ? state.tf : '1m';
    drawCandles(cv, t ? state.candles[t.id + '|' + tf] : null);
  }
  function drawStatsChart() {
    const cv = $('#bars');
    if (!cv) return;
    const demo = !isLive() ? state.candles[(state.lists.top || [])[0] + '|1m'] : null;
    drawCandles(cv, isLive() ? state.candles[SOL_MINT + '|1d'] : demo, {
      timeFmt: isLive() ? (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined,
    });
  }

  // ---------- DEN ----------
  const SEED_POSTS = [
    { h: 'Rudy', m: 3, text: 'Welcome to The Den. Tag a coin like $SOL and it shows up right in your post.', likes: 12 },
    { h: 'Rudy', m: 40, text: 'Before you buy anything new, check the badges under the coin name: mint renounced, no freeze, and how much the top holders own.', likes: 31 },
  ];
  const startedAt = Date.now();
  function allPosts() {
    const seeded = SEED_POSTS.map((p, i) => ({ ...p, id: 's' + i, ts: startedAt - p.m * 60000 }));
    return [...state.myPosts, ...seeded].sort((a, b) => b.ts - a.ts);
  }
  function postEmbed(text) {
    const m = /\$([A-Za-z0-9]{2,10})\b/.exec(text);
    if (!m) return '';
    const id = symIndex().get(m[1].toUpperCase());
    const t = id && state.tok.get(id);
    if (!t) return '';
    return `<div class="embed" data-act="open" data-id="${esc(t.id)}">${coinBadge(t)}<div><b>$${esc(t.sym)}</b><span class="sub">${fmtCompact(t.mcap)} · ${fmtPrice(t.price)}</span></div>${sparkBox(t.id)}<span class="num ${cls(t.chg24)}">${fmtPct(t.chg24)}</span></div>`;
  }
  function postHtml(p) {
    const isRudy = p.h === 'Rudy';
    const liked = state.liked.has(p.id);
    const av = isRudy
      ? `<span class="avatar rudy-av" aria-hidden="true">${rudy('happy', { blink: false })}</span>`
      : `<span class="avatar" style="background:${state.wallet ? colorFor(state.wallet) : '#c5ccd6'}" aria-hidden="true">ME</span>`;
    const name = isRudy ? 'Rudy' : 'You';
    const handle = isRudy ? '@ruckus' : state.wallet ? shortAddr(state.wallet) : '@you';
    return `<article class="post">${av}<div>
      <div class="post-meta"><b>${esc(name)}</b><span>${esc(handle)}</span><span>· ${fmtAgo((Date.now() - p.ts) / 1000)}</span></div>
      <p>${tickerLinks(p.text)}</p>${postEmbed(p.text)}
      <div class="post-actions"><button type="button" data-act="like" data-id="${p.id}" aria-pressed="${liked}">♥ <span>${p.likes + (liked ? 1 : 0)}</span></button></div>
    </div></article>`;
  }
  function viewDen() {
    return `<div class="desk">
      <div class="col-left stack">
        <section class="card"><div class="card-head"><h3>Following</h3><span class="label" id="follow-count"></span></div><ul class="people" id="den-follows"></ul></section>
        <section class="card"><div class="card-head"><h3>Wallets buying now</h3></div><ul class="people" id="den-buyers"></ul></section>
      </div>
      <div class="col-center">
        <section class="card">
          <form class="composer" id="compose">
            <span class="avatar" style="background:${state.wallet ? colorFor(state.wallet) : 'var(--panel-2)'}" aria-hidden="true">ME</span>
            <div>
              <label class="sr-only" for="compose-text">Post to The Den</label>
              <textarea id="compose-text" maxlength="280" placeholder="What are you watching tonight? Tag a coin like $SOL"></textarea>
              <div class="foot"><span class="hint" id="compose-count">280 left · posts stay on this device for now</span><button class="btn btn-primary btn-sm" type="submit">Post</button></div>
            </div>
          </form>
          <div id="feed">${allPosts().map(postHtml).join('')}</div>
        </section>
      </div>
      <div class="col-right stack">
        <section class="card"><div class="card-head"><h3>Your positions</h3><a class="link-btn" href="#wallet">Wallet</a></div><div class="card-body" id="den-pos"></div></section>
        <section class="card"><div class="card-head"><h3>Biggest moves this hour</h3></div><ul class="market-list" id="den-movers"></ul></section>
      </div>
    </div>`;
  }
  function updDen() {
    if (state.route !== 'den') return;
    const follows = [...state.following];
    $('#follow-count').textContent = follows.length;
    $('#den-follows').innerHTML = follows.length
      ? follows.map((a) => `<li class="person">${walletAvatar(a)}<div><b>${walletLink(a)}</b><span>Their trades get a ★ on coin pages</span></div>${followBtn(a)}</li>`).join('')
      : `<li class="empty">${rudy('neutral')}<b>Your circle is empty.</b>Follow wallets from any coin page.</li>`;
    const t = featured();
    $('#den-buyers').innerHTML = t ? buyersHtml(t, 5) : '';
    $('#den-movers').innerHTML = moversHtml(5);
    const pos = $('#den-pos');
    if (!isLive()) {
      const n = Object.keys(state.positions).length;
      pos.innerHTML = `<div class="mono" style="font-size:1.6rem;font-weight:600">${fmtUsd(state.cash)}</div><div class="hint">paper cash · ${n} open position${n === 1 ? '' : 's'}</div>`;
    } else if (!state.wallet) {
      pos.innerHTML = '<p class="hint" style="margin:0 0 10px">Connect a wallet to see your positions.</p><button class="btn btn-sm btn-primary" type="button" data-act="connect">Connect</button>';
    } else {
      const ids = Object.keys(state.balances).filter((m) => state.tok.has(m));
      const total = (state.solBal || 0) * solPrice() + ids.reduce((s, m) => s + holdingValue(m), 0);
      pos.innerHTML = `<div class="mono" style="font-size:1.6rem;font-weight:600">${fmtUsd(total)}</div><div class="hint">${ids.length} coins + ${(state.solBal || 0).toFixed(3)} SOL</div>`;
    }
    hydrateSparks(view);
  }
  function moversHtml(n = 5) {
    const movers = listTokens('hot').filter((t) => t.id !== SOL_MINT).sort((a, b) => b.chg1h - a.chg1h).slice(0, n);
    if (!movers.length) return loadingBlock();
    return movers.map((t) => `<li class="market-row" role="button" tabindex="0" data-act="open" data-id="${esc(t.id)}">${coinBadge(t)}<div class="who"><b>${esc(t.sym)}</b><span>${esc(t.name)}</span></div>${sparkBox(t.id, 'mini-spark')}<div class="figs"><div class="num">${fmtCompact(t.mcap)}</div><div class="num ${cls(t.chg1h)}">${fmtPct(t.chg1h)}</div></div><span></span></li>`).join('');
  }

  // ---------- WALLET ----------
  function viewWallet() {
    return `<div class="wrap"><div id="wallet-page">${loadingBlock('Opening the wallet…')}</div></div>`;
  }
  async function mountWallet() {
    const addr = state.viewWallet || state.wallet;
    const box = $('#wallet-page');
    if (!addr) {
      box.innerHTML = isLive()
        ? `<section class="card"><div class="empty" style="padding:48px 16px">${rudy('happy', { track: true })}<b>Connect your wallet to see what you hold.</b><span>Your balances, their value right now, and your P&L on coins traded here.</span><button class="btn btn-primary btn-lg" type="button" data-act="connect" style="margin-top:10px">Connect wallet</button></div></section>${walletLinksHtml()}`
        : demoWalletHtml();
      return;
    }
    if (!isLive()) { box.innerHTML = demoWalletHtml(); return; }
    renderWallet(addr);
    try {
      if (addr === state.wallet) await loadBalances(); else await loadWalletData(addr);
    } catch {
      if ((state.viewWallet || state.wallet) === addr) box.innerHTML = `<section class="card"><div class="empty">${rudy('worried')}<b>Couldn’t load this wallet.</b>Check the address and try again.</div></section>`;
      return;
    }
    if ((state.viewWallet || state.wallet) === addr && state.route === 'wallet') renderWallet(addr);
  }
  function renderWallet(addr) {
    const box = $('#wallet-page');
    if (!box) return;
    const own = addr === state.wallet;
    const d = own ? { sol: state.solBal, bal: state.balances } : state.walletData[addr];
    const sp = solPrice();
    const rows = d ? Object.entries(d.bal).filter(([m, b]) => b.ui > 0 && state.tok.has(m)).map(([m, b]) => ({ t: state.tok.get(m), ui: b.ui, val: b.ui * state.tok.get(m).price })).sort((a, b) => b.val - a.val) : [];
    const total = d ? (d.sol || 0) * sp + rows.reduce((s, r) => s + r.val, 0) : NaN;
    const led = own ? store.get(ledgerKey(addr), {}) : {};
    box.innerHTML = `
      <section class="card wallet-hero">
        ${rudy(total > 0 ? 'happy' : 'neutral', { track: true })}
        <div>
          <div class="label">${own ? 'Your wallet' : 'Wallet'}</div>
          <h1>${d ? fmtUsd(total) : '…'}</h1>
          <div class="sub"><span class="mono">${esc(shortAddr(addr))}</span><button class="link-btn" type="button" data-act="copy-addr" data-a="${esc(addr)}">Copy</button><a href="${solscanAcct(addr)}" target="_blank" rel="noopener">Solscan ↗</a>${d ? `<span>${(d.sol || 0).toFixed(4)} SOL · ${rows.length} coins</span>` : ''}</div>
        </div>
        <div>${own ? '<button class="btn" type="button" data-act="disconnect">Disconnect</button>' : followBtn(addr)}</div>
      </section>
      <section class="card gap-top">
        <div class="card-head"><h3>Holdings</h3><span class="label">${d ? 'value now' : ''}</span></div>
        ${!d ? `<div class="card-body">${skelRows(4)}</div>` : rows.length ? `<div class="table-scroll"><table class="hold-table"><thead><tr><th>Coin</th><th>Amount</th><th>Price</th><th>Value</th><th>24h</th>${own ? '<th>P&amp;L on Ruckus</th>' : ''}</tr></thead><tbody>
          ${rows.map((r) => {
            const l = led[r.t.id];
            const pnl = l ? r.val + l.sold - l.bought : null;
            return `<tr data-act="open" data-id="${esc(r.t.id)}"><td><div class="tok-cell">${coinBadge(r.t)}<div><b>${esc(r.t.sym)}</b><span>${esc(r.t.name)}</span></div></div></td><td>${fmtQty(r.ui)}</td><td>${fmtPrice(r.t.price)}</td><td>${fmtUsd(r.val)}</td><td class="${cls(r.t.chg24)}">${fmtPct(r.t.chg24)}</td>${own ? `<td class="${pnl == null ? '' : cls(pnl)}">${pnl == null ? '–' : fmtUsd(pnl)}</td>` : ''}</tr>`;
          }).join('')}</tbody></table></div>` : `<div class="empty">${rudy('neutral')}<b>No coins here yet.</b>${own ? 'Buy one on the Trade page.' : ''}</div>`}
      </section>
      ${own ? walletLinksHtml() : ''}`;
  }
  function walletLinksHtml() {
    return `<div class="grid-tiles gap-top">
      <a class="card tile" href="#rewards" style="text-decoration:none;color:inherit"><div class="label">Rewards</div><div class="val">${crumbsTotal().toLocaleString('en-US')}</div><div class="sub">crumbs · invite friends</div></a>
      <a class="card tile" href="#rewards" style="text-decoration:none;color:inherit"><div class="label">Tasks</div><div class="val">${Object.values(state.tasksDone).filter(Boolean).length} / ${TASKS.length}</div><div class="sub">done</div></a>
      <a class="card tile" href="#den" style="text-decoration:none;color:inherit"><div class="label">Following</div><div class="val">${state.following.size}</div><div class="sub">wallets</div></a>
      <a class="card tile" href="#pulse" style="text-decoration:none;color:inherit"><div class="label">Market pulse</div><div class="val">${isFinite(state.majors.SOL.p) ? fmtUsd(state.majors.SOL.p) : '–'}</div><div class="sub">SOL price</div></a>
    </div>`;
  }
  function demoWalletHtml() {
    let value = 0;
    const rows = Object.entries(state.positions).map(([id, p]) => { const t = state.tok.get(id); const v = p.qty * t.price; value += v; return { t, p, v }; });
    return `<section class="card wallet-hero">${rudy('happy', { track: true })}<div><div class="label">Paper wallet</div><h1>${fmtUsd(state.cash + value)}</h1><div class="sub">${fmtUsd(state.cash)} cash · ${rows.length} coins · demo mode</div></div><div></div></section>
      <section class="card gap-top"><div class="card-head"><h3>Holdings</h3></div>${rows.length ? `<div class="table-scroll"><table class="hold-table"><thead><tr><th>Coin</th><th>Amount</th><th>Value</th><th>P&amp;L</th></tr></thead><tbody>${rows.map((r) => `<tr data-act="open" data-id="${esc(r.t.id)}"><td><div class="tok-cell">${coinBadge(r.t)}<div><b>${esc(r.t.sym)}</b><span>${esc(r.t.name)}</span></div></div></td><td>${fmtQty(r.p.qty)}</td><td>${fmtUsd(r.v)}</td><td class="${cls(r.v - r.p.cost)}">${fmtUsd(r.v - r.p.cost)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">${rudy('neutral')}<b>No coins yet.</b>Buy one on the Trade page.</div>`}</section>${walletLinksHtml()}`;
  }

  // ---------- LAUNCH ----------
  function viewLaunch() {
    const note = isLive()
      ? 'Every coin starts on a bonding curve paired with SOL. On-chain launches switch on once the launch server is connected. Until then, this page saves your coin as a draft.'
      : 'Every coin starts on a bonding curve paired with SOL. In demo mode the coin lives in your browser only.';
    return `<div class="wrap">
    <div class="page-head"><div><h1>Launch a coin</h1><p>${note}</p></div></div>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h3>What does your coin trade against?</h3></div>
        <div class="card-body"><div class="kind-pick">
          <button class="kind" type="button" aria-pressed="true"><b>Regular coin</b><span>Paired with SOL on a bonding curve</span></button>
          <button class="kind" type="button" disabled><b>Stock-paired</b><span>Paired with a tokenized stock · coming soon</span></button>
        </div></div>
        <form class="form-grid" id="launch-form" novalidate style="padding-top:4px">
          <div class="two">
            <div class="field"><label for="l-name">Coin name</label><input class="input" id="l-name" maxlength="32" placeholder="Bin Lid" autocomplete="off"><div class="err" id="e-name"></div></div>
            <div class="field"><label for="l-sym">Ticker</label><input class="input mono" id="l-sym" maxlength="10" placeholder="BINLID" autocomplete="off"><div class="err" id="e-sym"></div></div>
          </div>
          <div class="field"><label for="l-desc">Description</label><textarea class="input" id="l-desc" maxlength="280" rows="3" placeholder="One or two lines on why this coin exists."></textarea><div class="hint" id="l-desc-count">280 characters left</div></div>
          <div class="field"><span class="lbl">Image</span>
            <label class="drop" id="l-drop" for="l-img"><span id="l-thumb">${coinBadge({ sym: '??', color: '#c5ccd6' }, 'lg')}</span><span><b>Choose an image</b><br><span class="hint">PNG, JPG or GIF up to 2 MB. Square works best.</span></span></label>
            <input id="l-img" type="file" accept="image/*" hidden><div class="err" id="e-img"></div>
          </div>
          <div class="field"><label for="l-buy">Your first buy (SOL, optional)</label><input class="input mono" id="l-buy" inputmode="decimal" placeholder="0.5" autocomplete="off"><div class="hint">Buying first protects you from being front-run at launch.</div><div class="err" id="e-buy"></div></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">${isLive() ? 'Save draft' : 'Launch demo coin'}</button>
        </form>
      </section>
      <div class="stack">
        <section class="card preview-card" aria-label="Preview">
          <span class="label">Preview</span>
          <div class="row"><span id="p-badge">${coinBadge({ sym: '??', color: '#ffb38a' }, 'lg')}</span><div><h3 id="p-name">Your coin</h3><span class="mono muted" id="p-sym">$TICKER</span></div></div>
          <p id="p-desc">Your description shows up here.</p>
          <div><div class="fee-line"><span>Bonding curve</span><span class="mono" id="p-curve-pct">0%</span></div><div class="curve"><i id="p-curve" style="width:0%"></i></div></div>
          <div class="fee-line"><span>Starting market cap</span><span class="mono" id="p-mc">$4.2K</span></div>
        </section>
        <section class="card rudy-note">${rudy('happy', { track: true })}<div><b>Rudy’s launch checklist</b><p>Pick a ticker people can say out loud. Write a description a stranger understands. Never promise returns.</p></div></section>
      </div>
    </div></div>`;
  }
  const LAUNCH_MC = 4200;
  const CURVE_SOL = 85;
  function launchPreview() {
    if (!$('#l-name')) return;
    const name = $('#l-name').value.trim();
    const sym = $('#l-sym').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if ($('#l-sym').value !== sym) $('#l-sym').value = sym;
    const desc = $('#l-desc').value;
    const buy = Math.max(0, parseFloat($('#l-buy').value) || 0);
    $('#p-name').textContent = name || 'Your coin';
    $('#p-sym').textContent = '$' + (sym || 'TICKER');
    $('#p-desc').textContent = desc.trim() || 'Your description shows up here.';
    $('#l-desc-count').textContent = `${280 - desc.length} characters left`;
    const pct = Math.min(1, buy / CURVE_SOL);
    $('#p-curve').style.width = (pct * 100).toFixed(1) + '%';
    $('#p-curve-pct').textContent = (pct * 100).toFixed(1) + '%';
    $('#p-mc').textContent = fmtCompact(LAUNCH_MC + buy * (solPrice() || 0));
    $('#p-badge').innerHTML = coinBadge({ sym: sym || '??', color: '#ffb38a', icon: state.launchImg }, 'lg');
  }
  function submitLaunch(e) {
    e.preventDefault();
    const name = $('#l-name').value.trim();
    const sym = $('#l-sym').value.trim().toUpperCase();
    const desc = $('#l-desc').value.trim();
    const buyRaw = $('#l-buy').value.trim();
    const buy = buyRaw ? parseFloat(buyRaw) : 0;
    let ok = true;
    const setErr = (id, msg) => { $(id).textContent = msg; if (msg) ok = false; };
    const taken = !isLive() && state.tok.has(sym);
    setErr('#e-name', name.length < 2 ? 'Give the coin a name of at least 2 characters.' : '');
    setErr('#e-sym', !/^[A-Z0-9]{2,10}$/.test(sym) ? 'Use 2–10 letters or numbers for the ticker.' : taken ? `$${sym} already exists. Pick another ticker.` : '');
    setErr('#e-buy', buyRaw && !(buy >= 0 && buy <= 50) ? 'Enter a first buy between 0 and 50 SOL.' : '');
    if (!ok) { $('#launch-form .err:not(:empty)')?.previousElementSibling?.focus(); return; }
    state.counts.launch++;
    if (isLive()) {
      store.set('launchDraft', { name, sym, desc, buy, img: state.launchImg, savedAt: Date.now() });
      save();
      syncAutoTasks();
      toast(`Draft for $${esc(sym)} saved on this device. It goes on-chain once launches are switched on.`, 'happy');
      return;
    }
    const usdIn = buy * solPrice();
    const price = (LAUNCH_MC + usdIn) / SUPPLY;
    const t = makeDemoToken([sym, name, price, 0.018, 0, 1, 0], { icon: state.launchImg });
    const cs = state.candles[t.id + '|1m'];
    state.candles[t.id + '|1m'] = cs.slice(-3).map((k) => ({ t: k.t, o: price, h: price, l: price, c: price, v: 1 }));
    state.trades[t.id] = [];
    t.vol24 = usdIn;
    if (usdIn > 0) {
      const qty = usdIn / price;
      state.trades[t.id].push({ ts: Date.now(), side: 'buy', usd: usdIn, qty, who: 'you', sig: null });
      state.positions[sym] = { qty, cost: usdIn };
    }
    state.selected = sym;
    state.marketTab = 'new';
    state.launchImg = null;
    computeDemoLists();
    save();
    syncAutoTasks();
    toast(`$${esc(sym)} is live in this demo. It disappears when you close the tab.`, 'cheer');
    location.hash = 'trade';
  }
  function readLaunchImage(file) {
    const err = $('#e-img');
    err.textContent = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { err.textContent = 'That file isn’t an image. Choose a PNG, JPG or GIF.'; return; }
    if (file.size > 2 * 1024 * 1024) { err.textContent = 'That image is over 2 MB. Choose a smaller one.'; return; }
    const r = new FileReader();
    r.onload = () => {
      state.launchImg = r.result;
      $('#l-thumb').innerHTML = coinBadge({ sym: '', color: '#c5ccd6', icon: r.result }, 'lg');
      launchPreview();
    };
    r.readAsDataURL(file);
  }

  // ---------- REWARDS (+ tasks) ----------
  const TASKS = [
    { id: 'follow', t: 'Follow Ruckus on X', d: 'Open X, follow the account, then mark this done.', crumbs: 50 },
    { id: 'share', t: 'Share a trade', d: 'Post a screenshot of a trade from Ruckus on X.', crumbs: 120 },
    { id: 'trades', t: 'Make 3 trades', d: 'Counted automatically on this device.', crumbs: 80, auto: 'trades', goal: 3 },
    { id: 'watch', t: 'Watch 5 coins', d: 'Star coins anywhere in Ruckus. Counted automatically.', crumbs: 40, auto: 'watch', goal: 5 },
    { id: 'launch', t: 'Draft a coin', d: 'Use the Launch page. Counted automatically.', crumbs: 150, auto: 'launch', goal: 1 },
    { id: 'post', t: 'Post in The Den', d: 'Say hi to the other night owls.', crumbs: 30, auto: 'post', goal: 1 },
  ];
  function taskProgress(task) {
    if (!task.auto) return null;
    const have = task.auto === 'watch' ? state.watch.size : state.counts[task.auto] || 0;
    return Math.min(have, task.goal);
  }
  function syncAutoTasks() {
    let changed = false;
    for (const task of TASKS) {
      if (task.auto && !state.tasksDone[task.id] && taskProgress(task) >= task.goal) {
        state.tasksDone[task.id] = true;
        changed = true;
        toast(`Task done: ${esc(task.t)}. +${task.crumbs} crumbs.`, 'cheer');
      }
    }
    if (changed) save();
  }
  function refLink() {
    const base = CONFIG.refBase || location.href.split('#')[0];
    return base + '#ref-' + state.refCode;
  }
  function viewRewards() {
    const done = Object.values(state.tasksDone).filter(Boolean).length;
    return `<div class="wrap">
    <div class="page-head"><div><h1>Rewards</h1><p>Earn crumbs for bringing friends and finishing tasks. Crumbs rank you on the leaderboard. They are points, not money.</p></div></div>
    <div class="grid-tiles">
      <div class="card tile"><div class="label">Your crumbs</div><div class="val">${crumbsTotal().toLocaleString('en-US')}</div><div class="sub">saved on this device</div></div>
      <div class="card tile"><div class="label">Friends joined</div><div class="val">0</div><div class="sub">share your link to start</div></div>
      <div class="card tile"><div class="label">Your code</div><div class="val">${state.refCode}</div><div class="sub">works on any page</div></div>
      <div class="card tile"><div class="label">Tasks done</div><div class="val">${done} / ${TASKS.length}</div><div class="sub">${Math.round((done / TASKS.length) * 100)}% complete</div></div>
    </div>
    <div class="grid-2 gap-top">
      <section class="card">
        <div class="card-head"><h3>Tasks</h3><span class="crumbs">${crumbsTotal().toLocaleString('en-US')} crumbs</span></div>
        <div class="card-body"><div class="progress"><i style="width:${(done / TASKS.length) * 100}%"></i></div></div>
        ${TASKS.map((task) => {
          const isDone = !!state.tasksDone[task.id];
          let actions;
          if (isDone) actions = '<span class="done-pill">Done</span>';
          else if (task.auto) actions = `<span class="mono muted">${taskProgress(task)} / ${task.goal}</span>`;
          else actions = `<a class="btn btn-sm" href="${CONFIG.xUrl}" target="_blank" rel="noopener">Open X</a><button class="btn btn-sm btn-soft" type="button" data-act="task-done" data-id="${task.id}">Mark done</button>`;
          return `<div class="task"><div><b>${esc(task.t)}</b><span>${esc(task.d)}</span></div><div class="task-actions"><span class="crumbs">+${task.crumbs}</span>${actions}</div></div>`;
        }).join('')}
      </section>
      <div class="stack">
        <section class="card"><div class="card-head"><h3>Your invite link</h3></div><div class="card-body stack">
          <div class="ref-box"><input class="input" id="ref-link" readonly value="${esc(refLink())}" aria-label="Your invite link"><button class="btn btn-primary" type="button" data-act="copy-ref">Copy</button></div>
          <ol class="steps">
            <li><div><b>Share your link</b><span>Send it to a friend or post it on X.</span></div></li>
            <li><div><b>They make their first trade</b><span>Any trade on Ruckus counts.</span></div></li>
            <li><div><b>You both get 200 crumbs</b><span>Counted once the rewards server goes live.</span></div></li>
          </ol>
        </div></section>
        <section class="card rudy-note">${rudy('cheer', { track: true })}<div><b>Leaderboard opens soon</b><p>Weekly ranking by crumbs and trading volume. Your crumbs so far are saved on this device.</p></div></section>
      </div>
    </div></div>`;
  }

  // ---------- PULSE ----------
  function viewPulse() {
    return `<div class="wrap">
    <div class="page-head"><div><h1>Market pulse</h1><p>What the Solana coin market is doing right now.</p></div></div>
    <div class="grid-tiles" id="stat-tiles"></div>
    <div class="grid-2 gap-top">
      <section class="card"><div class="card-head"><h3>${isLive() ? 'SOL price' : 'Top coin'}</h3><span class="label">${isLive() ? 'Daily candles' : 'Demo'}</span></div><div class="bars-box"><canvas id="bars" role="img" aria-label="Price candles"></canvas></div></section>
      <section class="card"><div class="card-head"><h3>Biggest moves this hour</h3><span class="label">Trending</span></div><ul class="market-list" id="movers"></ul></section>
    </div></div>`;
  }
  function updStats() {
    const tiles = $('#stat-tiles');
    if (!tiles) return;
    const hot = listTokens('hot');
    const fresh = listTokens('new').filter((t) => t.born && Date.now() - t.born < 3600000);
    const vol = hot.reduce((s, t) => s + t.vol24, 0);
    const moves = hot.map((t) => t.chg1h).sort((a, b) => a - b);
    const mid = moves.length ? moves[Math.floor(moves.length / 2)] : 0;
    const sol = state.majors.SOL;
    tiles.innerHTML = [
      ['SOL', isFinite(sol.p) ? fmtUsd(sol.p) : '–', `<span class="${cls(sol.c)}">${fmtPct(sol.c)}</span> 24h`],
      ['Trending volume', fmtCompact(vol), `24h, across ${hot.length} trending coins`],
      ['New coins', String(fresh.length), 'launched in the last hour'],
      ['Trending mood', `<span class="${cls(mid)}">${fmtPct(mid)}</span>`, 'median 1h move'],
    ].map(([k, v, s]) => `<div class="card tile"><div class="label">${k}</div><div class="val">${v}</div><div class="sub">${s}</div></div>`).join('');
    $('#movers').innerHTML = moversHtml(7);
    hydrateSparks(view);
  }

  // ---------- global search ----------
  let gsTimer = null, gsItems = [], gsIndex = -1;
  function gsRender(q, tokens) {
    const box = $('#gs-results');
    gsItems = [];
    let html = '';
    if (ADDR_RE.test(q)) {
      gsItems.push({ kind: 'wallet', id: q });
      html += `<a class="gs-row" href="#w-${esc(q)}" role="option"><span class="avatar" style="background:${colorFor(q)}" aria-hidden="true">${esc(q.slice(0, 2))}</span><div><b>View wallet</b><span class="sub">${esc(shortAddr(q))}</span></div><span class="label">wallet</span></a>`;
    }
    for (const t of tokens.slice(0, 8)) {
      gsItems.push({ kind: 'coin', id: t.id });
      html += `<a class="gs-row" href="#c-${esc(t.id)}" role="option">${coinBadge(t)}<div><b>${esc(t.sym)} ${t.verified ? '<span class="badge ok">✓</span>' : ''}</b><span class="sub">${esc(t.name)} · ${fmtCompact(t.mcap)}</span></div><span class="num ${cls(t.chg24)}">${fmtPct(t.chg24)}</span></a>`;
    }
    box.innerHTML = html || `<div class="gs-empty">No coins found for “${esc(q)}”. Try a ticker, a name or paste a mint address.</div>`;
    box.hidden = false;
    gsIndex = -1;
  }
  function gsSearch(q) {
    clearTimeout(gsTimer);
    q = q.trim();
    if (!q) { $('#gs-results').hidden = true; return; }
    const local = [...state.tok.values()].filter((t) => t.sym.toLowerCase().includes(q.toLowerCase()) || t.name.toLowerCase().includes(q.toLowerCase()) || t.id === q);
    gsRender(q, local);
    if (!isLive()) return;
    gsTimer = setTimeout(async () => {
      try {
        const ids = upsert(await http(`${JUP}/tokens/v2/search?query=${encodeURIComponent(q)}`));
        if ($('#gs-input').value.trim() === q) gsRender(q, ids.map((id) => state.tok.get(id)));
      } catch { /* keep local results */ }
    }, 250);
  }
  function gsClose() {
    $('#gs-results').hidden = true;
    $('#gsearch').classList.remove('open');
  }
  $('#gs-input').addEventListener('input', (e) => gsSearch(e.target.value));
  $('#gs-input').addEventListener('focus', (e) => { if (e.target.value.trim()) gsSearch(e.target.value); });
  $('#gs-input').addEventListener('keydown', (e) => {
    const rows = $$('#gs-results .gs-row');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      gsIndex = (gsIndex + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows.forEach((r, i) => r.setAttribute('aria-selected', String(i === gsIndex)));
    } else if (e.key === 'Enter') {
      const r = rows[Math.max(0, gsIndex)];
      if (r) { location.hash = r.getAttribute('href').slice(1); gsClose(); e.target.blur(); }
    } else if (e.key === 'Escape') { gsClose(); e.target.blur(); }
  });
  $('#gs-results').addEventListener('click', () => { gsClose(); $('#gs-input').value = ''; });
  document.addEventListener('click', (e) => { if (!e.target.closest('#gsearch') && !e.target.closest('#search-btn')) gsClose(); });
  $('#search-btn').addEventListener('click', () => { $('#gsearch').classList.add('open'); $('#gs-input').focus(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea')) { e.preventDefault(); $('#gsearch').classList.add('open'); $('#gs-input').focus(); }
  });

  // ---------- polling ----------
  const inflight = new Set();
  async function once(key, fn) {
    if (inflight.has(key)) return;
    inflight.add(key);
    try { await fn(); } catch { /* transient: try next round */ } finally { inflight.delete(key); }
  }
  const due = (key, ms) => {
    if (Date.now() - (state.last[key] || 0) < ms) return false;
    state.last[key] = Date.now();
    return true;
  };
  async function refreshList(tab = state.marketTab) {
    await once('list:' + tab, () => loadList(tab));
    if (state.route === 'trade') updMarkets();
    if (state.route === 'coins') renderCoins();
  }
  async function pollSelected(force = false) {
    const t = sel();
    if (!t || !isLive()) return;
    const id = t.id;
    const tf = state.tf;
    const jobs = [];
    if (force || due('tok:' + id, 10000)) jobs.push(once('tok:' + id, () => loadMints([id])));
    if (force || due('tx:' + id, 6000)) jobs.push(once('tx:' + id, () => loadTrades(id)));
    if (force || due('c:' + id + tf, tf === '1m' ? 30000 : 60000)) jobs.push(once('c:' + id + tf, () => loadCandles(id, tf)));
    await Promise.all(jobs);
    const cs = state.candles[id + '|' + tf];
    if (cs?.length && t.price) {
      const k = cs[cs.length - 1];
      k.c = t.price;
      k.h = Math.max(k.h, t.price);
      k.l = Math.min(k.l, t.price);
    }
    if (state.route === 'trade' && sel()?.id === id) refreshTrade();
  }
  async function pollHome(force = false) {
    if (force || due('hot', 20000)) await once('list:hot', () => loadList('hot'));
    if (force || due('new', 60000)) once('list:new', () => loadList('new'));
    const t = featured();
    if (t && (force || due('htx', 8000))) await once('tx:' + t.id, () => loadTrades(t.id));
    updHome();
  }
  async function liveLoop() {
    if (document.hidden || !isLive()) return;
    if (state.route === 'home') pollHome();
    if (state.route === 'trade' && due('list', 20000)) refreshList();
    if (state.route === 'coins' && due('clist', 30000)) {
      const need = state.coinSort === 'mcap' || state.coinSort === 'gainers' ? ['hot', 'top', 'new'] : [state.coinSort];
      await Promise.all(need.map((k) => once('list:' + k, () => loadList(k))));
      renderCoins();
    }
    if ((state.route === 'pulse' || state.route === 'den') && due('hot2', 30000)) {
      await Promise.all([once('list:hot', () => loadList('hot')), once('list:new', () => loadList('new'))]);
      const f = featured();
      if (state.route === 'den' && f) await once('tx:' + f.id, () => loadTrades(f.id));
      if (state.route === 'pulse') updStats();
      if (state.route === 'den') updDen();
    }
    if (due('majors', 30000)) once('majors', loadMajors);
    if (state.wallet && due('bal', 30000)) once('bal', loadBalances).then(() => { if (state.route === 'trade') updTicket(); });
    if (state.route === 'trade') pollSelected();
  }

  // ---------- router ----------
  const ROUTES = { home: viewHome, trade: viewTrade, coins: viewCoins, den: viewDen, launch: viewLaunch, wallet: viewWallet, rewards: viewRewards, pulse: viewPulse };
  const MOUNT = {
    home: () => { if (isLive()) pollHome(true); else updHome(); },
    trade: () => { updChips(); refreshTrade(true); observe('#chart', drawChart); scheduleQuote(); pollSelected(true); if (isLive() && !state.lists[state.marketTab]) refreshList(); },
    coins: () => {
      renderCoins();
      if (isLive()) {
        const need = state.coinSort === 'mcap' || state.coinSort === 'gainers' ? ['hot', 'top', 'new'] : [state.coinSort];
        Promise.all(need.map((k) => once('list:' + k, () => loadList(k)))).then(renderCoins);
      }
    },
    den: () => {
      updDen();
      if (isLive()) {
        Promise.all([once('list:hot', () => loadList('hot'))]).then(async () => {
          const f = featured();
          if (f) await once('tx:' + f.id, () => loadTrades(f.id));
          updDen();
        });
      }
    },
    wallet: mountWallet,
    launch: launchPreview,
    pulse: () => {
      updStats();
      drawStatsChart();
      observe('#bars', drawStatsChart);
      if (isLive()) {
        once('solday', async () => {
          const d = await http(`${DATA}/v2/charts/${SOL_MINT}?interval=1_DAY&to=${Date.now()}&candles=45&type=price&quote=usd`);
          state.candles[SOL_MINT + '|1d'] = (d.candles || []).map((c) => ({ t: c.time * 1000, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume || 0 }));
          drawStatsChart();
        });
        Promise.all([refreshList('hot'), refreshList('new')]).then(updStats);
      }
    },
  };
  let ro = null;
  function observe(selector, fn) {
    if (ro) ro.disconnect();
    if (!('ResizeObserver' in window)) return;
    ro = new ResizeObserver(() => fn());
    const el = $(selector);
    if (el) ro.observe(el);
  }
  async function route() {
    let h = location.hash.slice(1);
    if (h.startsWith('ref-')) {
      store.set('referredBy', h.slice(4));
      toast(`Invite code ${esc(h.slice(4))} saved. Welcome to the block.`, 'cheer');
      h = 'home';
      try { history.replaceState(null, '', '#home'); } catch { /* sandboxed */ }
    }
    if (h === 'tasks') h = 'rewards';
    if (h === 'stats') h = 'pulse';
    if (h === 'tokens') h = 'coins';
    state.viewWallet = null;
    if (h.startsWith('c-')) {
      const id = h.slice(2);
      if (!state.tok.has(id) && isLive()) await loadMints([id]).catch(() => []);
      if (state.tok.has(id)) { state.selected = id; store.set('selected2', id); state.sellPct = null; }
      h = 'trade';
    } else if (h.startsWith('w-')) {
      const a = h.slice(2);
      if (ADDR_RE.test(a)) state.viewWallet = a === state.wallet ? null : a;
      h = 'wallet';
    }
    if (!ROUTES[h]) h = 'home';
    const changed = state.route !== h;
    state.route = h;
    if (ro) { ro.disconnect(); ro = null; }
    view.innerHTML = ROUTES[h]();
    state.lastMarketKey = '';
    for (const a of $$('#nav a, #tabbar a')) {
      if (a.getAttribute('href') === '#' + h) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    MOUNT[h]?.();
    hydrateSparks(view);
    if (changed) window.scrollTo(0, 0);
  }

  // ---------- events ----------
  function openToken(id) {
    if (!state.tok.has(id)) return;
    state.selected = id;
    store.set('selected2', id);
    state.sellPct = null;
    if (state.route === 'trade') {
      $('#ticket-err').textContent = '';
      try { history.replaceState(null, '', '#c-' + id); } catch { /* sandboxed */ }
      refreshTrade(true);
      scheduleQuote();
      pollSelected(true);
    } else location.hash = 'c-' + id;
  }
  function setTabSelected(act, value) {
    $$(`[data-act="${act}"]`).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === value)));
  }

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || (e.target.closest('a') && !e.target.closest('a').isSameNode(el))) return;
    const act = el.dataset.act;
    if (act === 'star') {
      e.stopPropagation();
      const id = el.dataset.id;
      if (state.watch.has(id)) state.watch.delete(id); else state.watch.add(id);
      save();
      for (const b of $$(`[data-act="star"][data-id="${CSS.escape(id)}"]`)) b.outerHTML = starBtn(id);
      syncAutoTasks();
      if (!isLive()) computeDemoLists();
      else state.lists.watchlist = [...state.watch].filter((m) => state.tok.has(m));
      if (state.route === 'trade') updMarkets(true);
      return;
    }
    if (act === 'follow') {
      e.stopPropagation();
      const h = el.dataset.h;
      const on = !state.following.has(h);
      if (on) state.following.add(h); else state.following.delete(h);
      save();
      $$(`[data-act="follow"][data-h="${CSS.escape(h)}"]`).forEach((b) => { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Following' : 'Follow'; });
      if (on) toast(`Following ${esc(shortAddr(h))}. Their trades get a ★ on coin pages.`, 'happy');
      if (state.route === 'trade') updCenter();
      if (state.route === 'den') updDen();
      return;
    }
    switch (act) {
      case 'select':
      case 'open': openToken(el.dataset.id); break;
      case 'home-trade':
        state.side = el.dataset.side || 'buy';
        if (el.dataset.v) { state.amount = el.dataset.v; state.unit = 'usd'; }
        location.hash = 'c-' + el.dataset.id;
        break;
      case 'mtab':
        state.marketTab = el.dataset.k;
        store.set('marketTab', state.marketTab);
        setTabSelected('mtab', state.marketTab);
        updMarkets(true);
        if (isLive()) refreshList();
        break;
      case 'mk-all': state.showAllMk = true; updMarkets(true); break;
      case 'csort':
        state.coinSort = el.dataset.k;
        setTabSelected('csort', state.coinSort);
        MOUNT.coins();
        break;
      case 'ctab':
        state.centerTab = el.dataset.k;
        setTabSelected('ctab', state.centerTab);
        updCenter();
        break;
      case 'tf':
        state.tf = el.dataset.k;
        store.set('tf', state.tf);
        setTabSelected('tf', state.tf);
        updToken();
        drawChart();
        pollSelected(true);
        break;
      case 'side':
        state.side = el.dataset.side;
        state.sellPct = null;
        $$('.seg button[data-act="side"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === state.side)));
        $('#ticket-err').textContent = '';
        updChips();
        updTicket();
        scheduleQuote();
        break;
      case 'unit': {
        const usd = amountUsd();
        state.unit = state.unit === 'usd' ? 'sol' : 'usd';
        if (usd > 0) state.amount = state.unit === 'sol' ? (usd / solPrice()).toFixed(3) : usd.toFixed(2);
        $('#amt').value = state.amount;
        updChips();
        updTicket();
        scheduleQuote();
        break;
      }
      case 'chip': {
        let v = el.dataset.v;
        if (v === 'max') {
          const solAvail = isLive() ? Math.max(0, (state.solBal || 0) - CONFIG.solReserve) : state.cash / solPrice();
          v = state.unit === 'sol' ? solAvail.toFixed(3) : (Math.floor(solAvail * solPrice() * 100) / 100).toFixed(2);
        }
        state.amount = String(v);
        state.sellPct = null;
        $('#amt').value = state.amount;
        updTicket();
        scheduleQuote();
        break;
      }
      case 'pct': {
        const t = sel();
        if (!t) break;
        const pct = parseInt(el.dataset.v, 10);
        state.sellPct = pct;
        state.amount = (Math.floor(tokenBalanceUi(t.id) * t.price * pct) / 100).toFixed(2);
        $('#amt').value = state.amount;
        updChips();
        updTicket();
        scheduleQuote();
        break;
      }
      case 'go':
        if (isLive()) executeLive(); else executePaper();
        break;
      case 'connect': connectWallet(); break;
      case 'disconnect': disconnectWallet(); toast('Wallet disconnected.', 'neutral'); location.hash = 'home'; break;
      case 'reset':
        if (el.dataset.confirm === '1') {
          state.cash = CONFIG.startingCash;
          state.positions = {};
          save();
          computeDemoLists();
          toast(`Paper balance reset to ${fmtUsd(CONFIG.startingCash)}.`, 'neutral');
          refreshTrade(true);
          el.dataset.confirm = '';
          el.textContent = 'Reset paper balance';
        } else {
          el.dataset.confirm = '1';
          el.textContent = 'Tap again to reset';
          setTimeout(() => { if (el.isConnected) { el.dataset.confirm = ''; el.textContent = 'Reset paper balance'; } }, 3000);
        }
        break;
      case 'like': {
        const id = el.dataset.id;
        const on = !state.liked.has(id);
        if (on) state.liked.add(id); else state.liked.delete(id);
        save();
        el.setAttribute('aria-pressed', String(on));
        const n = el.querySelector('span');
        n.textContent = String(parseInt(n.textContent, 10) + (on ? 1 : -1));
        break;
      }
      case 'task-done':
        state.tasksDone[el.dataset.id] = true;
        save();
        toast(`+${TASKS.find((t) => t.id === el.dataset.id).crumbs} crumbs. Nice.`, 'cheer');
        route();
        break;
      case 'copy-ref': copyText($('#ref-link').value, 'Invite link copied.', $('#ref-link')); break;
      case 'copy-mint': copyText(sel()?.id || '', 'Mint address copied.'); break;
      case 'copy-addr': copyText(el.dataset.a, 'Wallet address copied.'); break;
      case 'share': copyText(location.href.split('#')[0] + '#c-' + (sel()?.id || ''), 'Link to this coin copied. Paste it anywhere.'); break;
    }
  });
  async function copyText(text, ok, input) {
    try {
      await navigator.clipboard.writeText(text);
      toast(ok, 'happy');
    } catch {
      if (input) { input.focus(); input.select(); }
      toast(`Your browser blocked copying. Here it is to copy by hand: <span class="mono">${esc(text)}</span>`, 'neutral');
    }
  }

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-act="select"], [data-act="open"]')) {
      e.preventDefault();
      openToken(e.target.dataset.id);
    }
  });

  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'mk-filter') { state.listFilter = e.target.value; updMarkets(true); }
    else if (id === 'coin-filter') { state.coinFilter = e.target.value; renderCoins(); }
    else if (id === 'amt') {
      const clean = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
      if (clean !== e.target.value) e.target.value = clean;
      state.amount = clean;
      state.sellPct = null;
      $('#ticket-err').textContent = '';
      updTicket();
      scheduleQuote();
    } else if (id === 'max-impact') { state.maxImpact = e.target.value; save(); renderQuote(); }
    else if (id === 'compose-text') { $('#compose-count').textContent = `${280 - e.target.value.length} left · posts stay on this device for now`; }
    else if (e.target.closest('#launch-form')) launchPreview();
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'l-img') readLaunchImage(e.target.files[0]);
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'launch-form') submitLaunch(e);
    if (e.target.id === 'compose') {
      e.preventDefault();
      const ta = $('#compose-text');
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      state.myPosts.unshift({ id: 'm' + Date.now(), h: 'you', ts: Date.now(), text, likes: 0 });
      state.counts.post++;
      save();
      syncAutoTasks();
      $('#feed').innerHTML = allPosts().map(postHtml).join('');
      hydrateSparks($('#feed'));
      ta.value = '';
      $('#compose-count').textContent = '280 left · posts stay on this device for now';
      toast('Posted to The Den.', 'happy');
    }
  });

  // drag & drop for the launch image
  document.addEventListener('dragover', (e) => {
    const d = e.target.closest?.('#l-drop');
    if (d) { e.preventDefault(); d.classList.add('over'); }
  });
  document.addEventListener('dragleave', (e) => e.target.closest?.('#l-drop')?.classList.remove('over'));
  document.addEventListener('drop', (e) => {
    const d = e.target.closest?.('#l-drop');
    if (!d) return;
    e.preventDefault();
    d.classList.remove('over');
    readLaunchImage(e.dataTransfer.files[0]);
  });

  // ---------- wallet ----------
  function walletProvider() {
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solflare?.isSolflare) return window.solflare;
    if (window.backpack?.solana) return window.backpack.solana;
    return window.solana || null;
  }
  function updWalletBtn() {
    const btn = $('#wallet-btn');
    if (!state.wallet) { btn.textContent = 'Connect'; btn.classList.add('btn-primary'); return; }
    btn.classList.remove('btn-primary');
    const sol = state.solBal != null ? `<span class="wb-sol">◎ ${state.solBal.toFixed(state.solBal >= 100 ? 1 : 3)} · </span>` : '';
    btn.innerHTML = sol + esc(shortAddr(state.wallet));
  }
  async function onConnected(p, key) {
    state.provider = p;
    state.wallet = key;
    store.set('walletKnown', true);
    updWalletBtn();
    if (isLive()) {
      await once('bal', loadBalances);
      if (state.marketTab === 'holding') refreshList('holding');
    }
    if (state.route === 'trade') { updTicket(); scheduleQuote(); updCenter(); }
    if (state.route === 'wallet') mountWallet();
    if (state.route === 'den') updDen();
  }
  async function connectWallet() {
    const p = walletProvider();
    if (!p) {
      toast('No Solana wallet found in this browser. Install <a href="https://phantom.com/download" target="_blank" rel="noopener">Phantom</a>, Solflare or Backpack, then reload the page.', 'worried');
      return;
    }
    try {
      const res = await p.connect();
      const key = String((res && res.publicKey) || p.publicKey || '');
      if (!key) throw new Error('no key');
      await onConnected(p, key);
      toast(isLive() ? 'Wallet connected. You approve every trade in your wallet.' : 'Wallet connected. Demo mode still uses paper money.', 'happy');
    } catch {
      toast('Connection was cancelled in your wallet.', 'neutral');
    }
  }
  function disconnectWallet() {
    try { state.provider?.disconnect?.(); } catch { /* ignore */ }
    state.wallet = null;
    state.provider = null;
    state.solBal = null;
    state.balances = {};
    if (isLive()) state.lists.holding = [];
    store.set('walletKnown', false);
    updWalletBtn();
    if (state.route === 'trade') { refreshTrade(true); scheduleQuote(); }
  }
  $('#wallet-btn').addEventListener('click', () => {
    if (state.wallet) location.hash = 'wallet';
    else connectWallet();
  });
  async function silentReconnect() {
    const p = walletProvider();
    if (!p) return;
    p.on?.('accountChanged', (pk) => {
      if (pk) onConnected(p, String(pk));
      else disconnectWallet();
    });
    p.on?.('disconnect', () => { if (state.wallet) disconnectWallet(); });
    if (!store.get('walletKnown', false)) return;
    try {
      const res = await p.connect({ onlyIfTrusted: true });
      const key = String((res && res.publicKey) || p.publicKey || '');
      if (key) await onConnected(p, key);
    } catch { /* user has to click connect */ }
  }

  // ---------- theme ----------
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  function effectiveTheme() {
    return document.documentElement.dataset.theme || (mq.matches ? 'dark' : 'light');
  }
  const savedTheme = store.get('theme', null);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  function redraw() { drawChart(); drawStatsChart(); }
  $('#theme-btn').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
    redraw();
  });
  mq.addEventListener?.('change', redraw);

  // ---------- boot ----------
  async function boot() {
    ensureRudyDefs();
    $('#brand-rudy').innerHTML = rudy('happy', { track: true });
    renderStatus();
    window.addEventListener('hashchange', route);
    await route();
    try {
      const [hot] = await Promise.all([
        http(JUP + LIST_URL.hot, { timeout: 9000 }),
        http(`${JUP}/tokens/v2/search?query=${SOL_MINT}`, { timeout: 9000 }).then(upsert),
      ]);
      state.mode = 'live';
      state.lists.hot = upsert(hot);
      if (state.selected && !state.tok.has(state.selected)) await loadMints([state.selected]).catch(() => []);
      if (!state.tok.has(state.selected) || state.selected === SOL_MINT) state.selected = featured()?.id || state.lists.hot[0];
      loadMajors();
      setInterval(liveLoop, 2000);
    } catch {
      startDemo();
      setInterval(() => {
        demoTick();
        if (document.hidden) return;
        if (state.route === 'trade') refreshTrade();
        else if (state.route === 'coins') updCoinCards(view);
        else if (state.route === 'pulse') updStats();
      }, 1500);
    }
    setInterval(() => { state.homeTick++; if (state.route === 'home' && !document.hidden) updHome(); }, 3500);
    renderStatus();
    await route();
    syncAutoTasks();
    silentReconnect();
  }
  boot();
})();
