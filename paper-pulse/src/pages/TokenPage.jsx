import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, storage } from '../lib/store.js'
import { market, loadPool, loadTrades } from '../lib/api.js'
import { paper, account, buy, sell, quoteBuy, quoteSell, positionValue, updateSettings, placeLimit, cancelOrder, openPositions, FEE } from '../lib/paper.js'
import { dexLabel } from '../lib/chains.js'
import { fmtAge, fmtUsdC, fmtPct, fmtEth, fmtSignedEth, fmtPriceUsd, fmtTokens, shortAddr, parseAmount, fmtCompact } from '../lib/format.js'
import { Icon, EthIcon, TokenLogo, Socials, CopyAddr, useNow, toast, mcTier } from '../components/ui.jsx'
import Chart from '../components/Chart.jsx'
import PnlCard, { pnlFromPosition } from '../components/PnlCard.jsx'

function usePrev(v) {
  const r = useRef(v)
  const prev = r.current
  r.current = v
  return prev
}

/* ---------------- trade panel ---------------- */
function TradePanel({ pool }) {
  const p = useStore(paper)
  const acct = account(p)
  const pos = acct.positions[pool.pool]
  const [side, setSide] = useState('buy')
  const [type, setType] = useState('market')
  const [amt, setAmt] = useState('')
  const [pct, setPct] = useState(100)
  const [trigger, setTrigger] = useState('')
  const [err, setErr] = useState(null)
  const { buyPresets, sellPresets, slippage } = p.settings

  const ethIn = parseAmount(amt)
  const sellTokens = pos ? (pos.tokens * pct) / 100 : 0
  const q = side === 'buy' ? quoteBuy(pool, ethIn) : quoteSell(pool, sellTokens)
  const impactPct = q ? q.impact * 100 : 0
  const trig = parseAmount(trigger)
  const buy_ = side === 'buy'

  function submit(force = false) {
    setErr(null)
    if (type === 'limit') {
      const r = placeLimit(pool, side, trig, buy_ ? ethIn : pct)
      if (!r.ok) return setErr(r)
      toast('ok', `Limit ${side} placed`, `${buy_ ? fmtEth(ethIn) + ' ETH' : pct + '%'} of ${pool.symbol} when MC ${buy_ ? '≤' : '≥'} ${fmtUsdC(trig)}`)
      setAmt('')
      return
    }
    const r = buy_ ? buy(pool, ethIn, 'market', { force }) : sell(pool, sellTokens, 'market', { force })
    if (!r.ok) return setErr(r)
    const t = r.trade
    if (buy_) toast('ok', `Bought ${fmtTokens(t.tokens)} ${pool.symbol}`, `${fmtEth(t.eth)} ETH at ${fmtUsdC(t.mc)} MC`)
    else toast(t.pnl >= 0 ? 'ok' : 'bad', `Sold ${pool.symbol} for ${fmtEth(t.eth)} ETH`, `Realized ${fmtSignedEth(t.pnl)} ETH (${fmtPct(t.pnlPct)})`)
    setAmt('')
  }

  const trigChips = buy_ ? [-10, -25, -50] : [25, 100, 200]
  return (
    <div className="box">
      <div className="bs">
        <button className={'buy' + (buy_ ? ' on' : '')} onClick={() => { setSide('buy'); setErr(null) }}>Buy</button>
        <button className={'sell' + (!buy_ ? ' on' : '')} onClick={() => { setSide('sell'); setErr(null) }}>Sell</button>
      </div>
      <div className="otype">
        <button className={type === 'market' ? 'on' : ''} onClick={() => setType('market')}>Market</button>
        <button className={type === 'limit' ? 'on' : ''} onClick={() => { setType('limit'); if (!trigger && pool.mc) setTrigger(String(Math.round(pool.mc * (buy_ ? 0.75 : 2)))) }}>Limit</button>
        <span className="bal">
          {buy_ ? <><EthIcon size={12} /><b>{fmtEth(acct.eth)}</b></> : <><b>{fmtTokens(pos?.tokens || 0)}</b> {pool.symbol}</>}
        </span>
      </div>

      {buy_ ? (
        <>
          <div className="field">
            <span className="pre">AMOUNT</span>
            <input id="buy-amount" inputMode="decimal" placeholder="0.0" value={amt} onChange={(e) => { setAmt(e.target.value); setErr(null) }} aria-label="Amount in ETH" />
            <EthIcon />
          </div>
          <div className="presets">
            {buyPresets.map((v) => (
              <button key={v} className={ethIn === v ? 'on' : ''} onClick={() => setAmt(String(v))}>{v}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <span className="pre">AMOUNT</span>
            <input id="sell-pct" inputMode="decimal" value={pct} onChange={(e) => { const v = parseAmount(e.target.value); setPct(isFinite(v) ? Math.min(100, v) : 0); setErr(null) }} aria-label="Percent of position to sell" />
            <span className="unit">%</span>
          </div>
          <div className="presets sell">
            {sellPresets.map((v) => (
              <button key={v} className={pct === v ? 'on' : ''} onClick={() => setPct(v)}>{v}%</button>
            ))}
          </div>
        </>
      )}

      {type === 'limit' && (
        <>
          <div className="field">
            <span className="pre">{buy_ ? 'BUY AT MC ≤' : 'SELL AT MC ≥'}</span>
            <input id="trigger" inputMode="decimal" value={trigger} onChange={(e) => setTrigger(e.target.value)} aria-label="Trigger market cap in USD" />
            <span className="unit">{trig > 0 ? fmtUsdC(trig) : 'USD'}</span>
          </div>
          <div className="chips">
            {trigChips.map((c) => (
              <button key={c} className="chip" onClick={() => setTrigger(String(Math.round(pool.mc * (1 + c / 100))))}>{c > 0 ? '+' : ''}{c}% MC</button>
            ))}
          </div>
        </>
      )}

      <div className="quote">
        {buy_ ? (
          <>
            <div className="kv"><span>You receive</span><span>{q ? '≈ ' + fmtTokens(q.tokens) + ' ' + pool.symbol : '—'}</span></div>
            <div className="kv"><span>Fill MC</span><span>{q ? fmtUsdC(type === 'limit' && trig ? trig : q.mcAtFill) : '—'}</span></div>
          </>
        ) : (
          <>
            <div className="kv"><span>You sell</span><span>{pos?.tokens ? fmtTokens(sellTokens) + ' ' + pool.symbol : 'No position'}</span></div>
            <div className="kv"><span>You receive</span><span>{q && type === 'market' ? '≈ ' + fmtEth(q.ethOut) + ' ETH' : '—'}</span></div>
          </>
        )}
        <div className="kv"><span>Price impact</span><span className={impactPct > slippage ? 'down' : impactPct > 5 ? '' : 'muted'}>{q ? impactPct.toFixed(2) + '%' : '—'}</span></div>
      </div>

      {err && (
        <div className="warn">
          {err.msg}
          {err.slippage && (
            <button className="btn sm block" style={{ marginTop: 8 }} onClick={() => submit(true)}>
              Execute anyway at {(err.impact * 100).toFixed(1)}% impact
            </button>
          )}
        </div>
      )}

      <button className={'btn lg block ' + (buy_ ? 'lime' : 'red')} onClick={() => submit(false)}>
        {type === 'limit' ? `Place limit ${side}` : buy_ ? `Buy ${pool.symbol}` : `Sell ${pct}% ${pool.symbol}`}
      </button>

      <div className="setrow">
        <label className="slip" title="Max price impact before an order is rejected">
          <Icon name="drop" size={12} />Slippage
          <input id="slippage" value={slippage} inputMode="numeric" onChange={(e) => { const v = parseAmount(e.target.value); if (v > 0 && v <= 100) updateSettings({ slippage: v }) }} />%
        </label>
        <span>Fee {FEE * 100}%</span>
        <span style={{ marginLeft: 'auto' }}>Paper mode</span>
      </div>
    </div>
  )
}

/* ---------------- position / PnL ---------------- */
function PnlBox({ pool, onShare }) {
  const p = useStore(paper)
  const pools = useStore(market, (s) => s.pools)
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const pos = account(p).positions[pool.pool]
  const v = pos ? positionValue(pos, pools, ethUsd) : null
  const total = pos ? pos.sold + (pos.tokens > 0 ? v.valueEth : 0) - pos.bought : 0
  const totalPct = pos?.bought ? (total / pos.bought) * 100 : 0
  return (
    <div className="box">
      <div className="pnl4">
        <div><label>Bought</label><b className="up">{fmtEth(pos?.bought || 0, 3)}</b></div>
        <div><label>Sold</label><b className="down">{fmtEth(pos?.sold || 0, 3)}</b></div>
        <div><label>Holding</label><b>{fmtEth(pos?.tokens > 0 ? v.valueEth : 0, 3)}</b></div>
        <div>
          <label>PnL</label>
          <b className={total >= 0 ? 'up' : 'down'}>{fmtSignedEth(total, 3)}</b>
          <small className={total >= 0 ? 'up' : 'down'}>{pos ? fmtPct(totalPct) : '—'}</small>
        </div>
      </div>
      {pos && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn sm" onClick={onShare}><Icon name="share" size={12} />Share PnL</button>
          {pos.tokens > 0 && (
            <button
              className="btn sm red"
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                const r = sell(pool, pos.tokens)
                if (r.ok) toast(r.trade.pnl >= 0 ? 'ok' : 'bad', `Sold all ${pool.symbol}`, `${fmtEth(r.trade.eth)} ETH · realized ${fmtSignedEth(r.trade.pnl)} ETH`)
                else toast('bad', 'Sell failed', r.msg)
              }}
            >
              Sell all
            </button>
          )}
        </div>
      )}
      {pos?.tokens > 0 && (
        <div className="quote">
          <div className="kv"><span>Avg entry MC</span><span>{fmtUsdC(pos.entryMc)}</span></div>
          <div className="kv"><span>Unrealized</span><span className={v.pnl >= 0 ? 'up' : 'down'}>{fmtSignedEth(v.pnl)} ({fmtPct(v.pnlPct)})</span></div>
          <div className="kv"><span>Realized</span><span className={pos.realized >= 0 ? 'up' : 'down'}>{fmtSignedEth(pos.realized)}</span></div>
        </div>
      )}
    </div>
  )
}

