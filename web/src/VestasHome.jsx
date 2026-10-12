// Vestas's landing view: hero with a live quick-buy card, market overview and the most traded launches.
import { useMemo, useState } from 'react';
import { txUrl } from '../../shared/chain.js';
import { laneOf } from './Board.jsx';
import { age, eth, num, pct, short, usd } from './lib.js';
import { openDrawer, setView, useStore } from './store.js';
import { canTrade, useTrader } from './trading.js';
import { Avatar, Delta, Spark } from './ui.jsx';

const TIERS = [
  { label: '$1M +', min: 1e6, max: Infinity },
  { label: '$250K – 1M', min: 250e3, max: 1e6 },
  { label: '$100K – 250K', min: 100e3, max: 250e3 },
  { label: '$50K – 100K', min: 50e3, max: 100e3 },
  { label: '$20K – 50K', min: 20e3, max: 50e3 },
  { label: '$10K – 20K', min: 10e3, max: 20e3 },
  { label: '$5K – 10K', min: 5e3, max: 10e3 },
  { label: 'under $5K', min: 0, max: 5e3 },
];

export function Home({ board, now }) {
  const rows = board.rows;
  const surging = useMemo(
    () => rows.filter((r) => canTrade(r) && laneOf(r, now) === 'hot').sort((a, b) => b.vol5mUsd - a.vol5mUsd).slice(0, 5),
    // re-rank every few seconds, not every tick
    [rows, Math.floor(now / 4000)]
  );
  const top = useMemo(() => [...rows].sort((a, b) => b.vol1hUsd - a.vol1hUsd).slice(0, 8), [rows]);
  const fresh = rows.filter((r) => now - r.createdAt < 3600_000).length;
  const vol1h = rows.reduce((s, r) => s + r.vol1hUsd, 0);

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <h1>
            Catch every launch,
            <br />
            <mark>before the crowd</mark>.
          </h1>
          <p className="lede">Every new memecoin on Robinhood Chain, live from Pons and Uniswap. Log in with email, buy in one click, exit on autopilot.</p>
          <a className="underlink" href="#how">
            How trading on Vestas works <span>↗</span>
          </a>
          <div className="hero-stats">
            <div>
              <strong>
                {num(fresh)}
                <em>new</em>
              </strong>
              <small>pools launched in the last hour</small>
            </div>
            <div>
              <strong>{usd(vol1h)}</strong>
              <small>traded across the board, last hour</small>
            </div>
            <div>
              <strong>$0</strong>
              <small>platform fees on your trades</small>
            </div>
          </div>
        </div>
        <QuickBuyCard candidates={surging.length ? surging : top.slice(0, 5)} ethUsd={board.meta?.ethUsd || 0} />
      </section>

      <section className="pillars" id="how">
        <Pillar title="Straight from the chain">
          Uniswap v4 pools are read straight from the chain as they trade, and launches on Pons and other Uniswap pools come in through GeckoTerminal. Every trade goes on-chain from your wallet.
        </Pillar>
        <Pillar title="Your keys, your coins">
          Trades are built in your browser and signed by your own wallet. Vestas never holds funds and never sees a private key.
        </Pillar>
        <Pillar title="Exits on autopilot">
          Set a take-profit, a stop-loss or a trailing stop once. Vestas sells for you the moment it triggers.
        </Pillar>
      </section>

      <h2 className="section-title">Where the money is moving.</h2>
      <section className="split">
        <TierBook rows={rows} />
        <BuyFeed feed={board.feed} now={now} ethUsd={board.meta?.ethUsd || 0} />
      </section>

      <h2 className="section-title">The most traded launches right now.</h2>
      <p className="section-sub">{num(rows.length)} live pools on the board, ranked by volume in the last hour.</p>
      <section className="catalogue card">
        <div className="catalogue-head">
          <span>token</span>
          <span>market cap · 1h volume · 1h change</span>
        </div>
        {top.map((r) => (
          <div key={r.id} className="catalogue-row" onClick={() => openDrawer(r.id)}>
            <Avatar token={r.token} symbol={r.symbol} logo={r.logo} size={38} />
            <div className="cat-name">
              <b>{r.name}</b>
              <small>
                ${r.symbol} · {short(r.token)} · {age(now - r.createdAt)} old
              </small>
            </div>
            <Spark data={r.spark} width={120} height={30} />
            <div className="cat-price">
              <span className="was">{usd(r.mcapUsd)}</span>
              <b>{usd(r.vol1hUsd)}</b>
              <span className={`pill ${r.ch1h >= 0 ? 'up' : 'down'}`}>{pct(r.ch1h, 0)}</span>
            </div>
          </div>
        ))}
        <button className="catalogue-more" onClick={() => setView('terminal')}>
          Open the live terminal →
        </button>
      </section>

      <footer className="footer">
        <span>Vestas · Robinhood Chain terminal</span>
        <span>Not affiliated with Vestas Wind Systems, Robinhood, Uniswap or Privy. Memecoins are extremely risky, so only trade what you can lose.</span>
      </footer>
    </div>
  );
}

