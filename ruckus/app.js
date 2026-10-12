/* Ruckus — paper-trading front end for a Solana social trading desk.
   No build step, no framework. Token markets are simulated in the browser;
   SOL/BTC/ETH prices come from CoinGecko when the network allows it. */
(() => {
  'use strict';

  // Change these before going live.
  const CONFIG = {
    xUrl: 'https://x.com',          // your project's X profile
    refBase: '',                     // e.g. 'https://ruckus.example/' (defaults to this page)
    startingCash: 1000,              // paper balance in USD
  };

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

  // ---------- randomness ----------
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
    if (p >= 1) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 0.001) return '$' + p.toPrecision(4);
    // DEX-style: 0.000061 -> $0.0₄61
    const [mant, ex] = p.toExponential(3).split('e');
    const zeros = -parseInt(ex, 10) - 1;
    const digits = mant.replace('.', '').replace(/0+$/, '') || '0';
    return '$0.0' + [...String(zeros)].map((d) => SUB[d]).join('') + digits;
  }
  function fmtUsd(n, dp = 2) {
    if (Math.abs(n) < 0.5 * 10 ** -dp) n = 0;
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return (n < 0 ? '-$' : '$') + s;
  }
  function fmtCompact(n, prefix = '$') {
    const a = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (a >= 1e9) return sign + prefix + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return sign + prefix + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return sign + prefix + (a / 1e3).toFixed(1) + 'K';
    return sign + prefix + a.toFixed(a < 10 ? 2 : 0);
  }
  const fmtQty = (n) => fmtCompact(n, '');
  const fmtPct = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
  const cls = (x) => (x >= 0 ? 'up' : 'down');
  function fmtAgo(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h';
    return Math.floor(sec / 86400) + 'd';
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

  // ---------- seed data ----------
  const SUPPLY = 1e9;
  // sym, name, price, volatility per tick, colour, blurb, age (minutes), holders, 24h change
  const SEEDS = [
    ['BINLID', 'Bin Lid', 0.00412, 0.012, '#f5a524', 'The lid is off. The flagship coin for people who trade after midnight.', 2900, 8412, 0.34],
    ['MASKED', 'Masked Bandit', 0.0187, 0.008, '#a3adb8', 'Steals the show, never the funds. Mint authority renounced.', 12400, 21877, 0.081],
    ['NIGHTSHIFT', 'Night Shift', 0.00093, 0.015, '#7cc4f2', 'For everyone clocking in when the charts get weird.', 640, 2215, 1.12],
    ['CRUMB', 'Crumb', 0.000061, 0.02, '#e9c58f', 'Small bites add up. Mostly.', 95, 611, 2.4],
    ['SODIUM', 'Streetlight', 0.00248, 0.01, '#ffcf6b', 'Glows orange. Attracts moths and traders alike.', 5100, 9930, -0.12],
    ['GRUB', 'Grub Club', 0.00731, 0.009, '#9ad17a', 'A members-only snack fund. The coin is the membership.', 8800, 14002, 0.05],
    ['PAWS', 'Wet Paws', 0.000284, 0.016, '#c9b2f0', 'Washes everything before eating it, including your bags.', 410, 1840, -0.27],
    ['ALLEY', 'Alley Cat', 0.0412, 0.006, '#f08a7e', 'The neighbourhood rival. Slow, steady and smug about it.', 30100, 40210, 0.018],
    ['RINSE', 'Rinse Cycle', 0.00119, 0.013, '#8fd3c7', 'Up, down, spin, repeat.', 1700, 3320, -0.06],
    ['TRASHTV', 'Trash TV', 0.000038, 0.022, '#f4a3c4', 'A reality show coin. Every candle is an episode.', 22, 148, 3.8],
    ['DUMPY', 'Dumpy', 0.00557, 0.011, '#b8c27a', 'Named after the dumpster, not the chart. Hopefully.', 4300, 6120, 0.21],
    ['MOONPIE', 'Half Moonpie', 0.000176, 0.017, '#ffd9a0', 'Half a moon is still a moon.', 260, 990, 0.62],
  ];

  const TRADERS = [
    { h: '3am_mara', n: 'Mara at 3am', pnl: 31877, win: 0.71, c: '#9ad17a' },
    { h: 'dumpsterdiver', n: 'Dumpster Diver', pnl: 18420, win: 0.64, c: '#f5a524' },
    { h: 'sodium_sam', n: 'Sodium Sam', pnl: 12050, win: 0.6, c: '#ffcf6b' },
    { h: 'lidlifter', n: 'Lid Lifter', pnl: 9120, win: 0.58, c: '#7cc4f2' },
    { h: 'quietpaws', n: 'Quiet Paws', pnl: 4410, win: 0.52, c: '#c9b2f0' },
    { h: 'binchicken', n: 'Bin Chicken', pnl: -1290, win: 0.44, c: '#f08a7e' },
  ];
  const traderBy = (h) => TRADERS.find((t) => t.h === h);

  const SEED_POSTS = [
    { h: 'dumpsterdiver', m: 3, text: '$BINLID holders up 8% since last night. The chart looks like stairs and I like stairs.', likes: 87 },
    { h: '3am_mara', m: 9, text: 'Took profit on $NIGHTSHIFT at 2.1x. Leaving a small bag in the bin for later.', likes: 41 },
    { h: 'quietpaws', m: 24, text: 'Reminder: set your slippage before you buy anything under $100K market cap. 30% is a ceiling, not a target.', likes: 132 },
    { h: 'binchicken', m: 47, text: 'Sold $TRASHTV too early again. Season finale energy.', likes: 19 },
    { h: 'sodium_sam', m: 74, text: '$MOONPIE just cleared 60% of its bonding curve. Watching, not buying yet.', likes: 56 },
    { h: 'lidlifter', m: 130, text: 'Quiet night. $ALLEY doing its usual 1% shuffle. Going to bed.', likes: 12 },
  ];

  const TASKS = [
    { id: 'follow', t: 'Follow Ruckus on X', d: 'Open X, follow the account, then mark this done.', crumbs: 50, link: true },
    { id: 'share', t: 'Share a paper trade', d: 'Post a screenshot of a trade from this page on X.', crumbs: 120, link: true },
    { id: 'trades', t: 'Make 3 paper trades', d: 'Counted automatically on this device.', crumbs: 80, auto: 'trades', goal: 3 },
    { id: 'watch', t: 'Watch 5 coins', d: 'Star coins in the market list. Counted automatically.', crumbs: 40, auto: 'watch', goal: 5 },
    { id: 'launch', t: 'Launch a demo coin', d: 'Use the Launch page. Counted automatically.', crumbs: 150, auto: 'launch', goal: 1 },
    { id: 'post', t: 'Post in The Den', d: 'Say hi to the other night owls.', crumbs: 30, auto: 'post', goal: 1 },
  ];

  // ---------- state ----------
  const state = {
    route: 'trade',
    tokens: [],
    selected: store.get('selected', 'BINLID'),
    marketTab: store.get('marketTab', 'hot'),
    search: '',
    side: 'buy',
    amount: '50',
    slip: 30,
    cash: store.get('cash', CONFIG.startingCash),
    positions: store.get('positions', {}),
    watch: new Set(store.get('watch', ['BINLID', 'SODIUM'])),
    following: new Set(store.get('following', [])),
    liked: new Set(store.get('liked', [])),
    myPosts: store.get('myPosts', []),
    tasksDone: store.get('tasksDone', {}),
    counts: store.get('counts', { trades: 0, launch: 0, post: 0 }),
    refCode: store.get('refCode', null),
    majors: {
      SOL: { p: 185, c: 0.021, live: false },
      BTC: { p: 112000, c: 0.006, live: false },
      ETH: { p: 4100, c: -0.004, live: false },
    },
    wallet: null,
    online: 160 + Math.floor(rand() * 60),
    trades24: 48211,
    tick: 0,
    mood: null,
    moodUntil: 0,
    tokSort: { key: 'vol', dir: -1 },
    launchImg: null,
    lastMarketKey: '',
  };
  const startedAt = Date.now();
  if (!state.refCode) {
    const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    state.refCode = Array.from({ length: 6 }, () => a[Math.floor(rand() * a.length)]).join('');
    store.set('refCode', state.refCode);
  }

  function makeCandles(price, sigma, r) {
    const n = 110, steps = 6;
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
    return raw.map(([o, h, l, c, v]) => ({
      o: Math.exp(o + shift), h: Math.exp(h + shift), l: Math.exp(l + shift), c: Math.exp(c + shift), v: v * volBase,
    }));
  }

  function makeToken([sym, name, price, sigma, color, blurb, ageMin, holders, chg24], extra = {}) {
    const r = rng(sym.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
    const t = {
      sym, name, price, sigma, color, blurb, holders,
      born: Date.now() - ageMin * 60000,
      ref24: price / (1 + chg24),
      candles: makeCandles(price, sigma, r),
      vol24: price * SUPPLY * (0.15 + r() * 0.5),
      tape: [],
      img: null,
      ...extra,
    };
    for (let i = 0; i < 14; i++) t.tape.push(fakeTrade(t, Date.now() - (14 - i) * 9000 * (0.5 + rand())));
    return t;
  }

  function fakeTrade(t, ts = Date.now()) {
    const usd = Math.exp(Math.log(5) + rand() * Math.log(1200));
    const who = rand() < 0.35 ? pick(TRADERS).h : randomWallet();
    return { ts, side: rand() < 0.53 ? 'buy' : 'sell', usd, qty: usd / t.price, who };
  }
  function randomWallet() {
    const a = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const s = (n) => Array.from({ length: n }, () => a[Math.floor(rand() * a.length)]).join('');
    return s(4) + '…' + s(4);
  }

  state.tokens = SEEDS.map((s) => makeToken(s));
  const tokenBy = (sym) => state.tokens.find((t) => t.sym === sym);
  if (!tokenBy(state.selected)) state.selected = 'BINLID';
  // Drop paper positions for coins that only existed in an earlier session (demo launches).
  for (const sym of Object.keys(state.positions)) if (!tokenBy(sym)) delete state.positions[sym];

  const mc = (t) => t.price * SUPPLY;
  const chg24 = (t) => t.price / t.ref24 - 1;
  const sel = () => tokenBy(state.selected);
  const solPrice = () => state.majors.SOL.p;

  function save() {
    store.set('cash', state.cash);
    store.set('positions', state.positions);
    store.set('watch', [...state.watch]);
    store.set('following', [...state.following]);
    store.set('liked', [...state.liked]);
    store.set('myPosts', state.myPosts);
    store.set('tasksDone', state.tasksDone);
    store.set('counts', state.counts);
  }

  // ---------- toasts ----------
  function toast(msg, mood = 'happy') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = rudy(mood) + `<div>${msg}</div>`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 4200);
  }

  // ---------- shared bits ----------
  function coinBadge(t, size = '') {
    const inner = t.img ? `<img src="${t.img}" alt="">` : esc(t.sym.slice(0, 2));
    return `<span class="coin ${size}" style="background:${t.color}" aria-hidden="true">${inner}</span>`;
  }
  const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path></svg>';
  const STAR_O = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path></svg>';
  function starBtn(sym) {
    const on = state.watch.has(sym);
    return `<button class="star" type="button" data-act="star" data-sym="${sym}" aria-pressed="${on}" aria-label="${on ? 'Remove' : 'Add'} ${sym} ${on ? 'from' : 'to'} watchlist">${on ? STAR : STAR_O}</button>`;
  }
  function avatar(h) {
    const t = traderBy(h);
    const color = t ? t.c : '#a3adb8';
    const label = t ? t.n.split(' ').map((w) => w[0]).join('').slice(0, 2) : 'ME';
    return `<span class="avatar" style="background:${color}" aria-hidden="true">${esc(label)}</span>`;
  }
  function personRow(t) {
    const on = state.following.has(t.h);
    return `<li class="person">${avatar(t.h)}
      <div><b>${esc(t.n)}</b><span>@${esc(t.h)} · <span class="${cls(t.pnl)}">${fmtCompact(t.pnl)}</span> 30d · ${Math.round(t.win * 100)}% wins</span></div>
      <button class="btn btn-sm follow" type="button" data-act="follow" data-h="${t.h}" aria-pressed="${on}">${on ? 'Following' : 'Follow'}</button></li>`;
  }
  function tickerLinks(text) {
    return esc(text).replace(/\$([A-Z0-9]{2,10})\b/g, (m, sym) =>
      tokenBy(sym) ? `<button type="button" class="tag" data-act="open" data-sym="${sym}">$${sym}</button>` : m);
  }
  function portfolio() {
    let value = 0, cost = 0;
    for (const [sym, p] of Object.entries(state.positions)) {
      const t = tokenBy(sym);
      if (!t) continue;
      value += p.qty * t.price;
      cost += p.cost;
    }
    return { value, cost, total: state.cash + value };
  }
  function crumbsTotal() {
    return TASKS.reduce((s, t) => s + (state.tasksDone[t.id] ? t.crumbs : 0), 0);
  }

  // ---------- ticker ----------
  function renderTicker() {
    const m = state.majors;
    const live = m.SOL.live;
    $('#ticker').innerHTML = ['SOL', 'BTC', 'ETH'].map((k) =>
      `<span><b>${k}</b>${fmtUsd(m[k].p, m[k].p > 1000 ? 0 : 2)} <span class="${cls(m[k].c)}">${fmtPct(m[k].c)}</span></span>`).join('') +
      `<span class="status"><span class="dot ${live ? '' : 'off'}"></span>${live ? 'Live prices' : 'Estimated prices'} · ${state.online} night owls online</span>`;
  }
  async function fetchMajors() {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana,bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true', { signal: ctl.signal });
      if (!res.ok) throw new Error(res.status);
      const d = await res.json();
      const map = { SOL: 'solana', BTC: 'bitcoin', ETH: 'ethereum' };
      for (const [k, id] of Object.entries(map)) {
        if (d[id]?.usd) state.majors[k] = { p: d[id].usd, c: (d[id].usd_24h_change || 0) / 100, live: true };
      }
    } catch { /* offline or blocked: keep estimates */ }
    clearTimeout(timer);
    renderTicker();
  }

  // ---------- trade view ----------
  const MARKET_TABS = [['hot', 'Hot'], ['new', 'New'], ['watchlist', 'Watchlist'], ['holding', 'Holding'], ['top', 'Top']];

  function viewTrade() {
    return `<div class="desk">
  <section class="panel desk-markets" aria-label="Markets">
    <div class="tabs" role="tablist" aria-label="Market lists">${MARKET_TABS.map(([k, l]) =>
      `<button class="tab" role="tab" type="button" data-act="mtab" data-k="${k}" aria-selected="${state.marketTab === k}">${l}</button>`).join('')}</div>
    <div class="market-search"><input class="input" id="mk-search" type="search" placeholder="Search coin or ticker" autocomplete="off" value="${esc(state.search)}" aria-label="Search coins"></div>
    <ul class="market-list" id="mk-list" role="listbox" aria-label="Coins"></ul>
  </section>
  <div class="desk-chart">
    <section class="panel">
      <div class="token-head" id="tok-head"></div>
      <div class="chart-box"><canvas id="chart" role="img" aria-label="Price chart"></canvas><span class="chart-note">15s candles · simulated</span></div>
      <div class="stat-row" id="tok-stats"></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Live trades</h2><span class="label" id="tape-sym"></span></div>
      <div class="table-scroll"><table class="tape"><thead><tr><th>Age</th><th>Side</th><th class="r">USD</th><th class="r">Coins</th><th>Trader</th></tr></thead><tbody id="tape"></tbody></table></div>
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
        <div class="chips">${[10, 50, 100, 500].map((v) => `<button type="button" class="chip" data-act="chip" data-v="${v}">$${v}</button>`).join('')}<button type="button" class="chip" data-act="chip" data-v="max">Max</button></div>
        <div class="fee-line"><span class="slip"><label for="slip">Slippage</label><input id="slip" inputmode="decimal" value="${state.slip}">%</span><span>0% ruckus fee · network ≈ 0.00001 SOL</span></div>
        <div class="err" id="ticket-err" role="alert"></div>
        <button class="btn btn-primary btn-block" type="button" id="ticket-go" data-act="go"></button>
      </div>
      <div class="panel-body stack panel-split">
        <dl class="balance" id="balance"></dl>
        <button class="btn btn-sm" type="button" data-act="reset">Reset paper balance</button>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Traders to follow</h2><a href="#den" class="label">See all</a></div>
      <ul class="people" id="people">${TRADERS.slice(0, 4).map(personRow).join('')}</ul>
    </section>
  </div>
</div>`;
  }

  function marketSyms() {
    let list = [...state.tokens];
    const q = state.search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.sym.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
    switch (state.marketTab) {
      case 'new': list.sort((a, b) => b.born - a.born); break;
      case 'watchlist': list = list.filter((t) => state.watch.has(t.sym)); break;
      case 'holding': list = list.filter((t) => state.positions[t.sym]?.qty > 0); break;
      case 'top': list.sort((a, b) => mc(b) - mc(a)); break;
      default: list.sort((a, b) => b.vol24 - a.vol24);
    }
    return list.map((t) => t.sym);
  }
  function marketFigs(t) {
    return `<div class="num">${fmtCompact(mc(t))}</div><div class="num ${cls(chg24(t))}">${fmtPct(chg24(t))}</div>`;
  }
  function updMarkets(force = false) {
    const list = $('#mk-list');
    if (!list) return;
    const syms = marketSyms();
    const key = state.marketTab + '|' + syms.join(',') + '|' + state.selected + '|' + [...state.watch].join(',');
    if (force || key !== state.lastMarketKey) {
      state.lastMarketKey = key;
      if (!syms.length) {
        const msg = {
          watchlist: '<b>No coins on your watchlist.</b>Tap the star next to a coin to keep an eye on it.',
          holding: '<b>Rudy’s pockets are empty.</b>Buy a coin and it shows up here.',
        }[state.marketTab] || '<b>No coins match that search.</b>Try a ticker like BINLID.';
        list.innerHTML = `<li class="empty">${rudy(state.marketTab === 'holding' ? 'neutral' : 'worried')}${msg}</li>`;
        return;
      }
      list.innerHTML = syms.map((sym) => {
        const t = tokenBy(sym);
        return `<li class="market-row" role="option" tabindex="0" data-act="select" data-sym="${sym}" aria-selected="${sym === state.selected}">
          ${coinBadge(t)}<div class="who"><b>${esc(t.sym)}</b><span>${esc(t.name)}</span></div>
          <div class="figs" data-figs="${sym}">${marketFigs(t)}</div>${starBtn(sym)}</li>`;
      }).join('');
      return;
    }
    for (const sym of syms) {
      const el = list.querySelector(`[data-figs="${sym}"]`);
      if (el) el.innerHTML = marketFigs(tokenBy(sym));
    }
  }

  function updToken() {
    const t = sel();
    const head = $('#tok-head');
    if (!head) return;
    const age = (Date.now() - t.born) / 1000;
    head.innerHTML = `${coinBadge(t, 'lg')}
      <div class="title"><h1>${esc(t.name)} <small>$${esc(t.sym)}</small></h1><p>${esc(t.blurb)}</p></div>
      <div class="token-price"><div class="big">${fmtPrice(t.price)}</div><div class="num ${cls(chg24(t))}">${fmtPct(chg24(t))} 24h</div></div>`;
    $('#tok-stats').innerHTML = [
      ['Market cap', fmtCompact(mc(t))],
      ['Volume 24h', fmtCompact(t.vol24)],
      ['Holders', t.holders.toLocaleString('en-US')],
      ['Age', fmtAgo(age)],
    ].map(([k, v]) => `<div><div class="label">${k}</div><div class="val">${v}</div></div>`).join('');
    $('#tape-sym').textContent = '$' + t.sym;
    $('#ticket-title').textContent = (state.side === 'buy' ? 'Buy ' : 'Sell ') + '$' + t.sym;
  }

  function updTape() {
    const body = $('#tape');
    if (!body) return;
    const t = sel();
    const now = Date.now();
    body.innerHTML = t.tape.slice(-12).reverse().map((x) => {
      const who = x.who === 'you' ? '<b>you</b>' : traderBy(x.who) ? '@' + esc(x.who) : esc(x.who);
      return `<tr><td>${fmtAgo((now - x.ts) / 1000)}</td><td class="${x.side === 'buy' ? 'up' : 'down'}">${x.side}</td><td class="r">${fmtUsd(x.usd)}</td><td class="r">${fmtQty(x.qty)}</td><td>${who}</td></tr>`;
    }).join('');
  }

  function updTicket() {
    const t = sel();
    const go = $('#ticket-go');
    if (!go) return;
    const usd = parseFloat(state.amount);
    const conv = $('#conv');
    if (usd > 0) conv.textContent = `≈ ${(usd / solPrice()).toFixed(4)} SOL · ${fmtQty(usd / t.price)} ${t.sym}`;
    else conv.textContent = 'Enter an amount';
    go.textContent = (state.side === 'buy' ? 'Buy ' : 'Sell ') + '$' + t.sym;
    go.classList.toggle('sell', state.side === 'sell');
    $('#ticket-title').textContent = (state.side === 'buy' ? 'Buy ' : 'Sell ') + '$' + t.sym;

    const pf = portfolio();
    const pos = state.positions[t.sym];
    const pnl = pf.total - CONFIG.startingCash;
    const rows = [
      ['Paper cash', fmtUsd(state.cash)],
      ['In coins', fmtUsd(pf.value)],
      ['Total', fmtUsd(pf.total)],
      ['P&L since start', `<span class="${cls(pnl)}">${fmtUsd(pnl)}</span>`],
    ];
    if (pos?.qty > 0) {
      const val = pos.qty * t.price;
      rows.push([`Your $${esc(t.sym)}`, `${fmtQty(pos.qty)} · <span class="${cls(val - pos.cost)}">${fmtUsd(val)}</span>`]);
    }
    $('#balance').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    updMood();
  }

  function currentMood() {
    if (state.mood && Date.now() < state.moodUntil) return state.mood;
    const t = sel();
    const pos = state.positions[t.sym];
    if (pos?.qty > 0) {
      const r = (pos.qty * t.price) / pos.cost - 1;
      return r > 0.02 ? 'happy' : r < -0.08 ? 'worried' : 'neutral';
    }
    const cs = t.candles;
    const r = t.price / cs[Math.max(0, cs.length - 8)].o - 1;
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

  function executeTrade() {
    const t = sel();
    const err = $('#ticket-err');
    err.textContent = '';
    const usd = parseFloat(state.amount);
    const slip = parseFloat(state.slip);
    if (!(usd > 0)) { err.textContent = 'Enter an amount above $0.'; return; }
    if (!(slip > 0 && slip <= 50)) { err.textContent = 'Set slippage between 0.1% and 50%.'; return; }
    const impact = usd / (mc(t) * 0.002) / 100;
    if (impact > slip / 100) {
      err.textContent = `This trade would move the price ${(impact * 100).toFixed(1)}%, more than your ${slip}% slippage. Trade less or raise slippage.`;
      return;
    }
    const pos = state.positions[t.sym] || { qty: 0, cost: 0 };
    let qty, spent;
    if (state.side === 'buy') {
      if (usd > state.cash + 1e-9) { err.textContent = `Not enough paper cash. You have ${fmtUsd(state.cash)}.`; return; }
      const fill = t.price * (1 + impact);
      qty = usd / fill;
      spent = usd;
      pos.qty += qty;
      pos.cost += usd;
      state.cash -= usd;
      bumpPrice(t, impact * 0.6);
    } else {
      if (!(pos.qty > 0)) { err.textContent = `You don't hold any $${t.sym} yet.`; return; }
      const fill = t.price * (1 - impact);
      qty = Math.min(pos.qty, usd / fill);
      spent = qty * fill;
      pos.cost *= 1 - qty / pos.qty;
      pos.qty -= qty;
      state.cash += spent;
      bumpPrice(t, -impact * 0.6);
    }
    if (pos.qty * t.price < 0.01) delete state.positions[t.sym];
    else state.positions[t.sym] = pos;
    t.tape.push({ ts: Date.now(), side: state.side, usd: spent, qty, who: 'you' });
    t.vol24 += spent;
    state.counts.trades++;
    state.trades24++;
    save();
    setMood(state.side === 'buy' ? 'cheer' : 'happy');
    toast(`${state.side === 'buy' ? 'Bought' : 'Sold'} ${fmtQty(qty)} $${esc(t.sym)} for ${fmtUsd(spent)} (paper).`, state.side === 'buy' ? 'cheer' : 'happy');
    refreshTrade(true);
  }
  function bumpPrice(t, r) {
    t.price *= 1 + r;
    const c = t.candles[t.candles.length - 1];
    c.c = t.price;
    c.h = Math.max(c.h, t.price);
    c.l = Math.min(c.l, t.price);
  }

  function refreshTrade(forceList = false) {
    updMarkets(forceList);
    updToken();
    updTape();
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

  function drawChart() {
    const cv = $('#chart');
    if (!cv) return;
    const { g, W, H } = fitCanvas(cv);
    const c = css();
    const col = (k) => c.getPropertyValue(k).trim();
    const mono = c.getPropertyValue('--font-mono');
    const axisW = 84, padT = 30, padB = 20, volH = 44;
    const plotW = W - axisW;
    const plotH = H - padT - padB - volH;
    const n = Math.min(sel().candles.length, Math.max(24, Math.floor(plotW / 9)));
    const cs = sel().candles.slice(-n);
    let hi = -Infinity, lo = Infinity, vmax = 0;
    for (const k of cs) { hi = Math.max(hi, k.h); lo = Math.min(lo, k.l); vmax = Math.max(vmax, k.v); }
    const pad = (hi - lo) * 0.08 || hi * 0.01;
    hi += pad; lo -= pad;
    const y = (p) => padT + ((hi - p) / (hi - lo)) * plotH;

    g.font = `11px ${mono}`;
    g.textBaseline = 'middle';
    g.lineWidth = 1;
    const lastY = y(cs[cs.length - 1].c);
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
      const vh = (k.v / vmax) * (volH - 8);
      g.globalAlpha = 0.35;
      g.fillRect(x - bw / 2, H - padB - vh, bw, vh);
      g.globalAlpha = 1;
    });

    const last = cs[cs.length - 1].c;
    const ly = Math.round(y(last)) + 0.5;
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

    g.fillStyle = col('--muted');
    g.textAlign = 'center';
    for (let i = n - 1; i >= 6; i -= 16) {
      const secs = (n - 1 - i) * 15;
      g.fillText(secs ? '-' + fmtAgo(secs) : 'now', i * step + step / 2, H - 8);
    }
    g.textAlign = 'left';
  }

  // Daily volume for the Stats page (seeded so it stays put between visits).
  const DAILY = (() => {
    const r = rng(42);
    const out = [];
    let v = 2.1e6;
    for (let i = 13; i >= 0; i--) {
      v *= 1 + (r() - 0.42) * 0.35;
      const d = new Date(Date.now() - i * 86400000);
      out.push({ d, v });
    }
    return out;
  })();
  function drawBars() {
    const cv = $('#bars');
    if (!cv) return;
    const { g, W, H } = fitCanvas(cv);
    const c = css();
    const col = (k) => c.getPropertyValue(k).trim();
    const mono = c.getPropertyValue('--font-mono');
    const padL = 56, padB = 22, padT = 10;
    const max = Math.max(...DAILY.map((x) => x.v)) * 1.1;
    const plotW = W - padL, plotH = H - padB - padT;
    const y = (v) => padT + plotH - (v / max) * plotH;
    g.font = `11px ${mono}`;
    g.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const v = (max * i) / 3;
      const yy = Math.round(y(v)) + 0.5;
      g.strokeStyle = col('--line');
      g.beginPath(); g.moveTo(padL, yy); g.lineTo(W, yy); g.stroke();
      g.fillStyle = col('--muted');
      g.fillText(fmtCompact(v), 2, yy);
    }
    const step = plotW / DAILY.length;
    const bw = Math.max(4, step * 0.6);
    g.textAlign = 'center';
    DAILY.forEach((x, i) => {
      const cx = padL + i * step + step / 2;
      const isToday = i === DAILY.length - 1;
      g.fillStyle = isToday ? col('--accent') : col('--muted');
      g.globalAlpha = isToday ? 1 : 0.55;
      g.fillRect(cx - bw / 2, y(x.v), bw, padT + plotH - y(x.v));
      g.globalAlpha = 1;
      if (i % 2 === 1 || isToday) {
        g.fillStyle = col('--muted');
        g.fillText(isToday ? 'today' : x.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cx, H - 8);
      }
    });
    g.textAlign = 'left';
  }

  // ---------- tokens view ----------
  const TOK_COLS = [
    ['sym', 'Coin'], ['price', 'Price'], ['chg', '24h'], ['mc', 'Market cap'], ['vol', 'Volume 24h'], ['holders', 'Holders'], ['age', 'Age'],
  ];
  const tokVal = {
    sym: (t) => t.sym, price: (t) => t.price, chg: chg24, mc, vol: (t) => t.vol24, holders: (t) => t.holders, age: (t) => -t.born,
  };
  function viewTokens() {
    return `<div class="page-head"><div><h1>Every coin on the block</h1><p>Sorted by what moved tonight. Tap a row to open its chart.</p></div>
      <input class="input" id="tok-search" type="search" placeholder="Filter coins" style="max-width:260px" autocomplete="off" aria-label="Filter coins" value="${esc(state.search)}"></div>
      <section class="panel"><div class="table-scroll"><table class="big-table">
        <thead><tr id="tok-headrow"></tr></thead><tbody id="tok-body"></tbody></table></div></section>`;
  }
  function renderTokRows() {
    const { key, dir } = state.tokSort;
    const q = state.search.trim().toLowerCase();
    const list = state.tokens
      .filter((t) => !q || t.sym.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const A = tokVal[key](a), B = tokVal[key](b);
        return (A > B ? 1 : A < B ? -1 : 0) * dir;
      });
    $('#tok-headrow').innerHTML = TOK_COLS.map(([k, l]) => {
      const s = state.tokSort.key === k ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : '';
      return `<th${s}><button type="button" data-act="sort" data-k="${k}">${l}${s ? (dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
    }).join('') + '<th><span class="sr-only">Watch</span></th>';
    $('#tok-body').innerHTML = list.length ? list.map((t) => `<tr data-act="open" data-sym="${t.sym}">
      <td><div class="tok-cell">${coinBadge(t)}<div><b>${esc(t.sym)}</b><span>${esc(t.name)}</span></div></div></td>
      <td data-f="price"></td><td data-f="chg"></td><td data-f="mc"></td><td data-f="vol"></td><td data-f="holders"></td><td data-f="age"></td>
      <td>${starBtn(t.sym)}</td></tr>`).join('')
      : `<tr><td colspan="8"><div class="empty">${rudy('worried')}<b>No coins match that filter.</b></div></td></tr>`;
    updTokCells();
  }
  function updTokCells() {
    for (const tr of $$('#tok-body tr[data-sym]')) {
      const t = tokenBy(tr.dataset.sym);
      const set = (f, html) => { tr.querySelector(`[data-f="${f}"]`).innerHTML = html; };
      set('price', fmtPrice(t.price));
      set('chg', `<span class="${cls(chg24(t))}">${fmtPct(chg24(t))}</span>`);
      set('mc', fmtCompact(mc(t)));
      set('vol', fmtCompact(t.vol24));
      set('holders', t.holders.toLocaleString('en-US'));
      set('age', fmtAgo((Date.now() - t.born) / 1000));
    }
  }

  // ---------- den (social) ----------
  function allPosts() {
    const seeded = SEED_POSTS.map((p, i) => ({ ...p, id: 's' + i, ts: startedAt - p.m * 60000 }));
    return [...state.myPosts, ...seeded].sort((a, b) => b.ts - a.ts);
  }
  function postHtml(p) {
    const t = traderBy(p.h);
    const name = t ? t.n : 'You';
    const handle = t ? '@' + t.h : '@you';
    const liked = state.liked.has(p.id);
    return `<article class="post">${avatar(p.h)}<div>
      <div class="post-meta"><b>${esc(name)}</b><span>${esc(handle)}</span><span>· ${fmtAgo((Date.now() - p.ts) / 1000)}</span></div>
      <p>${tickerLinks(p.text)}</p>
      <div class="post-actions"><button type="button" data-act="like" data-id="${p.id}" aria-pressed="${liked}">♥ <span>${p.likes + (liked ? 1 : 0)}</span></button></div>
    </div></article>`;
  }
  function viewDen() {
    const movers = [...state.tokens].sort((a, b) => Math.abs(chg24(b)) - Math.abs(chg24(a))).slice(0, 5);
    return `<div class="page-head"><div><h1>The Den</h1><p>Where the night shift talks trades. Tag a coin with $TICKER and it links to its chart.</p></div></div>
    <div class="grid-2">
      <div class="panel">
        <form class="panel-body compose" id="compose">
          <label class="label" for="compose-text">Post to The Den</label>
          <textarea class="input" id="compose-text" maxlength="280" placeholder="What are you watching tonight? Try $BINLID"></textarea>
          <div class="compose-foot"><span class="hint" id="compose-count">280 characters left</span><button class="btn btn-primary" type="submit">Post</button></div>
        </form>
        <div id="feed">${allPosts().map(postHtml).join('')}</div>
      </div>
      <div class="stack-col">
        <section class="panel"><div class="panel-head"><h2>Traders to follow</h2><span class="label">30-day P&amp;L</span></div><ul class="people">${TRADERS.map(personRow).join('')}</ul></section>
        <section class="panel"><div class="panel-head"><h2>Biggest moves tonight</h2></div><ul class="market-list">${movers.map((t) => `
          <li class="market-row" role="button" tabindex="0" data-act="open" data-sym="${t.sym}">${coinBadge(t)}<div class="who"><b>${esc(t.sym)}</b><span>${esc(t.name)}</span></div><div class="figs">${marketFigs(t)}</div><span></span></li>`).join('')}</ul></section>
      </div>
    </div>`;
  }

  // ---------- launch ----------
  function viewLaunch() {
    return `<div class="page-head"><div><h1>Launch a coin</h1><p>Every coin starts on a bonding curve paired with SOL. When the curve fills, liquidity moves to a DEX pool. In this demo the coin lives in your browser only.</p></div></div>
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
        <button class="btn btn-primary btn-block" type="submit">Launch coin</button>
      </form>
      <div class="stack-col">
        <section class="panel preview-card" aria-label="Preview">
          <span class="label">Preview</span>
          <div class="row"><span id="p-badge">${coinBadge({ sym: '??', color: '#f5a524' }, 'lg')}</span><div><h3 id="p-name">Your coin</h3><span class="mono muted" id="p-sym">$TICKER</span></div></div>
          <p id="p-desc">Your description shows up here.</p>
          <div><div class="fee-line"><span>Bonding curve</span><span class="mono" id="p-curve-pct">0%</span></div><div class="curve"><i id="p-curve" style="width:0%"></i></div></div>
          <div class="fee-line"><span>Starting market cap</span><span class="mono" id="p-mc">$4.2K</span></div>
        </section>
        <section class="panel hero-strip">${rudy('happy')}<div><b>Rudy’s launch checklist</b><p class="muted">Pick a ticker people can say out loud. Write a description that a stranger understands. Don’t promise returns.</p></div></section>
      </div>
    </div>`;
  }
  const LAUNCH_MC = 4200;
  const CURVE_SOL = 85;
  function launchPreview() {
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
    $('#p-mc').textContent = fmtCompact(LAUNCH_MC + buy * solPrice());
    $('#p-badge').innerHTML = coinBadge({ sym: sym || '??', color: '#f5a524', img: state.launchImg }, 'lg');
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
    setErr('#e-name', name.length < 2 ? 'Give the coin a name of at least 2 characters.' : '');
    setErr('#e-sym', !/^[A-Z0-9]{2,10}$/.test(sym) ? 'Use 2–10 letters or numbers for the ticker.' : tokenBy(sym) ? `$${sym} already exists. Pick another ticker.` : '');
    setErr('#e-buy', buyRaw && !(buy >= 0 && buy <= 50) ? 'Enter a first buy between 0 and 50 SOL.' : '');
    if (!ok) { $('#launch-form .err:not(:empty)')?.previousElementSibling?.focus(); return; }
    const usdIn = buy * solPrice();
    const price = (LAUNCH_MC + usdIn) / SUPPLY;
    const palette = ['#f5a524', '#7cc4f2', '#9ad17a', '#c9b2f0', '#f08a7e', '#8fd3c7'];
    const t = makeToken([sym, name, price, 0.018, pick(palette), desc || 'Freshly launched on Ruckus.', 0, 1, 0], { img: state.launchImg });
    t.candles = t.candles.slice(-3).map(() => ({ o: price, h: price, l: price, c: price, v: 1 }));
    t.tape = [];
    t.vol24 = usdIn;
    state.tokens.push(t);
    if (usdIn > 0) {
      const qty = usdIn / price;
      t.tape.push({ ts: Date.now(), side: 'buy', usd: usdIn, qty, who: 'you' });
      state.positions[sym] = { qty, cost: usdIn };
      // A first buy comes from your wallet in real life, so it doesn't touch paper cash.
    }
    state.counts.launch++;
    state.selected = sym;
    state.marketTab = 'new';
    state.launchImg = null;
    save();
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
      $('#l-thumb').innerHTML = coinBadge({ sym: '', color: '#a3adb8', img: r.result }, 'lg');
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
    const board = [...TRADERS].sort((a, b) => b.pnl - a.pnl).map((t, i) => ({ ...t, refs: [41, 29, 22, 17, 9, 4][i], crumbs: [6120, 4380, 3210, 2700, 1350, 560][i] }));
    return `<div class="page-head"><div><h1>Rewards</h1><p>Earn crumbs for bringing friends and finishing tasks. Crumbs track your standing on the leaderboard. They are points, not money.</p></div></div>
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
            <li><div><b>They make their first trade</b><span>Paper trades count while Ruckus is in demo.</span></div></li>
            <li><div><b>You both get 200 crumbs</b><span>Crumbs show up here within a minute.</span></div></li>
          </ol>
        </section>
      </div>
      <section class="panel"><div class="panel-head"><h2>Leaderboard</h2><span class="label">This week</span></div>
        <div class="table-scroll"><table class="tape"><thead><tr><th>#</th><th>Trader</th><th class="r">Friends</th><th class="r">Crumbs</th></tr></thead>
        <tbody>${board.map((t, i) => `<tr><td>${i + 1}</td><td>@${esc(t.h)}</td><td class="r">${t.refs}</td><td class="r">${t.crumbs.toLocaleString('en-US')}</td></tr>`).join('')}</tbody></table></div>
      </section>
    </div>`;
  }

  // ---------- tasks ----------
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
    return `<div class="page-head"><div><h1>Tasks</h1><p>Small jobs that earn crumbs. Automatic tasks tick themselves off as you use the app.</p></div>
      <div class="crumbs">${crumbsTotal().toLocaleString('en-US')} crumbs earned</div></div>
    <section class="panel">
      <div class="panel-body stack"><div class="fee-line"><span>${done} of ${TASKS.length} done</span><span class="mono">${Math.round((done / TASKS.length) * 100)}%</span></div><div class="progress"><i style="width:${(done / TASKS.length) * 100}%"></i></div></div>
      ${TASKS.map((task) => {
        const isDone = !!state.tasksDone[task.id];
        const prog = taskProgress(task);
        let actions;
        if (isDone) actions = '<span class="done-pill">Done</span>';
        else if (task.auto) actions = `<span class="mono muted">${prog} / ${task.goal}</span>`;
        else actions = `<a class="btn btn-sm" href="${CONFIG.xUrl}" target="_blank" rel="noopener">Open X</a><button class="btn btn-sm" type="button" data-act="task-done" data-id="${task.id}">Mark done</button>`;
        return `<div class="task"><div><b>${esc(task.t)}</b><span>${esc(task.d)}</span></div><div class="task-actions"><span class="crumbs">+${task.crumbs}</span>${actions}</div></div>`;
      }).join('')}
    </section>`;
  }

  // ---------- stats ----------
  function viewStats() {
    return `<div class="page-head"><div><h1>Stats</h1><p>How busy the block is right now. Demo figures, updated live.</p></div></div>
    <div class="grid-tiles" id="stat-tiles"></div>
    <div class="grid-2 gap-top">
      <section class="panel"><div class="panel-head"><h2>Daily volume</h2><span class="label">Last 14 days · USD</span></div><div class="bars-box"><canvas id="bars" role="img" aria-label="Bar chart of daily trading volume over the last 14 days"></canvas></div></section>
      <section class="panel"><div class="panel-head"><h2>Top movers</h2><span class="label">24h</span></div><ul class="market-list" id="movers"></ul></section>
    </div>`;
  }
  function updStats() {
    const tiles = $('#stat-tiles');
    if (!tiles) return;
    const vol = state.tokens.reduce((s, t) => s + t.vol24, 0);
    const launched = state.tokens.filter((t) => Date.now() - t.born < 86400000).length;
    tiles.innerHTML = [
      ['Volume 24h', fmtCompact(vol), `<span class="up">${fmtPct(0.124)}</span> vs yesterday`],
      ['Trades 24h', state.trades24.toLocaleString('en-US'), 'all coins'],
      ['Coins launched', String(launched), 'in the last 24h'],
      ['Online now', String(state.online), 'night owls'],
    ].map(([k, v, s]) => `<div class="panel tile"><div class="label">${k}</div><div class="val">${v}</div><div class="sub muted">${s}</div></div>`).join('');
    const movers = [...state.tokens].sort((a, b) => chg24(b) - chg24(a)).slice(0, 6);
    $('#movers').innerHTML = movers.map((t) => `<li class="market-row" role="button" tabindex="0" data-act="open" data-sym="${t.sym}">${coinBadge(t)}<div class="who"><b>${esc(t.sym)}</b><span>${esc(t.name)}</span></div><div class="figs">${marketFigs(t)}</div><span></span></li>`).join('');
  }

  // ---------- router ----------
  const ROUTES = { trade: viewTrade, tokens: viewTokens, den: viewDen, launch: viewLaunch, rewards: viewRewards, tasks: viewTasks, stats: viewStats };
  const MOUNT = {
    trade: () => { refreshTrade(true); observe('#chart', drawChart); },
    tokens: renderTokRows,
    launch: launchPreview,
    stats: () => { updStats(); drawBars(); observe('#bars', drawBars); },
  };
  let ro = null;
  function observe(sel, fn) {
    if (ro) ro.disconnect();
    if (!('ResizeObserver' in window)) return;
    ro = new ResizeObserver(() => fn());
    const el = $(sel);
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
  function openToken(sym) {
    state.selected = sym;
    store.set('selected', sym);
    if (state.route === 'trade') {
      $('#ticket-err').textContent = '';
      refreshTrade(true);
    } else location.hash = 'trade';
  }

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'star') {
      e.stopPropagation();
      const s = el.dataset.sym;
      if (state.watch.has(s)) state.watch.delete(s); else state.watch.add(s);
      save();
      el.outerHTML = starBtn(s);
      syncAutoTasks();
      if (state.route === 'trade') updMarkets(true);
      return;
    }
    switch (act) {
      case 'select':
      case 'open': openToken(el.dataset.sym); break;
      case 'mtab':
        state.marketTab = el.dataset.k;
        store.set('marketTab', state.marketTab);
        $$('#mk-tabs [role=tab], .tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === state.marketTab)));
        updMarkets(true);
        break;
      case 'side':
        state.side = el.dataset.side;
        $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === state.side)));
        $('#ticket-err').textContent = '';
        updTicket();
        break;
      case 'chip': {
        let v = el.dataset.v;
        if (v === 'max') {
          const t = sel();
          v = state.side === 'buy' ? Math.floor(state.cash * 100) / 100 : Math.floor((state.positions[t.sym]?.qty || 0) * t.price * 100) / 100;
        }
        state.amount = String(v);
        $('#amt').value = state.amount;
        updTicket();
        break;
      }
      case 'go': executeTrade(); break;
      case 'reset':
        if (el.dataset.confirm === '1') {
          state.cash = CONFIG.startingCash;
          state.positions = {};
          save();
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
        $$(`[data-act="follow"][data-h="${h}"]`).forEach((b) => { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Following' : 'Follow'; });
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
      case 'copy-ref': {
        const input = $('#ref-link');
        try {
          await navigator.clipboard.writeText(input.value);
          toast('Invite link copied.', 'happy');
        } catch {
          input.focus();
          input.select();
          toast('Your browser blocked copying. The link is selected, so press Ctrl+C or ⌘C.', 'neutral');
        }
        break;
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-act="select"], [data-act="open"]')) {
      e.preventDefault();
      openToken(e.target.dataset.sym);
    }
  });

  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'mk-search') { state.search = e.target.value; updMarkets(); }
    else if (id === 'tok-search') { state.search = e.target.value; renderTokRows(); }
    else if (id === 'amt') {
      const clean = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
      if (clean !== e.target.value) e.target.value = clean;
      state.amount = clean;
      $('#ticket-err').textContent = '';
      updTicket();
    } else if (id === 'slip') { state.slip = e.target.value; }
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
    return window.phantom?.solana || window.solflare || window.solana || null;
  }
  $('#wallet-btn').addEventListener('click', async () => {
    const p = walletProvider();
    const btn = $('#wallet-btn');
    if (state.wallet) {
      try { await p?.disconnect?.(); } catch { /* ignore */ }
      state.wallet = null;
      btn.textContent = 'Connect wallet';
      toast('Wallet disconnected.', 'neutral');
      return;
    }
    if (!p) {
      toast('No Solana wallet found in this browser. Install Phantom or Solflare, then reload the page.', 'worried');
      return;
    }
    try {
      const res = await p.connect();
      const key = String((res && res.publicKey) || p.publicKey || '');
      state.wallet = key;
      btn.textContent = key ? key.slice(0, 4) + '…' + key.slice(-4) : 'Connected';
      toast('Wallet connected. Trades on this page still use paper money.', 'happy');
    } catch {
      toast('Connection was cancelled in your wallet.', 'neutral');
    }
  });

  // ---------- theme ----------
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  function effectiveTheme() {
    return document.documentElement.dataset.theme || (mq.matches ? 'light' : 'dark');
  }
  const savedTheme = store.get('theme', null);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  function redraw() { drawChart(); drawBars(); }
  $('#theme-btn').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
    redraw();
  });
  mq.addEventListener?.('change', redraw);

  // ---------- live loop ----------
  function tick() {
    state.tick++;
    for (const t of state.tokens) {
      const r = gauss() * t.sigma + t.sigma * 0.01;
      t.price *= Math.exp(r);
      const cs = t.candles;
      let c = cs[cs.length - 1];
      if (state.tick % 10 === 0) {
        c = { o: c.c, h: c.c, l: c.c, c: c.c, v: 0 };
        cs.push(c);
        if (cs.length > 240) cs.shift();
      }
      c.c = t.price;
      c.h = Math.max(c.h, t.price);
      c.l = Math.min(c.l, t.price);
      const v = mc(t) * 0.00004 * (0.3 + rand() * 1.4);
      c.v += v;
      t.vol24 += v;
      if (rand() < 0.08) t.holders += rand() < 0.75 ? 1 : -1;
      if (rand() < (t.sym === state.selected ? 0.75 : 0.15)) {
        t.tape.push(fakeTrade(t));
        if (t.tape.length > 40) t.tape.shift();
        state.trades24++;
      }
    }
    if (state.tick % 4 === 0) {
      state.online = Math.max(90, state.online + Math.round(gauss() * 3));
      if (!state.majors.SOL.live) {
        for (const k of ['SOL', 'BTC', 'ETH']) state.majors[k].p *= 1 + gauss() * 0.0004;
      }
      renderTicker();
    }
    if (document.hidden) return;
    if (state.route === 'trade') refreshTrade();
    else if (state.route === 'tokens') updTokCells();
    else if (state.route === 'stats') updStats();
  }

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
  $('#brand-badge').innerHTML = rudy('happy');
  renderTicker();
  window.addEventListener('hashchange', route);
  route();
  syncAutoTasks();
  fetchMajors();
  setInterval(fetchMajors, 60000);
  setInterval(tick, 1500);
})();
