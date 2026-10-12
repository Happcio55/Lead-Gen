import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useStore, storage } from '../lib/store.js'
import { market, pollNewPairs, pollTrending, pollTop, loadNewPairsPage2, prefetchCandles, refreshPrices } from '../lib/api.js'
import { pons } from '../lib/pons.js'
import { paper, account, buy, updateSettings } from '../lib/paper.js'
import { fmtAge, fmtUsdC, fmtPct, fmtEth, parseAmount, fmtCompact } from '../lib/format.js'
import { Icon, EthIcon, TokenLogo, Socials, CopyAddr, useNow, toast, mcTier, ChainMark } from '../components/ui.jsx'

const BOOT = Date.now()
// Stablecoins and wrapped majors are not memecoins; keep them off the board.
const NOT_MEME = /^(W?ETH|W?BTC|USD.*|SUSD|DAI|EURC|PYUSD|FDUSD|TUSD)$/i
const SPAM = /^\d+$/ // bots launch tokens named "52", "53", …

export function quickBuy(pool, eth) {
  const r = buy(pool, eth, 'quick')
  if (r.ok) toast('ok', `Bought ${pool.symbol} · ${fmtEth(eth)} ETH`, `Filled at ${fmtUsdC(r.trade.mc)} MC · ${(r.trade.impact * 100).toFixed(2)}% impact`)
  else toast('bad', 'Buy failed', r.msg)
  return r
}

/* ---------------- settings (per viewer) ---------------- */
const WINDOWS = [['5m', 'm5'], ['1h', 'h1'], ['6h', 'h6'], ['24h', 'h24']]
const METRICS = [
  ['mc', 'Market cap'],
  ['vol', 'Volume'],
  ['tx', 'Transactions'],
  ['liq', 'Liquidity'],
  ['holders', 'Buyers'],
  ['dev', 'Dev holding'],
  ['curve', 'Bonding curve'],
  ['chg', 'Price change'],
  ['buys', 'Buy share'],
  ['socials', 'Socials'],
]
const DEFAULT = {
  source: 'pons',
  win: 'h1',
  compact: false,
  show: { mc: true, vol: true, tx: true, liq: false, holders: true, dev: true, curve: true, chg: true, buys: true, socials: true },
  filters: {},
}
const FILTER_DEFAULT = { minMc: '', maxMc: '', minLiq: '', minVol: '', minTx: '', maxAge: '', minCurve: '', hideSpam: true, needSocials: false, sort: 'default' }
const loadPrefs = () => {
  const p = storage.get('paperpulse:pulse', {})
  return { ...DEFAULT, ...p, show: { ...DEFAULT.show, ...(p.show || {}) }, filters: p.filters || {} }
}

const COLS = {
  pons: [
    { key: 'new', title: 'New Pairs', sort: 'new', hint: 'Fresh Pons launches' },
    { key: 'final', title: 'Final Stretch', sort: 'curve', hint: 'Closest to migrating' },
    { key: 'migrated', title: 'Migrated', sort: 'migrated', hint: 'Graduated to Uniswap v4' },
  ],
  all: [
    { key: 'new', title: 'New Pairs', sort: 'new', hint: 'Every new pool on Robinhood Chain' },
    { key: 'trending', title: 'Trending', sort: 'default', hint: 'Trending this hour' },
    { key: 'top', title: 'Top Volume', sort: 'default', hint: 'Most traded today' },
  ],
}
const SORTS = [
  ['default', 'Default'],
  ['new', 'Newest'],
  ['mc', 'Market cap'],
  ['vol', 'Volume'],
  ['tx', 'Transactions'],
  ['chg', 'Price change'],
  ['curve', 'Curve progress'],
]

const pctCls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'muted')
const num = (v) => (v === '' || v == null ? null : parseAmount(v))