function TokenInfo({ pool, now }) {
  const tx = pool.txns?.h24 || { b: 0, s: 0 }
  const items = [
    ['Liquidity', fmtUsdC(pool.liq)],
    ['FDV', fmtUsdC(pool.fdv)],
    ['Liq / MC', pool.mc ? Math.round((pool.liq / pool.mc) * 100) + '%' : '—'],
    ['Buyers 24h', pool.buyers || '—'],
    ['Sellers 24h', pool.sellers || '—'],
    ['Txns 24h', tx.b + tx.s < 1000 ? tx.b + tx.s : fmtCompact(tx.b + tx.s, 1)],
    ['Pair age', fmtAge(pool.createdAt, now)],
    ['DEX', dexLabel(pool.dex)],
    ['Quote', (pool.quote || '') + (pool.fee ? ' ' + pool.fee : '')],
  ]
  return (
    <div className="box">
      <span className="lbl u">Token info</span>
      <div className="info">
        {items.map(([l, v]) => (
          <div key={l}><b>{v}</b><label>{l}</label></div>
        ))}
      </div>
      <div className="kv"><span>CA</span><CopyAddr value={pool.tokenAddress} label={shortAddr(pool.tokenAddress)} /></div>
      <div className="kv"><span>Pair</span><CopyAddr value={pool.pool} label={shortAddr(pool.pool)} /></div>
      <div className="links">
        <a href={pool.dexscreener || `https://dexscreener.com/robinhood/${pool.pool}`} target="_blank" rel="noreferrer"><Icon name="chart" size={12} />DexScreener</a>
        <a href={`https://www.geckoterminal.com/robinhood/pools/${pool.pool}`} target="_blank" rel="noreferrer"><Icon name="ext" size={12} />GeckoTerminal</a>
      </div>
    </div>
  )
}

