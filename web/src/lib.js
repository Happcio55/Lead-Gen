// Shared browser helpers: chain client, formatting, local persistence.
import { createPublicClient, http } from 'viem';
import { robinhood } from '../../shared/chain.js';

// Reads go through our server's RPC proxy (no CORS issues, one place to swap providers).
export const chainClient = createPublicClient({
  chain: robinhood,
  transport: http('/api/rpc', { batch: { wait: 16 }, retryCount: 2 }),
});

// ---- formatting ----

export function usd(v, { compact = true } = {}) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (compact && a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (compact && a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (compact && a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  if (a >= 0.01) return `${sign}$${a.toFixed(2)}`;
  if (a === 0) return '$0';
  return `${sign}$${tiny(a)}`;
}

// 0.0000123 -> 0.0₄123 (subscript zero count), keeps tiny prices readable.
export function tiny(v) {
  if (v >= 0.001) return v.toPrecision(3);
  const s = v.toExponential(2); // e.g. 1.23e-7
  const [m, e] = s.split('e-');
  const zeros = Number(e) - 1;
  const sub = String(zeros).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[d]).join('');
  return `0.0${sub}${m.replace('.', '')}`;
}

export function eth(v, digits = 4) {
  if (v == null || !isFinite(v)) return '—';
  if (v === 0) return '0';
  if (Math.abs(v) < 0.0001) return v.toExponential(1);
  return Number(v.toFixed(digits)).toString();
}

export function pct(v, digits = 1) {
  if (v == null || !isFinite(v)) return '—';
  const s = Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(digits);
  return `${v > 0 ? '+' : ''}${s}%`;
}

export function num(v) {
  if (v == null) return '—';
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

export function age(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export const short = (a, n = 4) => (a ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : '');

export function hueOf(address) {
  let h = 0;
  for (let i = 2; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) % 360;
  return h;
}

// ---- persistence ----

export function load(key, fallback) {
  try {
    const v = localStorage.getItem(`surge.${key}`);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(`surge.${key}`, JSON.stringify(value));
  } catch {
    // storage full or blocked; settings just won't persist
  }
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