function applyFilters(items, f, win, colSort) {
  const out = items.filter((p) => {
    if (f.hideSpam && SPAM.test(p.symbol || '')) return false
    if (f.needSocials && !(p.socials?.length || p.websites?.length)) return false
    const mc = p.mc || 0
    if (num(f.minMc) != null && mc < num(f.minMc) * 1000) return false
    if (num(f.maxMc) != null && mc > num(f.maxMc) * 1000) return false
    if (num(f.minLiq) != null && (p.liq || 0) < num(f.minLiq) * 1000) return false
    if (num(f.minVol) != null && (p.vol?.[win] || 0) < num(f.minVol) * 1000) return false
    const tx = (p.txns?.[win]?.b || 0) + (p.txns?.[win]?.s || 0)
    if (num(f.minTx) != null && tx < num(f.minTx)) return false
    if (num(f.maxAge) != null && Date.now() - (p.createdAt || 0) > num(f.maxAge) * 60000) return false
    if (num(f.minCurve) != null && (p.progress ?? 100) < num(f.minCurve)) return false
    return true
  })
  const sort = f.sort && f.sort !== 'default' ? f.sort : colSort
  const key = {
    new: (p) => p.createdAt || 0,
    migrated: (p) => p.migratedAt || p.createdAt || 0,
    mc: (p) => p.mc || 0,
    vol: (p) => p.vol?.[win] || 0,
    tx: (p) => (p.txns?.[win]?.b || 0) + (p.txns?.[win]?.s || 0),
    chg: (p) => p.chg?.[win] || 0,
    curve: (p) => p.progress ?? 0,
  }[sort]
  return key ? out.sort((a, b) => key(b) - key(a)) : out
}

/* ---------------- card ---------------- */
const Card = memo(function Card({ pool, now, fresh, qb, held, prefs }) {
  const { win, show, compact } = prefs
  const tx = pool.txns?.[win] || pool.txns?.h24 || { b: 0, s: 0 }
  const total = tx.b + tx.s
  const buyPct = total ? (tx.b / total) * 100 : 50
  const go = () => (location.hash = '#/t/' + pool.pool)
  const hover = useRef(null)
  const warm = () => {
    hover.current = setTimeout(() => {
      prefetchCandles(pool.pool, '1m')
      import('./TokenPage.jsx')
    }, 150)
  }
  const wl = WINDOWS.find((w) => w[1] === win)[0]
  const migrated = pool.dex === 'pons-v2-dex'
  const ageTs = migrated && pool.migratedAt ? pool.migratedAt : pool.createdAt
  return (
    <div
      className={'card' + (fresh ? ' fresh' : '') + (compact ? ' compact' : '')}
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => e.key === 'Enter' && go()}
      onMouseEnter={warm}
      onMouseLeave={() => clearTimeout(hover.current)}
      onTouchStart={() => prefetchCandles(pool.pool, '1m')}
    >
      <div className="logo-col">
        <TokenLogo pool={pool} />
        {show.curve && pool.progress != null && !migrated && (
          <span className="curve" title={`Bonding curve ${pool.progress.toFixed(1)}% to migration`}>
            <i style={{ width: Math.max(3, pool.progress) + '%' }} />
          </span>
        )}
      </div>
      <div className="c-main">
        <div className="c-t">
          <b>{pool.symbol}</b>
          <span>{pool.name}</span>
          <CopyAddr value={pool.tokenAddress} label="" />
        </div>
        <div className="c-row">
          <span className={'age' + (now - (ageTs || now) > 3600000 ? ' old' : '')} title={migrated ? 'Since migration' : 'Since launch'}>{fmtAge(ageTs, now)}</span>
          {show.socials && <Socials pool={pool} size={12} />}
          {show.holders && pool.buyers > 0 && <span className="stat-i" title="Unique buyers seen"><Icon name="users" size={12} />{pool.buyers}</span>}
          {held && <span className="held">HOLDING</span>}
        </div>
        <div className="mets">
          {show.curve && pool.progress != null && !migrated && (
            <span className={'met ' + (pool.progress >= 70 ? 'up' : '')} title="Bonding curve progress"><i>BC</i>{pool.progress.toFixed(0)}%</span>
          )}
          {migrated && <span className="met up" title="Graduated to Uniswap v4"><i>DEX</i>v4</span>}
          {show.chg && <span className={'met ' + pctCls(pool.chg?.[win])}><i>{wl}</i>{fmtPct(pool.chg?.[win] || 0, 0)}</span>}
          {show.dev && pool.devPct != null && (
            <span className={'met ' + (pool.devPct > 10 ? 'down' : '')} title="Creator's share of supply"><i>DH</i>{pool.devPct < 0.1 ? '0' : pool.devPct.toFixed(1)}%</span>
          )}
          {show.buys && total > 0 && <span className={'met ' + (buyPct >= 50 ? 'up' : 'down')} title={`Share of buys, ${wl}`}><i>B</i>{Math.round(buyPct)}%</span>}
          {show.liq && pool.liq > 0 && <span className="met" title="Liquidity"><i>L</i>{fmtUsdC(pool.liq, 1)}</span>}
        </div>
      </div>
      <div className="c-r">
        {show.mc && <span className="mcv">MC<b className={mcTier(pool.mc)}>{fmtUsdC(pool.mc)}</b></span>}
        {show.vol && <span className="vv">V<b>{fmtUsdC(pool.vol?.[win] ?? pool.vol?.h24)}</b></span>}
        {show.tx && (
          <span className="txr">
            TX<b>{total < 1000 ? total : fmtCompact(total, 1)}</b>
            <span className="bar"><i style={{ width: buyPct + '%' }} /><i style={{ width: 100 - buyPct + '%' }} /></span>
          </span>
        )}
        <button
          className="qbuy"
          title={`Buy ${qb} ETH instantly`}
          onClick={(e) => {
            e.stopPropagation()
            quickBuy(pool, qb)
          }}
        >
          <Icon name="bolt" size={11} fill stroke={0} />
          {qb} ETH
        </button>
      </div>
    </div>
  )
})

