// Vestas split-wing monogram, shared visually with the favicon.
export { Home } from '../VestasHome.jsx';
export { NAME } from './vestas.meta.js';

export const Logo = () => (
  <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
    <rect x="1" y="1" width="38" height="38" rx="12" fill="#171b12"/>
    <path d="M7 10h8l6 14-4 8z" fill="#d0f65a"/>
    <path d="M25 10h8L21 32h-4z" fill="#d0f65a"/>
    <path d="M26.7 10H33l-3.1 5.7h-6.3z" fill="#f5ffd5"/>
  </svg>
);
export const Mascot = () => null;
export const SyncMark = () => <div className="pulse-dot" />;
export const ToastMark = () => <span className="toast-dot" />;