function Pillar({ title, children }) {
  return (
    <div className="pillar card">
      <h4>
        <i /> {title}
      </h4>
      <p>{children}</p>
    </div>
  );
}

function QuickBuyCard({ candidates, ethUsd }) {
  const { buy, wallet } = useTrader();
  const presets = useStore((s) => s.settings.presets);
  const [pick, setPick] = useState(0);
  const [amount, setAmount] = useState('0.01');
  const r = candidates[Math.min(pick, candidates.length - 1)];
  return (
    <div className="buy-card card">
      <div className="buy-card-tabs">
        <span className="on">Quick buy</span>
        <span className="live-dot">Live · surging now</span>
      </div>
      <div className="pick-row">
        {candidates.map((c, i) => (
          <button key={c.id} className={`pick ${i === pick ? 'on' : ''}`} onClick={() => setPick(i)}>
            <Avatar token={c.token} symbol={c.symbol} logo={c.logo} size={20} />
            {c.symbol}
          </button>
        ))}
        {!candidates.length && <span className="muted">Waiting for the first trades…</span>}
      </div>
      {r && (
        <div className="pick-stats" onClick={() => openDrawer(r.id)}>
          <div>
            <small>Market cap</small>
            <b>{usd(r.mcapUsd)}</b>
          </div>
          <div>
            <small>5m</small>
            <Delta v={r.ch5m}>{pct(r.ch5m)}</Delta>
          </div>
          <div>
            <small>5m volume</small>
            <b>{usd(r.vol5mUsd)}</b>
          </div>
        </div>
      )}
      <label className="buy-label">You pay</label>
      <div className="big-input">
        <span>Ξ</span>
        <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(',', '.'))} />
        <em>≈ {usd(Number(amount || 0) * ethUsd)}</em>
      </div>
      <div className="chips">
        {presets.map((p) => (
          <button key={p} className={Number(amount) === p ? 'on' : ''} onClick={() => setAmount(String(p))}>
            {p} ETH
          </button>
        ))}
      </div>
      <button className="cta big" disabled={!r || !(Number(amount) > 0)} onClick={() => r && buy(r, Number(amount))}>
        {!wallet.authenticated ? 'Log in & buy' : r ? `Buy ${r.symbol}` : 'Buy'}
      </button>
    </div>
  );
}

function TierBook({ rows }) {
  const tiers = TIERS.map((t) => {
    const inTier = rows.filter((r) => r.mcapUsd >= t.min && r.mcapUsd < t.max);
    return { ...t, count: inTier.length, vol: inTier.reduce((s, r) => s + r.vol1hUsd, 0) };
  });
  const max = Math.max(1, ...tiers.map((t) => t.vol));
  const total = tiers.reduce((s, t) => s + t.vol, 0);
  return (
    <div className="book card">
      <div className="card-head">
        <h3>
          <i className="dot" /> Volume by market cap
        </h3>
        <span className="mono muted">{usd(total)} traded · 1h</span>
      </div>
      <div className="book-cols">
        <span>market cap</span>
        <span>pools · 1h volume</span>
      </div>
      {tiers.map((t) => (
        <div key={t.label} className="book-row">
          <span className="book-fill" style={{ width: `${(t.vol / max) * 100}%` }} />
          <span className="book-label">{t.label}</span>
          <span className="book-val">
            <em>{t.count}</em> {usd(t.vol)}
          </span>
        </div>
      ))}
    </div>
  );
}

function BuyFeed({ feed, now, ethUsd }) {
  return (
    <div className="feed card">
      <div className="card-head">
        <h3>
          <i className="dot" /> Big buys
        </h3>
        <span className="mono muted">≥ 0.02 ETH</span>
      </div>
      <div className="feed-list">
        {!feed.length && <p className="muted pad">Watching for the next big buy…</p>}
        {feed.slice(0, 12).map((f) => (
          <a key={f.tx + f.pool} className="feed-row" href={txUrl(f.tx)} target="_blank" rel="noreferrer">
            <div>
              <b className="mono">{f.buyer ? short(f.buyer) : 'unknown'}</b>
              <small>
                bought <strong>{f.symbol}</strong> · {age(now - f.t)} ago
              </small>
            </div>
            <div className="feed-amt">
              <b className="mono">{usd(f.eth * ethUsd)}</b>
              <small className="mono">{eth(f.eth, 3)} ETH</small>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
