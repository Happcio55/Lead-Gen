// Vestas orbital spark symbol.
export { Home } from '../VestasHome.jsx';
export { NAME } from './vestas.meta.js';

export const Logo = () => (
  <svg viewBox="0 0 48 48" width="38" height="38" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
    <rect x="1" y="1" width="46" height="46" rx="15" fill="#171b12"/>
    <ellipse cx="24" cy="24" rx="19" ry="10" transform="rotate(-35 24 24)" fill="none" stroke="#d0f65a" strokeWidth="1.5" opacity=".55"/>
    <path d="M28 5 29.5 18.5 42 23 28.5 26.5 20 43 18.5 29.5 6 25 19.5 21.5Z" fill="#d0f65a"/>
    <path d="m28 5 1.5 13.5L24 24Z" fill="#f5ffd5"/>
    <circle cx="38.5" cy="13" r="2.5" fill="#d0f65a"/>
  </svg>
);
export const Mascot = () => null;
export const SyncMark = () => <div className="pulse-dot" />;
export const ToastMark = () => <span className="toast-dot" />;
