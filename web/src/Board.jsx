// The three-lane live board.
import { memo, useMemo, useRef, useState } from 'react';
import { age, num, pct, usd } from './lib.js';
import { openDrawer, resetFilters, setFilter, toggleWatch, useStore } from './store.js';
import { Avatar, Delta, NumField, Spark, Toggle } from './ui.jsx';

const HOT_TX = 15;
const HOT_VOL = 1000;
const NEW_AGE = 30 * 60_000;

export const LANES = [
  { key: 'new', title: 'Fresh pools', hint: 'Created in the last 30 min', icon: '✦' },
  { key: 'hot', title: 'Surging', hint: `≥${HOT_TX} trades and ≥$1K volume in 5 min`, icon: '⚡' },
  { key: 'est', title: 'Established', hint: 'Older than 30 min, still trading', icon: '◆' },
];

export function laneOf(r, now) {
  if (r.buys5m + r.sells5m >= HOT_TX && r.vol5mUsd >= HOT_VOL) return 'hot';
  if (now - r.createdAt < NEW_AGE) return 'new';
  return 'est';
}

const SORTS = {
  new: (a, b) => b.createdAt - a.createdAt,
  hot: (a, b) => b.vol5mUsd - a.vol5mUsd,
  est: (a, b) => b.mcapUsd - a.mcapUsd,
};

function passes(r, f, now) {
  if (f.minLiq && r.liqUsd < f.minLiq) return false;
  if (f.minMc && r.mcapUsd < f.minMc) return false;
  if (f.maxMc && r.mcapUsd > f.maxMc) return false;
  if (f.minTx5m && r.buys5m + r.sells5m < f.minTx5m) return false;
  if (f.maxAgeMin && now - r.createdAt > f.maxAgeMin * 60_000) return false;
  if (f.hideHooks && r.hooks !== '0x0000000000000000000000000000000000000000') return false;
  return true;
}

export function Board({ rows, now, query, onBuy }) {
  const filters = useStore((s) => s.settings.filters);
  const lanes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = { new: [], hot: [], est: [] };
    for (const r of rows) {
      if (q && !`${r.symbol} ${r.name} ${r.token}`.toLowerCase().includes(q)) continue;
      const lane = laneOf(r, now);
      if (passes(r, filters[lane], now)) out[lane].push(r);
    }
    for (const k of Object.keys(out)) out[k] = out[k].sort(SORTS[k]).slice(0, 80);
    return out;
    // `now` is intentionally coarse: lanes re-bucket on every board push
  }, [rows, filters, query, Math.floor(now / 5000)]);

  return (
    <div className="board">
      {LANES.map((l) => (
        <Lane key={l.key} lane={l} rows={lanes[l.key]} now={now} onBuy={onBuy} />
      ))}
    </div>
  );
}

function Lane({ lane, rows, now, onBuy }) {
  const pauseOnHover = useStore((s) => s.settings.pauseOnHover);
  const [hover, setHover] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const frozen = useRef(null);
  const paused = pauseOnHover && hover;

  // While hovered, keep the row order stable so things don't jump under the cursor (values still update).
  let shown = rows;
  if (paused && frozen.current) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    shown = frozen.current.map((r) => byId.get(r.id) || r);
  } else {
    frozen.current = rows;
  }

  return (
    <section className="lane" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <header className="lane-head">
        <span className="lane-icon">{lane.icon}</span>
        <div className="lane-title">
          <h2>{lane.title}</h2>
          <small>{lane.hint}</small>
        </div>
        <span className={`lane-state ${paused ? 'paused' : ''}`}>{paused ? 'Paused' : 'Live'}</span>
        <span className="lane-count">{rows.length}</span>
        <button className={`icon-btn ${showFilters ? 'on' : ''}`} onClick={() => setShowFilters((v) => !v)} title="Filters">
          ⚙
        </button>
      </header>
      {showFilters && <LaneFilters lane={lane.key} />}
      <div className="lane-body">
        {shown.length === 0 && <div className="empty">Nothing matches right now. Loosen the filters or wait for the next launch.</div>}
        {shown.map((r) => (
          <Row key={r.id} r={r} now={now} onBuy={onBuy} />
        ))}
      </div>
    </section>
  );
}

