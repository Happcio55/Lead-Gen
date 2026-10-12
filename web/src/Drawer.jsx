// Token drawer: candle chart, stats, trade panel, TP/SL rules and the live trade tape.
import { useEffect, useMemo, useRef, useState } from 'react';
import { addressUrl, tokenUrl, txUrl } from '../../shared/chain.js';
import { feeLabel } from './Board.jsx';
import { usePoolDetail, useNow } from './data.js';
import { age, copy, eth, num, pct, short, usd } from './lib.js';
import { closeDrawer, toast, toggleWatch, useStore } from './store.js';
import { canTrade, setRule, useTrader, valuePosition } from './trading.js';
import { Avatar, Delta, NumField } from './ui.jsx';
import { Rudy, rudyRead } from './Rudy.jsx';

const FRAMES = [
  { label: '5s', ms: 5_000 },
  { label: '15s', ms: 15_000 },
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 300_000 },
];

export function Drawer({ id, board }) {
  const [frame, setFrame] = useState(FRAMES[1].ms);
  const { detail, missing } = usePoolDetail(id, frame);
  const row = board.byId.get(id) || detail;
  const now = useNow();
  const watched = useStore((s) => s.watchlist.includes(id));
  const ethUsd = board.meta?.ethUsd || 0;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeDrawer();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!row) {
    return (
      <div className="drawer token-page">
        <button className="back-btn" onClick={() => (history.state?.coin ? history.back() : closeDrawer())}>
          ← Back
        </button>
        <div className="drawer-loading">{missing ? 'This pool is no longer tracked.' : 'Loading pool…'}</div>
      </div>
    );
  }

  const supply = detail?.supply || (row.priceEth ? row.mcapUsd / (row.priceEth * ethUsd || 1) : 0);
  return (
    <div className="drawer token-page">
      <button className="back-btn" onClick={() => (history.state?.coin ? history.back() : closeDrawer())}>
        ← Back
      </button>
      <header className="drawer-head">
        <Avatar token={row.token} symbol={row.symbol} logo={row.logo} size={48} />
        <div className="drawer-title">
          <div>
            <h2>{row.symbol}</h2>
            <span className="name">{row.name}</span>
          </div>
          <div className="addr-line">
            <button className="chip" onClick={() => copy(row.token).then(() => toast('Contract copied'))}>
              {short(row.token, 5)} ⧉
            </button>
            <a className="chip" href={tokenUrl(row.token)} target="_blank" rel="noreferrer">
              Explorer ↗
            </a>
            {row.socials?.x && (
              <a className="chip" href={row.socials.x} target="_blank" rel="noreferrer noopener">
                𝕏 ↗
              </a>
            )}
            {row.socials?.tg && (
              <a className="chip" href={row.socials.tg} target="_blank" rel="noreferrer noopener">
                Telegram ↗
              </a>
            )}
            {row.socials?.web && (
              <a className="chip" href={row.socials.web} target="_blank" rel="noreferrer noopener">
                Website ↗
              </a>
            )}
            <span className="chip dim">{age(now - row.createdAt)} old</span>
            {row.source === 'gecko' && <span className="chip">{row.dexName}</span>}
          </div>
        </div>
        <button className={`icon-btn star ${watched ? 'on' : ''}`} onClick={() => toggleWatch(id)}>
          {watched ? '★' : '☆'}
        </button>
      </header>

      <div className="drawer-scroll">
        <div className="price-hero">
          <div>
            <small>Market cap</small>
            <strong>{usd(row.mcapUsd)}</strong>
          </div>
          <div>
            <small>5m</small>
            <Delta v={row.ch5m}>{pct(row.ch5m)}</Delta>
          </div>
          <div>
            <small>1h</small>
            <Delta v={row.ch1h}>{pct(row.ch1h)}</Delta>
          </div>
          {row.source === 'gecko' ? (
            <div>
              <small>Liquidity</small>
              <span>{usd(row.liqUsd)}</span>
            </div>
          ) : (
            <div>
              <small>ATH</small>
              <span>{usd(row.athUsd)}</span>
            </div>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-tools">
            {FRAMES.map((f) => (
              <button key={f.ms} className={`seg ${frame === f.ms ? 'on' : ''}`} onClick={() => setFrame(f.ms)}>
                {f.label}
              </button>
            ))}
            <span className="chart-note">Market cap · USD</span>
          </div>
          <CandleChart candles={detail?.candles} scale={supply * ethUsd} />
        </div>

        <TradePanel row={row} ethUsd={ethUsd} />

        <div className="stats">
          <Stat k="Price" v={usd(row.priceUsd)} />
          <Stat k="Liquidity" v={usd(row.liqUsd)} />
          <Stat k="Vol 5m" v={usd(row.vol5mUsd)} />
          <Stat k="Vol 1h" v={usd(row.vol1hUsd)} />
          <Stat k="Buys / sells" v={`${num(row.buys)} / ${num(row.sells)}`} />
          <Stat k="5m flow" v={`${row.buys5m} / ${row.sells5m}`} />
          <Stat k="Pool fee" v={feeLabel(row.fee)} />
          <Stat
            k="Hook"
            v={row.hooks === '0x0000000000000000000000000000000000000000' ? 'none' : <a href={addressUrl(row.hooks)} target="_blank" rel="noreferrer">{short(row.hooks)}</a>}
          />
        </div>

        <div className="tape">
          <h4>Live trades</h4>
          {(detail?.swaps || []).slice(0, 40).map((s) => (
            <a key={s.tx + s.t + s.side} className={`tape-row ${s.side}`} href={txUrl(s.tx)} target="_blank" rel="noreferrer">
              <span className="side">{s.side === 'buy' ? 'BUY' : 'SELL'}</span>
              <span>{eth(s.eth, 4)} ETH</span>
              <span className="dim">{usd(s.eth * ethUsd)}</span>
              <span className="dim">{usd(s.priceEth * supply * ethUsd)}</span>
              <span className="dim right">{age(now - s.t)}</span>
            </a>
          ))}
          {detail && !detail.swaps.length && <div className="empty">No trades yet.</div>}
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }) {
  return (
    <div className="stat">
      <small>{k}</small>
      <span>{v}</span>
    </div>
  );
}

function TradePanel({ row, ethUsd }) {
  const { buy, sell, wallet } = useTrader();
  const settings = useStore((s) => s.settings);
  const pos = useStore((s) => (wallet.address ? s.positions[wallet.address.toLowerCase()]?.[row.token] : null));
  const rule = useStore((s) => (wallet.address ? s.rules[wallet.address.toLowerCase()]?.[row.token] : null));
  const [tab, setTab] = useState('buy');
  const [amount, setAmount] = useState(String(settings.quickBuy));
  const v = pos ? valuePosition(pos, row, ethUsd) : null;

  const read = rudyRead(row);
  if (!canTrade(row)) return <ExternalTrade row={row} />;
  return (
    <div className="trade">
      {read && (
        <div className={`rudy-tip ${read.kind}`}>
          <Rudy mood={read.kind === 'warn' ? 'worried' : 'happy'} size={44} track />
          <span>{read.text}</span>
        </div>
      )}
      <div className="trade-tabs">
        <button className={tab === 'buy' ? 'on buy' : ''} onClick={() => setTab('buy')}>
          Buy
        </button>
        <button className={tab === 'sell' ? 'on sell' : ''} onClick={() => setTab('sell')}>
          Sell
        </button>
        <button className={tab === 'auto' ? 'on auto' : ''} onClick={() => setTab('auto')}>
          TP / SL
        </button>
      </div>

      {tab === 'buy' && (
        <div className="trade-body">
          <div className="amount">
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} inputMode="decimal" />
            <span>ETH</span>
          </div>
          <div className="presets">
            {settings.presets.map((p) => (
              <button key={p} className={Number(amount) === p ? 'on' : ''} onClick={() => setAmount(String(p))}>
                {p}
              </button>
            ))}
          </div>
          <div className="trade-hint">
            ≈ {usd(Number(amount || 0) * ethUsd)} · slippage {settings.slippage}%
          </div>
          <button
            className="cta buy"
            disabled={!(Number(amount) > 0)}
            onClick={() => buy(row, Number(amount))}
          >
            {wallet.authenticated ? `Buy ${row.symbol}` : 'Log in to trade'}
          </button>
        </div>
      )}

      {tab === 'sell' && (
        <div className="trade-body">
          {v ? (
            <>
              <div className="holding">
                <div>
                  <small>Holding</small>
                  <b>{num(v.qty)} {row.symbol}</b>
                </div>
                <div>
                  <small>Value</small>
                  <b>{usd(v.valueUsd)}</b>
                </div>
                <div>
                  <small>PnL</small>
                  <Delta v={v.pnlPct}>{pct(v.pnlPct)}</Delta>
                </div>
              </div>
              <div className="sell-grid">
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <button key={f} className="cta sell ghost" onClick={() => sell({ ...pos, ...row, token: row.token, decimals: row.decimals }, f).catch(() => {})}>
                    {f === 1 ? 'All' : `${f * 100}%`}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">
              {wallet.authenticated ? 'No position in this token from this terminal.' : 'Log in to see your position.'}
            </div>
          )}
        </div>
      )}

      {tab === 'auto' && <RuleEditor row={row} pos={pos} rule={rule} wallet={wallet} />}
    </div>
  );
}