/* ---------------- bottom tables ---------------- */
function Bottom({ pool, myTrades }) {
  const [tab, setTab] = useState('trades')
  const [trades, setTrades] = useState([])
  const [state, setState] = useState('loading')
  const p = useStore(paper)
  const pools = useStore(market, (s) => s.pools)
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const acct = account(p)
  const now = useNow(1000)
  const supply = pool.fdv && pool.priceUsd ? pool.fdv / pool.priceUsd : 0

  useEffect(() => {
    let alive = true
    setTrades([])
    setState('loading')
    const load = () =>
      loadTrades(pool.pool)
        .then((t) => alive && (setTrades(t), setState('ok')))
        .catch(() => alive && setState((s) => (s === 'loading' ? 'error' : s)))
    load()
    const id = setInterval(load, 15000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [pool.pool])

  const traders = useMemo(() => {
    const m = {}
    for (const t of trades) {
      const w = (m[t.wallet] ||= { wallet: t.wallet, bought: 0, sold: 0, buys: 0, sells: 0 })
      if (t.side === 'buy') { w.bought += t.usd; w.buys++ } else { w.sold += t.usd; w.sells++ }
    }
    return Object.values(m).map((w) => ({ ...w, pnl: w.sold - w.bought })).sort((a, b) => b.pnl - a.pnl).slice(0, 50)
  }, [trades])

  const open = openPositions(acct)
  const orders = acct.orders
  const TABS = [
    ['trades', 'Trades', trades.length],
    ['traders', 'Top Traders', traders.length],
    ['positions', 'Positions', open.length],
    ['orders', 'Orders', orders.length],
    ['mine', 'My Trades', myTrades.length],
  ]

  return (
    <div className="tmain-bottom" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="tabs">
        {TABS.map(([k, l, n]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<span className="c">{n}</span></button>
        ))}
      </div>
      <div className="tbl">
        {tab === 'trades' &&
          (state === 'loading' ? (
            <div className="empty">Loading recent trades…</div>
          ) : !trades.length ? (
            <div className="empty"><b>{state === 'error' ? 'Could not load trades' : 'No trades yet'}</b>{state === 'error' ? 'Retrying in 15 seconds.' : 'This pair is brand new.'}</div>
          ) : (
            <table>
              <thead><tr><th>Age</th><th>Type</th><th>MC</th><th>Amount</th><th>Total USD</th><th>{pool.quote || 'ETH'}</th><th>Trader</th></tr></thead>
              <tbody>
                {trades.slice(0, 100).map((t) => (
                  <tr key={t.id} className={t.usd > 1000 ? 'big' : ''}>
                    <td className="muted">{fmtAge(t.t, now)}</td>
                    <td className={'side-t ' + (t.side === 'buy' ? 'up' : 'down')}>{t.side === 'buy' ? 'Buy' : 'Sell'}</td>
                    <td>{supply ? fmtUsdC(t.price * supply) : fmtPriceUsd(t.price)}</td>
                    <td>{fmtTokens(t.tokens)}</td>
                    <td className={t.side === 'buy' ? 'up' : 'down'}>{fmtUsdC(t.usd)}</td>
                    <td>{fmtCompact(t.quoteAmt, 3)}</td>
                    <td className="addr">{shortAddr(t.wallet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        {tab === 'traders' &&
          (!traders.length ? (
            <div className="empty"><b>No trader data yet</b>Top traders are ranked from the latest trades on this pair.</div>
          ) : (
            <table>
              <thead><tr><th>#</th><th>Trader</th><th>Bought</th><th>Sold</th><th>Txns</th><th>PnL (window)</th></tr></thead>
              <tbody>
                {traders.map((w, i) => (
                  <tr key={w.wallet}>
                    <td className="muted">{i + 1}</td>
                    <td className="addr" style={{ textAlign: 'right' }}>{shortAddr(w.wallet)}</td>
                    <td className="up">{fmtUsdC(w.bought)}</td>
                    <td className="down">{fmtUsdC(w.sold)}</td>
                    <td><span className="up">{w.buys}</span> / <span className="down">{w.sells}</span></td>
                    <td className={w.pnl >= 0 ? 'up' : 'down'}>{w.pnl >= 0 ? '+' : '-'}{fmtUsdC(Math.abs(w.pnl))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        {tab === 'positions' &&
          (!open.length ? (
            <div className="empty"><b>No open positions</b>Buy a token to open a paper position.</div>
          ) : (
            <table>
              <thead><tr><th>Token</th><th>Bought</th><th>Holding</th><th>Entry MC</th><th>MC</th><th>PnL</th></tr></thead>
              <tbody>
                {open.map((x) => {
                  const v = positionValue(x, pools, ethUsd)
                  return (
                    <tr key={x.pool} className="click" onClick={() => (location.hash = '#/t/' + x.pool)}>
                      <td><div className="tok-cell"><TokenLogo pool={pools[x.pool] || x} size="sm" /><div><b>{x.symbol}</b><span>{x.name}</span></div></div></td>
                      <td>{fmtEth(x.bought)}</td>
                      <td>{fmtEth(v.valueEth)}</td>
                      <td>{fmtUsdC(x.entryMc)}</td>
                      <td>{fmtUsdC(v.mc)}</td>
                      <td className={v.pnl >= 0 ? 'up' : 'down'}>{fmtSignedEth(v.pnl)} ({fmtPct(v.pnlPct)})</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ))}
        {tab === 'orders' &&
          (!orders.length ? (
            <div className="empty"><b>No open orders</b>Switch the trade panel to Limit to buy the dip or take profit at a market cap.</div>
          ) : (
            <table>
              <thead><tr><th>Token</th><th>Type</th><th>Amount</th><th>Trigger MC</th><th>MC now</th><th></th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td><b>{o.symbol}</b></td>
                    <td className={'side-t ' + (o.side === 'buy' ? 'up' : 'down')}>Limit {o.side}</td>
                    <td>{o.side === 'buy' ? fmtEth(o.amount) + ' ETH' : o.amount + '%'}</td>
                    <td>{o.side === 'buy' ? '≤ ' : '≥ '}{fmtUsdC(o.triggerMc)}</td>
                    <td>{fmtUsdC(pools[o.pool]?.mc)}</td>
                    <td><button className="btn sm" onClick={() => { cancelOrder(o.id); toast('bad', 'Order cancelled', `${o.symbol} limit ${o.side}`) }}>Cancel</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        {tab === 'mine' &&
          (!myTrades.length ? (
            <div className="empty"><b>No trades on {pool.symbol} yet</b>Your paper buys and sells will show here and on the chart.</div>
          ) : (
            <table>
              <thead><tr><th>Time</th><th>Type</th><th>MC</th><th>ETH</th><th>Amount</th><th>Impact</th><th>PnL</th></tr></thead>
              <tbody>
                {myTrades.map((t) => (
                  <tr key={t.id} className="mine">
                    <td className="muted">{new Date(t.t).toLocaleTimeString('en-GB')}</td>
                    <td className={'side-t ' + (t.side === 'buy' ? 'up' : 'down')}>{t.side === 'buy' ? 'Buy' : 'Sell'}{t.via === 'limit' ? ' (limit)' : ''}</td>
                    <td>{fmtUsdC(t.mc)}</td>
                    <td>{fmtEth(t.eth)}</td>
                    <td>{fmtTokens(t.tokens)}</td>
                    <td>{(t.impact * 100).toFixed(2)}%</td>
                    <td className={t.pnl == null ? 'muted' : t.pnl >= 0 ? 'up' : 'down'}>{t.pnl == null ? '—' : fmtSignedEth(t.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
    </div>
  )
}

// Full TradingView chart (1s candles, indicators, drawing tools) from DexScreener's embed.
function TvChart({ pool, theme }) {
  const [loaded, setLoaded] = useState(false)
  const t = theme === 'dark' ? 'dark' : 'light'
  const base = pool.dexscreener || `https://dexscreener.com/robinhood/${pool.pool}`
  const src = `${base}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=1&chartTheme=${t}&theme=${t}&chartStyle=1&chartType=marketCap&interval=1`
  return (
    <div className="chart-box tv">
      {!loaded && <div className="chart-msg">Loading chart…</div>}
      <iframe key={src} src={src} title={`${pool.symbol} chart`} onLoad={() => setLoaded(true)} allow="clipboard-write" referrerPolicy="strict-origin-when-cross-origin" />
    </div>
  )
}

export default function TokenPage({ id, theme }) {
  const pool = useStore(market, (s) => s.pools[id])
  const p = useStore(paper)
  const pools = useStore(market, (s) => s.pools)
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const [tf, setTfState] = useState(() => storage.get('paperpulse:tf', '15s'))
  const setTf = (v) => {
    setTfState(v)
    storage.set('paperpulse:tf', v)
  }
  const [mode, setMode] = useState('mc')
  const [view, setViewState] = useState(() => storage.get('paperpulse:chartview', 'pro'))
  const setView = (v) => {
    setViewState(v)
    storage.set('paperpulse:chartview', v)
  }
  const [missing, setMissing] = useState(false)
  const [share, setShare] = useState(null)
  const now = useNow(1000)
  const prevPrice = usePrev(pool?.priceUsd)
  const myTrades = useMemo(() => account(p).trades.filter((t) => t.pool === id), [p, id])

  useEffect(() => {
    let alive = true
    setMissing(false)
    window.scrollTo(0, 0)
    loadPool(id).catch(() => alive && !market.get().pools[id] && setMissing(true))
    const t = setInterval(() => loadPool(id, 3).catch(() => {}), 45000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [id])

  if (!pool)
    return (
      <main className="tok">
        <div className="empty" style={{ padding: 80 }}>
          {missing ? (<><b>Pair not found</b>Check the address, or pick a token from <a href="#/" style={{ textDecoration: 'underline' }}>Pulse</a>.</>) : (<><b>Loading token…</b>Live data from Robinhood Chain.</>)}
        </div>
      </main>
    )

  const dir = prevPrice && pool.priceUsd !== prevPrice ? (pool.priceUsd > prevPrice ? 'flash-up' : 'flash-down') : ''
  const pos = account(p).positions[pool.pool]
  return (
    <main className="tok">
      <div className="tbar">
        <a className="back" href="#/" aria-label="Back to Pulse"><Icon name="back" size={18} /></a>
        <div className="tid">
          <TokenLogo pool={pool} size="md" />
          <div style={{ minWidth: 0 }}>
            <h1>{pool.symbol} <span>{pool.name}</span></h1>
            <div className="row2">
              <CopyAddr value={pool.tokenAddress} label={shortAddr(pool.tokenAddress)} />
              <span className="age">{fmtAge(pool.createdAt, now)}</span>
              <Socials pool={pool} size={13} />
            </div>
          </div>
        </div>
        <div className="tstats">
          <div className="ts"><label>Market cap</label><b key={pool.priceUsd} className={'xl ' + mcTier(pool.mc) + ' ' + dir}>{fmtUsdC(pool.mc)}</b></div>
          <div className="ts"><label>Price</label><b>{fmtPriceUsd(pool.priceUsd)}</b></div>
          <div className="ts"><label>Liquidity</label><b>{fmtUsdC(pool.liq)}</b></div>
          <div className="ts"><label>24h Vol</label><b>{fmtUsdC(pool.vol?.h24)}</b></div>
          {[['5m', 'm5'], ['1h', 'h1'], ['6h', 'h6'], ['24h', 'h24']].map(([l, k]) => (
            <div className="ts" key={k}><label>{l}</label><b className={(pool.chg?.[k] || 0) >= 0 ? 'up' : 'down'}>{fmtPct(pool.chg?.[k] || 0)}</b></div>
          ))}
        </div>
      </div>

      <div className="tgrid">
        <div className="tmain">
          <div className="chart-bar">
            <div className="seg">
              <button className={view === 'pro' ? 'on' : ''} onClick={() => setView('pro')}>Chart + my trades</button>
              <button className={view === 'tv' ? 'on' : ''} onClick={() => setView('tv')}>TradingView</button>
            </div>
            {view === 'pro' && (
              <>
                <span className="sep" />
                <div className="seg">
                  {['1s', '15s', '30s', '1m', '5m', '15m', '1h', '4h'].map((t) => (
                    <button key={t} className={tf === t ? 'on' : ''} onClick={() => setTf(t)}>{t}</button>
                  ))}
                </div>
                <span className="sep" />
                <div className="seg">
                  <button className={mode === 'mc' ? 'on' : ''} onClick={() => setMode('mc')}>MarketCap</button>
                  <button className={mode === 'price' ? 'on' : ''} onClick={() => setMode('price')}>Price</button>
                </div>
              </>
            )}
            <span className="legend">{view === 'tv' ? <>Live chart by <b>DexScreener</b> · your trades show in Chart view</> : <>B/S markers = your paper trades · dashed line = avg entry</>}</span>
          </div>
          {view === 'tv' ? <TvChart pool={pool} theme={theme} /> : <Chart pool={pool} tf={tf} mode={mode} myTrades={myTrades} entryMc={pos?.tokens > 0 ? pos.entryMc : 0} />}
          <Bottom pool={pool} myTrades={myTrades} />
        </div>
        <aside className="tside">
          <TradePanel pool={pool} />
          <PnlBox pool={pool} onShare={() => setShare(pnlFromPosition(pos, positionValue(pos, pools, ethUsd)))} />
          <TokenInfo pool={pool} now={now} />
        </aside>
      </div>
      <PnlCard data={share} onClose={() => setShare(null)} />
    </main>
  )
}
