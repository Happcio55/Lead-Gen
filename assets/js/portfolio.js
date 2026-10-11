/* Sherwood — paper trading engine. All state lives in localStorage. */
(function () {
  const KEY = 'sw.portfolio.v1';
  const START_CASH = 10000;
  const EPS = 1e-9;
  const M = window.Market;

  const fresh = () => ({
    cash: START_CASH,
    start: START_CASH,
    positions: {}, // sym -> { qty, cost, locked }
    orders: [], // newest first
    history: [], // [t, equity]
    watch: ['DOGE', 'PEPE', 'CASHCAT'],
    realized: 0,
    createdAt: Date.now(),
  });

  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (e) { st = fresh(); }

  const listeners = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const changed = (evt) => { save(); for (const fn of listeners) fn(evt || {}); };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  const P = (window.Portfolio = {
    START_CASH,
    get state() { return st; },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    position(sym) { return st.positions[sym] || { qty: 0, cost: 0, locked: 0 }; },
    available(sym) { const p = P.position(sym); return Math.max(0, p.qty - (p.locked || 0)); },
    reservedCash() {
      return st.orders.reduce((a, o) => a + (o.status === 'open' && o.side === 'buy' ? o.reserved : 0), 0);
    },
    holdingsValue() {
      let v = 0;
      for (const sym in st.positions) {
        const p = st.positions[sym];
        const px = M.price(sym);
        v += p.qty * (px != null ? px : p.cost / p.qty);
      }
      return v;
    },
    equity() { return st.cash + P.reservedCash() + P.holdingsValue(); },
    dayChange() {
      // value change of current holdings over the last 24h
      let d = 0;
      for (const sym in st.positions) {
        const s = M.state[sym];
        if (s && s.price != null && s.open24) d += st.positions[sym].qty * (s.price - s.open24);
      }
      return d;
    },
    isWatched: (sym) => st.watch.includes(sym),
    toggleWatch(sym) {
      st.watch = P.isWatched(sym) ? st.watch.filter((s) => s !== sym) : [...st.watch, sym];
      changed({ type: 'watch', sym });
    },

    /** order: { sym, side: 'buy'|'sell', type: 'market'|'limit', qty, limit? } */
    place(order) {
      const { sym, side, type } = order;
      const px = M.price(sym);
      let qty = +order.qty;
      const limit = type === 'limit' ? +order.limit : null;
      if (px == null) return { ok: false, error: 'Waiting for a live price…' };
      if (!(qty > 0)) return { ok: false, error: 'Enter an amount' };
      if (type === 'limit' && !(limit > 0)) return { ok: false, error: 'Enter a limit price' };

      const o = { id: uid(), sym, side, type, qty, limit, status: 'open', createdAt: Date.now(), reserved: 0 };

      if (side === 'buy') {
        // absorb rounding from converting dollars to coin units
        if (type === 'market' && qty * px > st.cash && qty * px <= st.cash * 1.0005) { qty = st.cash / px; o.qty = qty; }
        const need = qty * (type === 'limit' ? limit : px);
        if (need < 1 - EPS) return { ok: false, error: 'Minimum order is $1.00' };
        if (need > st.cash + 1e-6) return { ok: false, error: 'Not enough buying power' };
        if (type === 'limit' && px > limit) {
          o.reserved = need;
          st.cash -= need;
          st.orders.unshift(o);
          changed({ type: 'placed', order: o });
          return { ok: true, order: o };
        }
        fill(o, px);
      } else {
        const avail = P.available(sym);
        if (qty > avail + EPS) return { ok: false, error: `You only have ${avail.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${sym}` };
        qty = Math.min(qty, avail);
        o.qty = qty;
        if (qty * px < 0.01) return { ok: false, error: 'Order is too small' };
        if (type === 'limit' && px < limit) {
          const pos = st.positions[sym];
          pos.locked = (pos.locked || 0) + qty;
          st.orders.unshift(o);
          changed({ type: 'placed', order: o });
          return { ok: true, order: o };
        }
        fill(o, px);
      }
      st.orders.unshift(o);
      snapshot(true);
      changed({ type: 'filled', order: o });
      return { ok: true, order: o };
    },

    cancel(id) {
      const o = st.orders.find((x) => x.id === id);
      if (!o || o.status !== 'open') return;
      o.status = 'canceled';
      o.closedAt = Date.now();
      if (o.side === 'buy') { st.cash += o.reserved; o.reserved = 0; }
      else if (st.positions[o.sym]) st.positions[o.sym].locked = Math.max(0, (st.positions[o.sym].locked || 0) - o.qty);
      changed({ type: 'canceled', order: o });
    },

    reset() {
      const watch = st.watch;
      st = fresh();
      st.watch = watch;
      changed({ type: 'reset' });
    },
  });

  function fill(o, px) {
    const sym = o.sym;
    const total = o.qty * px;
    if (o.side === 'buy') {
      if (o.reserved) { st.cash += o.reserved; o.reserved = 0; }
      st.cash -= total;
      const p = st.positions[sym] || (st.positions[sym] = { qty: 0, cost: 0, locked: 0 });
      p.qty += o.qty;
      p.cost += total;
    } else {
      const p = st.positions[sym];
      if (o.type === 'limit') p.locked = Math.max(0, (p.locked || 0) - o.qty);
      const basis = p.cost * (o.qty / p.qty);
      o.pnl = total - basis;
      st.realized += o.pnl;
      p.cost -= basis;
      p.qty -= o.qty;
      st.cash += total;
      if (p.qty * px < 0.005 && !(p.locked > EPS)) delete st.positions[sym];
    }
    if (st.cash < 0 && st.cash > -1e-6) st.cash = 0;
    o.status = 'filled';
    o.price = px;
    o.total = total;
    o.closedAt = Date.now();
  }

  // Trigger resting limit orders as prices move.
  M.on((sym, s) => {
    if (s.price == null) return;
    let any = false;
    for (const o of st.orders) {
      if (o.status !== 'open' || o.sym !== sym) continue;
      if ((o.side === 'buy' && s.price <= o.limit) || (o.side === 'sell' && s.price >= o.limit)) {
        fill(o, s.price);
        any = true;
        changed({ type: 'filled', order: o, triggered: true });
      }
    }
    if (any) snapshot(true);
  });

  function snapshot(force) {
    const eq = P.equity();
    if (!Number.isFinite(eq)) return;
    const now = Date.now();
    const h = st.history;
    const last = h[h.length - 1];
    if (!force && last && now - last[0] < 15000) return;
    h.push([now, +eq.toFixed(6)]);
    if (h.length > 6000) st.history = h.filter((_, i) => i % 2 === 0 || i > h.length - 1000);
    save();
  }
  P.snapshot = snapshot;
  if (!st.history.length) st.history.push([st.createdAt, st.start]);
  setInterval(() => snapshot(false), 15000);
})();