/* ---------------- popovers ---------------- */
function usePop() {
  const [open, setOpen] = useState(false)
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
  }, [open])
  return [open, setOpen, ref]
}

function FilterPop({ col, value, onChange, count }) {
  const [open, setOpen, ref] = usePop()
  const f = { ...FILTER_DEFAULT, ...value }
  const set = (k, v) => onChange({ ...f, [k]: v })
  const active = Object.entries(f).filter(([k, v]) => k !== 'hideSpam' && k !== 'sort' && v !== '' && v !== false).length + (f.sort !== 'default' ? 1 : 0)
  const field = (k, label, unit) => (
    <label className="ff">
      <span>{label}</span>
      <span className="ff-in">
        <input id={`f-${col}-${k}`} inputMode="decimal" value={f[k]} placeholder="Any" onChange={(e) => set(k, e.target.value)} />
        {unit && <em>{unit}</em>}
      </span>
    </label>
  )
  return (
    <div className="rel" ref={ref}>
      <button className={'icon-sq' + (active ? ' on' : '')} onClick={() => setOpen(!open)} title="Filters" aria-expanded={open}>
        <Icon name="filter" size={13} />
        {active > 0 && <i className="dot-n">{active}</i>}
      </button>
      {open && (
        <div className="pop filter-pop">
          <div className="fp-h"><b>Filters</b><span className="muted">{count} shown</span></div>
          <div className="ff-grid">
            {field('minMc', 'Min MC', 'K$')}
            {field('maxMc', 'Max MC', 'K$')}
            {field('minLiq', 'Min liquidity', 'K$')}
            {field('minVol', 'Min volume', 'K$')}
            {field('minTx', 'Min txns', '')}
            {field('maxAge', 'Max age', 'min')}
            {field('minCurve', 'Min curve', '%')}
          </div>
          <label className="ff-check"><input type="checkbox" checked={f.hideSpam} onChange={(e) => set('hideSpam', e.target.checked)} />Hide numbered spam tickers</label>
          <label className="ff-check"><input type="checkbox" checked={f.needSocials} onChange={(e) => set('needSocials', e.target.checked)} />Only tokens with socials</label>
          <span className="lbl u" style={{ marginTop: 6 }}>Sort by</span>
          <div className="chips">
            {SORTS.map(([k, l]) => (
              <button key={k} className={'chip' + (f.sort === k ? ' on' : '')} onClick={() => set('sort', k)}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button className="btn sm" onClick={() => onChange({ ...FILTER_DEFAULT })}>Reset</button>
            <button className="btn sm lime" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DisplayPop({ prefs, setPrefs }) {
  const [open, setOpen, ref] = usePop()
  return (
    <div className="rel" ref={ref}>
      <button className="pill" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="sliders" size={13} />Display<Icon name="chev" size={12} />
      </button>
      {open && (
        <div className="pop display-pop">
          <span className="lbl u">Metrics window</span>
          <div className="seg big">
            {WINDOWS.map(([l, k]) => (
              <button key={k} className={prefs.win === k ? 'on' : ''} onClick={() => setPrefs({ win: k })}>{l}</button>
            ))}
          </div>
          <span className="lbl u">Show on cards</span>
          <div className="metric-grid">
            {METRICS.map(([k, l]) => (
              <label key={k} className="ff-check">
                <input type="checkbox" checked={!!prefs.show[k]} onChange={(e) => setPrefs({ show: { ...prefs.show, [k]: e.target.checked } })} />
                {l}
              </label>
            ))}
          </div>
          <span className="lbl u">Card size</span>
          <div className="seg big">
            <button className={!prefs.compact ? 'on' : ''} onClick={() => setPrefs({ compact: false })}>Comfortable</button>
            <button className={prefs.compact ? 'on' : ''} onClick={() => setPrefs({ compact: true })}>Compact</button>
          </div>
        </div>
      )}
    </div>
  )
}

function QuickBuyInput({ col, value }) {
  const [text, setText] = useState(String(value))
  return (
    <label className="qb" title="Quick buy amount for this column">
      <Icon name="bolt" size={12} fill stroke={0} />
      <input
        id={'qb-' + col}
        value={text}
        inputMode="decimal"
        aria-label="Quick buy amount in ETH"
        onChange={(e) => {
          setText(e.target.value)
          const v = parseAmount(e.target.value)
          if (v > 0) updateSettings({ quickBuy: { ...paper.get().settings.quickBuy, [col]: v } })
        }}
      />
      <EthIcon size={12} />
    </label>
  )
}

/* ---------------- page ---------------- */
export default function Pulse() {
  const lists = useStore(market, (s) => s.lists)
  const loaded = useStore(market, (s) => s.loaded)
  const pools = useStore(market, (s) => s.pools)
  const firstSeen = useStore(market, (s) => s.firstSeen)
  const ponsState = useStore(pons)
  const p = useStore(paper)
  const acct = account(p)
  const now = useNow(1000)
  const [prefs, setPrefsState] = useState(loadPrefs)
  const setPrefs = (patch) =>
    setPrefsState((s) => {
      const next = { ...s, ...patch }
      storage.set('paperpulse:pulse', next)
      return next
    })
  const [mobileCol, setMobileCol] = useState('new')
  const cols = COLS[prefs.source]

  // "All pairs" uses GeckoTerminal lists; Pons reads the chain (lib/pons.js, started in App)
  useEffect(() => {
    if (prefs.source !== 'all') return
    let alive = true
    const safe = (fn) => () => alive && !document.hidden && fn().catch(() => alive && setTimeout(() => alive && fn().catch(() => {}), 8000))
    safe(pollNewPairs)()
    setTimeout(safe(loadNewPairsPage2), 2500)
    safe(pollTrending)()
    safe(pollTop)()
    const a = setInterval(safe(pollNewPairs), 10000)
    const b = setInterval(safe(pollTrending), 45000)
    const c = setInterval(safe(pollTop), 60000)
    return () => {
      alive = false
      clearInterval(a)
      clearInterval(b)
      clearInterval(c)
    }
  }, [prefs.source])

  // migrated Pons tokens trade on Uniswap v4: keep their numbers fresh from DexScreener
  useEffect(() => {
    if (prefs.source !== 'pons') return
    const tick = () => !document.hidden && refreshPrices(pons.get().migratedIds.slice(0, 30))
    const t0 = setTimeout(tick, 1500)
    const id = setInterval(tick, 8000)
    return () => {
      clearTimeout(t0)
      clearInterval(id)
    }
  }, [prefs.source, ponsState.migratedIds.length])

  const source = prefs.source === 'pons'
    ? { new: ponsState.newIds, final: ponsState.finalIds, migrated: ponsState.migratedIds }
    : { new: lists.new, trending: lists.trending, top: lists.top }
  const ready = prefs.source === 'pons' ? { new: ponsState.ready, final: ponsState.ready, migrated: ponsState.ready } : loaded
  const qbs = p.settings.quickBuy || {}

  return (
    <main className="pulse">
      <div className="pulse-bar">
        <h1>Pulse <ChainMark size={20} /></h1>
        <div className="seg big src">
          <button className={prefs.source === 'pons' ? 'on' : ''} onClick={() => setPrefs({ source: 'pons' })} title="Pons launchpad, read live from the chain">
            Pons
          </button>
          <button className={prefs.source === 'all' ? 'on' : ''} onClick={() => setPrefs({ source: 'all' })} title="Every pool on Robinhood Chain">All pairs</button>
        </div>
        <div className="seg mobile-tabs" role="tablist">
          {cols.map((c) => (
            <button key={c.key} className={mobileCol === c.key ? 'on' : ''} onClick={() => setMobileCol(c.key)}>{c.title}</button>
          ))}
        </div>
        <div className="right">
          <div className="seg big">
            {WINDOWS.map(([l, k]) => (
              <button key={k} className={prefs.win === k ? 'on' : ''} onClick={() => setPrefs({ win: k })} title="Window for change, volume and transactions">{l}</button>
            ))}
          </div>
          <DisplayPop prefs={prefs} setPrefs={setPrefs} />
        </div>
      </div>

      <div className="board">
        {cols.map((c) => {
          const fkey = prefs.source + ':' + c.key
          const f = { ...FILTER_DEFAULT, ...(prefs.filters[fkey] || {}) }
          const raw = (source[c.key] || []).map((id) => pools[id]).filter((x) => x && !NOT_MEME.test(x.symbol || ''))
          const items = applyFilters(raw, f, prefs.win, c.sort)
          const qb = qbs[c.key] || qbs.new || 0.05
          return (
            <section key={c.key} className={'col col-' + c.key + (mobileCol === c.key ? ' show' : '')} aria-label={c.title}>
              <div className="col-head">
                <h3 title={c.hint}>{c.title}</h3>
                <span className="n">{items.length}</span>
                <QuickBuyInput col={c.key} value={qb} />
                <FilterPop col={fkey} value={prefs.filters[fkey]} count={items.length} onChange={(v) => setPrefs({ filters: { ...prefs.filters, [fkey]: v } })} />
              </div>
              <div className="col-list">
                {!ready[c.key] &&
                  Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="skel"><i /><span><b /><b /><b /></span></div>
                  ))}
                {ready[c.key] && !items.length && (
                  <div className="col-empty">
                    <b>Nothing matches right now</b>
                    <span>{raw.length ? 'Loosen the filters to see more.' : c.key === 'final' ? 'No token is past 25% of its bonding curve yet.' : 'Waiting for the next one on-chain…'}</span>
                  </div>
                )}
                {items.map((pool) => (
                  <Card
                    key={pool.pool}
                    pool={pool}
                    now={now}
                    qb={qb}
                    prefs={prefs}
                    held={acct.positions[pool.pool]?.tokens > 0}
                    fresh={c.key === 'new' && firstSeen[pool.pool] > BOOT + 6000 && now - firstSeen[pool.pool] < 2500}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
