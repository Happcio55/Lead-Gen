import { useEffect, useState } from 'react'
import { refreshPrices, market } from './lib/api.js'
import { paper, account } from './lib/paper.js'
import { storage } from './lib/store.js'
import { Header, Strip, BottomNav, Onboarding } from './components/Header.jsx'
import { Toasts } from './components/ui.jsx'
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
  const [theme, setTheme] = useState(() => storage.get('paperpulse:theme', 'dark'))

  useEffect(() => {
    const on = () => setRoute(parseRoute())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    storage.set('paperpulse:theme', theme)
  }, [theme])

  // Keep held positions and the open token priced every few seconds.
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return
      const held = Object.values(account(paper.get()).positions).filter((p) => p.tokens > 0).map((p) => p.pool)
      const cur = parseRoute()
      const ids = cur.name === 'token' ? [cur.id, ...held] : held
      if (ids.length) refreshPrices(ids)
    }
    tick()
    const id = setInterval(tick, 4000)
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
      <div className="backdrop" aria-hidden="true" />
      <Strip />
      <Header route={route} theme={theme} setTheme={setTheme} />
      {route.name === 'pulse' && <Pulse />}
      {route.name === 'token' && <TokenPage key={route.id} id={route.id} theme={theme} />}
      {route.name === 'portfolio' && <Portfolio />}
      <footer className="footer">
        Paper Pulse er en øvebane. Alle handler er simulerede med papirpenge mod live priser fra GeckoTerminal og DexScreener. Ingen rigtige penge, ingen wallet, ingen finansiel rådgivning.
      </footer>
      <BottomNav route={route} />
      <Onboarding />
      <Toasts />
    </div>
  )
}
