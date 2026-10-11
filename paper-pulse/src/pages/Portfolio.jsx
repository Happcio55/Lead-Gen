import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, AreaSeries } from 'lightweight-charts'
import { useStore } from '../lib/store.js'
import { market } from '../lib/api.js'
import { paper, account, equityEth, positionValue, sell, cancelOrder } from '../lib/paper.js'
import { fmtEth, fmtSignedEth, fmtPct, fmtUsdC, fmtTokens, fmtCompact, fmtAge } from '../lib/format.js'
import { Icon, EthIcon, TokenLogo, toast, useNow } from '../components/ui.jsx'
import { ResetPanel } from '../components/Header.jsx'
import PnlCard, { pnlFromPosition } from '../components/PnlCard.jsx'

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
const RANGES = { '1H': 3600e3, '1D': 86400e3, '7D': 7 * 86400e3, All: Infinity }

function EquityChart({ curve, live, start, range }) {
  const box = useRef(null)
  const api = useRef(null)
  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: css('--fg-3'), fontFamily: 'Geist, system-ui, sans-serif', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: css('--line') } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      handleScroll: false,
      handleScale: false,
      crosshair: { vertLine: { labelBackgroundColor: css('--panel-3') }, horzLine: { labelBackgroundColor: css('--panel-3') } },
    })
    const s = chart.addSeries(AreaSeries, { lineWidth: 2, priceFormat: { type: 'custom', minMove: 1e-6, formatter: (v) => v.toFixed(4) + ' ETH' }, priceLineVisible: false })
    api.current = { chart, s }
    return () => chart.remove()
  }, [])
  useEffect(() => {
    const { chart, s } = api.current
    const from = Date.now() - RANGES[range]
    const pts = [...curve, [Date.now(), live]].filter(([t]) => t >= from)
    const data = []
    for (const [t, v] of pts) {
      const time = Math.floor(t / 1000)
      if (data.length && data[data.length - 1].time >= time) data[data.length - 1].value = v
      else data.push({ time, value: v })
    }
    const up = live >= (data[0]?.value ?? start)
    const col = up ? css('--up') : css('--down')
    s.applyOptions({ lineColor: col, topColor: col + '40', bottomColor: col + '00' })
    s.setData(data)
    chart.timeScale().fitContent()
  }, [curve.length, Math.round(live * 1e5), range])
  return <div ref={box} className="perf-chart" />
}