function RuleEditor({ row, pos, rule, wallet }) {
  const [tp, setTp] = useState(rule?.tp ?? 100);
  const [tpSell, setTpSell] = useState(rule?.tpSell ?? 50);
  const [sl, setSl] = useState(rule?.sl ?? 35);
  const [trail, setTrail] = useState(rule?.trail ?? 0);
  if (!wallet.authenticated) return <div className="trade-body empty">Log in to set automation.</div>;
  if (!pos) return <div className="trade-body empty">Buy first. Rules run against your position's entry.</div>;
  const save = () => {
    setRule(wallet.address, row.token, {
      armed: true,
      tp: tp || null,
      tpSell: tpSell || 100,
      sl: sl || null,
      trail: trail || null,
    });
    toast(`Automation armed for ${row.symbol}`, { kind: 'success' });
  };
  return (
    <div className="trade-body">
      <div className="rule-grid">
        <NumField label="Take profit at" suffix="%" value={tp} onChange={setTp} />
        <NumField label="…and sell" suffix="%" value={tpSell} onChange={setTpSell} />
        <NumField label="Stop loss at" suffix="-%" value={sl} onChange={setSl} />
        <NumField label="Trailing stop" suffix="%" value={trail} onChange={setTrail} />
      </div>
      {!wallet.embedded && (
        <div className="warn">Your wallet will ask you to confirm automated sells. With a Privy login, they go through instantly.</div>
      )}
      <div className="trade-hint">Rules run in this browser tab while it's open, and your keys never leave your wallet.</div>
      <div className="row-btns">
        <button className="cta auto" onClick={save}>
          {rule?.armed ? 'Update rules' : 'Arm rules'}
        </button>
        {rule && (
          <button className="cta ghost" onClick={() => setRule(wallet.address, row.token, null)}>
            Disarm
          </button>
        )}
      </div>
    </div>
  );
}

