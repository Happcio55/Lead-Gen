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
