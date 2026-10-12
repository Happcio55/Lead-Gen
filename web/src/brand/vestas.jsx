// Lund's organic four-petal mark, on the page background without a badge.
export { Home } from '../VestasHome.jsx';
export { NAME } from './vestas.meta.js';

export const Logo = () => (
  <svg viewBox="0 0 48 48" width="38" height="38" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
    <defs>
      <linearGradient id="lund-sage" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a1aa81"/><stop offset=".45" stopColor="#7b8666"/><stop offset="1" stopColor="#586447"/></linearGradient>
      <linearGradient id="lund-olive" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#64704d"/><stop offset=".45" stopColor="#414d35"/><stop offset="1" stopColor="#2e3825"/></linearGradient>
    </defs>
    <path d="M22 24C11 25 5 20 6 11C16 9 23 13 22 24Z" fill="url(#lund-sage)"/>
    <path d="M26 24C24 12 31 5 41 7C43 18 36 25 26 24Z" fill="url(#lund-olive)"/>
    <path d="M23 27C33 24 40 29 40 39C29 43 22 38 23 27Z" fill="url(#lund-sage)"/>
    <path d="M20 28C22 39 14 45 6 40C4 31 10 26 20 28Z" fill="url(#lund-olive)"/>
  </svg>
);
export const Mascot = () => null;
export const SyncMark = () => <div className="pulse-dot" />;
export const ToastMark = () => <span className="toast-dot" />;
