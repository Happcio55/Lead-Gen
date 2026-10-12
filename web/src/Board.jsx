// The three-column live board: dense token rows, per-column search, quick-buy amount and presets.
import { memo, useMemo, useRef, useState } from 'react';
import { age, copy, num, pct, short, usd } from './lib.js';
import { openDrawer, resetFilters, setFilter, setLaneBuy, toast, toggleWatch, useStore } from './store.js';
import { Avatar, Icon, NumField, Toggle } from './ui.jsx';

const HOT_TX = 15;
const HOT_VOL = 1000;
const NEW_AGE = 30 * 60_000;
const NO_HOOK = '0x0000000000000000000000000000000000000000';

export const LANES = [
  { key: 'new', title: 'New Pairs', hint: 'Pools created in the last 30 minutes' },
  { key: 'hot', title: 'Surging', hint: `≥${HOT_TX} trades and ≥$1K volume in the last 5 minutes` },
  { key: 'est', title: 'Established', hint: 'Older than 30 minutes and still trading' },
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
  if (f.hideHooks && r.hooks !== NO_HOOK) return false;
  if (f.hideJunk !== false && isJunk(r)) return false;
  return true;
}

// Pools that can't really be traded: market cap thousands of times the liquidity behind it,
// or a swap fee so high it eats the trade.
function isJunk(r) {
  if (r.liqUsd > 0 && r.mcapUsd > 50_000 && r.mcapUsd / r.liqUsd > 2000) return true;
  return !(r.fee & DYNAMIC_FEE) && r.fee >= 500_000;
}

// One row per token: keep its most liquid pool.
function dedupe(rows) {
  const best = new Map();
  for (const r of rows) {
    const cur = best.get(r.token);
    if (!cur || r.liqUsd > cur.liqUsd) best.set(r.token, r);
  }
  return rows.filter((r) => best.get(r.token) === r);
}

// v4 marks dynamic-fee pools (fee set by the hook per swap) with this flag.
const DYNAMIC_FEE = 0x800000;
export function feeLabel(fee) {
  if (fee & DYNAMIC_FEE) return 'dyn fee';
  return `${Number((fee / 10_000).toFixed(2))}%`;
}

