import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store.js'
import { market, net, searchPools } from '../lib/api.js'
import { CHAINS, ACTIVE_CHAIN } from '../lib/chains.js'
import { paper, account, equityEth, resetAccount, START_OPTIONS, openPositions } from '../lib/paper.js'
import { fmtEth, fmtSignedEth, fmtPct, fmtCompact, fmtUsdC, fmtAge, shortAddr } from '../lib/format.js'
import { wallet, availableWallets, connect, disconnect } from '../lib/wallet.js'
import { storage } from '../lib/store.js'
import { Icon, EthIcon, toast, useNow } from './ui.jsx'

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

export function useTheme() {
  const [theme, setTheme] = useState(() => storage.get('paperpulse:theme', 'light'))
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    storage.set('paperpulse:theme', theme)
  }, [theme])
  return [theme, setTheme]
}

function Avatar({ address, size = 18 }) {
  const h = parseInt((address || '0x0').slice(2, 10), 16)
  return <span className="avatar" style={{ width: size, height: size, background: `conic-gradient(from ${h % 360}deg, #c9ff3f, #66aaa0, #d0aa77, #c9ff3f)` }} />
}

function WalletConnect() {
  const w = useStore(wallet)
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const ref = useClickAway(menu, setMenu)
  const now = useNow(5000)
  if (w.address)
    return (
      <div className="rel" ref={ref}>
        <button className="pill" onClick={() => setMenu(!menu)} aria-expanded={menu}>
          <Avatar address={w.address} />
          <span className="hide-s">{shortAddr(w.address)}</span>
          <i className={'sync ' + w.status} title={w.status === 'synced' ? 'Saved to cloud' : w.status} />
        </button>
        {menu && (
          <div className="pop wallet">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Avatar address={w.address} size={34} />
              <div>
                <b style={{ fontSize: 14 }}>{shortAddr(w.address)}</b>
                <div className="muted">{w.walletName || 'Wallet'} · Robinhood Chain</div>
              </div>
            </div>
            <div className="note">
              {w.status === 'error' ? w.error : w.status === 'syncing' ? 'Saving…' : w.lastSaved ? `Progress saved to your wallet · ${fmtAge(w.lastSaved, now)} ago` : 'Progress is saved to your wallet.'}
            </div>
            <button className="btn block" onClick={() => { disconnect(); setMenu(false); toast('ok', 'Wallet disconnected', 'You are trading as a guest on this device.') }}>Disconnect</button>
          </div>
        )}
      </div>
    )
  return (
    <>
      <button className="btn lime" style={{ height: 32, borderRadius: 999 }} onClick={() => setOpen(true)}>
        <Icon name="wallet" size={14} />Connect
      </button>
      {open && <ConnectModal onClose={() => setOpen(false)} />}
    </>
  )
}

function ConnectModal({ onClose }) {
  const w = useStore(wallet)
  const list = availableWallets()
  const busy = w.status === 'connecting' || w.status === 'signing' || w.status === 'syncing'
  return (
    <div className="scrim" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2>Connect wallet</h2>
          <button className="x" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        <p>Save your paper profit, positions and history to your wallet and pick up on any device. You only sign a message: no transaction, no gas, no access to your funds.</p>
        {list.length ? (
          <div className="wallet-list">
            {list.map((e) => (
              <button
                key={e.info.uuid}
                className="wallet-opt"
                disabled={busy}
                onClick={async () => {
                  const r = await connect(e)
                  if (r.ok) {
                    toast('ok', 'Wallet connected', 'Your paper account now follows this wallet.')
                    onClose()
                  }
                }}
              >
                {e.info.icon ? <img src={e.info.icon} alt="" width="28" height="28" /> : <Icon name="wallet" size={22} />}
                <b>{e.info.name}</b>
                <span className="muted" style={{ marginLeft: 'auto' }}>{busy ? (w.status === 'signing' ? 'Sign in your wallet…' : 'Connecting…') : 'Detected'}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="note">
            No wallet found in this browser. Install <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask</a>, <a href="https://rabby.io/" target="_blank" rel="noreferrer">Rabby</a> or <a href="https://www.coinbase.com/wallet/downloads" target="_blank" rel="noreferrer">Coinbase Wallet</a>, or open this site inside your wallet app's browser.
          </div>
        )}
        {w.status === 'error' && w.error && <div className="warn">{w.error}</div>}
      </div>
    </div>
  )
}

export function Ticker() {
  const ids = useStore(market, (s) => s.lists.new)
  const pools = useStore(market, (s) => s.pools)
  const items = ids.slice(0, 14).map((id) => pools[id]).filter(Boolean)
  const now = useNow(1000)
  if (!items.length) return <div className="ticker"><span className="tk-live"><i />LIVE</span><span className="muted-b">Loading new launches on Robinhood Chain…</span></div>
  const row = items.map((p) => (
    <a key={p.pool} href={'#/t/' + p.pool} className="tk-item">
      <b>${p.symbol}</b>
      <span>{fmtAge(p.createdAt, now)}</span>
      <span>MC {fmtUsdC(p.mc)}</span>
      <span className={(p.chg?.h1 || 0) >= 0 ? 'tk-up' : 'tk-down'}>{fmtPct(p.chg?.h1 || 0, 0)}</span>
    </a>
  ))
  return (
    <div className="ticker">
      <span className="tk-live"><i />LIVE</span>
      <div className="tk-track">
        <div className="tk-run">{row}{row}</div>
      </div>
    </div>
  )
}

export function TopBar({ route, theme, setTheme }) {
  return (
    <header className="top">
      <a href="#/" className="logo" aria-label="Paper Pulse">
        <img src="/logo-96.png" alt="" width="34" height="34" className="logo-img" />
        <span className="word">Paper<em>Pulse</em></span>
      </a>
      <nav className="nav">
        <a href="#/discover" className={route.name === 'discover' ? 'on' : ''}>Discover</a>
        <a href="#/" className={route.name === 'pulse' ? 'on' : ''}>Pulse</a>
        <a href="#/portfolio" className={route.name === 'portfolio' ? 'on' : ''}>Portfolio</a>
      </nav>
      <Search />
      <div className="top-r">
        <ChainPicker />
        <button className="pill icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Light mode' : 'Dark mode'} aria-label="Toggle theme">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
        </button>
        <Wallet />
        <WalletConnect />
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
      <a href="#/discover" className={route.name === 'discover' ? 'on' : ''}><Icon name="chart" size={19} />Discover</a>
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
        <img src="/logo-256.png" alt="" width="72" height="72" />
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