function LaneFilters({ lane }) {
  const f = useStore((s) => s.settings.filters[lane]);
  const set = (patch) => setFilter(lane, patch);
  return (
    <div className="lane-filters">
      <NumField label="Min liquidity" suffix="$" value={f.minLiq} onChange={(v) => set({ minLiq: v })} />
      <NumField label="Min market cap" suffix="$" value={f.minMc} onChange={(v) => set({ minMc: v })} />
      <NumField label="Max market cap" suffix="$" value={f.maxMc} onChange={(v) => set({ maxMc: v })} />
      <NumField label="Min trades / 5m" value={f.minTx5m} onChange={(v) => set({ minTx5m: v })} />
      <NumField label="Max age" suffix="min" value={f.maxAgeMin} onChange={(v) => set({ maxAgeMin: v })} />
      <Toggle label="Hide hooked pools" checked={f.hideHooks} onChange={(v) => set({ hideHooks: v })} />
      <button className="link-btn" onClick={() => resetFilters(lane)}>
        Reset
      </button>
    </div>
  );
}

// v4 marks dynamic-fee pools (fee set by the hook per swap) with this flag.
const DYNAMIC_FEE = 0x800000;
export function feeLabel(fee) {
  if (fee & DYNAMIC_FEE) return 'dyn fee';
  return `${Number((fee / 10_000).toFixed(2))}%`;
}

const Row = memo(function Row({ r, now, onBuy }) {
  const quickBuy = useStore((s) => s.settings.quickBuy);
  const compact = useStore((s) => s.settings.compact);
  const watched = useStore((s) => s.watchlist.includes(r.id));
  const tx5 = r.buys5m + r.sells5m;
  const buyShare = tx5 ? (r.buys5m / tx5) * 100 : 50;
  const fresh = now - r.createdAt < 20_000;
  const hooked = r.hooks !== '0x0000000000000000000000000000000000000000';
  return (
    <div className={`row ${compact ? 'compact' : ''} ${fresh ? 'fresh' : ''}`} onClick={() => openDrawer(r.id)}>
      <Avatar token={r.token} symbol={r.symbol} size={compact ? 30 : 40} />
      <div className="row-main">
        <div className="row-top">
          <b className="sym">{r.symbol}</b>
          <span className="name">{r.name}</span>
          <button
            className={`star ${watched ? 'on' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleWatch(r.id);
            }}
            title={watched ? 'Unwatch' : 'Watch'}
          >
            {watched ? '★' : '☆'}
          </button>
        </div>
        <div className="row-meta">
          <span className="age">{age(now - r.createdAt)}</span>
          <span title="Liquidity (virtual, in range)">
            <i>L</i> {usd(r.liqUsd)}
          </span>
          <span title="5 minute volume">
            <i>V</i> {usd(r.vol5mUsd)}
          </span>
          <span title="Trades in 5 minutes">
            <i>TX</i> {num(tx5)}
          </span>
          {hooked && <span className="tag" title={`v4 hook ${r.hooks}`}>hook</span>}
          <span className={`tag ${r.fee & DYNAMIC_FEE || r.fee >= 50_000 ? '' : 'dim'}`} title="Pool swap fee">
            {feeLabel(r.fee)}
          </span>
        </div>
        {!compact && (
          <div className="flow" title={`${r.buys5m} buys / ${r.sells5m} sells (5m)`}>
            <span style={{ width: `${buyShare}%` }} />
          </div>
        )}
      </div>
      <div className="row-right">
        <div className="mc">{usd(r.mcapUsd)}</div>
        <Delta v={r.ch5m}>{pct(r.ch5m)}</Delta>
        {!compact && <Spark data={r.spark} width={74} height={20} />}
      </div>
      <button
        className="qbuy"
        onClick={(e) => {
          e.stopPropagation();
          onBuy(r, quickBuy);
        }}
        title={`Buy ${quickBuy} ETH`}
      >
        ⚡ {quickBuy}
      </button>
    </div>
  );
});
