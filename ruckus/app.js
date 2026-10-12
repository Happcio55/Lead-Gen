/* Ruckus — a social trading desk for Solana coins.
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
  const PALETTE = ['#f5a524', '#a3adb8', '#7cc4f2', '#e9c58f', '#ffcf6b', '#9ad17a', '#c9b2f0', '#f08a7e', '#8fd3c7', '#f4a3c4', '#b8c27a', '#ffd9a0'];
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
  const MOOD_WORD = { neutral: 'calm', happy: 'pleased', cheer: 'thrilled', worried: 'nervous' };
  function rudy(mood = 'neutral') {
    return `<svg class="rudy mood-${mood}" viewBox="0 0 120 124" role="img" aria-label="Rudy the raccoon, looking ${MOOD_WORD[mood]}">
  <g filter="url(#wobble)" stroke="var(--rudy-line)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
    <path d="M30 42 L23 12 L52 29 Z" fill="var(--rudy-fur)"></path>
    <path d="M90 42 L97 12 L68 29 Z" fill="var(--rudy-fur)"></path>
    <path d="M31 34 L28 20 L42 28 Z" fill="var(--rudy-dark)" stroke="none"></path>
    <path d="M89 34 L92 20 L78 28 Z" fill="var(--rudy-dark)" stroke="none"></path>
    <path d="M19 59 C17 37 37 24 60 24 C84 24 103 37 101 59 C99 79 83 89 60 89 C37 89 21 79 19 59 Z" fill="var(--rudy-fur)"></path>
    <path d="M60 26 C56 33 56 39 60 46 C64 39 64 33 60 26 Z" fill="var(--rudy-dark)" stroke="none"></path>
    <path d="M24 55 C29 42 46 42 55 51 L60 56 L65 51 C74 42 91 42 96 55 C98 65 87 71 75 66 L60 62 L45 66 C33 71 22 65 24 55 Z" fill="var(--rudy-dark)"></path>
    <circle cx="43" cy="55" r="6.5" fill="var(--rudy-cheek)"></circle>
    <circle cx="77" cy="55" r="6.5" fill="var(--rudy-cheek)"></circle>
    <circle class="r-pupil" cx="44" cy="56" r="3.2" fill="var(--rudy-line)" stroke="none"></circle>
    <circle class="r-pupil" cx="78" cy="56" r="3.2" fill="var(--rudy-line)" stroke="none"></circle>
    <circle cx="45.5" cy="54.3" r="1.1" fill="var(--rudy-cheek)" stroke="none"></circle>
    <circle cx="79.5" cy="54.3" r="1.1" fill="var(--rudy-cheek)" stroke="none"></circle>
    <path d="M41 72 C45 63 75 63 79 72 C81 82 72 88 60 88 C48 88 39 82 41 72 Z" fill="var(--rudy-cheek)"></path>
    <path d="M54 69 C56 65 64 65 66 69 C65 73 55 73 54 69 Z" fill="var(--rudy-line)"></path>
    <path class="r-mouth r-smile" d="M52 77 Q60 85 68 77" fill="none"></path>
    <path class="r-mouth r-flat" d="M54 79 Q60 81 66 79" fill="none"></path>
    <path class="r-mouth r-frown" d="M53 82 Q60 76 67 82" fill="none"></path>
    <path class="r-sweat" d="M100 38 C95 47 97 52 100.5 52 C104 52 105 47 100 38 Z" fill="var(--rudy-sweat)"></path>
    <g class="r-spark" fill="none">
      <path d="M10 30 L4 26"></path><path d="M8 40 L1 40"></path><path d="M110 30 L116 26"></path><path d="M112 40 L119 40"></path>
    </g>
    <g class="r-paws">
      <circle cx="60" cy="106" r="13" fill="var(--accent)"></circle>
      <path d="M56 99.5 L56 112.5 M56 99.5 L61.5 99.5 C66 99.5 66 106 61.5 106 L56 106 M61 106 L65 112.5" fill="none" stroke-width="2.4"></path>
      <ellipse cx="45" cy="106" rx="7.5" ry="6.5" fill="var(--rudy-dark)"></ellipse>
      <ellipse cx="75" cy="106" rx="7.5" ry="6.5" fill="var(--rudy-dark)"></ellipse>
    </g>
  </g>
</svg>`;
  }

  // ---------- state ----------
  const state = {
    mode: 'loading',            // 'loading' | 'live' | 'demo'
    route: 'trade',
    tok: new Map(),             // mint -> token
    lists: {},                  // tab -> [mint]
    searchIds: null,
    candles: {},                // mint|tf -> [{t,o,h,l,c,v}]
    trades: {},                 // mint -> [{ts,side,usd,qty,who,sig}]
    selected: store.get('selected2', null),
    marketTab: store.get('marketTab', 'hot'),
    tokTab: 'hot',
    tf: store.get('tf', '1m'),
    search: '',
    side: 'buy',
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
    balances: {},               // mint -> {raw: integer string, ui}
    // demo mode only
    cash: store.get('cash', CONFIG.startingCash),
    positions: store.get('positions', {}),
    mood: null,
    moodUntil: 0,
    tokSort: { key: 'vol', dir: -1 },
    launchImg: null,
    lastMarketKey: '',
    last: {},                   // poll timestamps
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
  const ledgerKey = () => 'ledger:' + state.wallet;
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
      traders24: s24.numTraders || 0,
      born: Date.parse(j.firstPool?.createdAt || j.createdAt || '') || null,
      launchpad: j.launchpad || null,
      verified: !!j.isVerified,
      organic: j.organicScoreLabel || null,
      audit: j.audit || {},
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
  async function loadHoldings() {
    if (!state.wallet) return [];
    await loadBalances();
    const mints = Object.keys(state.balances).filter((m) => state.balances[m].ui > 0);
    await loadMints(mints);
    return mints
      .filter((m) => state.tok.has(m))
      .sort((a, b) => holdingValue(b) - holdingValue(a));
  }
  const holdingValue = (m) => (state.balances[m]?.ui || 0) * (state.tok.get(m)?.price || 0);
  async function loadBalances() {
    if (!state.wallet || !isLive()) return;
    const b = await http(`${JUP}/ultra/v1/balances/${state.wallet}`);
    state.solBal = b.SOL ? b.SOL.uiAmount : 0;
    const next = {};
    for (const [k, v] of Object.entries(b)) if (k !== 'SOL') next[k] = { raw: String(v.amount), ui: v.uiAmount };
    state.balances = next;
    updWalletBtn();
  }
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
      .slice(0, 50);
  }
  // SOL, BTC and ETH for the ticker, priced by Jupiter (wrapped BTC/ETH on Solana track the real thing).
  const MAJORS = { SOL: SOL_MINT, BTC: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs' };
  async function loadMajors() {
    try { await loadMints(Object.values(MAJORS)); } catch { /* keep what we have */ }
    for (const [k, mint] of Object.entries(MAJORS)) {
      const t = state.tok.get(mint);
      if (t?.price) state.majors[k] = { p: t.price, c: t.chg24 };
    }
    renderTicker();
  }

  // ---------- demo data ----------
  const SUPPLY = 1e9;
  // sym, name, price, volatility per tick, colour, age (minutes), holders, 24h change
  const SEEDS = [
    ['BINLID', 'Bin Lid', 0.00412, 0.012, '#f5a524', 2900, 8412, 0.34],
    ['MASKED', 'Masked Bandit', 0.0187, 0.008, '#a3adb8', 12400, 21877, 0.081],
    ['NIGHTSHIFT', 'Night Shift', 0.00093, 0.015, '#7cc4f2', 640, 2215, 1.12],
    ['CRUMB', 'Crumb', 0.000061, 0.02, '#e9c58f', 95, 611, 2.4],
    ['SODIUM', 'Streetlight', 0.00248, 0.01, '#ffcf6b', 5100, 9930, -0.12],
    ['GRUB', 'Grub Club', 0.00731, 0.009, '#9ad17a', 8800, 14002, 0.05],
    ['PAWS', 'Wet Paws', 0.000284, 0.016, '#c9b2f0', 410, 1840, -0.27],
    ['ALLEY', 'Alley Cat', 0.0412, 0.006, '#f08a7e', 30100, 40210, 0.018],
    ['RINSE', 'Rinse Cycle', 0.00119, 0.013, '#8fd3c7', 1700, 3320, -0.06],
    ['TRASHTV', 'Trash TV', 0.000038, 0.022, '#f4a3c4', 22, 148, 3.8],
    ['DUMPY', 'Dumpy', 0.00557, 0.011, '#b8c27a', 4300, 6120, 0.21],
    ['MOONPIE', 'Half Moonpie', 0.000176, 0.017, '#ffd9a0', 260, 990, 0.62],
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
  function makeDemoToken([sym, name, price, sigma, color, ageMin, holders, chg24], extra = {}) {
    const r = rng(sym.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
    const t = {
      id: sym, sym, name, icon: null, decimals: 6, price, sigma, color, holders,
      mcap: price * SUPPLY, liq: price * SUPPLY * 0.08,
      born: Date.now() - ageMin * 60000,
      ref24: price / (1 + chg24), chg24, chg1h: 0, chg5m: 0,
      vol24: price * SUPPLY * (0.15 + r() * 0.5),
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
      if (rand() < (t.id === state.selected ? 0.75 : 0.15)) {
        const tr = state.trades[t.id];
        tr.unshift(fakeTrade(t));
        if (tr.length > 40) tr.pop();
      }
    }
    computeDemoLists();
  }

  // ---------- toasts ----------
  function toast(msg, mood = 'happy') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = rudy(mood) + `<div>${msg}</div>`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 6000);
  }

  // ---------- shared bits ----------
  function coinBadge(t, size = '') {
    const inner = t.icon
      ? `<img src="${esc(t.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
      : '';
    return `<span class="coin ${size}" style="background:${t.color}" aria-hidden="true"><i>${esc(String(t.sym).slice(0, 2))}</i>${inner}</span>`;
  }
  const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path></svg>';
  const STAR_O = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path></svg>';
  function starBtn(id) {
    const t = state.tok.get(id);
    const on = state.watch.has(id);
    return `<button class="star" type="button" data-act="star" data-id="${esc(id)}" aria-pressed="${on}" aria-label="${on ? 'Remove' : 'Add'} ${esc(t?.sym)} ${on ? 'from' : 'to'} watchlist">${on ? STAR : STAR_O}</button>`;
  }
  function walletAvatar(addr) {
    return `<span class="avatar" style="background:${colorFor(addr)}" aria-hidden="true">${esc(addr.slice(0, 2))}</span>`;
  }
  function followBtn(addr) {
    const on = state.following.has(addr);
    return `<button class="btn btn-sm follow" type="button" data-act="follow" data-h="${esc(addr)}" aria-pressed="${on}">${on ? 'Following' : 'Follow'}</button>`;
  }
  function tickerLinks(text) {
    const bySym = new Map([...state.tok.values()].map((t) => [t.sym.toUpperCase(), t.id]));
    return esc(text).replace(/\$([A-Za-z0-9]{2,10})\b/g, (m, sym) => {
      const id = bySym.get(sym.toUpperCase());
      return id ? `<button type="button" class="tag" data-act="open" data-id="${esc(id)}">$${esc(sym)}</button>` : m;
    });
  }
  function crumbsTotal() {
    return TASKS.reduce((s, t) => s + (state.tasksDone[t.id] ? t.crumbs : 0), 0);
  }
  function loadingBlock(msg = 'Loading markets…') {
    return `<div class="empty">${rudy('neutral')}<b>${msg}</b></div>`;
  }

  // ---------- ticker ----------
  function renderTicker() {
    const m = state.majors;
    const status = {
      live: '<span class="dot"></span>Live · Solana mainnet',
      demo: '<span class="dot off"></span>Demo data · live markets unreachable',
      loading: '<span class="dot off"></span>Connecting…',
    }[state.mode];
    $('#ticker').innerHTML = ['SOL', 'BTC', 'ETH'].map((k) =>
      `<span><b>${k}</b>${isFinite(m[k].p) ? fmtUsd(m[k].p, m[k].p > 1000 ? 0 : 2) : '–'} <span class="${cls(m[k].c)}">${fmtPct(m[k].c)}</span></span>`).join('') +
      `<span class="status">${status}</span>`;
  }
  function renderBanner() {
    const b = $('#mode-banner');
    if (state.mode === 'demo') {
      b.innerHTML = '<strong>Demo mode.</strong> Live market data couldn’t be reached, so prices are simulated and trades use a $1,000 paper balance.';
    } else {
      b.innerHTML = '<strong>Non-custodial.</strong> Trades route through Jupiter and you sign each one in your own wallet. Memecoins are high risk. Only trade what you can afford to lose.';
    }
  }

  // ---------- trade view ----------
  const MARKET_TABS = [['hot', 'Hot'], ['new', 'New'], ['top', 'Top'], ['watchlist', 'Watchlist'], ['holding', 'Holding']];

  function viewTrade() {
    return `<div class="desk">
  <section class="panel desk-markets" aria-label="Markets">
    <div class="tabs" role="tablist" aria-label="Market lists">${MARKET_TABS.map(([k, l]) =>
      `<button class="tab" role="tab" type="button" data-act="mtab" data-k="${k}" aria-selected="${state.marketTab === k}">${l}</button>`).join('')}</div>
    <div class="market-search"><input class="input" id="mk-search" type="search" placeholder="Search name, ticker or mint" autocomplete="off" value="${esc(state.search)}" aria-label="Search coins"></div>
    <ul class="market-list" id="mk-list" role="listbox" aria-label="Coins">${loadingBlock()}</ul>
  </section>
  <div class="desk-chart">
    <section class="panel">
      <div class="token-head" id="tok-head"></div>
      <div class="token-flags" id="tok-flags"></div>
      <div class="tabs tf" role="tablist" aria-label="Candle size">${Object.keys(TF).map((k) =>
        `<button class="tab" role="tab" type="button" data-act="tf" data-k="${k}" aria-selected="${state.tf === k}">${k}</button>`).join('')}</div>
      <div class="chart-box"><canvas id="chart" role="img" aria-label="Price chart"></canvas><span class="chart-note" id="chart-note"></span></div>
      <div class="stat-row" id="tok-stats"></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Live trades</h2><span class="label" id="tape-sym"></span></div>
      <div class="table-scroll"><table class="tape"><thead><tr><th>Age</th><th>Side</th><th class="r">USD</th><th class="r">Coins</th><th>Trader</th><th class="r">Tx</th></tr></thead><tbody id="tape"></tbody></table></div>
    </section>
  </div>
  <div class="desk-side">
    <section class="panel ticket" aria-label="Trade ticket">
      <div class="ticket-rudy" id="ticket-rudy"></div>
      <div class="panel-head"><h2 id="ticket-title">Trade</h2></div>
      <div class="panel-body stack">
        <div class="seg" role="group" aria-label="Buy or sell">
          <button type="button" class="buy" data-act="side" data-side="buy" aria-pressed="${state.side === 'buy'}">Buy</button>
          <button type="button" class="sell" data-act="side" data-side="sell" aria-pressed="${state.side === 'sell'}">Sell</button>
        </div>
        <div class="field">
          <label class="label" for="amt">Amount in USD</label>
          <div class="amount-wrap"><span>$</span><input class="input" id="amt" inputmode="decimal" autocomplete="off" value="${esc(state.amount)}"></div>
          <div class="conv" id="conv"></div>
        </div>
        <div class="chips" id="chips"></div>
        <dl class="quote" id="quote"></dl>
        <div class="fee-line"><span class="slip"><label for="max-impact">Max price impact</label><input id="max-impact" inputmode="decimal" value="${esc(state.maxImpact)}">%</span><span>Slippage: auto</span></div>
        <div class="err" id="ticket-err" role="alert"></div>
        <button class="btn btn-primary btn-block" type="button" id="ticket-go" data-act="go"></button>
      </div>
      <div class="panel-body stack panel-split">
        <dl class="balance" id="balance"></dl>
        <button class="btn btn-sm" type="button" data-act="reset" id="reset-btn" hidden>Reset paper balance</button>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Top buyers right now</h2><a href="#den" class="label">Following</a></div>
      <ul class="people" id="people"></ul>
    </section>
  </div>
</div>`;
  }

  function marketIds() {
    let ids = state.search.trim() && state.searchIds ? state.searchIds : state.lists[state.marketTab];
    if (!ids) return null;
    ids = ids.filter((id) => state.tok.has(id));
    if (state.search.trim() && !state.searchIds) {
      const q = state.search.trim().toLowerCase();
      ids = ids.filter((id) => { const t = state.tok.get(id); return t.sym.toLowerCase().includes(q) || t.name.toLowerCase().includes(q); });
    }
    return ids;
  }
  function marketFigs(t) {
    return `<div class="num">${fmtCompact(t.mcap)}</div><div class="num ${cls(t.chg24)}">${fmtPct(t.chg24)}</div>`;
  }
  function updMarkets(force = false) {
    const list = $('#mk-list');
    if (!list) return;
    const ids = marketIds();
    if (!ids) { list.innerHTML = loadingBlock(); state.lastMarketKey = ''; return; }
    const key = state.marketTab + '|' + ids.join(',') + '|' + state.selected + '|' + [...state.watch].join(',');
    if (force || key !== state.lastMarketKey) {
      state.lastMarketKey = key;
      if (!ids.length) {
        const msg = state.search.trim() ? '<b>No coins match that search.</b>Try a ticker, a name or paste a mint address.' : {
          watchlist: '<b>No coins on your watchlist.</b>Tap the star next to a coin to keep an eye on it.',
          holding: state.wallet || !isLive() ? '<b>Rudy’s pockets are empty.</b>Buy a coin and it shows up here.' : '<b>Connect your wallet</b>to see the coins you hold.',
        }[state.marketTab] || '<b>Nothing here yet.</b>';
        list.innerHTML = `<li class="empty">${rudy(state.marketTab === 'holding' ? 'neutral' : 'worried')}${msg}</li>`;
        return;
      }
      list.innerHTML = ids.map((id) => {
        const t = state.tok.get(id);
        return `<li class="market-row" role="option" tabindex="0" data-act="select" data-id="${esc(id)}" aria-selected="${id === state.selected}">
          ${coinBadge(t)}<div class="who"><b>${esc(t.sym)}</b><span>${esc(t.name)}</span></div>
          <div class="figs" data-figs="${esc(id)}">${marketFigs(t)}</div>${starBtn(id)}</li>`;
      }).join('');
      return;
    }
    for (const id of ids) {
      const el = list.querySelector(`[data-figs="${CSS.escape(id)}"]`);
      if (el) el.innerHTML = marketFigs(state.tok.get(id));
    }
  }

  function flag(ok, yes, no) {
    return `<span class="flag ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '!'} ${ok ? yes : no}</span>`;
  }
  function updToken() {
    const t = sel();
    const head = $('#tok-head');
    if (!head) return;
    if (!t) { head.innerHTML = `<div class="title">${loadingBlock('Picking a coin…')}</div>`; return; }
    const links = isLive() ? ` · <button type="button" class="linkish" data-act="copy-mint">Copy mint</button> · <a href="${solscanAcct(t.id)}" target="_blank" rel="noopener">Solscan</a>` : '';
    head.innerHTML = `${coinBadge(t, 'lg')}
      <div class="title"><h1>${esc(t.name)} <small>$${esc(t.sym)}</small>${t.verified ? '<span class="flag ok">Verified</span>' : ''}</h1>
      <p class="addr"><span class="mono">${isLive() ? esc(shortAddr(t.id)) : 'demo coin'}</span>${links}</p></div>
      <div class="token-price"><div class="big">${fmtPrice(t.price)}</div><div class="num"><span class="${cls(t.chg1h)}">${fmtPct(t.chg1h)} 1h</span> · <span class="${cls(t.chg24)}">${fmtPct(t.chg24)} 24h</span></div></div>`;
    const a = t.audit || {};
    const top = a.topHoldersPercentage;
    $('#tok-flags').innerHTML = [
      a.mintAuthorityDisabled != null ? flag(a.mintAuthorityDisabled, 'Mint renounced', 'Mint still active') : '',
      a.freezeAuthorityDisabled != null ? flag(a.freezeAuthorityDisabled, 'No freeze', 'Can freeze wallets') : '',
      top != null ? flag(top < 30, `Top holders ${top.toFixed(0)}%`, `Top holders own ${top.toFixed(0)}%`) : '',
      t.organic ? `<span class="flag">${esc(t.organic)} organic activity</span>` : '',
      t.launchpad && t.launchpad !== 'demo' ? `<span class="flag">${esc(t.launchpad)}</span>` : '',
    ].join('');
    $('#tok-stats').innerHTML = [
      ['Market cap', fmtCompact(t.mcap)],
      ['Liquidity', fmtCompact(t.liq)],
      ['Volume 24h', fmtCompact(t.vol24)],
      ['Holders', t.holders ? t.holders.toLocaleString('en-US') : '–'],
      ['Age', fmtAgo(ageOf(t))],
    ].map(([k, v]) => `<div><div class="label">${k}</div><div class="val">${v}</div></div>`).join('');
    $('#tape-sym').textContent = '$' + t.sym;
    $('#chart-note').textContent = `${isLive() ? state.tf : '1m'} candles${isLive() ? '' : ' · simulated'}`;
  }

  function updTape() {
    const body = $('#tape');
    if (!body) return;
    const t = sel();
    const list = t ? state.trades[t.id] : null;
    if (!list) { body.innerHTML = '<tr><td colspan="6" class="muted">Loading trades…</td></tr>'; return; }
    if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="muted">No trades in the last few minutes.</td></tr>'; return; }
    const now = Date.now();
    body.innerHTML = list.slice(0, 14).map((x) => {
      const mine = x.who === 'you' || (state.wallet && x.who === state.wallet);
      const followed = state.following.has(x.who);
      const who = mine ? '<b>you</b>' : `${followed ? '★ ' : ''}${isLive() ? `<a href="${solscanAcct(x.who)}" target="_blank" rel="noopener">${esc(shortAddr(x.who))}</a>` : esc(shortAddr(x.who))}`;
      const tx = x.sig ? `<a href="${solscanTx(x.sig)}" target="_blank" rel="noopener" aria-label="View transaction">↗</a>` : '';
      return `<tr${followed ? ' class="followed"' : ''}><td>${fmtAgo((now - x.ts) / 1000)}</td><td class="${x.side === 'buy' ? 'up' : 'down'}">${esc(x.side)}</td><td class="r">${fmtUsd(x.usd)}</td><td class="r">${fmtQty(x.qty)}</td><td>${who}</td><td class="r">${tx}</td></tr>`;
    }).join('');
  }

  function updPeople() {
    const box = $('#people');
    if (!box) return;
    const t = sel();
    const list = t ? state.trades[t.id] : null;
    if (!list) { box.innerHTML = ''; return; }
    const agg = new Map();
    for (const x of list) {
      if (x.side !== 'buy' || !x.who || x.who === 'you') continue;
      const a = agg.get(x.who) || { usd: 0, n: 0 };
      a.usd += x.usd;
      a.n++;
      agg.set(x.who, a);
    }
    const top = [...agg.entries()].sort((a, b) => b[1].usd - a[1].usd).slice(0, 4);
    box.innerHTML = top.length ? top.map(([addr, a]) => `<li class="person">${walletAvatar(addr)}
      <div><b>${isLive() ? `<a href="${solscanAcct(addr)}" target="_blank" rel="noopener">${esc(shortAddr(addr))}</a>` : esc(shortAddr(addr))}</b><span>bought ${fmtUsd(a.usd)} of $${esc(t.sym)} · ${a.n} trade${a.n > 1 ? 's' : ''}</span></div>
      ${followBtn(addr)}</li>`).join('')
      : `<li class="empty">${rudy('neutral')}No buyers in the latest trades.</li>`;
  }

  // ----- ticket -----
  function updChips() {
    const box = $('#chips');
    if (!box) return;
    box.innerHTML = state.side === 'buy'
      ? [10, 25, 50, 100].map((v) => `<button type="button" class="chip" data-act="chip" data-v="${v}">$${v}</button>`).join('') + '<button type="button" class="chip" data-act="chip" data-v="max">Max</button>'
      : [25, 50, 75, 100].map((v) => `<button type="button" class="chip" data-act="pct" data-v="${v}">${v}%</button>`).join('');
  }
  function tokenBalanceUi(id) {
    if (!isLive()) return state.positions[id]?.qty || 0;
    return state.balances[id]?.ui || 0;
  }
  // Works out what the trade spends, in raw on-chain units.
  function swapParams() {
    const t = sel();
    if (!t) return { error: 'Pick a coin first.' };
    if (t.id === SOL_MINT) return { error: 'Pick a coin other than SOL. Trades here are coin ↔ SOL.' };
    const usd = parseFloat(state.amount);
    if (state.side === 'buy') {
      if (!(usd > 0)) return { error: 'Enter an amount above $0.' };
      const sp = solPrice();
      if (!(sp > 0)) return { error: 'Waiting for the SOL price. Try again in a moment.' };
      const lamports = Math.floor((usd / sp) * 1e9);
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
      if (!(usd > 0)) return { error: 'Enter an amount above $0.' };
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
    if (q.failed) { box.innerHTML = '<dt class="down">Couldn’t get a price. Check your connection.</dt><dd></dd>'; return; }
    const { o } = q;
    const outSym = state.side === 'buy' ? t.sym : 'SOL';
    const outDec = state.side === 'buy' ? t.decimals : 9;
    const out = Number(o.outAmount || 0) / 10 ** outDec;
    const min = Number(o.otherAmountThreshold || o.outAmount || 0) / 10 ** outDec;
    const imp = impactOf(o);
    const fee = (o.feeBps ?? o.platformFee?.feeBps ?? 0) / 100;
    box.innerHTML = `
      <dt>You get about</dt><dd>${fmtQty(out)} ${esc(outSym)}</dd>
      <dt>Minimum</dt><dd>${fmtQty(min)} ${esc(outSym)}</dd>
      <dt>Price impact</dt><dd class="${imp > parseFloat(state.maxImpact) ? 'down' : ''}">${imp.toFixed(2)}%</dd>
      <dt>Fees</dt><dd>Ruckus 0% · Jupiter ${fee.toFixed(2)}%</dd>
      ${o.errorMessage ? `<dt class="down wide">${esc(o.errorMessage)}</dt>` : ''}`;
  }
  function updTicket() {
    const t = sel();
    const go = $('#ticket-go');
    if (!go) return;
    const usd = parseFloat(state.amount);
    const conv = $('#conv');
    if (t && usd > 0 && t.price > 0) {
      conv.textContent = `≈ ${isFinite(solPrice()) ? (usd / solPrice()).toFixed(4) + ' SOL · ' : ''}${fmtQty(usd / t.price)} ${t.sym}`;
    } else conv.textContent = 'Enter an amount';
    const verb = state.side === 'buy' ? 'Buy' : 'Sell';
    $('#ticket-title').textContent = t ? `${verb} $${t.sym}` : 'Trade';
    if (state.busy) go.textContent = state.busy;
    else if (isLive() && !state.wallet) go.textContent = 'Connect wallet to trade';
    else go.textContent = t ? `${verb} $${t.sym}` : verb;
    go.disabled = !!state.busy;
    go.classList.toggle('sell', state.side === 'sell');
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
    if (!state.wallet) return [['Wallet', 'not connected']];
    const sp = solPrice();
    const rows = [['SOL balance', state.solBal == null ? '…' : `${state.solBal.toFixed(4)} · ${fmtUsd(state.solBal * sp)}`]];
    if (t && t.id !== SOL_MINT) {
      const ui = tokenBalanceUi(t.id);
      const val = ui * t.price;
      rows.push([`Your $${esc(t.sym)}`, ui > 0 ? `${fmtQty(ui)} · ${fmtUsd(val)}` : 'none']);
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
    const r = t.chg5m || 0;
    return r > 0.01 ? 'happy' : r < -0.03 ? 'worried' : 'neutral';
  }
  function updMood() {
    const box = $('#ticket-rudy');
    if (!box) return;
    const mood = currentMood();
    if (box.dataset.mood !== mood) {
      box.dataset.mood = mood;
      box.innerHTML = rudy(mood);
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
    let usd = parseFloat(state.amount);
    const pos = state.positions[t.id] || { qty: 0, cost: 0 };
    if (state.side === 'sell' && state.sellPct) usd = pos.qty * t.price * (state.sellPct / 100);
    if (!(usd > 0)) { err.textContent = 'Enter an amount above $0.'; return; }
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
    updTape();
    updPeople();
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
    const axisW = 84, padT = 30, padB = 20, volH = 44;
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
      g.beginPath(); g.moveTo(0, yy); g.lineTo(plotW, yy); g.stroke();
      if (Math.abs(yy - lastY) < 16) continue; // the last-price tag sits here
      g.fillStyle = col('--muted');
      g.fillText(fmtPrice(p), plotW + 8, yy);
    }

    const step = plotW / n;
    const bw = Math.max(2, step * 0.62);
    const upC = col('--up'), dnC = col('--down');
    cs.forEach((k, i) => {
      const x = Math.round(i * step + step / 2) + 0.5;
      const color = k.c >= k.o ? upC : dnC;
      g.strokeStyle = color;
      g.fillStyle = color;
      g.beginPath(); g.moveTo(x, y(k.h)); g.lineTo(x, y(k.l)); g.stroke();
      const top = y(Math.max(k.o, k.c)), bot = y(Math.min(k.o, k.c));
      g.fillRect(x - bw / 2, top, bw, Math.max(1, bot - top));
      if (vmax > 0) {
        const vh = (k.v / vmax) * (volH - 8);
        g.globalAlpha = 0.35;
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
    const tw = g.measureText(label).width + 12;
    g.fillStyle = col('--accent');
    g.fillRect(plotW + 2, ly - 9, Math.min(tw, axisW - 2), 18);
    g.fillStyle = col('--accent-ink');
    g.fillText(label, plotW + 8, ly);

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

  // ---------- tokens view ----------
  const TOK_COLS = [
    ['sym', 'Coin'], ['price', 'Price'], ['chg1h', '1h'], ['chg24', '24h'], ['mcap', 'Market cap'], ['liq', 'Liquidity'], ['vol', 'Volume 24h'], ['holders', 'Holders'], ['age', 'Age'],
  ];
  const tokVal = {
    sym: (t) => t.sym.toLowerCase(), price: (t) => t.price, chg1h: (t) => t.chg1h, chg24: (t) => t.chg24, mcap: (t) => t.mcap,
    liq: (t) => t.liq, vol: (t) => t.vol24, holders: (t) => t.holders, age: (t) => -(t.born || 0),
  };
  function viewTokens() {
    return `<div class="page-head"><div><h1>Every coin on the block</h1><p>${isLive() ? 'Live from Solana.' : 'Demo coins.'} Tap a row to open its chart and trade it.</p></div>
      <input class="input narrow" id="tok-search" type="search" placeholder="Filter this list" autocomplete="off" aria-label="Filter coins" value="${esc(state.search)}"></div>
      <section class="panel">
        <div class="tabs" role="tablist" aria-label="Lists">${[['hot', 'Trending'], ['new', 'New'], ['top', 'Top traded']].map(([k, l]) =>
          `<button class="tab" role="tab" type="button" data-act="ttab" data-k="${k}" aria-selected="${state.tokTab === k}">${l}</button>`).join('')}</div>
        <div class="table-scroll"><table class="big-table">
        <thead><tr id="tok-headrow"></tr></thead><tbody id="tok-body"></tbody></table></div></section>`;
  }
  function renderTokRows() {
    const body = $('#tok-body');
    if (!body) return;
    const { key, dir } = state.tokSort;
    const q = state.search.trim().toLowerCase();
    const ids = state.lists[state.tokTab];
    $('#tok-headrow').innerHTML = TOK_COLS.map(([k, l]) => {
      const s = key === k ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : '';
      return `<th${s}><button type="button" data-act="sort" data-k="${k}">${l}${s ? (dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
    }).join('') + '<th><span class="sr-only">Watch</span></th>';
    if (!ids) { body.innerHTML = `<tr><td colspan="10">${loadingBlock()}</td></tr>`; return; }
    const list = ids.map((id) => state.tok.get(id)).filter(Boolean)
      .filter((t) => !q || t.sym.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const A = tokVal[key](a), B = tokVal[key](b);
        return (A > B ? 1 : A < B ? -1 : 0) * dir;
      });
    body.innerHTML = list.length ? list.map((t) => `<tr data-act="open" data-id="${esc(t.id)}">
      <td><div class="tok-cell">${coinBadge(t)}<div><b>${esc(t.sym)}</b><span>${esc(t.name)}</span></div></div></td>
      <td data-f="price"></td><td data-f="chg1h"></td><td data-f="chg24"></td><td data-f="mc"></td><td data-f="liq"></td><td data-f="vol"></td><td data-f="holders"></td><td data-f="age"></td>
      <td>${starBtn(t.id)}</td></tr>`).join('')
      : `<tr><td colspan="10"><div class="empty">${rudy('worried')}<b>No coins match that filter.</b></div></td></tr>`;
    updTokCells();
  }
  function updTokCells() {
    for (const tr of $$('#tok-body tr[data-id]')) {
      const t = state.tok.get(tr.dataset.id);
      if (!t) continue;
      const set = (f, html) => { tr.querySelector(`[data-f="${f}"]`).innerHTML = html; };
      set('price', fmtPrice(t.price));
      set('chg1h', `<span class="${cls(t.chg1h)}">${fmtPct(t.chg1h)}</span>`);
      set('chg24', `<span class="${cls(t.chg24)}">${fmtPct(t.chg24)}</span>`);
      set('mc', fmtCompact(t.mcap));
      set('liq', fmtCompact(t.liq));
      set('vol', fmtCompact(t.vol24));
      set('holders', t.holders ? t.holders.toLocaleString('en-US') : '–');
      set('age', fmtAgo(ageOf(t)));
    }
  }

  // ---------- den (social) ----------
  const SEED_POSTS = [
    { h: 'Rudy', m: 3, text: 'Welcome to The Den. Tag a coin like $SOL and it links straight to its chart.', likes: 12 },
    { h: 'Rudy', m: 40, text: 'Before you buy anything new, check the badges under the coin name: mint renounced, no freeze, and how much the top holders own.', likes: 31 },
  ];
  const startedAt = Date.now();
  function allPosts() {
    const seeded = SEED_POSTS.map((p, i) => ({ ...p, id: 's' + i, ts: startedAt - p.m * 60000 }));
    return [...state.myPosts, ...seeded].sort((a, b) => b.ts - a.ts);
  }
  function postHtml(p) {
    const isRudy = p.h === 'Rudy';
    const liked = state.liked.has(p.id);
    const av = isRudy
      ? `<span class="avatar rudy-av" aria-hidden="true">${rudy('happy')}</span>`
      : `<span class="avatar" style="background:${state.wallet ? colorFor(state.wallet) : '#a3adb8'}" aria-hidden="true">ME</span>`;
    const name = isRudy ? 'Rudy' : 'You';
    const handle = isRudy ? '@ruckus' : state.wallet ? shortAddr(state.wallet) : '@you';
    return `<article class="post">${av}<div>
      <div class="post-meta"><b>${esc(name)}</b><span>${esc(handle)}</span><span>· ${fmtAgo((Date.now() - p.ts) / 1000)}</span></div>
      <p>${tickerLinks(p.text)}</p>
      <div class="post-actions"><button type="button" data-act="like" data-id="${p.id}" aria-pressed="${liked}">♥ <span>${p.likes + (liked ? 1 : 0)}</span></button></div>
    </div></article>`;
  }
  function viewDen() {
    const follows = [...state.following];
    return `<div class="page-head"><div><h1>The Den</h1><p>Where the night shift talks trades. Tag a coin with $TICKER and it links to its chart.</p></div></div>
    <div class="grid-2">
      <div class="panel">
        <form class="panel-body compose" id="compose">
          <label class="label" for="compose-text">Post to The Den</label>
          <textarea class="input" id="compose-text" maxlength="280" placeholder="What are you watching tonight?"></textarea>
          <div class="compose-foot"><span class="hint" id="compose-count">280 characters left</span><button class="btn btn-primary" type="submit">Post</button></div>
          <p class="hint">Posts stay on this device until The Den server goes live.</p>
        </form>
        <div id="feed">${allPosts().map(postHtml).join('')}</div>
      </div>
      <div class="stack-col">
        <section class="panel"><div class="panel-head"><h2>Wallets you follow</h2><span class="label">${follows.length}</span></div>
          <ul class="people">${follows.length ? follows.map((a) => `<li class="person">${walletAvatar(a)}<div><b>${isLive() ? `<a href="${solscanAcct(a)}" target="_blank" rel="noopener">${esc(shortAddr(a))}</a>` : esc(shortAddr(a))}</b><span>Their trades get a ★ in Live trades</span></div>${followBtn(a)}</li>`).join('')
            : `<li class="empty">${rudy('neutral')}<b>You’re not following anyone yet.</b>Follow top buyers from the Trade page.</li>`}</ul></section>
        <section class="panel"><div class="panel-head"><h2>Biggest moves this hour</h2></div><ul class="market-list" id="den-movers"></ul></section>
      </div>
    </div>`;
  }
  function moversHtml(n = 5) {
    const ids = state.lists.hot || [];
    const movers = ids.map((id) => state.tok.get(id)).filter(Boolean).sort((a, b) => b.chg1h - a.chg1h).slice(0, n);
    if (!movers.length) return loadingBlock();
    return movers.map((t) => `<li class="market-row" role="button" tabindex="0" data-act="open" data-id="${esc(t.id)}">${coinBadge(t)}<div class="who"><b>${esc(t.sym)}</b><span>${esc(t.name)}</span></div><div class="figs"><div class="num">${fmtCompact(t.mcap)}</div><div class="num ${cls(t.chg1h)}">${fmtPct(t.chg1h)} 1h</div></div><span></span></li>`).join('');
  }

  // ---------- launch ----------
  function viewLaunch() {
    const note = isLive()
      ? 'Every coin starts on a bonding curve paired with SOL. On-chain launches switch on once the launch server is connected (see README). Until then this page saves your coin as a draft.'
      : 'Every coin starts on a bonding curve paired with SOL. In demo mode the coin lives in your browser only.';
    return `<div class="page-head"><div><h1>Launch a coin</h1><p>${note}</p></div></div>
    <div class="grid-2">
      <form class="panel panel-body form-grid" id="launch-form" novalidate>
        <div class="two">
          <div class="field"><label for="l-name">Coin name</label><input class="input" id="l-name" maxlength="32" placeholder="Bin Lid" autocomplete="off"><div class="err" id="e-name"></div></div>
          <div class="field"><label for="l-sym">Ticker</label><input class="input mono" id="l-sym" maxlength="10" placeholder="BINLID" autocomplete="off"><div class="err" id="e-sym"></div></div>
        </div>
        <div class="field"><label for="l-desc">Description</label><textarea class="input" id="l-desc" maxlength="280" rows="3" placeholder="One or two lines on why this coin exists."></textarea><div class="hint" id="l-desc-count">280 characters left</div></div>
        <div class="field"><span class="label">Image</span>
          <label class="drop" id="l-drop" for="l-img"><span id="l-thumb">${coinBadge({ sym: '??', color: '#a3adb8' }, 'lg')}</span><span><b>Choose an image</b><br><span class="hint">PNG, JPG or GIF up to 2 MB. Square works best.</span></span></label>
          <input id="l-img" type="file" accept="image/*" hidden><div class="err" id="e-img"></div>
        </div>
        <div class="field"><label for="l-buy">Your first buy (SOL, optional)</label><input class="input mono" id="l-buy" inputmode="decimal" placeholder="0.5" autocomplete="off"><div class="hint">Buying first protects you from being front-run at launch.</div><div class="err" id="e-buy"></div></div>
        <button class="btn btn-primary btn-block" type="submit">${isLive() ? 'Save draft' : 'Launch demo coin'}</button>
      </form>
      <div class="stack-col">
        <section class="panel preview-card" aria-label="Preview">
          <span class="label">Preview</span>
          <div class="row"><span id="p-badge">${coinBadge({ sym: '??', color: '#f5a524' }, 'lg')}</span><div><h3 id="p-name">Your coin</h3><span class="mono muted" id="p-sym">$TICKER</span></div></div>
          <p id="p-desc">Your description shows up here.</p>
          <div><div class="fee-line"><span>Bonding curve</span><span class="mono" id="p-curve-pct">0%</span></div><div class="curve"><i id="p-curve" style="width:0%"></i></div></div>
          <div class="fee-line"><span>Starting market cap</span><span class="mono" id="p-mc">$4.2K</span></div>
        </section>
        <section class="panel hero-strip">${rudy('happy')}<div><b>Rudy’s launch checklist</b><p class="muted">Pick a ticker people can say out loud. Write a description a stranger understands. Don’t promise returns.</p></div></section>
      </div>
    </div>`;
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
    $('#p-badge').innerHTML = coinBadge({ sym: sym || '??', color: '#f5a524', icon: state.launchImg }, 'lg');
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
    const t = makeDemoToken([sym, name, price, 0.018, pick(PALETTE), 0, 1, 0], { icon: state.launchImg });
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
      $('#l-thumb').innerHTML = coinBadge({ sym: '', color: '#a3adb8', icon: r.result }, 'lg');
      launchPreview();
    };
    r.readAsDataURL(file);
  }

  // ---------- rewards ----------
  function refLink() {
    const base = CONFIG.refBase || location.href.split('#')[0];
    return base + '#ref-' + state.refCode;
  }
  function viewRewards() {
    const crumbs = crumbsTotal();
    return `<div class="page-head"><div><h1>Rewards</h1><p>Earn crumbs for bringing friends and finishing tasks. Crumbs are points that rank you on the leaderboard. They are not money.</p></div></div>
    <div class="grid-tiles">
      <div class="panel tile"><div class="label">Your crumbs</div><div class="val">${crumbs.toLocaleString('en-US')}</div><div class="sub muted">from tasks on this device</div></div>
      <div class="panel tile"><div class="label">Friends joined</div><div class="val">0</div><div class="sub muted">share your link to start</div></div>
      <div class="panel tile"><div class="label">Your code</div><div class="val">${state.refCode}</div><div class="sub muted">works on any page</div></div>
      <div class="panel tile"><div class="label">Tasks done</div><div class="val">${Object.values(state.tasksDone).filter(Boolean).length} / ${TASKS.length}</div><div class="sub"><a href="#tasks">See tasks</a></div></div>
    </div>
    <div class="grid-2 gap-top">
      <div class="stack-col">
        <section class="panel panel-body stack">
          <label class="label" for="ref-link">Your invite link</label>
          <div class="ref-box"><input class="input" id="ref-link" readonly value="${esc(refLink())}"><button class="btn btn-primary" type="button" data-act="copy-ref">Copy link</button></div>
        </section>
        <section class="panel panel-body">
          <ol class="steps">
            <li><div><b>Share your link</b><span>Send it to a friend or post it on X.</span></div></li>
            <li><div><b>They make their first trade</b><span>Any trade on Ruckus counts.</span></div></li>
            <li><div><b>You both get 200 crumbs</b><span>Counted once the rewards server goes live.</span></div></li>
          </ol>
        </section>
      </div>
      <section class="panel"><div class="panel-head"><h2>Leaderboard</h2><span class="label">This week</span></div>
        <div class="empty">${rudy('neutral')}<b>The leaderboard opens with the rewards server.</b>Your crumbs so far are saved on this device.</div>
      </section>
    </div>`;
  }

  // ---------- tasks ----------
  const TASKS = [
    { id: 'follow', t: 'Follow Ruckus on X', d: 'Open X, follow the account, then mark this done.', crumbs: 50 },
    { id: 'share', t: 'Share a trade', d: 'Post a screenshot of a trade from Ruckus on X.', crumbs: 120 },
    { id: 'trades', t: 'Make 3 trades', d: 'Counted automatically on this device.', crumbs: 80, auto: 'trades', goal: 3 },
    { id: 'watch', t: 'Watch 5 coins', d: 'Star coins in the market list. Counted automatically.', crumbs: 40, auto: 'watch', goal: 5 },
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
  function viewTasks() {
    const done = Object.values(state.tasksDone).filter(Boolean).length;
    return `<div class="page-head"><div><h1>Tasks</h1><p>Small jobs that earn crumbs. Automatic tasks tick themselves off as you use Ruckus.</p></div>
      <div class="crumbs">${crumbsTotal().toLocaleString('en-US')} crumbs earned</div></div>
    <section class="panel">
      <div class="panel-body stack"><div class="fee-line"><span>${done} of ${TASKS.length} done</span><span class="mono">${Math.round((done / TASKS.length) * 100)}%</span></div><div class="progress"><i style="width:${(done / TASKS.length) * 100}%"></i></div></div>
      ${TASKS.map((task) => {
        const isDone = !!state.tasksDone[task.id];
        let actions;
        if (isDone) actions = '<span class="done-pill">Done</span>';
        else if (task.auto) actions = `<span class="mono muted">${taskProgress(task)} / ${task.goal}</span>`;
        else actions = `<a class="btn btn-sm" href="${CONFIG.xUrl}" target="_blank" rel="noopener">Open X</a><button class="btn btn-sm" type="button" data-act="task-done" data-id="${task.id}">Mark done</button>`;
        return `<div class="task"><div><b>${esc(task.t)}</b><span>${esc(task.d)}</span></div><div class="task-actions"><span class="crumbs">+${task.crumbs}</span>${actions}</div></div>`;
      }).join('')}
    </section>`;
  }

  // ---------- stats ----------
  function viewStats() {
    return `<div class="page-head"><div><h1>Market pulse</h1><p>What the Solana memecoin market is doing right now.</p></div></div>
    <div class="grid-tiles" id="stat-tiles"></div>
    <div class="grid-2 gap-top">
      <section class="panel"><div class="panel-head"><h2>${isLive() ? 'SOL price' : 'Top coin'}</h2><span class="label">${isLive() ? 'Daily candles' : 'Demo'}</span></div><div class="bars-box"><canvas id="bars" role="img" aria-label="Price candles"></canvas></div></section>
      <section class="panel"><div class="panel-head"><h2>Biggest moves this hour</h2><span class="label">Trending coins</span></div><ul class="market-list" id="movers"></ul></section>
    </div>`;
  }
  function updStats() {
    const tiles = $('#stat-tiles');
    if (!tiles) return;
    const hot = (state.lists.hot || []).map((id) => state.tok.get(id)).filter(Boolean);
    const fresh = (state.lists.new || []).map((id) => state.tok.get(id)).filter((t) => t && t.born && Date.now() - t.born < 3600000);
    const vol = hot.reduce((s, t) => s + t.vol24, 0);
    const moves = hot.map((t) => t.chg1h).sort((a, b) => a - b);
    const avg = moves.length ? moves[Math.floor(moves.length / 2)] : 0;
    const sol = state.majors.SOL;
    tiles.innerHTML = [
      ['SOL', isFinite(sol.p) ? fmtUsd(sol.p) : '–', `<span class="${cls(sol.c)}">${fmtPct(sol.c)}</span> 24h`],
      ['Trending volume', fmtCompact(vol), `24h, across ${hot.length} trending coins`],
      ['New coins', String(fresh.length), 'launched in the last hour'],
      ['Trending mood', `<span class="${cls(avg)}">${fmtPct(avg)}</span>`, 'median 1h move'],
    ].map(([k, v, s]) => `<div class="panel tile"><div class="label">${k}</div><div class="val">${v}</div><div class="sub muted">${s}</div></div>`).join('');
    $('#movers').innerHTML = moversHtml(6);
  }

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
    if (state.route === 'tokens') renderTokRows();
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
    // keep the newest candle in step with the latest price
    const cs = state.candles[id + '|' + tf];
    if (cs?.length && t.price) {
      const k = cs[cs.length - 1];
      k.c = t.price;
      k.h = Math.max(k.h, t.price);
      k.l = Math.min(k.l, t.price);
    }
    if (state.route === 'trade' && sel()?.id === id) refreshTrade();
  }
  async function liveLoop() {
    if (document.hidden || !isLive()) return;
    if (state.route === 'trade' && due('list', 20000)) refreshList();
    if (state.route === 'tokens' && due('tlist', 20000)) refreshList(state.tokTab);
    if ((state.route === 'stats' || state.route === 'den') && due('hot', 30000)) {
      await Promise.all([once('list:hot', () => loadList('hot')), once('list:new', () => loadList('new'))]);
      if (state.route === 'stats') updStats();
      if (state.route === 'den') $('#den-movers').innerHTML = moversHtml();
    }
    if (due('majors', 30000)) once('majors', loadMajors);
    if (state.wallet && due('bal', 30000)) once('bal', loadBalances).then(() => { if (state.route === 'trade') updTicket(); });
    if (state.route === 'trade') pollSelected();
  }

  // ---------- router ----------
  const ROUTES = { trade: viewTrade, tokens: viewTokens, den: viewDen, launch: viewLaunch, rewards: viewRewards, tasks: viewTasks, stats: viewStats };
  const MOUNT = {
    trade: () => { updChips(); refreshTrade(true); observe('#chart', drawChart); scheduleQuote(); pollSelected(true); },
    tokens: () => { renderTokRows(); if (isLive() && !state.lists[state.tokTab]) refreshList(state.tokTab); },
    den: () => {
      $('#den-movers').innerHTML = moversHtml();
      if (isLive() && !state.lists.hot) refreshList('hot').then(() => { const m = $('#den-movers'); if (m) m.innerHTML = moversHtml(); });
    },
    launch: launchPreview,
    stats: () => {
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
  function route() {
    let h = location.hash.slice(1);
    if (h.startsWith('ref-')) {
      store.set('referredBy', h.slice(4));
      toast(`Invite code ${esc(h.slice(4))} saved. Welcome to the block.`, 'cheer');
      h = 'trade';
      try { history.replaceState(null, '', '#trade'); } catch { /* sandboxed */ }
    }
    if (!ROUTES[h]) h = 'trade';
    const changed = state.route !== h;
    state.route = h;
    if (ro) { ro.disconnect(); ro = null; }
    view.innerHTML = ROUTES[h]();
    state.lastMarketKey = '';
    for (const a of $$('#nav a')) {
      if (a.getAttribute('href') === '#' + h) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    MOUNT[h]?.();
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
      refreshTrade(true);
      scheduleQuote();
      pollSelected(true);
    } else location.hash = 'trade';
  }
  function setTabSelected(act, value) {
    $$(`[data-act="${act}"]`).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === value)));
  }

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || e.target.closest('a')) return;
    const act = el.dataset.act;
    if (act === 'star') {
      e.stopPropagation();
      const id = el.dataset.id;
      if (state.watch.has(id)) state.watch.delete(id); else state.watch.add(id);
      save();
      el.outerHTML = starBtn(id);
      syncAutoTasks();
      if (!isLive()) computeDemoLists();
      else state.lists.watchlist = [...state.watch].filter((m) => state.tok.has(m));
      if (state.route === 'trade') updMarkets(true);
      return;
    }
    switch (act) {
      case 'select':
      case 'open': openToken(el.dataset.id); break;
      case 'mtab':
        state.marketTab = el.dataset.k;
        store.set('marketTab', state.marketTab);
        setTabSelected('mtab', state.marketTab);
        updMarkets(true);
        if (isLive()) refreshList();
        break;
      case 'ttab':
        state.tokTab = el.dataset.k;
        setTabSelected('ttab', state.tokTab);
        renderTokRows();
        if (isLive()) refreshList(state.tokTab);
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
        $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === state.side)));
        $('#ticket-err').textContent = '';
        updChips();
        updTicket();
        scheduleQuote();
        break;
      case 'chip': {
        let v = el.dataset.v;
        if (v === 'max') {
          v = isLive()
            ? Math.max(0, Math.floor(((state.solBal || 0) - CONFIG.solReserve) * solPrice() * 100) / 100)
            : Math.floor(state.cash * 100) / 100;
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
        updTicket();
        scheduleQuote();
        break;
      }
      case 'go':
        if (isLive()) executeLive(); else executePaper();
        break;
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
      case 'follow': {
        const h = el.dataset.h;
        const on = !state.following.has(h);
        if (on) state.following.add(h); else state.following.delete(h);
        save();
        $$(`[data-act="follow"][data-h="${CSS.escape(h)}"]`).forEach((b) => { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Following' : 'Follow'; });
        updTape();
        break;
      }
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
      case 'sort': {
        const k = el.dataset.k;
        state.tokSort = state.tokSort.key === k ? { key: k, dir: -state.tokSort.dir } : { key: k, dir: k === 'sym' ? 1 : -1 };
        renderTokRows();
        break;
      }
      case 'task-done':
        state.tasksDone[el.dataset.id] = true;
        save();
        toast(`+${TASKS.find((t) => t.id === el.dataset.id).crumbs} crumbs. Nice.`, 'cheer');
        route();
        break;
      case 'copy-ref':
        copyText($('#ref-link').value, 'Invite link copied.', $('#ref-link'));
        break;
      case 'copy-mint':
        copyText(sel()?.id || '', 'Mint address copied.');
        break;
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

  let searchTimer = null;
  function runSearch() {
    clearTimeout(searchTimer);
    const q = state.search.trim();
    state.searchIds = null;
    updMarkets(true);
    if (!q || !isLive()) return;
    searchTimer = setTimeout(async () => {
      try {
        const ids = upsert(await http(`${JUP}/tokens/v2/search?query=${encodeURIComponent(q)}`));
        if (state.search.trim() === q) { state.searchIds = ids; updMarkets(true); }
      } catch { /* keep local filter */ }
    }, 300);
  }

  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'mk-search') { state.search = e.target.value; runSearch(); }
    else if (id === 'tok-search') { state.search = e.target.value; renderTokRows(); }
    else if (id === 'amt') {
      const clean = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
      if (clean !== e.target.value) e.target.value = clean;
      state.amount = clean;
      state.sellPct = null;
      $('#ticket-err').textContent = '';
      updTicket();
      scheduleQuote();
    } else if (id === 'max-impact') { state.maxImpact = e.target.value; save(); renderQuote(); }
    else if (id === 'compose-text') { $('#compose-count').textContent = `${280 - e.target.value.length} characters left`; }
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
      ta.value = '';
      $('#compose-count').textContent = '280 characters left';
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
    if (!state.wallet) { btn.textContent = 'Connect wallet'; return; }
    const sol = state.solBal != null ? `◎ ${state.solBal.toFixed(state.solBal >= 100 ? 1 : 3)} · ` : '';
    btn.textContent = sol + shortAddr(state.wallet);
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
    if (state.route === 'trade') { updTicket(); scheduleQuote(); updTape(); }
  }
  async function connectWallet() {
    const p = walletProvider();
    if (!p) {
      toast('No Solana wallet found in this browser. Install Phantom, Solflare or Backpack, then reload the page.', 'worried');
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
    if (state.wallet) { disconnectWallet(); toast('Wallet disconnected.', 'neutral'); }
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
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  function effectiveTheme() {
    return document.documentElement.dataset.theme || (mq.matches ? 'light' : 'dark');
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

  // Hand-drawn "line boil": cycle the wobble filter's noise so Rudy's ink lines shimmer.
  if (!reduceMotion) {
    const noise = document.getElementById('wobble-noise');
    let seed = 1;
    setInterval(() => {
      if (document.hidden) return;
      seed = (seed % 3) + 1;
      noise.setAttribute('seed', String(seed));
    }, 180);
  }

  // ---------- boot ----------
  async function boot() {
    $('#brand-badge').innerHTML = rudy('happy');
    renderTicker();
    renderBanner();
    window.addEventListener('hashchange', route);
    route();
    try {
      const [hot] = await Promise.all([
        http(JUP + LIST_URL.hot, { timeout: 9000 }),
        http(`${JUP}/tokens/v2/search?query=${SOL_MINT}`, { timeout: 9000 }).then(upsert),
      ]);
      state.mode = 'live';
      state.lists.hot = upsert(hot);
      if (state.selected && !state.tok.has(state.selected)) await loadMints([state.selected]).catch(() => []);
      if (!state.tok.has(state.selected) || state.selected === SOL_MINT) {
        state.selected = state.lists.hot.find((id) => id !== SOL_MINT) || state.lists.hot[0];
      }
      loadMajors();
      setInterval(liveLoop, 2000);
    } catch {
      startDemo();
      setInterval(() => {
        demoTick();
        if (document.hidden) return;
        if (state.route === 'trade') refreshTrade();
        else if (state.route === 'tokens') updTokCells();
        else if (state.route === 'stats') updStats();
      }, 1500);
    }
    renderTicker();
    renderBanner();
    route();
    syncAutoTasks();
    silentReconnect();
  }
  boot();
})();
