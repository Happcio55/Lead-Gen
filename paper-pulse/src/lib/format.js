const SUB = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n) => String(n).split('').map((d) => SUB[+d]).join('')

// Tiny prices the way trading terminals show them: 0.0₅1883 instead of 0.000001883
export function fmtTiny(n, sig = 4) {
  if (!isFinite(n) || n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1) return abs.toLocaleString('en-US', { maximumFractionDigits: abs >= 1000 ? 0 : 4 })
  if (abs >= 0.001) return abs.toPrecision(sig).replace(/0+$/, '').replace(/\.$/, '')
  const s = abs.toExponential(sig - 1) // e.g. 1.883e-6
  const [m, e] = s.split('e-')
  const zeros = +e - 1
  return `0.0${sub(zeros)}${m.replace('.', '').replace(/0+$/, '')}`
}

export function fmtPriceUsd(n) {
  if (!isFinite(n)) return '—'
  return '$' + fmtTiny(n)
}

export function fmtCompact(n, digits = 1) {
  if (!isFinite(n) || n === null) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(digits) + 'B'
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(digits) + 'M'
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(digits) + 'K'
  if (abs >= 1) return sign + abs.toFixed(abs >= 100 ? 0 : 1)
  if (abs === 0) return '0'
  return sign + fmtTiny(abs, 3)
}

export const fmtUsdC = (n, d = 2) => (!isFinite(n) || n === null ? '—' : (n < 0 ? '-$' : '$') + fmtCompact(Math.abs(n), d))

export function fmtEth(n, max = 4) {
  if (!isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs !== 0 && abs < 0.0001) return (n < 0 ? '-' : '') + fmtTiny(abs, 3)
  return n.toLocaleString('en-US', { minimumFractionDigits: abs >= 100 ? 2 : Math.min(2, max), maximumFractionDigits: abs >= 100 ? 2 : max })
}

export const fmtSignedEth = (n, max = 4) => (n >= 0 ? '+' : '-') + fmtEth(Math.abs(n), max)

export function fmtPct(n, digits = 1) {
  if (!isFinite(n)) return '—'
  const abs = Math.abs(n)
  const d = abs >= 1000 ? 0 : digits
  if (abs < 0.5 * 10 ** -digits) return (0).toFixed(digits) + '%'
  return (n >= 0 ? '+' : '-') + abs.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%'
}

export function fmtAge(ts, now = Date.now()) {
  if (!ts) return '—'
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h'
  const d = Math.floor(h / 24)
  if (d < 30) return d + 'd'
  return Math.floor(d / 30) + 'mo'
}

export function fmtTokens(n) {
  if (!isFinite(n)) return '—'
  return fmtCompact(n, 2)
}

export const shortAddr = (a = '') => (a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a)

export function parseAmount(s) {
  const v = parseFloat(String(s).replace(',', '.').replace(/[^\d.]/g, ''))
  return isFinite(v) ? v : NaN
}