// @handle for an x.com profile link; "X community" for community links.
function xHandle(url) {
  if (!url) return null;
  if (/\/i\/communities\//.test(url)) return 'X community';
  const m = url.match(/^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/);
  return m && m[1] !== 'i' ? `@${m[1]}` : null;
}

export function Board({ rows, now, onBuy }) {
  const filters = useStore((s) => s.settings.filters);
  const lanes = useMemo(() => {
    const out = { new: [], hot: [], est: [] };
    for (const r of dedupe(rows)) {
      const lane = laneOf(r, now);
      if (passes(r, filters[lane], now)) out[lane].push(r);
    }
    for (const k of Object.keys(out)) out[k].sort(SORTS[k]);
    return out;
    // `now` is intentionally coarse: lanes re-bucket on every board push
  }, [rows, filters, Math.floor(now / 5000)]);

  return (
    <div className="pulse-grid">
      {LANES.map((l) => (
        <Lane key={l.key} lane={l} rows={lanes[l.key]} now={now} onBuy={onBuy} />
      ))}
    </div>
  );
}

function Lane({ lane, rows, now, onBuy }) {
  const pauseOnHover = useStore((s) => s.settings.pauseOnHover);
  const amount = useStore((s) => s.settings.laneBuy[lane.key]);
  const p = useStore((s) => s.settings.laneP[lane.key]);
  const presets = useStore((s) => s.settings.tradePresets);
  const [q, setQ] = useState('');
  const [amountText, setAmountText] = useState(String(amount));
  const [hover, setHover] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const frozen = useRef(null);
  const paused = pauseOnHover && hover;

  const needle = q.trim().toLowerCase();
  let list = needle ? rows.filter((r) => `${r.symbol} ${r.name} ${r.token}`.toLowerCase().includes(needle)) : rows;
  list = list.slice(0, 60);

  // While hovered, keep the row order stable so things don't jump under the cursor (values still update).
  if (paused && frozen.current) {
    const byId = new Map(list.map((r) => [r.id, r]));
    list = frozen.current.map((r) => byId.get(r.id) || r);
  } else {
    frozen.current = list;
  }

  const buy = (r) => onBuy(r, amount, { slippage: presets[p]?.slippage });

  return (
    <section className="plane" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <header className="plane-head">
        <h2 title={lane.hint}>
          {lane.title}
          <span className="plane-count">{rows.length}</span>
        </h2>
        <label className="plane-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker or name" />
        </label>
        <label className="plane-amount" title="Quick-buy amount for this column">
          <Icon name="bolt" />
          <input
            value={amountText}
            inputMode="decimal"
            onChange={(e) => {
              const t = e.target.value.replace(',', '.');
              setAmountText(t);
              if (Number(t) > 0) setLaneBuy(lane.key, { amount: Number(t) });
            }}
          />
          <em>Ξ</em>
        </label>
        <div className="plane-presets">
          {presets.map((pr, i) => (
            <button
              key={i}
              className={p === i ? 'on' : ''}
              title={`P${i + 1}: ${pr.slippage}% slippage`}
              onClick={() => setLaneBuy(lane.key, { p: i })}
            >
              P{i + 1}
            </button>
          ))}
        </div>
        <button className={`plane-icon ${showFilters ? 'on' : ''}`} onClick={() => setShowFilters((v) => !v)} title="Filters">
          <Icon name="sliders" />
        </button>
      </header>
      {paused && <div className="plane-paused">Paused while you hover</div>}
      {showFilters && <LaneFilters lane={lane.key} />}
      <div className="plane-body">
        {list.length === 0 && <div className="empty">Nothing matches right now. Loosen the filters or wait for the next launch.</div>}
        {list.map((r) => (
          <Row key={r.id} r={r} now={now} amount={amount} onBuy={buy} />
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
      <Toggle label="Hide fake caps & huge fees" checked={f.hideJunk !== false} onChange={(v) => set({ hideJunk: v })} />
      <button className="link-btn" onClick={() => resetFilters(lane)}>
        Reset
      </button>
    </div>
  );
}

function Pill({ label, value, good, title }) {
  const tone = good == null ? '' : good ? 'good' : 'bad';
  return (
    <span className={`pill2 ${tone}`} title={title}>
      <i>{label}</i> {value}
    </span>
  );
}

const stop = (fn) => (e) => {
  e.stopPropagation();
  fn?.(e);
};

const Row = memo(function Row({ r, now, amount, onBuy }) {
  const watched = useStore((s) => s.watchlist.includes(r.id));
  const tx5 = r.buys5m + r.sells5m;
  const buyShare = tx5 ? Math.round((r.buys5m / tx5) * 100) : null;
  const fromAth = r.athUsd > 0 ? (r.mcapUsd / r.athUsd - 1) * 100 : 0;
  const fresh = now - r.createdAt < 20_000;
  const hooked = r.hooks !== NO_HOOK;
  const highFee = r.fee & DYNAMIC_FEE || r.fee >= 50_000;
  const handle = xHandle(r.socials?.x);
  const xSearch = `https://x.com/search?q=${encodeURIComponent(r.token)}`;

  return (
    <div className={`prow ${fresh ? 'fresh' : ''}`} onClick={() => openDrawer(r.id)}>
      <div className="prow-media">
        <Avatar token={r.token} symbol={r.symbol} logo={r.logo} size={66} />
        <span className="prow-ca">{short(r.token, 4)}</span>
      </div>

      <div className="prow-main">
        <div className="prow-l1">
          <b className="prow-sym">{r.symbol}</b>
          <span className="prow-name">{r.name}</span>
          <button
            className="prow-copy"
            title="Copy contract"
            onClick={stop(() => copy(r.token).then(() => toast(`${r.symbol} contract copied`)))}
          >
            <Icon name="copy" />
          </button>
          <span className="prow-stats">
            <i>V</i> {usd(r.vol1hUsd)} <i>MC</i> <b className={r.ch5m >= 0 ? 'up' : 'down'}>{usd(r.mcapUsd)}</b>
          </span>
        </div>

        <div className="prow-l2">
          <span className="prow-age">{age(now - r.createdAt)}</span>
          {r.socials?.x && (
            <a className="soc" href={r.socials.x} target="_blank" rel="noreferrer noopener" onClick={stop()} title="X">
              𝕏
            </a>
          )}
          {r.socials?.tg && (
            <a className="soc" href={r.socials.tg} target="_blank" rel="noreferrer noopener" onClick={stop()} title="Telegram">
              <Icon name="send" />
            </a>
          )}
          {r.socials?.web && (
            <a className="soc" href={r.socials.web} target="_blank" rel="noreferrer noopener" onClick={stop()} title="Website">
              <Icon name="globe" />
            </a>
          )}
          <a className="soc" href={xSearch} target="_blank" rel="noreferrer noopener" onClick={stop()} title="Search contract on X">
            <Icon name="search" />
          </a>
          <span className="prow-meta" title="Liquidity">
            <i>L</i> {usd(r.liqUsd)}
          </span>
          <span className="prow-meta" title={`${r.buys5m} buys / ${r.sells5m} sells in 5 min`}>
            <i>TX</i> {num(tx5)}
            <span className="prow-bs">
              <span style={{ width: `${buyShare ?? 50}%` }} />
            </span>
          </span>
          <button className={`prow-star ${watched ? 'on' : ''}`} onClick={stop(() => toggleWatch(r.id))} title={watched ? 'Unwatch' : 'Watch'}>
            <Icon name="star" />
          </button>
        </div>

        <div className="prow-l3">{handle || <span className="dim">no socials</span>}</div>

        <div className="prow-pills">
          <Pill label="5m" value={pct(r.ch5m, 0)} good={r.ch5m === 0 ? null : r.ch5m > 0} title="Price change, 5 minutes" />
          <Pill label="1h" value={pct(r.ch1h, 0)} good={r.ch1h === 0 ? null : r.ch1h > 0} title="Price change, 1 hour" />
          <Pill label="Buys" value={buyShare == null ? '—' : `${buyShare}%`} good={buyShare == null ? null : buyShare >= 50} title="Share of buys in the last 5 minutes" />
          <Pill label="ATH" value={pct(fromAth, 0)} good={fromAth > -25} title="Distance from all-time-high market cap" />
          <Pill label="Fee" value={feeLabel(r.fee)} good={!highFee} title="Pool swap fee" />
          {hooked && <Pill label="Hook" value="v4" good={false} title={`Pool uses hook ${r.hooks}`} />}
        </div>
      </div>

      <button className="prow-buy" onClick={stop(() => onBuy(r))} title={`Buy ${amount} ETH`}>
        <Icon name="bolt" /> {amount} Ξ
      </button>
    </div>
  );
});
