import { useState } from 'react'
import { useStore } from '../lib/store.js'
import { market } from '../lib/api.js'
import { paper, account, equityEth, positionValue, sell } from '../lib/paper.js'
import { fmtEth, fmtSignedEth, fmtPct, fmtUsdC, fmtTokens, fmtCompact, fmtAge } from '../lib/format.js'
import { TokenLogo, toast, useNow } from '../components/ui.jsx'

export default function Portfolio() {
  const p = useStore(paper)
  const pools = useStore(market, (s) => s.pools)
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const [tab, setTab] = useState('open')
  const now = useNow(5000)
  const acct = account(p)
  const eq = equityEth(acct, pools, ethUsd)
  const pnl = eq - acct.start
  const all = Object.values(acct.positions)
  const open = all.filter((x) => x.tokens > 0).map((x) => ({ ...x, v: positionValue(x, pools, ethUsd) })).sort((a, b) => b.v.valueEth - a.v.valueEth)
  const closed = all.filter((x) => x.tokens <= 0).sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
  const unreal = open.reduce((s, x) => s + x.v.pnl, 0)
  const sells = acct.trades.filter((t) => t.side === 'sell')
  const wins = sells.filter((t) => t.pnl > 0).length
  const best = closed.reduce((b, x) => (!b || x.realized > b.realized ? x : b), null)

  return (
    <main className="page">
      <div className="pf-top">
        <div className="panel pf-tile hero-t">
          <span className="label">Samlet værdi</span>
          <b>{fmtEth(eq)} ETH</b>
          <span className={'sub ' + (pnl >= 0 ? 'up' : 'down')}>
            {fmtSignedEth(pnl)} ETH ({fmtPct((pnl / acct.start) * 100)}) · startede med {acct.start} ETH
          </span>
        </div>
        <div className="panel pf-tile"><span className="label">Fri ETH</span><b>{fmtEth(acct.eth)}</b><span className="muted">${fmtCompact(acct.eth * ethUsd, 2)}</span></div>
        <div className="panel pf-tile"><span className="label">Urealiseret</span><b className={unreal >= 0 ? 'up' : 'down'}>{fmtSignedEth(unreal)}</b><span className="muted">{open.length} åbne positioner</span></div>
        <div className="panel pf-tile"><span className="label">Realiseret</span><b className={acct.realized >= 0 ? 'up' : 'down'}>{fmtSignedEth(acct.realized)}</b><span className="muted">{sells.length} salg</span></div>
        <div className="panel pf-tile">
          <span className="label">Træfsikkerhed</span>
          <b>{sells.length ? Math.round((wins / sells.length) * 100) + '%' : '—'}</b>
          <span className="muted">{best ? `Bedste: ${best.symbol} ${fmtSignedEth(best.realized, 3)}` : 'Ingen lukkede handler endnu'}</span>
        </div>
      </div>

      <div className="panel">
        <div className="tabs">
          <button className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>Åbne<span className="n">{open.length}</span></button>
          <button className={tab === 'closed' ? 'on' : ''} onClick={() => setTab('closed')}>Lukkede<span className="n">{closed.length}</span></button>
          <button className={tab === 'hist' ? 'on' : ''} onClick={() => setTab('hist')}>Historik<span className="n">{acct.trades.length}</span></button>
        </div>
        <div className="tbl-wrap" style={{ maxHeight: 'none' }}>
          {tab === 'open' &&
            (open.length ? (
              <table>
                <thead><tr><th>Token</th><th>Beholdning</th><th>Indgang MC</th><th>MC nu</th><th>Investeret</th><th>Værdi</th><th>Afkast</th><th></th></tr></thead>
                <tbody>
                  {open.map((x) => {
                    const live = pools[x.pool] || x
                    return (
                      <tr key={x.pool} className="clickable" onClick={() => (location.hash = '#/t/' + x.pool)}>
                        <td><div className="tok-cell"><TokenLogo pool={live} size="sm" /><div><b>{x.symbol}</b><span>{x.name}</span></div></div></td>
                        <td>{fmtTokens(x.tokens)}</td>
                        <td>{fmtUsdC(x.entryMc)}</td>
                        <td>{fmtUsdC(x.v.mc)}</td>
                        <td>{fmtEth(x.cost)}</td>
                        <td>{fmtEth(x.v.valueEth)}</td>
                        <td className={x.v.pnl >= 0 ? 'up' : 'down'}>{fmtSignedEth(x.v.pnl)} <span className="muted">({fmtPct(x.v.pnlPct)})</span></td>
                        <td>
                          <button
                            className="chip"
                            onClick={(e) => {
                              e.stopPropagation()
                              const r = sell(live, x.tokens)
                              if (r.ok) toast(r.trade.pnl >= 0 ? 'ok' : 'bad', `Solgt alt ${x.symbol}`, `Realiseret ${fmtSignedEth(r.trade.pnl)} ETH`)
                              else toast('bad', 'Salget gik ikke igennem', r.msg)
                            }}
                          >
                            Sælg alt
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty"><b>Ingen åbne positioner</b>Gå til <a href="#/" style={{ color: 'var(--fg)', textDecoration: 'underline' }}>Pulse</a> og tryk ⚡ på et token for at købe med det samme.</div>
            ))}
          {tab === 'closed' &&
            (closed.length ? (
              <table>
                <thead><tr><th>Token</th><th>Købt for</th><th>Solgt for</th><th>Resultat</th><th>Lukket</th></tr></thead>
                <tbody>
                  {closed.map((x) => (
                    <tr key={x.pool} className="clickable" onClick={() => (location.hash = '#/t/' + x.pool)}>
                      <td><div className="tok-cell"><TokenLogo pool={pools[x.pool] || x} size="sm" /><div><b>{x.symbol}</b><span>{x.name}</span></div></div></td>
                      <td>{fmtEth(x.bought)}</td>
                      <td>{fmtEth(x.sold)}</td>
                      <td className={x.realized >= 0 ? 'up' : 'down'}>{fmtSignedEth(x.realized)} <span className="muted">({fmtPct((x.realized / x.bought) * 100)})</span></td>
                      <td className="muted">{fmtAge(x.closedAt, now)} siden</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty"><b>Ingen lukkede positioner</b>Når du sælger alt i et token, lander resultatet her.</div>
            ))}
          {tab === 'hist' &&
            (acct.trades.length ? (
              <table>
                <thead><tr><th>Token</th><th>Type</th><th>Tid</th><th>MC</th><th>ETH</th><th>Antal</th><th>Resultat</th></tr></thead>
                <tbody>
                  {acct.trades.map((t) => (
                    <tr key={t.id} className="clickable" onClick={() => (location.hash = '#/t/' + t.pool)}>
                      <td><div className="tok-cell"><TokenLogo pool={pools[t.pool] || t} size="sm" /><div><b>{t.symbol}</b><span>{t.name}</span></div></div></td>
                      <td><span className={'side-pill ' + t.side}>{t.side === 'buy' ? 'Køb' : 'Salg'}</span></td>
                      <td className="muted">{new Date(t.t).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                      <td>{fmtUsdC(t.mc)}</td>
                      <td>{fmtEth(t.eth)}</td>
                      <td>{fmtTokens(t.tokens)}</td>
                      <td className={t.pnl == null ? 'muted' : t.pnl >= 0 ? 'up' : 'down'}>{t.pnl == null ? '—' : fmtSignedEth(t.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty"><b>Ingen handler endnu</b>Alle dine papir-køb og -salg vises her.</div>
            ))}
        </div>
      </div>

      {p.history?.length > 0 && (
        <div className="panel">
          <div className="section-h"><h2>Tidligere runder</h2><span className="muted">Hver nulstilling gemmes her</span></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Nulstillet</th><th>Start</th><th>Slut</th><th>Resultat</th><th>Handler</th></tr></thead>
              <tbody>
                {p.history.map((h) => (
                  <tr key={h.at}>
                    <td className="muted">{new Date(h.at).toLocaleString('da-DK')}</td>
                    <td>{h.start} ETH</td>
                    <td>{fmtEth(h.end)} ETH</td>
                    <td className={h.end - h.start >= 0 ? 'up' : 'down'}>{fmtPct(((h.end - h.start) / h.start) * 100)}</td>
                    <td>{h.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  )
}
