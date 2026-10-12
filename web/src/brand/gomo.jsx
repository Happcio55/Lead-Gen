// Gomo brand pieces: the lightning orb, no mascot.
export { Home } from '../GomoHome.jsx';
export { NAME } from './gomo.meta.js';

export const Logo = () => (
  <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
    <defs>
      <radialGradient id="orb" cx="35%" cy="30%" r="75%">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.45" stopColor="#e9f9b8" />
        <stop offset="1" stopColor="#9fc21c" />
      </radialGradient>
    </defs>
    <circle cx="16" cy="16" r="14" fill="url(#orb)" stroke="rgba(20,20,20,.12)" />
    <path d="M17.6 7 10 17.4h5.2l-1.4 7.6 8-10.6h-5.3z" fill="#141414" />
  </svg>
);
export const Mascot = () => null;
export const SyncMark = () => <div className="pulse-dot" />;
export const ToastMark = () => <span className="toast-dot" />;
