import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store.js'
import { market, net, searchPools } from '../lib/api.js'
import { CHAINS, ACTIVE_CHAIN } from '../lib/chains.js'
import { paper, account, equityEth, resetAccount, START_OPTIONS, openPositions } from '../lib/paper.js'
import { fmtEth, fmtSignedEth, fmtPct, fmtCompact } from '../lib/format.js'
import { Icon, toast } from './ui.jsx'

function useClickAway(open, setOpen) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const k = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('keydown', k)
    }
  }, [open, setOpen])
  return ref
}

export function Strip() {
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const seen = useStore(market, (s) => Object.keys(s.firstSeen).length)
  const n = useStore(net)
  const throttled = n.throttledUntil > Date.now()
  return (
    <div className="strip">
      <span>
        <i className={'live-dot' + (throttled ? ' warn' : '')} />
        <b>{throttled ? 'Datakilden drosler, venter et øjeblik' : 'Live på Robinhood Chain'}</b>
      </span>
      <span className="sep">|</span>
      <span>
        ETH <span className="mono">{ethUsd ? '$' + ethUsd.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '…'}</span>
      </span>
      <span className="sep">|</span>
      <span>
        <span className="mono">{seen}</span> tokens fulgt i denne session
      </span>
      <span className="sep">|</span>
      <span>Papirpenge. Ingen rigtig risiko.</span>
    </div>
  )
}

function ChainPicker() {
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, setOpen)
  return (
    <div className="rel" ref={ref}>
      <button className="chain-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="chain-mark">{ACTIVE_CHAIN.short}</span>
        <span className="cname">{ACTIVE_CHAIN.name}</span>
        <Icon name="chev" size={14} />
      </button>
      {open && (
        <div className="pop" role="menu">
          <h4>Kæde</h4>
          {CHAINS.map((c) => (
            <button key={c.id} className="pop-item" disabled={!c.live} onClick={() => setOpen(false)}>
              <span className={'chain-mark' + (c.live ? '' : ' off')}>{c.short}</span>
              {c.name}
              {c.live ? <span className="live">Live</span> : <span className="soon">Snart</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function StartPicker({ value, onPick }) {
  return (
    <div className="starts">
      {START_OPTIONS.map((v) => (
        <button key={v} type="button" className={'start' + (value === v ? ' on' : '')} onClick={() => onPick(v)}>
          <b>{v}</b>
          <span>ETH</span>
        </button>
      ))}
    </div>
  )
}

function Wallet() {
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState(null)
  const ref = useClickAway(open, setOpen)
  const p = useStore(paper)
  const pools = useStore(market, (s) => s.pools)
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const acct = account(p)
  const eq = equityEth(acct, pools, ethUsd)
  const pnl = eq - acct.start
  return (
    <div className="rel" ref={ref}>
      <button className="bal-btn" onClick={() => setOpen(!open)} aria-expanded={open} title="Din papir-wallet">
        <Icon name="wallet" size={15} />
        <span className="eth">{fmtEth(acct.eth, 3)} ETH</span>
      </button>
      {open && (
        <div className="pop wallet">
          <div>
            <div className="label">Samlet værdi</div>
            <div className="big">{fmtEth(eq)} ETH</div>
            <div className={'mono ' + (pnl >= 0 ? 'up' : 'down')} style={{ fontSize: 13 }}>
              {fmtSignedEth(pnl)} ETH ({fmtPct((pnl / acct.start) * 100)}) siden start
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="kv"><span>Fri ETH</span><span>{fmtEth(acct.eth)}</span></div>
            <div className="kv"><span>I positioner</span><span>{fmtEth(eq - acct.eth)}</span></div>
            <div className="kv"><span>Åbne positioner</span><span>{openPositions(acct).length}</span></div>
            <div className="kv"><span>Startbeløb</span><span>{acct.start} ETH</span></div>
            <div className="kv"><span>Værdi i USD</span><span>${fmtCompact(eq * ethUsd, 2)}</span></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="label">Nulstil med nyt beløb</div>
            <StartPicker value={pick} onPick={setPick} />
            <button
              className="btn danger block"
              disabled={!pick}
              style={{ opacity: pick ? 1 : 0.45 }}
              onClick={() => {
                resetAccount(pick)
                setOpen(false)
                setPick(null)
                toast('ok', 'Wallet nulstillet', `Du starter forfra med ${pick} ETH.`)
              }}
            >
              <Icon name="reset" size={15} />
              {pick ? `Nulstil til ${pick} ETH` : 'Vælg et beløb'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Search() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef(null)
  useEffect(() => {
    const k = (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [])
  async function go(e) {
    e.preventDefault()
    const s = q.trim()
    if (!s) return
    const pools = market.get().pools
    const lower = s.toLowerCase()
    const local = Object.values(pools).find((p) => p.pool === lower || p.tokenAddress === lower || p.symbol?.toLowerCase() === lower)
    if (local) {
      location.hash = '#/t/' + local.pool
      setQ('')
      return
    }
    setBusy(true)
    try {
      const ids = await searchPools(s)
      if (ids.length) {
        location.hash = '#/t/' + ids[0]
        setQ('')
      } else toast('bad', 'Ingen resultater', `Fandt ingen token på Robinhood Chain for "${s}".`)
    } catch {
      toast('bad', 'Søgningen fejlede', 'Datakilden svarede ikke. Prøv igen om lidt.')
    }
    setBusy(false)
  }
  return (
    <form className="search" onSubmit={go}>
      <Icon name="search" size={15} />
      <input ref={input} id="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={busy ? 'Søger…' : 'Søg ticker, navn eller kontrakt'} autoComplete="off" />
      <kbd>/</kbd>
    </form>
  )
}

export function Header({ route, theme, setTheme }) {
  return (
    <header className="header">
      <a href="#/" className="logo" aria-label="Paper Pulse">
        <span className="orb" />
        <span className="word">
          Paper<em>pulse</em>
        </span>
      </a>
      <nav className="nav">
        <a href="#/" className={route.name === 'pulse' ? 'on' : ''}>Pulse</a>
        <a href="#/portfolio" className={route.name === 'portfolio' ? 'on' : ''}>Portefølje</a>
      </nav>
      <Search />
      <div className="hdr-right">
        <ChainPicker />
        <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Lyst tema' : 'Mørkt tema'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
        <Wallet />
      </div>
    </header>
  )
}

export function BottomNav({ route }) {
  return (
    <nav className="bottom-nav">
      <a href="#/" className={route.name === 'pulse' ? 'on' : ''}><Icon name="pulse" size={20} />Pulse</a>
      <a href="#/portfolio" className={route.name === 'portfolio' ? 'on' : ''}><Icon name="wallet" size={20} />Portefølje</a>
    </nav>
  )
}

export function Onboarding() {
  const onboarded = useStore(paper, (s) => s.onboarded)
  const [pick, setPick] = useState(1)
  if (onboarded) return null
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="ob-h">
      <div className="modal">
        <span className="orb" style={{ width: 40, height: 40 }} />
        <h2 id="ob-h">
          Hvor mange <em>papir</em>-ETH vil du starte med?
        </h2>
        <p>Du trader rigtige memecoins fra Robinhood Chain med live priser, men med falske penge. Du kan nulstille og starte forfra når som helst fra din wallet.</p>
        <StartPicker value={pick} onPick={setPick} />
        <button className="btn neon lg block" onClick={() => resetAccount(pick)}>
          Start med {pick} ETH
        </button>
      </div>
    </div>
  )
}
