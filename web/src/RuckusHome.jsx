// Landing view: hero with a live quick-buy card, market overview and the most traded launches.
import { useEffect, useMemo, useState } from 'react';
import { txUrl } from '../../shared/chain.js';
import { laneOf } from './Board.jsx';
import { age, eth, num, pct, short, usd } from './lib.js';
import { openDrawer, setView, useStore } from './store.js';
import { canTrade, useTrader } from './trading.js';
import { Avatar, Delta, Spark } from './ui.jsx';
import { Rudy } from './Rudy.jsx';
import { addressUrl } from '../../shared/chain.js';

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
  const tradeable = useMemo(() => rows.filter(canTrade), [rows]);
  const surging = useMemo(
    () => rows.filter((r) => laneOf(r, now) === 'hot').sort((a, b) => b.vol5mUsd - a.vol5mUsd).slice(0, 5),
    // re-rank every few seconds, not every tick
    [rows, Math.floor(now / 4000)]
  );
  const top = useMemo(() => [...rows].sort((a, b) => b.vol1hUsd - a.vol1hUsd).slice(0, 8), [rows]);
  const fresh = rows.filter((r) => now - r.createdAt < 3600_000).length;
  const vol1h = rows.reduce((s, r) => s + r.vol1hUsd, 0);

  return (
    <div className="home">
      <Stage rows={rows} tradeable={tradeable} surging={surging} top={top} feed={board.feed} now={now} ethUsd={board.meta?.ethUsd || 0} fresh={fresh} />

      <section className="hero-copy">
        <h1>
          Catch every launch,
          <br />
          <em>before the crowd.</em>
        </h1>
        <div>
          <p className="lede">Every new memecoin on Robinhood Chain, live from Pons and Uniswap. Log in with email, buy in one click, exit on autopilot.</p>
          <div className="cta-row">
            <button className="cta big-pill" onClick={() => setView('terminal')}>
              Open the terminal
            </button>
            <a className="cta ghost big-pill" href="#how">
              How it works
            </a>
          </div>
          <div className="hero-stats">
            <div>
              <strong>
                {num(fresh)}
                <em>new</em>
              </strong>
              <small>pools in the last hour</small>
            </div>
            <div>
              <strong>{usd(vol1h)}</strong>
              <small>traded, last hour</small>
            </div>
            <div>
              <strong>$0</strong>
              <small>platform fees</small>
            </div>
          </div>
        </div>
      </section>

      <section className="pillars" id="how">
        <Pillar title="Straight from the chain">
          Uniswap v4 pools are read straight from the chain as they trade, and launches on Pons and other Uniswap pools come in through GeckoTerminal. Every trade goes on-chain from your wallet.
        </Pillar>
        <Pillar title="Your keys, your coins">
          Trades are built in your browser and signed by your own wallet. Ruckus never holds funds and never sees a private key.
        </Pillar>
        <Pillar title="Exits on autopilot">
          Set a take-profit, a stop-loss or a trailing stop once. Ruckus sells for you the moment it triggers.
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
        <span>Ruckus · Robinhood Chain terminal</span>
        <span>Not affiliated with Robinhood, Uniswap or Privy. Memecoins are extremely risky, so only trade what you can lose.</span>
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

function QuickBuyCard({ candidates, ethUsd, compact = false }) {
  const { buy, wallet } = useTrader();
  const presets = useStore((s) => s.settings.presets);
  const [pick, setPick] = useState(0);
  const [amount, setAmount] = useState('0.01');
  const r = candidates[Math.min(pick, candidates.length - 1)];
  return (
    <div className={`buy-card ${compact ? 'compact' : 'card'}`}>
      {!compact && (
        <div className="buy-card-tabs">
          <span className="on">Quick buy</span>
          <span className="live-dot">Live · surging now</span>
        </div>
      )}
      <div className="pick-row">
        {candidates.map((c, i) => (
          <button key={c.id} className={`pick ${i === pick ? 'on' : ''}`} onClick={() => setPick(i)}>
            <Avatar token={c.token} symbol={c.symbol} logo={c.logo} size={20} />
            {c.symbol}
          </button>
        ))}
        {!candidates.length && <span className="muted">Waiting for the first trades…</span>}
      </div>
      {r && !compact && (
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
      {!compact && <label className="buy-label">You pay</label>}
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

// Front-page stage: Rudy in the middle, live cards from the board orbiting him.
function Stage({ rows, tradeable, surging, top, feed, now, ethUsd, fresh }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 3500);
    return () => clearInterval(iv);
  }, []);
  const star = surging[0] || top[0];
  const bigBuy = useMemo(() => [...(feed || [])].slice(0, 30).sort((a, b) => b.eth - a.eth)[0], [feed]);
  const recent = (feed || []).slice(0, 3);
  const ticker = feed && feed.length ? feed[tick % Math.min(feed.length, 8)] : null;

  const tips = [];
  if (star) tips.push(`$${star.symbol} is ${star.ch5m >= 0 ? 'up' : 'down'} ${Math.abs(star.ch5m || 0).toFixed(1)}% in five minutes. ${star.ch5m > 20 ? 'Spicy.' : 'Keep an eye on it.'}`);
  if (fresh) tips.push(`${fresh} new pools launched in the last hour. Most won't last, so check Rudy's read before you buy.`);
  if (bigBuy) tips.push(`Someone just put ${eth(bigBuy.eth, 3)} ETH into $${bigBuy.symbol}.`);
  tips.push('Psst. I sniff out the launches that are actually moving.');
  const tip = tips[tick % tips.length];

  return (
    <section className="stage-wrap">
      <div className="stage">
        <div className="orbit o1" aria-hidden />
        <div className="orbit o2" aria-hidden />
        <div className="pedestal" aria-hidden />
        <div className="bubble" aria-live="polite">{tip}</div>
        <div className="hero-rudy">
          <Rudy mood={star && star.ch5m > 15 ? 'cheer' : 'happy'} size={300} track />
        </div>

        <div className="fc fc-market floaty d1" onClick={() => star && openDrawer(star.id)}>
          <span className="eyebrow">Surging now</span>
          {star ? (
            <>
              <div className="fc-row">
                <Avatar token={star.token} symbol={star.symbol} logo={star.logo} size={44} />
                <div className="fc-grow">
                  <b>${star.symbol}</b>
                  <small>{star.name} · Robinhood Chain</small>
                </div>
                <span className="fc-tag">5m</span>
              </div>
              <div className="fc-big">
                {usd(star.mcapUsd)} <Delta v={star.ch5m}>{pct(star.ch5m)}</Delta>
              </div>
              <Spark data={star.spark} width={268} height={64} className="fc-spark" />
              <div className="fc-meta">
                <span>
                  Vol <b>{usd(star.vol1hUsd)}</b>
                </span>
                <span>
                  Liq <b>{usd(star.liqUsd)}</b>
                </span>
                <span>
                  Trades <b>{num(star.buys5m + star.sells5m)}</b>
                </span>
              </div>
            </>
          ) : (
            <div className="skel-block" />
          )}
        </div>

        <div className="fc fc-trader floaty">
          <span className="eyebrow">Biggest buy</span>
          {bigBuy ? (
            <>
              <div className="fc-row">
                <Avatar token={bigBuy.buyer || '0x0'} symbol="W" logo={null} size={40} />
                <div className="fc-grow">
                  {bigBuy.buyer ? (
                    <a className="mono" href={addressUrl(bigBuy.buyer)} target="_blank" rel="noreferrer">
                      {short(bigBuy.buyer)}
                    </a>
                  ) : (
                    <b>unknown wallet</b>
                  )}
                  <small>bought ${bigBuy.symbol}</small>
                </div>
              </div>
              <div className="fc-split">
                <div>
                  <small>{age(now - bigBuy.t)} ago</small>
                  <div className="fc-big pos">{usd(bigBuy.eth * ethUsd)}</div>
                </div>
                <div className="right">
                  <small>ETH</small>
                  <div className="mono strong">{eth(bigBuy.eth, 3)}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="fc-row">
              <Rudy mood="neutral" size={40} />
              <small>Watching for the next big buy…</small>
            </div>
          )}
        </div>

        <div className="fc fc-buy floaty d2">
          <span className="eyebrow">Quick buy</span>
          <QuickBuyCard candidates={tradeable.slice().sort((a, b) => b.vol5mUsd - a.vol5mUsd).slice(0, 3)} ethUsd={ethUsd} compact />
        </div>

        <div className="fc-pills">
          {recent.map((f) => (
            <a key={f.tx + f.pool} className="mini-pill" href={txUrl(f.tx)} target="_blank" rel="noreferrer">
              <Avatar token={f.buyer || f.tx} symbol="W" logo={null} size={26} />
              {f.buyer ? short(f.buyer) : 'wallet'} <span className="pos">+{usd(f.eth * ethUsd)}</span>
            </a>
          ))}
        </div>

        {ticker && (
          <div className="fc fc-toast">
            <span className="check">✓</span>
            {ticker.buyer ? short(ticker.buyer) : 'Someone'} bought {usd(ticker.eth * ethUsd)} of ${ticker.symbol} · {age(now - ticker.t)} ago
          </div>
        )}
      </div>
    </section>
  );
}
