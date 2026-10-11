import { memo, useEffect, useState } from 'react'
import { useStore } from '../lib/store.js'
import { market, pollNewPairs, pollTrending, pollTop, loadNewPairsPage2 } from '../lib/api.js'
import { paper, account, buy, updateSettings, equityEth } from '../lib/paper.js'
import { dexLabel } from '../lib/chains.js'
import { fmtAge, fmtUsdC, fmtPct, fmtEth, parseAmount } from '../lib/format.js'
import { Icon, TokenLogo, Socials, useNow, toast } from '../components/ui.jsx'

const BOOT = Date.now()
// Stablecoins and wrapped majors are not memecoins; keep them off the board.
const NOT_MEME = /^(W?ETH|W?BTC|USD.*|SUSD|DAI|EURC|PYUSD|FDUSD|TUSD)$/i

export function quickBuy(pool, eth) {
  const r = buy(pool, eth)
  if (r.ok) toast('ok', `Købt ${pool.symbol} for ${fmtEth(eth)} ETH`, `Fyldt ved MC ${fmtUsdC(r.trade.mc)} · prisudsving ${(r.trade.impact * 100).toFixed(2)}%`)
  else toast('bad', 'Købet gik ikke igennem', r.msg)
  return r
}

const Card = memo(function Card({ pool, now, fresh, qb, held }) {
  const tx = pool.txns?.h24 || { b: 0, s: 0 }
  const total = tx.b + tx.s
  const buyPct = total ? (tx.b / total) * 100 : 50
  const age = fmtAge(pool.createdAt, now)
  const chg = pool.chg?.h1 ?? 0
  return (
    <div
      className={'card' + (fresh ? ' fresh' : '')}
      role="link"
      tabIndex={0}
      onClick={() => (location.hash = '#/t/' + pool.pool)}
      onKeyDown={(e) => e.key === 'Enter' && (location.hash = '#/t/' + pool.pool)}
    >
      <TokenLogo pool={pool} age={age} isNew={now - pool.createdAt < 120000} />
      <div className="c-main">
        <div className="c-title">
          <b>{pool.symbol}</b>
          <span>{pool.name}</span>
        </div>
        <div className="c-meta">
          <span className="dex-tag">{dexLabel(pool.dex)}</span>
          <span>{pool.quote}{pool.fee ? ' ' + pool.fee : ''}</span>
          <Socials pool={pool} size={12} />
          {held && <span className="held">EJER</span>}
        </div>
        <div className="c-stats">
          <span>MC<b>{fmtUsdC(pool.mc)}</b></span>
          <span>V<b>{fmtUsdC(pool.vol?.h24)}</b></span>
          <span>L<b>{fmtUsdC(pool.liq)}</b></span>
        </div>
      </div>
      <div className="c-side">
        <span className={'c-chg ' + (chg >= 0 ? 'up' : 'down')} title="Ændring seneste time">{fmtPct(chg)}</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div className="c-tx" title="Køb / salg seneste 24 t">
            <span className="up">{tx.b}</span>
            <span className="down">{tx.s}</span>
          </div>
          <div className="txbar">
            <i style={{ width: buyPct + '%' }} />
            <i style={{ width: 100 - buyPct + '%' }} />
          </div>
        </div>
        <button
          className="qbuy"
          title={`Køb for ${qb} ETH med det samme`}
          onClick={(e) => {
            e.stopPropagation()
            quickBuy(pool, qb)
          }}
        >
          <Icon name="bolt" size={12} fill stroke={0} />
          {qb}
        </button>
      </div>
    </div>
  )
})

const COLS = [
  { key: 'new', title: 'Nye par', hint: 'live, hvert 10. sek', dot: 'var(--neon)' },
  { key: 'trending', title: 'Trending', hint: 'seneste time', dot: 'var(--bronze)' },
  { key: 'top', title: 'Top volumen', hint: '24 timer', dot: 'var(--patina)' },
]
const LIQ = [
  { v: 0, l: 'Alle' },
  { v: 1000, l: '>$1K' },
  { v: 10000, l: '>$10K' },
  { v: 50000, l: '>$50K' },
]

