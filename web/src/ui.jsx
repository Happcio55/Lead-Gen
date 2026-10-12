// Small shared UI pieces.
import { useEffect, useState } from 'react';
import { hueOf } from './lib.js';
import { dismiss, useStore } from './store.js';

// Logos that failed to load, so a broken image is never retried on re-render.
const brokenLogos = new Set();

// Token avatar: the official launch artwork when the token has one, otherwise a generated badge.
// `logo` undefined = try /api/logo for this token; null = known to have none.
export function Avatar({ token, symbol, size = 36, logo }) {
  const src = logo === undefined && token ? `/api/logo/${token}` : logo;
  const [failed, setFailed] = useState(() => !src || brokenLogos.has(src));
  useEffect(() => setFailed(!src || brokenLogos.has(src)), [src]);
  const h = hueOf(token || '0x0');
  const h2 = (h + 70) % 360;
  return (
    <div
      className={`avatar ${failed ? '' : 'has-img'}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `radial-gradient(120% 120% at 20% 10%, hsl(${h} 90% 62%), hsl(${h2} 80% 34%) 70%)`,
      }}
    >
      {failed ? (
        (symbol || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase() || '?'
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => {
            brokenLogos.add(src);
            setFailed(true);
          }}
        />
      )}
    </div>
  );
}

export function Spark({ data, width = 84, height = 26, className = '' }) {
  if (!data || data.length < 2) return <svg width={width} height={height} className={`spark ${className}`} />;
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || max || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} className={`spark ${up ? 'up' : 'down'} ${className}`} viewBox={`0 0 ${width} ${height}`}>
      <path d={`${d}L${width},${height}L0,${height}Z`} className="spark-fill" />
      <path d={d} className="spark-line" />
    </svg>
  );
}

export function Delta({ v, children }) {
  return <span className={v > 0 ? 'pos' : v < 0 ? 'neg' : 'flat'}>{children}</span>;
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          <span className="toast-dot" />
          <span className="toast-msg">{t.msg}</span>
          {t.link && (
            <a href={t.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              view ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, width = 520 }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function NumField({ label, value, onChange, suffix, step = 'any', placeholder = 'off' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-input">
        <input
          type="number"
          step={step}
          min="0"
          value={value || value === 0 ? value : ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

// Minimal line icons (own drawings), sized by font-size via 1em.
const ICONS = {
  search: 'M10.5 4a6.5 6.5 0 1 0 4 11.6l4.2 4.2 1.4-1.4-4.2-4.2A6.5 6.5 0 0 0 10.5 4Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z',
  copy: 'M8 3h10a2 2 0 0 1 2 2v10h-2V5H8V3Zm-3 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h10V9H5Z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3a15 15 0 0 0-1.2-5.3A8 8 0 0 1 18.9 11ZM12 4c.9 1.2 1.8 3.5 2 7h-4c.2-3.5 1.1-5.8 2-7Zm-2.7 1.7A15 15 0 0 0 8.1 11h-3a8 8 0 0 1 4.2-5.3ZM5.1 13h3a15 15 0 0 0 1.2 5.3A8 8 0 0 1 5.1 13ZM12 20c-.9-1.2-1.8-3.5-2-7h4c-.2 3.5-1.1 5.8-2 7Zm2.7-1.7a15 15 0 0 0 1.2-5.3h3a8 8 0 0 1-4.2 5.3Z',
  send: 'M3 11.5 21 4l-5.5 16-3.8-6.2L3 11.5Zm5.2.2 4.6 1.9 1.9 3.1 2.6-7.6-9.1 2.6Z',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
  sliders: 'M4 6h9v2H4V6Zm13 0h3v2h-3v2h-2V4h2v2ZM4 16h3v2H4v-2Zm7 0h9v2h-9v2H9v-6h2v2Zm-7-5h12v2H4v-2Zm16 0v2h-2v-2h2Z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm-7 11c0-3.3 3.1-6 7-6s7 2.7 7 6h-2c0-2.2-2.2-4-5-4s-5 1.8-5 4H2Zm15-9.1a3 3 0 0 0 0-5.8V2a5 5 0 0 1 0 9.8v-.9Zm2 2.6c1.8.9 3 2.5 3 4.5h-2c0-1.2-.8-2.3-2-3l1-1.5Z',
  wallet: 'M4 5h14a2 2 0 0 1 2 2v1h-2V7H4v10h14v-1h2v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm9 4h9v6h-9a3 3 0 0 1 0-6Zm0 2a1 1 0 0 0 0 2h7v-2h-7Z',
  layers: 'M12 2 2 7l10 5 10-5-10-5Zm-7.5 5L12 3.3 19.5 7 12 10.7 4.5 7ZM3 11.5l9 4.5 9-4.5 1 1.7-10 5-10-5 1-1.7Zm0 4 9 4.5 9-4.5 1 1.7-10 5-10-5 1-1.7Z',
};

export function Icon({ name, className = '' }) {
  return (
    <svg className={`ic ${className}`} viewBox="0 0 24 24" width="1em" height="1em" aria-hidden>
      <path d={ICONS[name]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
