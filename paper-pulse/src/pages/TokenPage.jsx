import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store.js'
import { market, loadPool, loadTrades } from '../lib/api.js'
import { paper, account, buy, sell, quoteBuy, quoteSell, positionValue, updateSettings, FEE } from '../lib/paper.js'
import { dexLabel } from '../lib/chains.js'
import { fmtAge, fmtUsdC, fmtPct, fmtEth, fmtSignedEth, fmtPriceUsd, fmtTokens, shortAddr, parseAmount, fmtCompact } from '../lib/format.js'
import { Icon, TokenLogo, Socials, CopyAddr, useNow, toast } from '../components/ui.jsx'
import Chart from '../components/Chart.jsx'

function usePrev(v) {
  const r = useRef(v)
  const prev = r.current
  r.current = v
  return prev
}

function Ticket({ pool }) {
  const p = useStore(paper)
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const acct = account(p)
  const pos = acct.positions[pool.pool]
  const [side, setSide] = useState('buy')
  const [amt, setAmt] = useState('')
  const [pct, setPct] = useState(100)
  const [err, setErr] = useState(null)
  const { buyPresets, sellPresets, slippage } = p.settings

  const ethIn = parseAmount(amt)
  const sellTokens = pos ? (pos.tokens * pct) / 100 : 0
  const q = side === 'buy' ? quoteBuy(pool, ethIn) : quoteSell(pool, sellTokens)
  const impactPct = q ? q.impact * 100 : 0

  function submit() {
    setErr(null)
    const r = side === 'buy' ? buy(pool, ethIn) : sell(pool, sellTokens)
    if (!r.ok) return setErr(r.msg)
    const t = r.trade
    if (side === 'buy') toast('ok', `Købt ${fmtTokens(t.tokens)} ${pool.symbol}`, `${fmtEth(t.eth)} ETH ved MC ${fmtUsdC(t.mc)}`)
    else toast(t.pnl >= 0 ? 'ok' : 'bad', `Solgt ${pool.symbol} for ${fmtEth(t.eth)} ETH`, `Realiseret ${fmtSignedEth(t.pnl)} ETH`)
    setAmt('')
  }

  return (
    <div className="panel ticket">
      <div className="bs">
        <button className={'buy' + (side === 'buy' ? ' on' : '')} onClick={() => { setSide('buy'); setErr(null) }}>Køb</button>
        <button className={'sell' + (side === 'sell' ? ' on' : '')} onClick={() => { setSide('sell'); setErr(null) }}>Sælg</button>
      </div>

      {side === 'buy' ? (
        <>
          <div className="input-wrap">
            <input className="input" id="buy-amount" inputMode="decimal" placeholder="0.0" value={amt} onChange={(e) => { setAmt(e.target.value); setErr(null) }} aria-label="Beløb i ETH" />
            <span className="unit">ETH</span>
          </div>
          <div className="chips">
            {buyPresets.map((v) => (
              <button key={v} className={'chip' + (ethIn === v ? ' on' : '')} onClick={() => setAmt(String(v))}>{v}</button>
            ))}
            <button className="chip" onClick={() => setAmt(String(Math.floor(acct.eth * 1e6) / 1e6))}>Max</button>
          </div>
        </>
      ) : (
        <>
          <div className="input-wrap">
            <input className="input" id="sell-pct" inputMode="decimal" value={pct} onChange={(e) => { const v = parseAmount(e.target.value); setPct(isFinite(v) ? Math.min(100, v) : 0); setErr(null) }} aria-label="Andel at sælge i procent" />
            <span className="unit">% af position</span>
          </div>
          <div className="chips">
            {[10, ...sellPresets].map((v) => (
              <button key={v} className={'chip' + (pct === v ? ' on' : '')} onClick={() => setPct(v)}>{v}%</button>
            ))}
          </div>
        </>
      )}

      <div className="quote">
        {side === 'buy' ? (
          <>
            <div className="kv"><span>Du får ca.</span><span>{q ? fmtTokens(q.tokens) + ' ' + pool.symbol : '—'}</span></div>
            <div className="kv"><span>Fyld ved MC</span><span>{q ? fmtUsdC(q.mcAtFill) : '—'}</span></div>
          </>
        ) : (
          <>
            <div className="kv"><span>Du sælger</span><span>{pos?.tokens ? fmtTokens(sellTokens) + ' ' + pool.symbol : 'Ingen position'}</span></div>
            <div className="kv"><span>Du får ca.</span><span>{q ? fmtEth(q.ethOut) + ' ETH' : '—'}</span></div>
          </>
        )}
        <div className="kv"><span>Prisudsving</span><span className={impactPct > slippage ? 'down' : impactPct > 5 ? '' : 'muted'}>{q ? impactPct.toFixed(2) + '%' : '—'}</span></div>
        <div className="kv"><span>Swap-gebyr ({FEE * 100}%)</span><span className="muted">{q ? fmtEth(q.feeEth) + ' ETH' : '—'}</span></div>
      </div>

      {err && <div className="warn-box">{err}</div>}

      <button className={'btn lg block ' + (side === 'buy' ? 'neon' : 'danger')} onClick={submit}>
        <Icon name="bolt" size={15} fill stroke={0} />
        {side === 'buy' ? `Køb ${pool.symbol}` : `Sælg ${pct}% ${pool.symbol}`}
      </button>

      <div className="settings-row">
        <span>
          Fri saldo <b className="mono" style={{ color: 'var(--fg)' }}>{fmtEth(acct.eth)} ETH</b>
          {ethUsd ? <span className="muted"> · ${fmtCompact(acct.eth * ethUsd, 2)}</span> : null}
        </span>
        <label className="slip" title="Maks. prisudsving før en ordre afvises">
          Slippage
          <input id="slippage" value={slippage} inputMode="numeric" onChange={(e) => { const v = parseAmount(e.target.value); if (v > 0 && v <= 100) updateSettings({ slippage: v }) }} />%
        </label>
      </div>
    </div>
  )
}