export default function Pulse() {
  const lists = useStore(market, (s) => s.lists)
  const loaded = useStore(market, (s) => s.loaded)
  const pools = useStore(market, (s) => s.pools)
  const firstSeen = useStore(market, (s) => s.firstSeen)
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const p = useStore(paper)
  const acct = account(p)
  const now = useNow(1000)
  const [minLiq, setMinLiq] = useState(0)
  const [mobileCol, setMobileCol] = useState('new')
  const [qbText, setQbText] = useState(String(p.settings.quickBuy))

  useEffect(() => {
    let alive = true
    const safe = (fn) => () => alive && !document.hidden && fn().catch(() => {})
    safe(pollNewPairs)()
    setTimeout(safe(loadNewPairsPage2), 2500)
    safe(pollTrending)()
    safe(pollTop)()
    const a = setInterval(safe(pollNewPairs), 10000)
    const b = setInterval(safe(pollTrending), 45000)
    const c = setInterval(safe(pollTop), 60000)
    return () => {
      alive = false
      clearInterval(a)
      clearInterval(b)
      clearInterval(c)
    }
  }, [])

  const qb = p.settings.quickBuy
  const eq = equityEth(acct, pools, ethUsd)
  const pnl = eq - acct.start
  const newCount = lists.new.filter((id) => now - (pools[id]?.createdAt || 0) < 3600000).length

  return (
    <main className="page">
      <section className="hero">
        <h1>
          Øv dig på hver ny memecoin på Robinhood Chain med <span className="hl">papirpenge</span>
          <em>.</em>
        </h1>
        <div className="hero-stats">
          <div className="hs">
            <b>{newCount}</b>
            <span>nye par seneste time</span>
          </div>
          <div className="hs">
            <b>{fmtEth(eq, 3)}</b>
            <span>din værdi i ETH</span>
          </div>
          <div className="hs">
            <b className={pnl >= 0 ? 'up' : 'down'}>{fmtPct((pnl / acct.start) * 100)}</b>
            <span>afkast siden start</span>
          </div>
        </div>
      </section>

      <div className="toolbar">
        <div className="tool">
          <span className="label">Hurtigkøb</span>
          <label className="qb" title="Beløb for ⚡-knappen på hvert token">
            <Icon name="bolt" size={14} fill stroke={0} />
            <input
              id="quickbuy"
              value={qbText}
              inputMode="decimal"
              onChange={(e) => {
                setQbText(e.target.value)
                const v = parseAmount(e.target.value)
                if (v > 0) updateSettings({ quickBuy: v })
              }}
              aria-label="Hurtigkøb beløb i ETH"
            />
            <span>ETH</span>
          </label>
        </div>
        <div className="tool">
          <span className="label">Likviditet</span>
          <div className="chips">
            {LIQ.map((o) => (
              <button key={o.v} className={'chip' + (minLiq === o.v ? ' on' : '')} onClick={() => setMinLiq(o.v)}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <div className="seg mobile-tabs" role="tablist">
          {COLS.map((c) => (
            <button key={c.key} className={mobileCol === c.key ? 'on' : ''} onClick={() => setMobileCol(c.key)}>
              {c.title}
            </button>
          ))}
        </div>
      </div>

      <div className="board">
        {COLS.map((c) => {
          const items = lists[c.key].map((id) => pools[id]).filter((x) => x && !NOT_MEME.test(x.symbol || '') && (!minLiq || (x.liq || 0) >= minLiq))
          return (
            <section key={c.key} className={'col' + (mobileCol === c.key ? ' show' : '')} aria-label={c.title}>
              <div className="col-head">
                <span className="col-dot" style={{ background: c.dot, boxShadow: `0 0 10px ${c.dot}` }} />
                <h3>{c.title}</h3>
                <span className="count">{items.length}</span>
                <span className="hint">{c.hint}</span>
              </div>
              <div className="col-list">
                {!loaded[c.key] && (
                  <div className="col-empty">
                    <b>Henter live par fra Robinhood Chain…</b>
                    <span>Første opdatering tager et par sekunder.</span>
                  </div>
                )}
                {loaded[c.key] && !items.length && (
                  <div className="col-empty">
                    <b>Ingen tokens matcher filteret</b>
                    <span>Sænk kravet til likviditet for at se flere.</span>
                  </div>
                )}
                {items.map((pool) => (
                  <Card
                    key={pool.pool}
                    pool={pool}
                    now={now}
                    qb={qb}
                    held={acct.positions[pool.pool]?.tokens > 0}
                    fresh={c.key === 'new' && firstSeen[pool.pool] > BOOT + 4000 && now - firstSeen[pool.pool] < 2500}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}