export default function Portfolio() {
  const p = useStore(paper)
  const pools = useStore(market, (s) => s.pools)
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const [tab, setTab] = useState('active')
  const [range, setRange] = useState('All')
  const [share, setShare] = useState(null)
  const now = useNow(5000)
  const acct = account(p)
  const eq = equityEth(acct, pools, ethUsd)
  const pnl = eq - acct.start
  const all = Object.values(acct.positions)
  const open = all.filter((x) => x.tokens > 0).map((x) => ({ ...x, v: positionValue(x, pools, ethUsd) })).sort((a, b) => b.v.valueEth - a.v.valueEth)
  const closed = all.filter((x) => x.tokens <= 0).sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
  const inPos = eq - acct.eth
  const unreal = open.reduce((s, x) => s + x.v.pnl, 0)

  const stats = useMemo(() => {
    const done = closed.map((x) => ({ ...x, pct: x.bought ? (x.realized / x.bought) * 100 : 0 }))
    const wins = done.filter((x) => x.realized > 0).length
    const buckets = [
      ['>500%', (v) => v > 500, 'var(--lime)'],
      ['200% ~ 500%', (v) => v > 200 && v <= 500, 'var(--lime)'],
      ['0% ~ 200%', (v) => v >= 0 && v <= 200, 'var(--cyan)'],
      ['0% ~ -50%', (v) => v < 0 && v >= -50, 'var(--amber)'],
      ['< -50%', (v) => v < -50, 'var(--down)'],
    ].map(([l, f, c]) => [l, done.filter((x) => f(x.pct)).length, c])
    const best = done.reduce((b, x) => (!b || x.realized > b.realized ? x : b), null)
    const worst = done.reduce((b, x) => (!b || x.realized < b.realized ? x : b), null)
    return { wins, n: done.length, buckets, best, worst }
  }, [closed.length, acct.realized])
  const maxB = Math.max(1, ...stats.buckets.map((b) => b[1]))
  const buys = acct.trades.filter((t) => t.side === 'buy').length
  const sells = acct.trades.length - buys

  const shareFor = (x) => setShare(pnlFromPosition(x, x.tokens > 0 ? positionValue(x, pools, ethUsd) : null))

  return (
    <main className="pf">
      <div className="pf-grid">
        <section className="panel bal-panel">
          <span className="lbl u">Balance</span>
          <div className="total"><EthIcon />{fmtEth(eq)}</div>
          <div className="muted" style={{ marginTop: -8 }}>${fmtCompact(eq * ethUsd, 2)} · started with {acct.start} ETH</div>
          <div className="split"><i style={{ width: (acct.eth / Math.max(eq, 1e-9)) * 100 + '%' }} /><i style={{ width: (inPos / Math.max(eq, 1e-9)) * 100 + '%' }} /></div>
          <div className="legend-row">
            <span style={{ '--dot': 'var(--lime)' }}>Available {fmtEth(acct.eth, 3)}</span>
            <span style={{ '--dot': 'var(--cyan)' }}>In positions {fmtEth(inPos, 3)}</span>
          </div>
          <ResetPanel />
        </section>

        <section className="panel perf">
          <div className="p-h">
            <h2>Realized &amp; unrealized PnL</h2>
            <div className="seg">
              {Object.keys(RANGES).map((r) => (
                <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
          </div>
          <div className="perf-top">
            <div className="ts"><label>Total PnL</label><b className={pnl >= 0 ? 'up' : 'down'}>{fmtSignedEth(pnl)} ETH <small>({fmtPct((pnl / acct.start) * 100)})</small></b></div>
            <div className="ts"><label>Unrealized</label><b className={unreal >= 0 ? 'up' : 'down'}>{fmtSignedEth(unreal)}</b></div>
            <div className="ts"><label>Realized</label><b className={acct.realized >= 0 ? 'up' : 'down'}>{fmtSignedEth(acct.realized)}</b></div>
          </div>
          <EquityChart curve={acct.curve || []} live={eq} start={acct.start} range={range} />
        </section>

        <section className="panel stats-panel">
          <span className="lbl u">Performance</span>
          <div className="kv"><span>Win rate</span><span>{stats.n ? Math.round((stats.wins / stats.n) * 100) + '%' : '—'} <span className="muted">({stats.wins}/{stats.n})</span></span></div>
          <div className="kv"><span>Total trades</span><span><span className="up">{buys}</span> / <span className="down">{sells}</span></span></div>
          <div className="kv"><span>Best trade</span><span className="up">{stats.best ? `${stats.best.symbol} ${fmtSignedEth(stats.best.realized, 3)}` : '—'}</span></div>
          <div className="kv"><span>Worst trade</span><span className="down">{stats.worst ? `${stats.worst.symbol} ${fmtSignedEth(stats.worst.realized, 3)}` : '—'}</span></div>
          <span className="lbl u" style={{ marginTop: 6 }}>PnL distribution</span>
          <div className="dist">
            {stats.buckets.map(([l, n, c]) => (
              <div className="dist-row" key={l}>
                <span className="muted">{l}</span>
                <span className="track"><i style={{ width: (n / maxB) * 100 + '%', background: c }} /></span>
                <span>{n}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel" style={{ overflow: 'hidden' }}>
        <div className="tabs">
          {[['active', 'Active Positions', open.length], ['closed', 'History', closed.length], ['orders', 'Orders', acct.orders.length], ['activity', 'Activity', acct.trades.length]].map(([k, l, n]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<span className="c">{n}</span></button>
          ))}
        </div>
        <div className="tbl" style={{ maxHeight: 'none' }}>
          {tab === 'active' &&
            (open.length ? (
              <table>
                <thead><tr><th>Token</th><th>Bought</th><th>Remaining</th><th>Entry MC</th><th>MC</th><th>Unrealized PnL</th><th>Total PnL</th><th></th></tr></thead>
                <tbody>
                  {open.map((x) => {
                    const live = pools[x.pool] || x
                    const total = x.sold + x.v.valueEth - x.bought
                    return (
                      <tr key={x.pool} className="click" onClick={() => (location.hash = '#/t/' + x.pool)}>
                        <td><div className="tok-cell"><TokenLogo pool={live} size="sm" /><div><b>{x.symbol}</b><span>{fmtTokens(x.tokens)} tokens</span></div></div></td>
                        <td>{fmtEth(x.bought)}</td>
                        <td>{fmtEth(x.v.valueEth)}</td>
                        <td>{fmtUsdC(x.entryMc)}</td>
                        <td>{fmtUsdC(x.v.mc)}</td>
                        <td className={x.v.pnl >= 0 ? 'up' : 'down'}>{fmtSignedEth(x.v.pnl)} ({fmtPct(x.v.pnlPct)})</td>
                        <td className={total >= 0 ? 'up' : 'down'}>{fmtSignedEth(total)}</td>
                        <td>
                          <div style={{ display: 'inline-flex', gap: 4 }}>
                            <button className="btn sm" onClick={(e) => { e.stopPropagation(); shareFor(x) }} title="Share PnL"><Icon name="share" size={12} /></button>
                            <button
                              className="btn sm red"
                              onClick={(e) => {
                                e.stopPropagation()
                                const r = sell(live, x.tokens)
                                if (r.ok) toast(r.trade.pnl >= 0 ? 'ok' : 'bad', `Sold all ${x.symbol}`, `Realized ${fmtSignedEth(r.trade.pnl)} ETH`)
                                else toast('bad', 'Sell failed', r.msg)
                              }}
                            >
                              Sell all
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty"><b>No active positions</b>Hit ⚡ on any token in <a href="#/" style={{ textDecoration: 'underline' }}>Pulse</a> to open one instantly.</div>
            ))}
          {tab === 'closed' &&
            (closed.length ? (
              <table>
                <thead><tr><th>Token</th><th>Bought</th><th>Sold</th><th>Entry MC</th><th>Exit MC</th><th>PnL</th><th>Closed</th><th></th></tr></thead>
                <tbody>
                  {closed.map((x) => (
                    <tr key={x.pool} className="click" onClick={() => (location.hash = '#/t/' + x.pool)}>
                      <td><div className="tok-cell"><TokenLogo pool={pools[x.pool] || x} size="sm" /><div><b>{x.symbol}</b><span>{x.name}</span></div></div></td>
                      <td>{fmtEth(x.bought)}</td>
                      <td>{fmtEth(x.sold)}</td>
                      <td>{fmtUsdC(x.entryMc)}</td>
                      <td>{fmtUsdC(x.exitMc || x.lastMc)}</td>
                      <td className={x.realized >= 0 ? 'up' : 'down'}>{fmtSignedEth(x.realized)} ({fmtPct((x.realized / x.bought) * 100)})</td>
                      <td className="muted">{fmtAge(x.closedAt, now)} ago</td>
                      <td><button className="btn sm" onClick={(e) => { e.stopPropagation(); shareFor(x) }} title="Share PnL"><Icon name="share" size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty"><b>No closed positions</b>Sell a full position and the result lands here.</div>
            ))}
          {tab === 'orders' &&
            (acct.orders.length ? (
              <table>
                <thead><tr><th>Token</th><th>Type</th><th>Amount</th><th>Trigger MC</th><th>MC now</th><th>Placed</th><th></th></tr></thead>
                <tbody>
                  {acct.orders.map((o) => (
                    <tr key={o.id} className="click" onClick={() => (location.hash = '#/t/' + o.pool)}>
                      <td><b>{o.symbol}</b></td>
                      <td className={'side-t ' + (o.side === 'buy' ? 'up' : 'down')}>Limit {o.side}</td>
                      <td>{o.side === 'buy' ? fmtEth(o.amount) + ' ETH' : o.amount + '%'}</td>
                      <td>{o.side === 'buy' ? '≤ ' : '≥ '}{fmtUsdC(o.triggerMc)}</td>
                      <td>{fmtUsdC(pools[o.pool]?.mc)}</td>
                      <td className="muted">{fmtAge(o.t, now)} ago</td>
                      <td><button className="btn sm" onClick={(e) => { e.stopPropagation(); cancelOrder(o.id) }}>Cancel</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty"><b>No open orders</b>Place limit orders from any token page.</div>
            ))}
          {tab === 'activity' &&
            (acct.trades.length ? (
              <table>
                <thead><tr><th>Token</th><th>Type</th><th>Time</th><th>MC</th><th>ETH</th><th>Amount</th><th>PnL</th></tr></thead>
                <tbody>
                  {acct.trades.map((t) => (
                    <tr key={t.id} className="click" onClick={() => (location.hash = '#/t/' + t.pool)}>
                      <td><div className="tok-cell"><TokenLogo pool={pools[t.pool] || t} size="sm" /><div><b>{t.symbol}</b><span>{t.name}</span></div></div></td>
                      <td className={'side-t ' + (t.side === 'buy' ? 'up' : 'down')}>{t.side === 'buy' ? 'Buy' : 'Sell'}{t.via && t.via !== 'market' ? ` (${t.via})` : ''}</td>
                      <td className="muted">{new Date(t.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                      <td>{fmtUsdC(t.mc)}</td>
                      <td>{fmtEth(t.eth)}</td>
                      <td>{fmtTokens(t.tokens)}</td>
                      <td className={t.pnl == null ? 'muted' : t.pnl >= 0 ? 'up' : 'down'}>{t.pnl == null ? '—' : `${fmtSignedEth(t.pnl)} (${fmtPct(t.pnlPct || 0)})`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty"><b>No activity yet</b>Every paper buy and sell is logged here.</div>
            ))}
        </div>
      </section>

      {p.history?.length > 0 && (
        <section className="panel" style={{ overflow: 'hidden' }}>
          <div className="p-h" style={{ paddingBottom: 10 }}><h2>Previous rounds</h2></div>
          <div className="tbl" style={{ maxHeight: 'none', minHeight: 0 }}>
            <table>
              <thead><tr><th>Reset at</th><th>Start</th><th>End</th><th>Result</th><th>Trades</th></tr></thead>
              <tbody>
                {p.history.map((h) => (
                  <tr key={h.at}>
                    <td className="muted">{new Date(h.at).toLocaleString('en-GB')}</td>
                    <td>{h.start} ETH</td>
                    <td>{fmtEth(h.end)} ETH</td>
                    <td className={h.end - h.start >= 0 ? 'up' : 'down'}>{fmtPct(((h.end - h.start) / h.start) * 100)}</td>
                    <td>{h.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <PnlCard data={share} onClose={() => setShare(null)} />
    </main>
  )
}