// Canvas candle chart, drawn from scratch so it stays light and themeable.
function CandleChart({ candles, scale }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const data = useMemo(() => (candles || []).slice(-120), [candles]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const up = css.getPropertyValue('--up').trim() || '#2ee6a6';
    const down = css.getPropertyValue('--down').trim() || '#ff4d6d';
    const grid = css.getPropertyValue('--grid').trim() || 'rgba(255,255,255,.05)';
    const muted = css.getPropertyValue('--muted').trim() || '#7d8596';
    if (!data.length || !scale) {
      g.fillStyle = muted;
      g.font = '12px Inter, sans-serif';
      g.fillText('Waiting for trades…', 16, h / 2);
      return;
    }
    const padR = 64;
    const padY = 14;
    let lo = Infinity;
    let hi = -Infinity;
    for (const k of data) {
      lo = Math.min(lo, k.l);
      hi = Math.max(hi, k.h);
    }
    if (hi === lo) {
      hi *= 1.01;
      lo *= 0.99;
    }
    const y = (p) => padY + (1 - (p - lo) / (hi - lo)) * (h - padY * 2);
    const slot = (w - padR) / Math.max(data.length, 30);
    const bw = Math.max(1, slot * 0.62);

    g.strokeStyle = grid;
    g.lineWidth = 1;
    g.fillStyle = muted;
    g.font = '10px "JetBrains Mono", monospace';
    for (let i = 0; i <= 4; i++) {
      const p = lo + ((hi - lo) * i) / 4;
      const yy = Math.round(y(p)) + 0.5;
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(w - padR, yy);
      g.stroke();
      g.fillText(usd(p * scale), w - padR + 6, yy + 3);
    }
    data.forEach((k, i) => {
      const x = i * slot + slot / 2;
      const col = k.c >= k.o ? up : down;
      g.strokeStyle = col;
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, y(k.h));
      g.lineTo(Math.round(x) + 0.5, y(k.l));
      g.stroke();
      const top = y(Math.max(k.o, k.c));
      const bh = Math.max(1, Math.abs(y(k.o) - y(k.c)));
      g.fillRect(x - bw / 2, top, bw, bh);
    });
    const last = data[data.length - 1];
    const ly = Math.round(y(last.c)) + 0.5;
    g.setLineDash([3, 3]);
    g.strokeStyle = last.c >= last.o ? up : down;
    g.beginPath();
    g.moveTo(0, ly);
    g.lineTo(w - padR, ly);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = last.c >= last.o ? up : down;
    g.fillRect(w - padR + 2, ly - 8, padR - 4, 16);
    g.fillStyle = '#ffffff';
    g.fillText(usd(last.c * scale), w - padR + 6, ly + 3);
    if (hover != null && data[hover]) {
      const x = hover * slot + slot / 2;
      g.strokeStyle = muted;
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
      g.setLineDash([]);
    }
  }, [data, scale, hover]);

  const k = hover != null ? data[hover] : null;
  return (
    <div className="chart-wrap">
      <canvas
        ref={ref}
        className="chart"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const slot = (rect.width - 64) / Math.max(data.length, 30);
          const i = Math.floor((e.clientX - rect.left) / slot);
          setHover(i >= 0 && i < data.length ? i : null);
        }}
        onMouseLeave={() => setHover(null)}
      />
      {k && (
        <div className="chart-ohlc">
          O {usd(k.o * scale)} H {usd(k.h * scale)} L {usd(k.l * scale)} C {usd(k.c * scale)} · {new Date(k.t).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}


// Coins on a DEX the app does not route through yet: trade them on GeckoTerminal.
function ExternalTrade({ row }) {
  const gt = `https://www.geckoterminal.com/robinhood/pools/${row.poolAddress}`;
  return (
    <div className="trade ext-trade">
      <div className="rudy-tip">
        <Rudy mood="neutral" size={44} track />
        <span>
          ${row.symbol} trades on {row.dexName}, which Vestas can't route through yet. Trade it on GeckoTerminal instead.
        </span>
      </div>
      <div className="trade-body">
        <a className="cta big" href={gt} target="_blank" rel="noreferrer">
          Trade ${row.symbol} on GeckoTerminal ↗
        </a>
        <div className="trade-hint">Price, chart and trades on this page come from GeckoTerminal.</div>
      </div>
    </div>
  );
}
