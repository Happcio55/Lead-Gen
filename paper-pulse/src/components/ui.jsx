import { useEffect, useState } from 'react'
import { createStore, useStore } from '../lib/store.js'

/* ---------------- icons ---------------- */
const P = {
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.3-4.3',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  chev: 'm6 9 6 6 6-6',
  back: 'M15 18l-6-6 6-6',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Zm14 6h.01',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  x: 'M4 4l16 16M20 4 4 20',
  tg: 'm21 4-18 7.5 6 2 2 6 3.5-4 5 3.5z',
  reset: 'M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0 0 12.5 2.5M18.5 9A7 7 0 0 0 6 6.5',
  chart: 'M4 20V10m6 10V4m6 16v-7m6 7H2',
}
export function Icon({ name, size = 16, stroke = 2, fill = false, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  )
}

/* ---------------- token logo with generated fallback ---------------- */
const SWATCH = [
  ['#c9ff3f', '#66aaa0'],
  ['#d0aa77', '#c9ff3f'],
  ['#8cc3ba', '#efefe9'],
  ['#e0c5a0', '#8a6134'],
  ['#b8f22e', '#2b5751'],
  ['#f6ecdd', '#bd9058'],
]
function hash(s = '') {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
export function TokenLogo({ pool, size = '', age, isNew }) {
  const [broken, setBroken] = useState(false)
  const src = pool?.image && !broken ? pool.image : null
  const h = hash(pool?.tokenAddress || pool?.pool || pool?.symbol)
  const [a, b] = SWATCH[h % SWATCH.length]
  const letters = (pool?.symbol || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'
  return (
    <div className={'tlogo ' + size}>
      {src ? (
        <img className="img" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <div className="img" style={{ background: `linear-gradient(${h % 360}deg, ${a}, ${b})` }}>{letters}</div>
      )}
      {age && <span className={'age' + (isNew ? ' new' : '')}>{age}</span>}
    </div>
  )
}

/* ---------------- clock for ticking ages ---------------- */
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
          <div className="t-ic">{t.kind === 'ok' ? '✓' : '!'}</div>
          <div>
            <div style={{ fontWeight: 700 }}>{t.title}</div>
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
      title="Kopiér adresse"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        }, () => {})
      }}
    >
      {done ? 'Kopieret' : label}
      <Icon name="copy" size={12} />
    </button>
  )
}

export function Socials({ pool, size = 13 }) {
  const items = []
  if (pool?.dexscreener || pool?.pool) items.push({ href: pool.dexscreener || `https://dexscreener.com/robinhood/${pool.pool}`, icon: 'chart', label: 'DexScreener' })
  for (const w of pool?.websites || []) items.push({ href: w.url, icon: 'globe', label: 'Hjemmeside' })
  for (const s of pool?.socials || []) {
    if (s.type === 'twitter') items.push({ href: s.url, icon: 'x', label: 'X' })
    if (s.type === 'telegram') items.push({ href: s.url, icon: 'tg', label: 'Telegram' })
  }
  return (
    <span className="c-icons">
      {items.slice(0, 4).map((i) => (
        <a key={i.href} href={i.href} target="_blank" rel="noreferrer" title={i.label} onClick={(e) => e.stopPropagation()}>
          <Icon name={i.icon} size={size} />
        </a>
      ))}
    </span>
  )
}
