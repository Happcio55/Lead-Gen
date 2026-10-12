// Rudy the raccoon, Vestas' mascot: a rendered 3D character in four moods. Tracked Rudys lean
// toward the pointer.
import { useEffect } from 'react';

const WORD = { neutral: 'calm', happy: 'pleased', cheer: 'thrilled', worried: 'nervous' };
const MOODS = ['neutral', 'happy', 'cheer', 'worried'];

// Tilts every Rudy marked data-track a little toward the pointer.
let tracking = false;
function startTracking() {
  if (tracking || typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  tracking = true;
  let frame = 0;
  window.addEventListener('pointermove', (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const img of document.querySelectorAll('.rudy[data-track]')) {
        const r = img.getBoundingClientRect();
        if (!r.width) continue;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 400);
        const s = r.width / 100;
        img.style.translate = `${((dx / d) * 2.5 * s * k).toFixed(2)}px ${((dy / d) * 1.5 * s * k).toFixed(2)}px`;
        img.style.rotate = `${((dx / d) * 4 * k).toFixed(2)}deg`;
      }
    });
  });
}

export function Rudy({ mood = 'neutral', size = 64, track = false, className = '' }) {
  useEffect(() => {
    if (track) startTracking();
  }, [track]);
  const m = MOODS.includes(mood) ? mood : 'neutral';
  return (
    <img
      className={`rudy mood-${m} ${className}`}
      data-track={track ? '1' : undefined}
      src={`/rudy/rudy-${m}${size > 80 ? '' : '-sm'}.webp`}
      width={size}
      height={size}
      alt={`Rudy the raccoon, looking ${WORD[m]}`}
      draggable={false}
      decoding="async"
    />
  );
}

// Rudy's read on a pool: the first red flag he finds, or a thumbs-up.
export function rudyRead(r, now = Date.now()) {
  if (!r) return null;
  const NO_HOOK = '0x0000000000000000000000000000000000000000';
  if (r.liqUsd > 0 && r.mcapUsd > 50_000 && r.mcapUsd / r.liqUsd > 2000)
    return { kind: 'warn', text: `Market cap is ${Math.round(r.mcapUsd / r.liqUsd)}× the liquidity. That price won't hold if you sell.` };
  if (r.fee & 0x800000) return { kind: 'warn', text: 'Dynamic fee pool. The hook can change the fee on every swap, including yours.' };
  if (r.fee >= 50_000) return { kind: 'warn', text: `This pool charges a ${(r.fee / 10_000).toFixed(1)}% swap fee. That eats into every trade.` };
  if (r.hooks && r.hooks !== NO_HOOK) return { kind: 'warn', text: 'This pool runs a custom hook. Hooks can add rules to buying and selling.' };
  if (r.liqUsd > 0 && r.liqUsd < 3000) return { kind: 'warn', text: `Only $${Math.round(r.liqUsd).toLocaleString('en-US')} of liquidity. Bigger trades will move the price a lot.` };
  if (now - r.createdAt < 10 * 60_000) return { kind: '', text: 'Brand new, under ten minutes old. Things move fast here.' };
  const tx = r.buys5m + r.sells5m;
  if (tx >= 10 && r.buys5m / tx >= 0.65) return { kind: 'good', text: `${Math.round((r.buys5m / tx) * 100)}% of trades in the last 5 minutes were buys.` };
  return { kind: 'good', text: 'Normal fee, no hook, real liquidity. Nothing scary so far.' };
}
