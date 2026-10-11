import { memo, useEffect, useState } from 'react'
import { useStore } from '../lib/store.js'
import { market, pollNewPairs, pollTrending, pollTop, loadNewPairsPage2 } from '../lib/api.js'
import { paper, account, buy, updateSettings } from '../lib/paper.js'
import { fmtAge, fmtUsdC, fmtPct, fmtEth, parseAmount, fmtCompact } from '../lib/format.js'
import { Icon, EthIcon, TokenLogo, Socials, CopyAddr, useNow, toast, mcTier } from '../components/ui.jsx'

const BOOT = Date.now()
// Stablecoins and wrapped majors are not memecoins; keep them off the board.
const NOT_MEME = /^(W?ETH|W?BTC|USD.*|SUSD|DAI|EURC|PYUSD|FDUSD|TUSD)$/i

export function quickBuy(pool, eth) {
  const r = buy(pool, eth, 'quick')
  if (r.ok) toast('ok', `Bought ${pool.symbol} · ${fmtEth(eth)} ETH`, `Filled at ${fmtUsdC(r.trade.mc)} MC · ${(r.trade.impact * 100).toFixed(2)}% impact`)
  else toast('bad', 'Buy failed', r.msg)
  return r
}

const pctCls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'muted')

const Card = memo(function Card({ pool, now, fresh, qb, held }) {
  const tx = pool.txns?.h24 || { b: 0, s: 0 }
  const total = tx.b + tx.s
  const buyPct = total ? (tx.b / total) * 100 : 50
  const ageMs = now - (pool.createdAt || now)
  const liqRatio = pool.mc ? (pool.liq / pool.mc) * 100 : 0
  const go = () => (location.hash = '#/t/' + pool.pool)
  return (
    <div className={'card' + (fresh ? ' fresh' : '')} role="link" tabIndex={0} onClick={go} onKeyDown={(e) => e.key === 'Enter' && go()}>
      <TokenLogo pool={pool} />
      <div className="c-main">
        <div className="c-t">
          <b>{pool.symbol}</b>
          <span>{pool.name}</span>
          <CopyAddr value={pool.tokenAddress} label="" />
        </div>
        <div className="c-row">
          <span className={'age' + (ageMs > 3600000 ? ' old' : '')}>{fmtAge(pool.createdAt, now)}</span>
          <Socials pool={pool} size={12} />
          <span className="stat-i" title="Unique buyers 24h"><Icon name="users" size={12} />{pool.buyers || tx.b}</span>
          {held && <span className="held">HOLDING</span>}
        </div>
        <div className="mets">
          <span className={'met ' + pctCls(pool.chg?.m5)}><i>5m</i>{fmtPct(pool.chg?.m5 || 0, 0)}</span>
          <span className={'met ' + pctCls(pool.chg?.h1)}><i>1h</i>{fmtPct(pool.chg?.h1 || 0, 0)}</span>
          <span className={'met ' + (buyPct >= 50 ? 'up' : 'down')} title="Share of buys, 24h"><i>B</i>{Math.round(buyPct)}%</span>
          <span className={'met ' + (liqRatio >= 10 ? '' : 'down')} title="Liquidity as share of market cap"><i>L/MC</i>{liqRatio ? (liqRatio > 100 ? '>100%' : Math.round(liqRatio) + '%') : '—'}</span>
        </div>
      </div>
      <div className="c-r">
        <span className="mcv">MC<b className={mcTier(pool.mc)}>{fmtUsdC(pool.mc)}</b></span>
        <span className="vv">V<b>{fmtUsdC(pool.vol?.h24)}</b></span>
        <span className="txr">
          TX<b>{total < 1000 ? total : fmtCompact(total, 1)}</b>
          <span className="bar"><i style={{ width: buyPct + '%' }} /><i style={{ width: 100 - buyPct + '%' }} /></span>
        </span>
        <button
          className="qbuy"
          title={`Buy ${qb} ETH instantly`}
          onClick={(e) => {
            e.stopPropagation()
            quickBuy(pool, qb)
          }}
        >
          <Icon name="bolt" size={11} fill stroke={0} />
          {qb} ETH
        </button>
      </div>
    </div>
  )
})

const COLS = [
  { key: 'new', title: 'New Pairs' },
  { key: 'trending', title: 'Trending' },
  { key: 'top', title: 'Top Volume' },
]
const LIQ = [
  { v: 0, l: 'All' },
  { v: 1000, l: 'Liq >$1K' },
  { v: 10000, l: '>$10K' },
  { v: 50000, l: '>$50K' },
]

function QuickBuyInput({ col, value }) {
  const [text, setText] = useState(String(value))
  return (
    <label className="qb" title="Quick buy amount for this column">
      <Icon name="bolt" size={12} fill stroke={0} />
      <input
        id={'qb-' + col}
        value={text}
        inputMode="decimal"
        aria-label="Quick buy amount in ETH"
        onChange={(e) => {
          setText(e.target.value)
          const v = parseAmount(e.target.value)
          if (v > 0) updateSettings({ quickBuy: { ...paper.get().settings.quickBuy, [col]: v } })
        }}
      />
      <EthIcon size={12} />
    </label>
  )
}

export default function Pulse() {
  const lists = useStore(market, (s) => s.lists)
  const loaded = useStore(market, (s) => s.loaded)
  const pools = useStore(market, (s) => s.pools)
  const firstSeen = useStore(market, (s) => s.firstSeen)
  const p = useStore(paper)
  const acct = account(p)
  const now = useNow(1000)
  const [minLiq, setMinLiq] = useState(0)
  const [mobileCol, setMobileCol] = useState('new')

  useEffect(() => {
    let alive = true
    // a failed first load retries soon instead of waiting for the next interval
    const safe = (fn) => () => alive && !document.hidden && fn().catch(() => alive && setTimeout(() => alive && fn().catch(() => {}), 8000))
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

  const qbs = p.settings.quickBuy || {}

  return (
    <main className="pulse">
      <div className="pulse-bar">
        <h1>Pulse <span className="chain-ic">RH</span></h1>
        <div className="seg mobile-tabs" role="tablist">
          {COLS.map((c) => (
            <button key={c.key} className={mobileCol === c.key ? 'on' : ''} onClick={() => setMobileCol(c.key)}>{c.title}</button>
          ))}
        </div>
        <div className="right">
          <div className="chips">
            {LIQ.map((o) => (
              <button key={o.v} className={'chip' + (minLiq === o.v ? ' on' : '')} onClick={() => setMinLiq(o.v)}>{o.l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="board">
        {COLS.map((c) => {
          const items = lists[c.key].map((id) => pools[id]).filter((x) => x && !NOT_MEME.test(x.symbol || '') && (!minLiq || (x.liq || 0) >= minLiq))
          const qb = qbs[c.key] || 0.05
          return (
            <section key={c.key} className={'col' + (mobileCol === c.key ? ' show' : '')} aria-label={c.title}>
              <div className="col-head">
                <h3>{c.title}</h3>
                <span className="n">{items.length}</span>
                <QuickBuyInput col={c.key} value={qb} />
              </div>
              <div className="col-list">
                {!loaded[c.key] &&
                  Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="skel"><i /><span><b /><b /><b /></span></div>
                  ))}
                {loaded[c.key] && !items.length && (
                  <div className="col-empty">
                    <b>No pairs match this filter</b>
                    <span>Lower the liquidity filter to see more.</span>
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
