import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store.js'
import { market, net, searchPools } from '../lib/api.js'
import { CHAINS, ACTIVE_CHAIN } from '../lib/chains.js'
import { paper, account, equityEth, resetAccount, START_OPTIONS, openPositions } from '../lib/paper.js'
import { fmtEth, fmtSignedEth, fmtPct, fmtCompact } from '../lib/format.js'
import { Icon, EthIcon, Mark, toast } from './ui.jsx'

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

function useEquity() {
  const p = useStore(paper)
  const pools = useStore(market, (s) => s.pools)
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const acct = account(p)
  const eq = equityEth(acct, pools, ethUsd)
  return { acct, eq, pnl: eq - acct.start, ethUsd }
}

function ChainPicker() {
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, setOpen)
  return (
    <div className="rel" ref={ref}>
      <button className="pill" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="chain-ic">{ACTIVE_CHAIN.short}</span>
        <span className="hide-s">{ACTIVE_CHAIN.name}</span>
        <Icon name="chev" size={12} />
      </button>
      {open && (
        <div className="pop" role="menu">
          <h4>Network</h4>
          {CHAINS.map((c) => (
            <button key={c.id} className="pop-item" disabled={!c.live} onClick={() => setOpen(false)}>
              <span className={'chain-ic' + (c.live ? '' : ' off')}>{c.short.slice(0, 3)}</span>
              {c.name}
              <span className="tag" style={{ color: c.live ? 'var(--lime)' : 'var(--bronze)' }}>{c.live ? 'Live' : 'Soon'}</span>
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

export function ResetPanel({ onDone }) {
  const [pick, setPick] = useState(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="lbl u">Reset balance</span>
      <StartPicker value={pick} onPick={setPick} />
      <button
        className="btn red block"
        disabled={!pick}
        onClick={() => {
          resetAccount(pick)
          setPick(null)
          toast('ok', 'Balance reset', `Fresh start with ${pick} ETH.`)
          onDone?.()
        }}
      >
        <Icon name="reset" size={13} />
        {pick ? `Reset to ${pick} ETH` : 'Pick a starting balance'}
      </button>
    </div>
  )
}

function Wallet() {
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, setOpen)
  const { acct, eq, pnl, ethUsd } = useEquity()
  return (
    <div className="rel" ref={ref}>
      <button className="pill" onClick={() => setOpen(!open)} aria-expanded={open} title="Paper wallet">
        <EthIcon />
        <b>{fmtEth(acct.eth, 3)}</b>
        <span className="sep" />
        <span className={pnl >= 0 ? 'up' : 'down'}>{fmtPct((pnl / acct.start) * 100)}</span>
        <Icon name="chev" size={12} />
      </button>
      {open && (
        <div className="pop wallet">
          <div>
            <span className="lbl u">Total value</span>
            <div className="big" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><EthIcon size={18} />{fmtEth(eq)}</div>
            <div className={pnl >= 0 ? 'up' : 'down'} style={{ fontWeight: 600 }}>
              {fmtSignedEth(pnl)} ETH ({fmtPct((pnl / acct.start) * 100)}) all time
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="kv"><span>Available</span><span>{fmtEth(acct.eth)} ETH</span></div>
            <div className="kv"><span>In positions</span><span>{fmtEth(eq - acct.eth)} ETH</span></div>
            <div className="kv"><span>Open positions</span><span>{openPositions(acct).length}</span></div>
            <div className="kv"><span>Starting balance</span><span>{acct.start} ETH</span></div>
            <div className="kv"><span>USD value</span><span>${fmtCompact(eq * ethUsd, 2)}</span></div>
          </div>
          <ResetPanel onDone={() => setOpen(false)} />
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
    const lower = s.toLowerCase()
    const local = Object.values(market.get().pools).find((p) => p.pool === lower || p.tokenAddress === lower || p.symbol?.toLowerCase() === lower.replace(/^\$/, ''))
    if (local) {
      location.hash = '#/t/' + local.pool
      setQ('')
      return
    }
    setBusy(true)
    try {
      const ids = await searchPools(s.replace(/^\$/, ''))
      if (ids.length) {
        location.hash = '#/t/' + ids[0]
        setQ('')
      } else toast('bad', 'No results', `Nothing on Robinhood Chain matches "${s}".`)
    } catch {
      toast('bad', 'Search failed', 'The data source did not respond. Try again shortly.')
    }
    setBusy(false)
  }
  return (
    <form className="search" onSubmit={go}>
      <Icon name="search" size={14} />
      <input ref={input} id="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={busy ? 'Searching…' : 'Search by token, ticker or CA…'} autoComplete="off" />
      <kbd>/</kbd>
    </form>
  )
}

export function TopBar({ route }) {
  return (
    <header className="top">
      <a href="#/" className="logo" aria-label="Paper Pulse">
        <Mark />
        <span className="word">Paper Pulse</span>
      </a>
      <nav className="nav">
        <a href="#/" className={route.name === 'pulse' ? 'on' : ''}>Pulse</a>
        <a href="#/portfolio" className={route.name === 'portfolio' ? 'on' : ''}>Portfolio</a>
      </nav>
      <Search />
      <div className="top-r">
        <ChainPicker />
        <Wallet />
      </div>
    </header>
  )
}

export function StatusBar() {
  const n = useStore(net)
  const ethUsd = useStore(market, (s) => s.ethUsd)
  const tracked = useStore(market, (s) => Object.keys(s.firstSeen).length)
  const { pnl, acct } = useEquity()
  const throttled = n.throttledUntil > Date.now()
  return (
    <footer className="status">
      <span className="paper">PAPER</span>
      <span><i className={'dot' + (throttled ? ' warn' : '')} />{throttled ? 'Rate limited, retrying' : 'Connection is stable'}</span>
      <span className="hide-m"><b>Robinhood Chain</b></span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><EthIcon size={12} /><b>${ethUsd ? ethUsd.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '…'}</b></span>
      <span className="hide-m">{tracked} pairs tracked</span>
      <span className="r">
        <span className="hide-m">Data: GeckoTerminal · DexScreener</span>
        <span>PnL <b className={pnl >= 0 ? 'up' : 'down'}>{fmtSignedEth(pnl, 3)} ETH</b> <span className={pnl >= 0 ? 'up' : 'down'}>({fmtPct((pnl / acct.start) * 100)})</span></span>
      </span>
    </footer>
  )
}

export function BottomNav({ route }) {
  return (
    <nav className="bottom-nav">
      <a href="#/" className={route.name === 'pulse' ? 'on' : ''}><Icon name="pulse" size={19} />Pulse</a>
      <a href="#/portfolio" className={route.name === 'portfolio' ? 'on' : ''}><Icon name="wallet" size={19} />Portfolio</a>
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
        <Mark size={34} />
        <h2 id="ob-h">Pick your paper balance</h2>
        <p>Trade real Robinhood Chain memecoins at live prices with paper ETH. Fills include real price impact from each pool's liquidity. Reset any time from your wallet.</p>
        <StartPicker value={pick} onPick={setPick} />
        <button className="btn lime lg block" onClick={() => resetAccount(pick)}>
          Start trading with {pick} ETH
        </button>
      </div>
    </div>
  )
}
