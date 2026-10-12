import { useEffect, useState } from 'react'
import { createStore, useStore } from '../lib/store.js'
import { dexLabel } from '../lib/chains.js'

/* ---------------- icons ---------------- */
const P = {
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.3-4.3',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  chev: 'm6 9 6 6 6-6',
  back: 'M15 18l-6-6 6-6',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Zm14 6h.01',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  x: 'M4 4l16 16M20 4 4 20',
  tg: 'm21 4-18 7.5 6 2 2 6 3.5-4 5 3.5z',
  reset: 'M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0 0 12.5 2.5M18.5 9A7 7 0 0 0 6 6.5',
  chart: 'M4 20V10m6 10V4m6 16v-7m6 7H2',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
  download: 'M12 3v12m0 0-4-4m4 4 4-4M4 19h16',
  close: 'M6 6l12 12M18 6 6 18',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  filter: 'M3 5h18M6 12h12M10 19h4',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  fire: 'M12 22a7 7 0 0 0 7-7c0-4-3-6-4-9-1 2-2 3-4 3 0-2-1-4-3-6-1 5-3 7-3 12a7 7 0 0 0 7 7Z',
}
export function Icon({ name, size = 14, stroke = 2, fill = false, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  )
}

export function EthIcon({ size = 14 }) {
  return (
    <svg className="eth-ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 5 12.2 12 16l7-3.8z" fill="#c9cdfb" />
      <path d="M12 2v14l7-3.8z" fill="#8f95e8" />
      <path d="M5 13.6 12 22l7-8.4-7 3.8z" fill="#c9cdfb" />
      <path d="M12 17.4V22l7-8.4z" fill="#8f95e8" />
    </svg>
  )
}

export function Mark({ size = 26 }) {
  return (
    <span className="mark" style={{ width: size, height: size }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 13h4l3-7 5 13 3-6h5" />
      </svg>
    </span>
  )
}

/* ---------------- token logo with DEX ring ---------------- */
const DEX_COLOR = [
  [/uniswap/, '#ff4fc8'],
  [/pancake/, '#d6a35c'],
  [/pons/, '#c9ff3f'],
  [/clank/, '#9b7bff'],
  [/bankr/, '#ff8a3d'],
  [/virtuals/, '#5ee0ff'],
  [/sushi/, '#f05aa8'],
  [/hood|robin/, '#3ddc84'],
  [/frontier|launch|kickstart|mint/, '#f5c542'],
]
export const dexColor = (id = '') => (DEX_COLOR.find(([r]) => r.test(id)) || [0, '#4e5166'])[1]

const SWATCH = [
  ['#c9ff3f', '#66aaa0'],
  ['#d0aa77', '#c9ff3f'],
  ['#8cc3ba', '#efefe9'],
  ['#e0c5a0', '#8a6134'],
  ['#5ee0ff', '#2b5751'],
  ['#f6ecdd', '#bd9058'],
]
function hash(s = '') {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
export function TokenLogo({ pool, size = '', badge = true }) {
  const [broken, setBroken] = useState(false)
  const src = pool?.image && !broken ? pool.image : null
  const h = hash(pool?.tokenAddress || pool?.pool || pool?.symbol)
  const [a, b] = SWATCH[h % SWATCH.length]
  const letters = (pool?.symbol || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'
  const ring = dexColor(pool?.dex)
  return (
    <div className={'tlogo ' + size} style={{ '--ring': ring }}>
      {src ? (
        <img className="img" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <div className="img gen" style={{ background: `linear-gradient(${h % 360}deg, ${a}, ${b})` }}>{letters}</div>
      )}
      {badge && !size && <span className="badge" title={dexLabel(pool?.dex)}>{dexLabel(pool?.dex)[0]}</span>}
    </div>
  )
}

/* ---------------- clock ---------------- */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/* ---------------- toasts ---------------- */
const toasts = createStore({ list: [] })
export function toast(kind, title, body) {
  const id = Math.random()
  toasts.set((s) => ({ list: [...s.list.slice(-3), { id, kind, title, body }] }))
  setTimeout(() => toasts.set((s) => ({ list: s.list.filter((t) => t.id !== id) })), 4200)
}
export function Toasts() {
  const list = useStore(toasts, (s) => s.list)
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          <div className="ic">{t.kind === 'ok' ? '✓' : '!'}</div>
          <div>
            <b>{t.title}</b>
            {t.body && <div className="muted" style={{ marginTop: 2 }}>{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

export function CopyAddr({ value, label }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="copy"
      title="Copy address"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        }, () => {})
      }}
    >
      {done ? 'Copied' : label}
      <Icon name="copy" size={11} />
    </button>
  )
}

export function Socials({ pool, size = 13 }) {
  const items = []
  for (const w of pool?.websites || []) items.push({ href: w.url, icon: 'globe', label: 'Website' })
  for (const s of pool?.socials || []) {
    if (s.type === 'twitter') items.push({ href: s.url, icon: 'x', label: 'X' })
    if (s.type === 'telegram') items.push({ href: s.url, icon: 'tg', label: 'Telegram' })
  }
  if (pool?.symbol) items.push({ href: `https://x.com/search?q=${encodeURIComponent('$' + pool.symbol)}`, icon: 'search', label: `Search $${pool.symbol} on X` })
  return (
    <span className="icons">
      {items.slice(0, 4).map((i) => (
        <a key={i.href} href={i.href} target="_blank" rel="noreferrer" title={i.label} onClick={(e) => e.stopPropagation()}>
          <Icon name={i.icon} size={size} />
        </a>
      ))}
    </span>
  )
}

export const mcTier = (mc = 0) => (mc >= 1e6 ? 't3' : mc >= 1e5 ? 't2' : mc >= 3e4 ? 't1' : 't0')
