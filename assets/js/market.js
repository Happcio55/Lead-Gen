/* Sherwood — live market data layer.
 *  Stocks & ETFs: Robinhood's own public market data (quotes, fundamentals, historicals,
 *                 market hours, analyst ratings) through the bundled proxy (server.js).
 *  Crypto:        Coinbase Exchange + Kraken websockets, DexScreener for CASHCAT (Robinhood Chain),
 *                 CoinGecko for supply.
 */
(function () {
  const STOCKS = (window.STOCKS || []).map((s) => ({ ...s, cls: 'stock', src: { type: 'rh' } }));
  const COINS = (window.COINS || []).map((c) => ({ ...c, cls: 'crypto', kind: 'Crypto' }));
  const ASSETS = (window.ASSETS = [...STOCKS, ...COINS]);
  const BY_SYM = Object.fromEntries(ASSETS.map((a) => [a.sym, a]));
  const API = (window.SW_API || 'api/rh/').replace(/\/?$/, '/');
  const CACHE_KEY = 'sw.market.v2';

  // Preview mode: a sandbox without network access ships a real snapshot and animates it.
  const SNAP = window.SW_SNAPSHOT || null;
  const DEMO = !!(window.SW_DEMO && SNAP);
  const SNAP_SHIFT = DEMO ? Math.floor(Date.now() / 1000) - SNAP.at : 0;

  const M = (window.Market = {
    state: {},
    status: { robinhood: 'connecting', coinbase: 'connecting', kraken: 'connecting', dex: 'connecting' },
    session: { state: 'unknown', label: 'Market hours…' },
    listeners: new Set(),
    statusListeners: new Set(),
    demo: DEMO,
    snapshotAt: SNAP ? SNAP.at * 1000 : null,
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
    onStatus(fn) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); },
    asset: (sym) => BY_SYM[sym],
    price: (sym) => (M.state[sym] ? M.state[sym].price : null),
  });
  M.coin = M.asset;

  ASSETS.forEach((a) => {
    M.state[a.sym] = { price: null, open24: null, high24: null, low24: null, vol24: null, change24: null, mcap: null, supply: null, ts: 0, dir: 0 };
  });

  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    for (const s in cache) if (M.state[s]) Object.assign(M.state[s], cache[s], { dir: 0, ts: 0 });
  } catch (e) {}
  setInterval(() => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(M.state)); } catch (e) {} }, 10000);

  function emit(sym) { for (const fn of M.listeners) fn(sym, M.state[sym]); }
  function emitStatus() { for (const fn of M.statusListeners) fn(M.status, M.session); }
  function setStatus(src, v) {
    if (M.status[src] === v) return;
    M.status[src] = v;
    emitStatus();
  }

  function update(sym, patch, quiet) {
    const s = M.state[sym];
    if (!s) return;
    const prev = s.price;
    for (const k in patch) if (patch[k] != null && !(typeof patch[k] === 'number' && Number.isNaN(patch[k]))) s[k] = patch[k];
    if (patch.price != null && !Number.isNaN(patch.price)) {
      s.dir = prev == null ? 0 : patch.price > prev ? 1 : patch.price < prev ? -1 : 0;
      s.ts = Date.now();
      if (s.supply) s.mcap = s.supply * s.price;
      if (s.open24) s.change24 = ((s.price - s.open24) / s.open24) * 100;
      if (BY_SYM[sym].cls === 'crypto') {
        if (s.high24 != null && s.price > s.high24) s.high24 = s.price;
        if (s.low24 != null && s.price < s.low24) s.low24 = s.price;
      }
    }
    if (!quiet) emit(sym);
  }
  M._update = update;

  const getJSON = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status + ' ' + url);
    return r.json();
  };
  const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  const num = (v) => (v == null || v === '' ? null : +v);

  /* =================== Stocks — Robinhood =================== */
  const stockSyms = STOCKS.map((s) => s.sym);
  const BY_ID = Object.fromEntries(STOCKS.map((s) => [s.id, s.sym]));

  async function pollQuotes() {
    try {
      for (const part of chunks(stockSyms, 60)) {
        const j = await getJSON(`${API}marketdata/quotes/?symbols=${part.join(',')}`);
        for (const q of j.results || []) {
          if (!q || !BY_SYM[q.symbol]) continue;
          const reg = num(q.last_trade_price);
          const non = num(q.last_non_reg_trade_price) ?? num(q.last_extended_hours_trade_price);
          const tReg = Date.parse(q.venue_last_trade_time || 0) || 0;
          const tNon = Date.parse(q.venue_last_non_reg_trade_time || 0) || 0;
          const useNon = non != null && tNon > tReg;
          const price = useNon ? non : reg;
          const s = M.state[q.symbol];
          const patch = {
            price, regPrice: reg, extended: useNon && Math.abs(non - reg) > 1e-9,
            open24: num(q.adjusted_previous_close) || num(q.previous_close),
            bid: num(q.bid_price), ask: num(q.ask_price), halted: q.trading_halted,
          };
          update(q.symbol, patch, s.ts && s.price === price && s.open24 === patch.open24);
        }
      }
      setStatus('robinhood', 'live');
    } catch (e) {
      setStatus('robinhood', 'reconnecting');
    }
  }

  async function loadFundamentals() {
    try {
      for (const part of chunks(stockSyms, 50)) {
        const j = await getJSON(`${API}fundamentals/?symbols=${part.join(',')}`);
        (j.results || []).forEach((f) => {
          const sym = f && f.instrument && BY_ID[f.instrument.replace(/\/$/, '').split('/').pop()];
          if (!sym) return;
          const s = M.state[sym];
          Object.assign(s, {
            high24: num(f.high), low24: num(f.low), dayOpen: num(f.open), volume: num(f.volume), avgVolume: num(f.average_volume),
            hi52: num(f.high_52_weeks), lo52: num(f.low_52_weeks), pe: num(f.pe_ratio), divYield: num(f.dividend_yield),
            supply: num(f.shares_outstanding), description: f.description, ceo: f.ceo, employees: f.num_employees,
            founded: f.year_founded, hq: [f.headquarters_city, f.headquarters_state].filter(Boolean).join(', '),
            sector: f.sector, industry: f.industry,
          });
          s.mcap = s.supply && s.price ? s.supply * s.price : num(f.market_cap);
          emit(sym);
        });
      }
    } catch (e) {}
  }

  // Market session from Robinhood's XNYS hours (regular, extended and 24 Hour Market).
  const hours = {};
  const etDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
  async function loadHours() {
    const now = new Date();
    for (const d of [etDate(now), etDate(new Date(now.getTime() + 864e5))]) {
      if (hours[d]) continue;
      try { hours[d] = await getJSON(`${API}markets/XNYS/hours/${d}/`); } catch (e) {}
    }
    computeSession();
  }
  function computeSession() {
    if (DEMO) { M.session = { state: 'preview', label: 'Preview' }; emitStatus(); return; }
    const now = Date.now();
    const t = (s) => (s ? Date.parse(s) : NaN);
    let st = 'closed', next = null;
    for (const d of Object.values(hours)) {
      if (!d || !d.is_open) continue;
      const o = t(d.opens_at), c = t(d.closes_at), eo = t(d.extended_opens_at), ec = t(d.extended_closes_at), ao = t(d.all_day_opens_at), ac = t(d.all_day_closes_at);
      if (now >= o && now < c) { st = 'regular'; break; }
      if (now >= eo && now < o) { st = 'pre'; break; }
      if (now >= c && now < ec) { st = 'after'; break; }
      if (now >= ao && now < ac && st === 'closed') st = 'overnight';
      if (o > now && (!next || o < next)) next = o;
    }
    const labels = { regular: 'Market open', pre: 'Pre-market', after: 'After hours', overnight: '24 Hour Market', closed: 'Market closed' };
    M.session = { state: st, label: labels[st], next };
    emitStatus();
  }
  M.isStockSessionLive = () => ['regular', 'pre', 'after', 'overnight', 'preview'].includes(M.session.state);

  M.ratings = async function (sym) {
    const a = BY_SYM[sym];
    if (DEMO) return (SNAP.ratings && SNAP.ratings[sym]) || null;
    try { return await getJSON(`${API}midlands/ratings/${a.id}/`); } catch (e) { return null; }
  };

  /* =================== Crypto =================== */
  const cbCoins = COINS.filter((c) => c.src.type === 'coinbase');
  function connectCoinbase() {
    if (!cbCoins.length) return;
    let retry = 0;
    const open = () => {
      let ws;
      try { ws = new WebSocket('wss://ws-feed.exchange.coinbase.com'); } catch (e) { setStatus('coinbase', 'offline'); return; }
      ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ type: 'subscribe', product_ids: cbCoins.map((c) => c.src.id), channels: ['ticker'] })); };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type !== 'ticker') return;
        setStatus('coinbase', 'live');
        const sym = m.product_id.split('-')[0];
        const price = +m.price;
        update(sym, { price, open24: +m.open_24h, high24: +m.high_24h, low24: +m.low_24h, vol24: +m.volume_24h * price });
      };
      ws.onclose = () => { setStatus('coinbase', 'reconnecting'); setTimeout(open, Math.min(30000, 1000 * 2 ** retry++)); };
      ws.onerror = () => ws.close();
    };
    open();
  }

  const krCoins = COINS.filter((c) => c.src.type === 'kraken');
  const krSym = Object.fromEntries(krCoins.map((c) => [c.src.id, c.sym]));
  function connectKraken() {
    if (!krCoins.length) return;
    let retry = 0;
    const open = () => {
      let ws;
      try { ws = new WebSocket('wss://ws.kraken.com/v2'); } catch (e) { setStatus('kraken', 'offline'); return; }
      ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: krCoins.map((c) => c.src.id) } })); };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.channel !== 'ticker' || !m.data) return;
        setStatus('kraken', 'live');
        for (const d of m.data) {
          const sym = krSym[d.symbol];
          if (sym) update(sym, { price: +d.last, high24: +d.high, low24: +d.low, vol24: +d.volume * +d.last, open24: +d.last / (1 + +d.change_pct / 100) });
        }
      };
      ws.onclose = () => { setStatus('kraken', 'reconnecting'); setTimeout(open, Math.min(30000, 1000 * 2 ** retry++)); };
      ws.onerror = () => ws.close();
    };
    open();
  }

  const dexCoins = COINS.filter((c) => c.src.type === 'dex');
  async function pollDex() {
    for (const c of dexCoins) {
      try {
        const j = await getJSON(`https://api.dexscreener.com/latest/dex/pairs/${c.src.chain}/${c.src.pair}`);
        const p = (j.pairs && j.pairs[0]) || j.pair;
        if (!p) continue;
        const price = +p.priceUsd;
        const chg = p.priceChange ? +p.priceChange.h24 : null;
        const patch = { price, vol24: p.volume ? +p.volume.h24 : null };
        if (chg != null) patch.open24 = price / (1 + chg / 100);
        if (p.marketCap && !M.state[c.sym].supply) patch.supply = +p.marketCap / price;
        update(c.sym, patch);
        setStatus('dex', 'live');
      } catch (e) { setStatus('dex', 'reconnecting'); }
    }
  }

  async function pollCryptoFallback() {
    if (M.status.coinbase !== 'live') {
      for (const c of cbCoins) {
        try {
          const t = await getJSON(`https://api.exchange.coinbase.com/products/${c.src.id}/stats`);
          const price = +t.last;
          update(c.sym, { price, open24: +t.open, high24: +t.high, low24: +t.low, vol24: +t.volume * price });
        } catch (e) {}
      }
    }
    if (M.status.kraken !== 'live') {
      for (const c of krCoins) {
        try {
          const j = await getJSON(`https://api.kraken.com/0/public/Ticker?pair=${c.src.rest}`);
          const t = Object.values(j.result)[0];
          const price = +t.c[0];
          update(c.sym, { price, open24: +t.o, high24: +t.h[1], low24: +t.l[1], vol24: +t.v[1] * price });
        } catch (e) {}
      }
    }
  }

  async function loadCryptoMeta() {
    try {
      const rows = await getJSON(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COINS.map((c) => c.cg).join(',')}`);
      const byId = Object.fromEntries(COINS.map((c) => [c.cg, c.sym]));
      for (const r of rows) {
        const sym = byId[r.id];
        if (!sym) continue;
        const s = M.state[sym];
        s.supply = r.circulating_supply || (r.market_cap && r.current_price ? r.market_cap / r.current_price : null);
        s.rank = r.market_cap_rank;
        if (!s.ts) {
          update(sym, { price: r.current_price, high24: r.high_24h, low24: r.low_24h, vol24: r.total_volume, open24: r.price_change_percentage_24h != null ? r.current_price / (1 + r.price_change_percentage_24h / 100) : null });
          s.ts = 0;
        } else {
          if (s.supply && s.price) s.mcap = s.supply * s.price;
          emit(sym);
        }
      }
    } catch (e) {}
  }

  /* =================== Historical candles =================== */
  const RANGES = {
    stock: {
      '1D': { q: 'interval=5minute&span=day&bounds=trading', bucket: 300 },
      '1W': { q: 'interval=10minute&span=week&bounds=trading', bucket: 600 },
      '1M': { q: 'interval=hour&span=month&bounds=regular', bucket: 3600 },
      '3M': { q: 'interval=day&span=3month&bounds=regular', bucket: 86400 },
      '1Y': { q: 'interval=day&span=year&bounds=regular', bucket: 86400 },
      '5Y': { q: 'interval=week&span=5year&bounds=regular', bucket: 604800 },
    },
    crypto: {
      '1H': { span: 3600, cb: 60, kr: 1, gt: ['minute', 1, 60] },
      '1D': { span: 86400, cb: 300, kr: 5, gt: ['minute', 5, 300] },
      '1W': { span: 604800, cb: 3600, kr: 60, gt: ['hour', 1, 3600] },
      '1M': { span: 2592000, cb: 21600, kr: 240, gt: ['hour', 4, 14400] },
      '3M': { span: 7776000, cb: 86400, kr: 1440, gt: ['day', 1, 86400] },
    },
  };
  M.rangesFor = (sym) => Object.keys(RANGES[BY_SYM[sym].cls]);
  const histCache = new Map();
  const snapFiles = new Map();

  function snapHistory(sym) {
    if (!snapFiles.has(sym)) {
      const inline = SNAP.hist && SNAP.hist[sym];
      const p = inline ? Promise.resolve(inline) : getJSON(`snap/${sym.toLowerCase().replace('.', '-')}.json`);
      p.catch(() => snapFiles.delete(sym));
      snapFiles.set(sym, p);
    }
    return snapFiles.get(sym);
  }

  M.history = async function (sym, range) {
    const a = BY_SYM[sym];
    if (DEMO) {
      const all = await snapHistory(sym);
      const h = all[range];
      const shift = a.cls === 'crypto' ? Math.floor(SNAP_SHIFT / h.bucket) * h.bucket : 0;
      return { bucket: h.bucket, prevClose: h.prevClose, bars: h.bars.map((b) => ({ time: b[0] + shift, open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5] })) };
    }
    const key = sym + ':' + range;
    const hit = histCache.get(key);
    if (hit && Date.now() - hit.at < 30000) return hit.data;
    const R = RANGES[a.cls][range];
    let bars = [], bucket, prevClose = null;
    const now = Math.floor(Date.now() / 1000);
    if (a.cls === 'stock') {
      bucket = R.bucket;
      const j = await getJSON(`${API}marketdata/historicals/?symbols=${encodeURIComponent(sym)}&${R.q}`);
      const r = j.results && j.results[0];
      if (!r) throw new Error('no data');
      prevClose = num(r.previous_close_price);
      bars = r.historicals.filter((h) => !h.interpolated).map((h) => ({
        time: Math.floor(Date.parse(h.begins_at) / 1000), open: +h.open_price, high: +h.high_price, low: +h.low_price, close: +h.close_price, volume: +h.volume,
      }));
    } else {
      const start = now - R.span;
      if (a.src.type === 'coinbase') {
        bucket = R.cb;
        const rows = await getJSON(`https://api.exchange.coinbase.com/products/${a.src.id}/candles?granularity=${R.cb}&start=${new Date(start * 1000).toISOString()}&end=${new Date(now * 1000).toISOString()}`);
        bars = rows.map((r) => ({ time: r[0], low: r[1], high: r[2], open: r[3], close: r[4], volume: r[5] * r[4] }));
      } else if (a.src.type === 'kraken') {
        bucket = R.kr * 60;
        const j = await getJSON(`https://api.kraken.com/0/public/OHLC?pair=${a.src.rest}&interval=${R.kr}&since=${start}`);
        const rows = Object.entries(j.result).find(([k]) => k !== 'last')[1];
        bars = rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[6] * +r[4] }));
      } else {
        const [tf, agg, b] = R.gt;
        bucket = b;
        const j = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${a.src.chain}/pools/${a.src.pair}/ohlcv/${tf}?aggregate=${agg}&limit=${Math.min(1000, Math.ceil(R.span / b))}&currency=usd`);
        bars = j.data.attributes.ohlcv_list.map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] }));
      }
      bars = bars.filter((b) => b.time >= start - bucket);
    }
    bars.sort((x, y) => x.time - y.time);
    bars = bars.filter((b, i) => i === 0 || b.time !== bars[i - 1].time);
    const data = { bars, bucket, prevClose };
    histCache.set(key, { at: Date.now(), data });
    return data;
  };

  /* =================== Sparklines (last trading day) =================== */
  const sparks = (M.sparks = {});
  M.loadSparks = async function (onEach) {
    if (DEMO) {
      for (const a of ASSETS) { sparks[a.sym] = (SNAP.sparks && SNAP.sparks[a.sym]) || []; onEach && onEach(a.sym); }
      return;
    }
    for (const part of chunks(stockSyms, 40)) {
      try {
        const j = await getJSON(`${API}marketdata/historicals/?symbols=${part.join(',')}&interval=5minute&span=day&bounds=regular`);
        for (const r of j.results || []) {
          if (!r) continue;
          sparks[r.symbol] = r.historicals.map((h) => +h.close_price);
          onEach && onEach(r.symbol);
        }
      } catch (e) {}
    }
    loadCryptoSparks(onEach);
  };
  async function loadCryptoSparks(onEach, list = COINS, attempt = 0) {
    const failed = [];
    for (const c of list) {
      try {
        const now = Math.floor(Date.now() / 1000);
        let closes = [];
        if (c.src.type === 'coinbase') {
          const rows = await getJSON(`https://api.exchange.coinbase.com/products/${c.src.id}/candles?granularity=900&start=${new Date((now - 86400) * 1000).toISOString()}&end=${new Date(now * 1000).toISOString()}`);
          closes = rows.sort((a, b) => a[0] - b[0]).map((r) => r[4]);
        } else if (c.src.type === 'kraken') {
          const j = await getJSON(`https://api.kraken.com/0/public/OHLC?pair=${c.src.rest}&interval=15&since=${now - 86400}`);
          closes = Object.entries(j.result).find(([k]) => k !== 'last')[1].map((r) => +r[4]);
        } else {
          const j = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${c.src.chain}/pools/${c.src.pair}/ohlcv/minute?aggregate=15&limit=96&currency=usd`);
          closes = j.data.attributes.ohlcv_list.sort((a, b) => a[0] - b[0]).map((r) => r[4]);
        }
        sparks[c.sym] = closes;
        const s = M.state[c.sym];
        if (closes.length && (s.high24 == null || s.low24 == null)) {
          const all = s.price != null ? closes.concat(s.price) : closes;
          s.high24 = Math.max(...all);
          s.low24 = Math.min(...all);
        }
        onEach && onEach(c.sym);
      } catch (e) { failed.push(c); }
      await new Promise((r) => setTimeout(r, 90));
    }
    // rate-limited responses come back without CORS headers — retry later
    if (failed.length && attempt < 3) setTimeout(() => loadCryptoSparks(onEach, failed, attempt + 1), 20000 * (attempt + 1));
  }

  /* =================== Preview simulation =================== */
  function startDemo() {
    for (const a of ASSETS) {
      const s = SNAP.state[a.sym];
      if (!s) continue;
      M.state[a.sym].ts = 0;
      update(a.sym, { ...s });
    }
    for (const k in M.status) M.status[k] = 'demo';
    computeSession();
    const tick = () => {
      const a = ASSETS[Math.floor(Math.random() * ASSETS.length)];
      const s = M.state[a.sym];
      const base = SNAP.state[a.sym] && SNAP.state[a.sym].price;
      if (s.price && base) {
        const z = (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
        const vol = a.cls === 'crypto' ? 0.0011 : a.kind === 'ETF' ? 0.00012 : 0.00035;
        update(a.sym, { price: s.price * Math.exp(z * vol + Math.log(base / s.price) * 0.02) });
      }
      setTimeout(tick, 40 + Math.random() * 160);
    };
    tick();
  }

  /* =================== start =================== */
  M.start = function () {
    if (DEMO) { startDemo(); return; }
    loadHours();
    setInterval(loadHours, 600000);
    setInterval(computeSession, 15000);
    loadFundamentals();
    setInterval(loadFundamentals, 300000);
    const loop = async () => {
      await pollQuotes();
      setTimeout(loop, M.isStockSessionLive() ? 2000 : 15000);
    };
    loop();
    connectCoinbase();
    connectKraken();
    pollDex();
    setInterval(pollDex, 5000);
    loadCryptoMeta();
    setInterval(loadCryptoMeta, 180000);
    setTimeout(pollCryptoFallback, 4000);
    setInterval(pollCryptoFallback, 8000);
  };
})();
