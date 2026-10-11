/* Sherwood — live market data layer.
 *  - Coinbase Exchange websocket (ticker) for most coins
 *  - Kraken v2 websocket for MEW
 *  - DexScreener polling for CASHCAT (Robinhood Chain)
 *  - CoinGecko for supply / market cap metadata
 * Everything is public, keyless and CORS-enabled, so the app runs as static files. */
(function () {
  const COINS = window.COINS;
  const BY_SYM = Object.fromEntries(COINS.map((c) => [c.sym, c]));
  const CACHE_KEY = 'sw.market.v1';

  const M = (window.Market = {
    state: {},
    status: { coinbase: 'connecting', kraken: 'connecting', dex: 'connecting' },
    listeners: new Set(),
    statusListeners: new Set(),
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
    onStatus(fn) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); },
    coin: (sym) => BY_SYM[sym],
    price: (sym) => (M.state[sym] ? M.state[sym].price : null),
  });

  COINS.forEach((c) => {
    M.state[c.sym] = { price: null, open24: null, high24: null, low24: null, vol24: null, change24: null, mcap: null, supply: null, rank: null, ts: 0, dir: 0 };
  });

  // Restore last known snapshot so the UI paints instantly on reload.
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    for (const s in cache) if (M.state[s]) Object.assign(M.state[s], cache[s], { dir: 0 });
  } catch (e) {}
  setInterval(() => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(M.state)); } catch (e) {}
  }, 10000);

  function emit(sym) { for (const fn of M.listeners) fn(sym, M.state[sym]); }
  function setStatus(src, v) {
    if (M.status[src] === v) return;
    M.status[src] = v;
    for (const fn of M.statusListeners) fn(M.status);
  }

  function update(sym, patch) {
    const s = M.state[sym];
    if (!s) return;
    const prev = s.price;
    for (const k in patch) if (patch[k] != null && !Number.isNaN(patch[k])) s[k] = patch[k];
    if (patch.price != null && !Number.isNaN(patch.price)) {
      s.dir = prev == null ? 0 : patch.price > prev ? 1 : patch.price < prev ? -1 : 0;
      s.ts = Date.now();
      if (s.supply) s.mcap = s.supply * s.price;
      if (s.open24) s.change24 = ((s.price - s.open24) / s.open24) * 100;
      if (s.high24 != null && s.price > s.high24) s.high24 = s.price;
      if (s.low24 != null && s.price < s.low24) s.low24 = s.price;
    }
    emit(sym);
  }
  M._update = update;

  const getJSON = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status + ' ' + url);
    return r.json();
  };

  /* ---------- Coinbase ---------- */
  const cbCoins = COINS.filter((c) => c.src.type === 'coinbase');
  function connectCoinbase() {
    let retry = 0;
    const open = () => {
      let ws;
      try { ws = new WebSocket('wss://ws-feed.exchange.coinbase.com'); } catch (e) { setStatus('coinbase', 'offline'); return; }
      ws.onopen = () => {
        retry = 0;
        ws.send(JSON.stringify({ type: 'subscribe', product_ids: cbCoins.map((c) => c.src.id), channels: ['ticker'] }));
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type !== 'ticker') return;
        setStatus('coinbase', 'live');
        const sym = m.product_id.split('-')[0];
        const price = +m.price;
        update(sym, { price, open24: +m.open_24h, high24: +m.high_24h, low24: +m.low_24h, vol24: +m.volume_24h * price });
      };
      ws.onclose = () => {
        setStatus('coinbase', 'reconnecting');
        setTimeout(open, Math.min(30000, 1000 * 2 ** retry++));
      };
      ws.onerror = () => ws.close();
    };
    open();
  }

  /* ---------- Kraken ---------- */
  const krCoins = COINS.filter((c) => c.src.type === 'kraken');
  const krSym = Object.fromEntries(krCoins.map((c) => [c.src.id, c.sym]));
  function connectKraken() {
    if (!krCoins.length) return;
    let retry = 0;
    const open = () => {
      let ws;
      try { ws = new WebSocket('wss://ws.kraken.com/v2'); } catch (e) { setStatus('kraken', 'offline'); return; }
      ws.onopen = () => {
        retry = 0;
        ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: krCoins.map((c) => c.src.id) } }));
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.channel !== 'ticker' || !m.data) return;
        setStatus('kraken', 'live');
        for (const d of m.data) {
          const sym = krSym[d.symbol];
          if (!sym) continue;
          update(sym, { price: +d.last, high24: +d.high, low24: +d.low, vol24: +d.volume * +d.last, open24: +d.last / (1 + +d.change_pct / 100) });
        }
      };
      ws.onclose = () => {
        setStatus('kraken', 'reconnecting');
        setTimeout(open, Math.min(30000, 1000 * 2 ** retry++));
      };
      ws.onerror = () => ws.close();
    };
    open();
  }

  /* ---------- DexScreener (Robinhood Chain) ---------- */
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
      } catch (e) {
        setStatus('dex', 'reconnecting');
      }
    }
  }

  /* ---------- REST fallback when websockets are blocked ---------- */
  async function pollFallback() {
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

  /* ---------- CoinGecko metadata (supply, rank) ---------- */
  async function loadMeta() {
    try {
      const ids = COINS.map((c) => c.cg).join(',');
      const rows = await getJSON(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}`);
      const byId = Object.fromEntries(COINS.map((c) => [c.cg, c.sym]));
      for (const r of rows) {
        const sym = byId[r.id];
        if (!sym) continue;
        const s = M.state[sym];
        const patch = {
          supply: r.circulating_supply || (r.market_cap && r.current_price ? r.market_cap / r.current_price : null),
          rank: r.market_cap_rank,
        };
        // Only seed price data if no live feed has delivered yet.
        if (s.price == null || !s.ts) {
          patch.price = r.current_price;
          patch.high24 = r.high_24h;
          patch.low24 = r.low_24h;
          patch.vol24 = r.total_volume;
          if (r.price_change_percentage_24h != null) patch.open24 = r.current_price / (1 + r.price_change_percentage_24h / 100);
          update(sym, patch);
          s.ts = 0;
        } else {
          Object.assign(s, patch);
          if (s.supply && s.price) s.mcap = s.supply * s.price;
          emit(sym);
        }
      }
    } catch (e) { /* rate limited — keep cached values */ }
  }

  /* ---------- Historical candles ---------- */
  // span = seconds shown, plus a per-source bucket size.
  const RANGES = {
    '1H': { span: 3600, cb: 60, kr: 1, gt: ['minute', 1, 60] },
    '1D': { span: 86400, cb: 300, kr: 5, gt: ['minute', 5, 300] },
    '1W': { span: 604800, cb: 3600, kr: 60, gt: ['hour', 1, 3600] },
    '1M': { span: 2592000, cb: 21600, kr: 240, gt: ['hour', 4, 14400] },
    '3M': { span: 7776000, cb: 86400, kr: 1440, gt: ['day', 1, 86400] },
  };
  M.RANGES = RANGES;
  const histCache = new Map();

  M.history = async function (sym, range) {
    const key = sym + ':' + range;
    const hit = histCache.get(key);
    if (hit && Date.now() - hit.at < 30000) return hit.data;
    const c = BY_SYM[sym];
    const R = RANGES[range];
    const now = Math.floor(Date.now() / 1000);
    const start = now - R.span;
    let bars = [];
    let bucket;
    if (c.src.type === 'coinbase') {
      bucket = R.cb;
      const url = `https://api.exchange.coinbase.com/products/${c.src.id}/candles?granularity=${R.cb}&start=${new Date(start * 1000).toISOString()}&end=${new Date(now * 1000).toISOString()}`;
      const rows = await getJSON(url);
      bars = rows.map((r) => ({ time: r[0], low: r[1], high: r[2], open: r[3], close: r[4], volume: r[5] * r[4] }));
    } else if (c.src.type === 'kraken') {
      bucket = R.kr * 60;
      const j = await getJSON(`https://api.kraken.com/0/public/OHLC?pair=${c.src.rest}&interval=${R.kr}&since=${start}`);
      const rows = Object.entries(j.result).find(([k]) => k !== 'last')[1];
      bars = rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[6] * +r[4] }));
    } else {
      const [tf, agg, b] = R.gt;
      bucket = b;
      const limit = Math.min(1000, Math.ceil(R.span / b));
      const j = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${c.src.chain}/pools/${c.src.pair}/ohlcv/${tf}?aggregate=${agg}&limit=${limit}&currency=usd`);
      bars = j.data.attributes.ohlcv_list.map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] }));
    }
    bars = bars.filter((b) => b.time >= start - bucket).sort((a, b) => a.time - b.time);
    // de-dupe identical timestamps
    bars = bars.filter((b, i) => i === 0 || b.time !== bars[i - 1].time);
    const data = { bars, bucket };
    histCache.set(key, { at: Date.now(), data });
    return data;
  };

  // 24h hourly closes for sparklines.
  const sparks = {};
  M.sparks = sparks;
  M.loadSparks = async function (onEach, list = COINS, attempt = 0) {
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
    if (failed.length && attempt < 3) setTimeout(() => M.loadSparks(onEach, failed, attempt + 1), 20000 * (attempt + 1));
  };

  M.start = function () {
    connectCoinbase();
    connectKraken();
    pollDex();
    setInterval(pollDex, 5000);
    loadMeta();
    setInterval(loadMeta, 180000);
    setTimeout(pollFallback, 4000);
    setInterval(pollFallback, 8000);
  };
})();