function PositionCard({ pool }) {
  const p = useStore(paper)
  const pools = useStore(market, (s) => s.pools)
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const pos = account(p).positions[pool.pool]
  if (!pos || (!pos.tokens && !pos.realized)) return null
  const v = positionValue(pos, pools, ethUsd)
  const open = pos.tokens > 0
  const total = v.pnl + pos.realized
  return (
    <div className={'panel pos-card ' + (total >= 0 ? 'win' : 'loss')}>
      <div className="label">{open ? 'Din position' : 'Lukket position'}</div>
      <div className={'pnl ' + (total >= 0 ? 'up' : 'down')}>
        {fmtSignedEth(total)} ETH
        {open && <small>{fmtPct(v.pnlPct)}</small>}
      </div>
      <div className="grid2">
        <div><label>Beholdning</label><b>{open ? fmtTokens(pos.tokens) : '0'}</b></div>
        <div><label>Værdi</label><b>{fmtEth(v.valueEth)} ETH</b></div>
        <div><label>Købt for</label><b>{fmtEth(pos.bought)} ETH</b></div>
        <div><label>Solgt for</label><b>{fmtEth(pos.sold)} ETH</b></div>
        <div><label>Gns. indgang MC</label><b>{fmtUsdC(pos.entryMc)}</b></div>
        <div><label>Realiseret</label><b className={pos.realized >= 0 ? 'up' : 'down'}>{fmtSignedEth(pos.realized)}</b></div>
      </div>
      {open && (
        <button
          className="btn danger block"
          onClick={() => {
            const r = sell(pool, pos.tokens)
            if (r.ok) toast(r.trade.pnl >= 0 ? 'ok' : 'bad', `Solgt alt ${pool.symbol}`, `${fmtEth(r.trade.eth)} ETH · realiseret ${fmtSignedEth(r.trade.pnl)} ETH`)
            else toast('bad', 'Salget gik ikke igennem', r.msg)
          }}
        >
          Sælg alt
        </button>
      )}
    </div>
  )
}

