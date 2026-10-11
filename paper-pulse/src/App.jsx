import { useEffect, useState } from 'react'
import { refreshPrices, market } from './lib/api.js'
import { paper, account, checkOrders, recordEquity } from './lib/paper.js'
import { fmtEth, fmtSignedEth, fmtUsdC } from './lib/format.js'
import { TopBar, StatusBar, BottomNav, Onboarding } from './components/Header.jsx'
import { Toasts, toast } from './components/ui.jsx'
import Pulse from './pages/Pulse.jsx'
import TokenPage from './pages/TokenPage.jsx'
import Portfolio from './pages/Portfolio.jsx'

function parseRoute() {
  const h = location.hash.replace(/^#/, '')
  const m = h.match(/^\/t\/(0x[0-9a-fA-F]+)/)
  if (m) return { name: 'token', id: m[1].toLowerCase() }
  if (h.startsWith('/portfolio')) return { name: 'portfolio' }
  return { name: 'pulse' }
}

export default function App() {
  const [route, setRoute] = useState(parseRoute)

  useEffect(() => {
    const on = () => setRoute(parseRoute())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // Keep held positions, open orders and the open token priced every few seconds.
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return
      const acct = account(paper.get())
      const held = Object.values(acct.positions).filter((p) => p.tokens > 0).map((p) => p.pool)
      const ordered = acct.orders.map((o) => o.pool)
      const cur = parseRoute()
      const ids = [...new Set([...(cur.name === 'token' ? [cur.id] : []), ...held, ...ordered])]
      if (ids.length) refreshPrices(ids)
    }
    tick()
    const id = setInterval(tick, 4000)
    return () => clearInterval(id)
  }, [])

  // Fill limit orders as prices move.
  useEffect(() => {
    let last = null
    return market.subscribe(() => {
      const pools = market.get().pools
      if (pools === last) return
      last = pools
      for (const ev of checkOrders(pools)) {
        const o = ev.order
        if (ev.ok) toast('ok', `Limit ${o.side} filled · ${o.symbol}`, o.side === 'buy' ? `${fmtEth(ev.trade.eth)} ETH at ${fmtUsdC(ev.trade.mc)} MC` : `Realized ${fmtSignedEth(ev.trade.pnl)} ETH`)
        else toast('bad', `Limit ${o.side} on ${o.symbol} cancelled`, ev.msg)
      }
    })
  }, [])

  // Equity curve sample every 30s.
  useEffect(() => {
    const id = setInterval(() => !document.hidden && recordEquity(), 30000)
    return () => clearInterval(id)
  }, [])

  // ETH price fallback before the first WETH pool reports it
  useEffect(() => {
    if (market.get().ethUsd) return
    fetch('https://api.dexscreener.com/latest/dex/search?q=WETH%20USDG')
      .then((r) => r.json())
      .then((j) => {
        if (market.get().ethUsd) return
        const p = (j.pairs || []).find((x) => x.chainId === 'robinhood' && /^W?ETH$/.test(x.baseToken.symbol) && +x.priceUsd > 100)
        if (p) market.set({ ethUsd: +p.priceUsd })
      })
      .catch(() => {})
  }, [])

  return (
    <div className="shell">
      <TopBar route={route} />
      {route.name === 'pulse' && <Pulse />}
      {route.name === 'token' && <TokenPage key={route.id} id={route.id} />}
      {route.name === 'portfolio' && <Portfolio />}
      <BottomNav route={route} />
      <StatusBar />
      <Onboarding />
      <Toasts />
    </div>
  )
}
