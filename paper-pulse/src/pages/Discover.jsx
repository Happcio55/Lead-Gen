import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store.js'
import { market, pollNewPairs, pollTrending, pollTop, prefetchCandles } from '../lib/api.js'
import { paper } from '../lib/paper.js'
import { fmtAge, fmtUsdC, fmtPct } from '../lib/format.js'
import { Icon, TokenLogo, useNow, mcTier } from '../components/ui.jsx'
import { quickBuy } from './Pulse.jsx'

const NOT_MEME = /^(W?ETH|W?BTC|USD.*|SUSD|DAI|EURC|PYUSD|FDUSD|TUSD)$/i
const TABS = [
  { k: 'trending', l: 'Trending' },
  { k: 'top', l: 'Top volume' },
  { k: 'gainers', l: 'Gainers' },
  { k: 'losers', l: 'Losers' },
  { k: 'new', l: 'New' },
]
const TF = [
  ['5m', 'm5'],
  ['1h', 'h1'],
  ['6h', 'h6'],
  ['24h', 'h24'],
]

export default function Discover() {
  const lists = useStore(market, (s) => s.lists)
  const pools = useStore(market, (s) => s.pools)
  const loaded = useStore(market, (s) => s.loaded)
  const qb = useStore(paper, (s) => s.settings.quickBuy?.trending || 0.1)
  const now = useNow(1000)
  const [tab, setTab] = useState('trending')
  const [tf, setTf] = useState('h1')
  const [sort, setSort] = useState(null)

  useEffect(() => {
    let alive = true
    const safe = (fn) => () => alive && !document.hidden && fn().catch(() => {})
    safe(pollTrending)()
    safe(pollTop)()
    safe(pollNewPairs)()
    const a = setInterval(safe(pollTrending), 30000)
    const b = setInterval(safe(pollTop), 45000)
    const c = setInterval(safe(pollNewPairs), 15000)
    return () => {
      alive = false
      clearInterval(a)
      clearInterval(b)
      clearInterval(c)
    }
  }, [])

  const rows = useMemo(() => {
    const all = [...new Set([...lists.trending, ...lists.top, ...lists.new])].map((id) => pools[id]).filter((p) => p && !NOT_MEME.test(p.symbol || ''))
    let r
    if (tab === 'trending') r = lists.trending.map((id) => pools[id]).filter((p) => p && !NOT_MEME.test(p.symbol || ''))
    else if (tab === 'top') r = [...all].sort((a, b) => (b.vol?.[tf] || 0) - (a.vol?.[tf] || 0))
    else if (tab === 'new') r = [...all].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    else {
      const liquid = all.filter((p) => (p.liq || 0) >= 1000 && (p.vol?.[tf] || 0) > 0)
      r = liquid.sort((a, b) => (tab === 'gainers' ? 1 : -1) * ((b.chg?.[tf] || 0) - (a.chg?.[tf] || 0)))
    }
    if (sort) {
      const get = {
        age: (p) => -(p.createdAt || 0),
        mc: (p) => p.mc || 0,
        liq: (p) => p.liq || 0,
        vol: (p) => p.vol?.[tf] || 0,
        tx: (p) => (p.txns?.[tf]?.b || 0) + (p.txns?.[tf]?.s || 0),
        chg: (p) => p.chg?.[tf] || 0,
      }[sort.k]
      r = [...r].sort((a, b) => sort.dir * (get(b) - get(a)))
    }
    return r.slice(0, 60)
  }, [lists, pools, tab, tf, sort])

  const th = (k, l) => (
    <th className="sortable" onClick={() => setSort((s) => (s?.k === k ? (s.dir === 1 ? { k, dir: -1 } : null) : { k, dir: 1 }))}>
      {l}
      {sort?.k === k ? (sort.dir === 1 ? ' ↓' : ' ↑') : ''}
    </th>
  )
  const tfLabel = TF.find((t) => t[1] === tf)[0]
  const ready = tab === 'trending' ? loaded.trending : tab === 'new' ? loaded.new : loaded.top || loaded.trending

  return (
    <main className="disc">
      <div className="disc-head">
        <div>
          <h1>Discover</h1>
          <p className="muted">What's moving on Robinhood Chain right now. Tap ⚡ to paper-buy instantly.</p>
        </div>
        <div className="seg big">
          {TF.map(([l, k]) => (
            <button key={k} className={tf === k ? 'on' : ''} onClick={() => setTf(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="disc-tabs">
        {TABS.map((t) => (
          <button key={t.k} className={tab === t.k ? 'on' : ''} onClick={() => { setTab(t.k); setSort(null) }}>
            {t.k === 'trending' && <Icon name="fire" size={13} />}
            {t.l}
          </button>
        ))}
      </div>
      <section className="panel" style={{ overflow: 'hidden' }}>
        <div className="tbl" style={{ maxHeight: 'none' }}>
          <table className="disc-tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Token</th>
                {th('age', 'Age')}
                {th('mc', 'Market cap')}
                {th('liq', 'Liquidity')}
                {th('vol', `Volume ${tfLabel}`)}
                {th('tx', `Txns ${tfLabel}`)}
                {th('chg', `Change ${tfLabel}`)}
                <th />
              </tr>
            </thead>
            <tbody>
              {!ready &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}><td colSpan={9}><div className="skel-row" /></td></tr>
                ))}
              {ready && !rows.length && (
                <tr><td colSpan={9}><div className="empty"><b>Nothing here yet</b>Try another time window.</div></td></tr>
              )}
              {rows.map((p, i) => {
                const tx = p.txns?.[tf]
                const ch = p.chg?.[tf] || 0
                return (
                  <tr key={p.pool} className="click" onClick={() => (location.hash = '#/t/' + p.pool)} onMouseEnter={() => prefetchCandles(p.pool)}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      <div className="tok-cell">
                        <TokenLogo pool={p} size="sm" />
                        <div><b>{p.symbol}</b><span>{p.name}</span></div>
                      </div>
                    </td>
                    <td className="muted">{fmtAge(p.createdAt, now)}</td>
                    <td className={'num ' + mcTier(p.mc)}>{fmtUsdC(p.mc)}</td>
                    <td className="num">{fmtUsdC(p.liq)}</td>
                    <td className="num">{fmtUsdC(p.vol?.[tf])}</td>
                    <td className="num">{tx ? (<><span className="up">{tx.b}</span> / <span className="down">{tx.s}</span></>) : '—'}</td>
                    <td className={'num ' + (ch > 0 ? 'up' : ch < 0 ? 'down' : 'muted')}><span className="chg-pill">{fmtPct(ch)}</span></td>
                    <td>
                      <button className="qbuy" onClick={(e) => { e.stopPropagation(); quickBuy(p, qb) }}>
                        <Icon name="bolt" size={11} fill stroke={0} />{qb}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