function Trades({ pool, myTrades }) {
  const [tab, setTab] = useState('all')
  const [trades, setTrades] = useState([])
  const [state, setState] = useState('loading')
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

  return (
    <div className="panel">
      <div className="tabs">
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>Live handler<span className="n">{trades.length}</span></button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Mine handler<span className="n">{myTrades.length}</span></button>
      </div>
      <div className="tbl-wrap">
        {tab === 'all' ? (
          state === 'loading' ? (
            <div className="empty">Henter de seneste handler…</div>
          ) : state === 'error' && !trades.length ? (
            <div className="empty"><b>Kunne ikke hente handler</b>Der prøves igen om 15 sekunder.</div>
          ) : !trades.length ? (
            <div className="empty"><b>Ingen handler endnu</b>Parret er helt nyt.</div>
          ) : (
            <table>
              <thead><tr><th>Alder</th><th>Type</th><th>MC</th><th>Beløb</th><th>{pool.quote || 'ETH'}</th><th>{pool.symbol}</th><th>Wallet</th></tr></thead>
              <tbody>
                {trades.slice(0, 80).map((t) => (
                  <tr key={t.id}>
                    <td className="muted">{fmtAge(t.t, now)}</td>
                    <td><span className={'side-pill ' + t.side}>{t.side === 'buy' ? 'Køb' : 'Salg'}</span></td>
                    <td>{supply ? fmtUsdC(t.price * supply) : fmtPriceUsd(t.price)}</td>
                    <td className={t.side === 'buy' ? 'up' : 'down'} style={{ fontWeight: t.usd > 1000 ? 700 : 400 }}>{fmtUsdC(t.usd)}</td>
                    <td>{fmtCompact(t.quoteAmt, 3)}</td>
                    <td>{fmtTokens(t.tokens)}</td>
                    <td className="muted">{shortAddr(t.wallet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : !myTrades.length ? (
          <div className="empty"><b>Du har ikke handlet {pool.symbol} endnu</b>Brug køb-panelet til at åbne en papir-position.</div>
        ) : (
          <table>
            <thead><tr><th>Tid</th><th>Type</th><th>MC ved handel</th><th>ETH</th><th>{pool.symbol}</th><th>Prisudsving</th><th>Resultat</th></tr></thead>
            <tbody>
              {myTrades.map((t) => (
                <tr key={t.id} className="mine">
                  <td className="muted">{new Date(t.t).toLocaleTimeString('da-DK')}</td>
                  <td><span className={'side-pill ' + t.side}>{t.side === 'buy' ? 'Køb' : 'Salg'}</span></td>
                  <td>{fmtUsdC(t.mc)}</td>
                  <td>{fmtEth(t.eth)}</td>
                  <td>{fmtTokens(t.tokens)}</td>
                  <td>{(t.impact * 100).toFixed(2)}%</td>
                  <td className={t.pnl == null ? 'muted' : t.pnl >= 0 ? 'up' : 'down'}>{t.pnl == null ? '—' : fmtSignedEth(t.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function TokenPage({ id, theme }) {
  const pool = useStore(market, (s) => s.pools[id])
  const p = useStore(paper)
  const [tf, setTf] = useState('1m')
  const [mode, setMode] = useState('mc')
  const [missing, setMissing] = useState(false)
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
      <main className="page">
        <a className="back" href="#/"><Icon name="back" size={15} /> Tilbage til Pulse</a>
        <div className="panel empty" style={{ padding: 60 }}>
          {missing ? (<><b>Fandt ikke dette par</b>Tjek adressen, eller gå tilbage til Pulse og vælg et token.</>) : (<><b>Henter token…</b>Live data fra Robinhood Chain.</>)}
        </div>
      </main>
    )

  const dir = prevPrice && pool.priceUsd !== prevPrice ? (pool.priceUsd > prevPrice ? 'flash-up' : 'flash-down') : ''
  return (
    <main className="page">
      <a className="back" href="#/"><Icon name="back" size={15} /> Pulse</a>
      <div className="desk">
        <div className="desk-main">
          <div className="panel t-panel">
            <div className="t-head">
              <div className="t-id">
                <TokenLogo pool={pool} size="lg" />
                <div style={{ minWidth: 0 }}>
                  <h1>{pool.symbol} <span>{pool.name}</span></h1>
                  <div className="t-sub">
                    <CopyAddr value={pool.tokenAddress} label={shortAddr(pool.tokenAddress)} />
                    <span className="dex-tag">{dexLabel(pool.dex)}</span>
                    <span>{fmtAge(pool.createdAt, now)} gammel</span>
                    <Socials pool={pool} size={14} />
                  </div>
                </div>
              </div>
              <div className="t-stats">
                <div className="ts"><label>Market cap</label><b key={pool.priceUsd} className={'hero-n ' + dir}>{fmtUsdC(pool.mc)}</b></div>
                <div className="ts"><label>Pris</label><b>{fmtPriceUsd(pool.priceUsd)}</b></div>
                <div className="ts"><label>Likviditet</label><b>{fmtUsdC(pool.liq)}</b></div>
                <div className="ts"><label>Volumen 24t</label><b>{fmtUsdC(pool.vol?.h24)}</b></div>
              </div>
            </div>
            <div className="chgs">
              {[['5m', 'm5'], ['1t', 'h1'], ['6t', 'h6'], ['24t', 'h24']].map(([l, k]) => (
                <div key={k}><label>{l}</label><b className={(pool.chg?.[k] || 0) >= 0 ? 'up' : 'down'}>{fmtPct(pool.chg?.[k] || 0)}</b></div>
              ))}
              <div><label>Køb / salg 24t</label><b><span className="up">{pool.txns?.h24?.b ?? 0}</span> / <span className="down">{pool.txns?.h24?.s ?? 0}</span></b></div>
            </div>
          </div>

          <div className="panel chart-panel">
            <div className="chart-bar">
              <div className="seg">
                {['1m', '5m', '15m', '1h', '4h'].map((t) => (
                  <button key={t} className={tf === t ? 'on' : ''} onClick={() => setTf(t)}>{t}</button>
                ))}
              </div>
              <div className="seg">
                <button className={mode === 'mc' ? 'on' : ''} onClick={() => setMode('mc')}>MC</button>
                <button className={mode === 'price' ? 'on' : ''} onClick={() => setMode('price')}>Pris</button>
              </div>
            </div>
            <Chart pool={pool} tf={tf} mode={mode} myTrades={myTrades} theme={theme} />
          </div>

          <Trades pool={pool} myTrades={myTrades} />
        </div>

        <aside className="side">
          <Ticket pool={pool} />
          <PositionCard pool={pool} />
          <div className="panel info">
            <div className="label">Token</div>
            <div className="kv"><span>Kontrakt</span><CopyAddr value={pool.tokenAddress} label={shortAddr(pool.tokenAddress)} /></div>
            <div className="kv"><span>Pool</span><CopyAddr value={pool.pool} label={shortAddr(pool.pool)} /></div>
            <div className="kv"><span>Handles mod</span><span>{pool.quote}{pool.fee ? ' · ' + pool.fee : ''}</span></div>
            <div className="kv"><span>FDV</span><span>{fmtUsdC(pool.fdv)}</span></div>
            <div className="kv"><span>Købere / sælgere 24t</span><span>{pool.buyers || '—'} / {pool.sellers || '—'}</span></div>
            <div className="kv"><span>Oprettet</span><span>{pool.createdAt ? new Date(pool.createdAt).toLocaleString('da-DK') : '—'}</span></div>
            <div className="links" style={{ marginTop: 4 }}>
              <a href={pool.dexscreener || `https://dexscreener.com/robinhood/${pool.pool}`} target="_blank" rel="noreferrer"><Icon name="chart" size={13} />DexScreener</a>
              <a href={`https://www.geckoterminal.com/robinhood/pools/${pool.pool}`} target="_blank" rel="noreferrer"><Icon name="ext" size={13} />GeckoTerminal</a>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
