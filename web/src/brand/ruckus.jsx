// Ruckus brand pieces: Rudy everywhere, orange look on top of the base theme.
import './ruckus.css';
import { Rudy } from '../Rudy.jsx';

export { Home } from '../RuckusHome.jsx';
export { NAME } from './ruckus.meta.js';

export const Logo = () => <Rudy mood="happy" size={40} track />;
export const Mascot = Rudy;
export const SyncMark = () => <Rudy mood="neutral" size={96} track />;
export const ToastMark = ({ kind }) => (
  <Rudy mood={kind === 'error' ? 'worried' : kind === 'success' ? 'cheer' : 'happy'} size={34} className="toast-rudy" />
);
