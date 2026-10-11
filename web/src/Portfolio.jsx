// Portfolio dashboard: value tiles, daily activity bars and open positions.
import { useMemo } from 'react';
import { addressUrl } from '../../shared/chain.js';
import { useEthBalance } from './data.js';
import { eth, num, pct, short, usd } from './lib.js';
import { openDrawer, setView, useStore } from './store.js';
import { useTrader, valuePosition } from './trading.js';
import { Avatar, Delta } from './ui.jsx';

const DAYS = 30;

export function Portfolio({ board }) {
  const { wallet, sell } = useTrader();
  const key = wallet.address?.toLowerCase();
  const positions = useStore((s) => (key ? s.positions[key] : null));
  const rules = useStore((s) => (key ? s.rules[key] : null));
  const trades = useStore((s) => s.trades);
  const bal = useEthBalance(wallet.address);
  const ethUsd = board.meta?.ethUsd || 0;

  const list = useMemo(
    () =>
      Object.values(positions || {})
        .map((p) => {
          const row = board.byToken.get(p.token);
          return { p, row, v: valuePosition(p, row, ethUsd), rule: rules?.[p.token] };
        })
        .sort((a, b) => b.v.valueEth - a.v.valueEth),
    [positions, rules, board.byToken, ethUsd]
  );
  const mine = useMemo(() => trades.filter((t) => t.wallet?.toLowerCase() === key), [trades, key]);
  const totals = list.reduce(
    (t, { p, v }) => ({ value: t.value + v.valueEth, cost: t.cost + p.costEth, realized: t.realized + (p.realizedEth || 0) }),
    { value: 0, cost: 0, realized: 0 }
  );
  const unrealized = totals.value - totals.cost;
  const days = useMemo(() => {
    const out = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (DAYS - 1 - i));
      return { t: d.getTime(), buy: 0, sell: 0 };
    });
    for (const t of mine) {
      const idx = out.findIndex((d, i) => t.at >= d.t && (i === DAYS - 1 || t.at < out[i + 1].t));
      if (idx >= 0) out[idx][t.side] += t.eth;
    }
    return out;
  }, [mine]);
  const maxDay = Math.max(1e-9, ...days.map((d) => d.buy + d.sell));

  if (!wallet.authenticated) {
    return (
      <div className="page">
        <div className="card empty-state">
          <h2>
            Your portfolio, <mark>live</mark>.
          </h2>
          <p>Log in to see your positions, PnL and automation in one place.</p>
          <button className="cta big" onClick={() => wallet.login()}>
            Log in
          </button>
        </div>
      </div>
    );
  }

  const maxValue = Math.max(1e-12, ...list.map((x) => x.v.valueEth));
  return (
    <div className="page">
      <div className="dash card">
        <div className="dash-head">
          <h3>
            <i className="dot" /> {wallet.label || 'Your wallet'}
          </h3>
          <a className="key-chip mono" href={addressUrl(wallet.address)} target="_blank" rel="noreferrer">
            {short(wallet.address, 6)} ↗
          </a>
        </div>
        <div className="tiles">
          <Tile label="Cash" value={`${bal == null ? '…' : eth(bal, 4)} ETH`} sub={usd((bal || 0) * ethUsd)} />
          <Tile label="Positions" value={usd(totals.value * ethUsd)} sub={`${list.length} open · ${eth(totals.value)} ETH`} />
          <Tile label="Realized PnL" value={<Delta v={totals.realized}>{usd(totals.realized * ethUsd)}</Delta>} sub={`${mine.length} trades from this browser`} />
          <Tile
            label="Unrealized PnL"
            value={<Delta v={unrealized}>{usd(unrealized * ethUsd)}</Delta>}
            sub={totals.cost ? pct((unrealized / totals.cost) * 100) : 'no open cost'}
            hot
          />
        </div>

        <div className="card inner">
          <div className="card-head">
            <h4>ETH traded by day</h4>
            <span className="legend-keys">
              <i className="k buy" /> bought <i className="k sell" /> sold · last {DAYS} days
            </span>
          </div>
          <div className="bars">
            {days.map((d) => (
              <div key={d.t} className="bar" title={`${new Date(d.t).toLocaleDateString()}: bought ${eth(d.buy)} ETH, sold ${eth(d.sell)} ETH`}>
                <span className="sell" style={{ height: `${(d.sell / maxDay) * 100}%` }} />
                <span className="buy" style={{ height: `${(d.buy / maxDay) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>

        <div className="card inner">
          <div className="card-head">
            <h4>Positions</h4>
            <button className="link-btn" onClick={() => setView('terminal')}>
              Find more on the terminal →
            </button>
          </div>
          {!list.length && <p className="muted pad">No open positions yet.</p>}
          {list.map(({ p, row, v, rule }) => (
            <div key={p.token} className="pos-row" onClick={() => openDrawer(row?.id || p.id)}>
              <div className="pos-top">
                <Avatar token={p.token} symbol={p.symbol} size={30} />
                <div className="pos-name">
                  <b>{p.symbol}</b>
                  <small>
                    {num(v.qty)} tokens · cost {eth(p.costEth)} ETH
                    {rule?.armed && ` · ${[rule.tp != null && `TP +${rule.tp}%`, rule.sl != null && `SL -${rule.sl}%`, rule.trail != null && `trail ${rule.trail}%`].filter(Boolean).join(' · ')}`}
                  </small>
                </div>
                <div className="pos-val">
                  <b className="mono">{usd(v.valueUsd)}</b>
                  <Delta v={v.pnlPct}>{pct(v.pnlPct)}</Delta>
                </div>
                <div className="row-btns" onClick={(e) => e.stopPropagation()}>
                  <button className="mini-btn" onClick={() => sell({ ...p, ...(row || {}), token: p.token, decimals: p.decimals }, 0.5).catch(() => {})}>
                    Sell 50%
                  </button>
                  <button className="mini-btn sell" onClick={() => sell({ ...p, ...(row || {}), token: p.token, decimals: p.decimals }, 1).catch(() => {})}>
                    Sell all
                  </button>
                </div>
              </div>
              <div className="meter">
                <span style={{ width: `${(v.valueEth / maxValue) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, hot }) {
  return (
    <div className={`tile ${hot ? 'hot' : ''}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{sub}</span>
    </div>
  );
}
