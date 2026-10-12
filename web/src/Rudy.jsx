// Rudy the raccoon, Vestas' mascot. One SVG with four moods; eyes can follow the pointer.
import { useEffect, useRef } from 'react';

const WORD = { neutral: 'calm', happy: 'pleased', cheer: 'thrilled', worried: 'nervous' };

// Gradients live in one hidden <svg> so every Rudy on the page shares them.
export function RudyDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        <radialGradient id="rd-fur" cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#d9dee5" />
          <stop offset="0.55" stopColor="#a7b0bc" />
          <stop offset="1" stopColor="#7d8794" />
        </radialGradient>
        <linearGradient id="rd-mask" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b414c" />
          <stop offset="1" stopColor="#1c2027" />
        </linearGradient>
        <radialGradient id="rd-cheek" cx="50%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#fbf8f3" />
        </radialGradient>
        <radialGradient id="rd-nose" cx="40%" cy="30%" r="70%">
          <stop offset="0" stopColor="#4b525e" />
          <stop offset="1" stopColor="#101216" />
        </radialGradient>
        <radialGradient id="rd-gloss" cx="35%" cy="20%" r="60%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

// Moves the pupils of every Rudy marked data-track toward the pointer.
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
      for (const svg of document.querySelectorAll('.rudy[data-track]')) {
        const r = svg.getBoundingClientRect();
        if (!r.width) continue;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height * 0.52);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 300);
        const p = svg.querySelector('.r-pupils');
        if (p) p.style.transform = `translate(${((dx / d) * 6 * k).toFixed(2)}px, ${((dy / d) * 5 * k).toFixed(2)}px)`;
      }
    });
  });
}

export function Rudy({ mood = 'neutral', size = 64, track = false, blink = true, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (track) startTracking();
  }, [track]);
  return (
    <svg
      ref={ref}
      className={`rudy mood-${mood}${blink ? ' blink' : ''} ${className}`}
      data-track={track ? '1' : undefined}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`Rudy the raccoon, looking ${WORD[mood] || 'calm'}`}
    >
      <g className="r-head">
        <g className="r-spark" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round">
          <path d="M26 44 L12 32" />
          <path d="M174 44 L188 32" />
          <path d="M100 18 L100 4" />
        </g>
        <path d="M40 74 C30 44 40 18 60 20 C74 22 84 42 86 60 Z" fill="url(#rd-fur)" />
        <path d="M160 74 C170 44 160 18 140 20 C126 22 116 42 114 60 Z" fill="url(#rd-fur)" />
        <path d="M50 62 C46 44 51 32 60 33 C68 35 73 46 74 56 Z" fill="#1c2027" />
        <path d="M150 62 C154 44 149 32 140 33 C132 35 127 46 126 56 Z" fill="#1c2027" />
        <path d="M100 38 C152 38 180 66 180 114 C180 160 147 186 100 186 C53 186 20 160 20 114 C20 66 48 38 100 38 Z" fill="url(#rd-fur)" />
        <path d="M100 42 C93 54 92 66 100 78 C108 66 107 54 100 42 Z" fill="#7d8794" opacity="0.75" />
        <path
          d="M30 106 C34 82 60 74 82 86 C90 91 96 96 100 100 C104 96 110 91 118 86 C140 74 166 82 170 106 C172 124 156 134 136 128 C122 124 110 120 100 120 C90 120 78 124 64 128 C44 134 28 124 30 106 Z"
          fill="url(#rd-mask)"
        />
        <g className="r-brow-worry" stroke="#1c2027" strokeWidth="6" strokeLinecap="round">
          <path d="M54 74 L82 84" />
          <path d="M146 74 L118 84" />
        </g>
        <circle cx="72" cy="105" r="19" fill="#ffffff" />
        <circle cx="128" cy="105" r="19" fill="#ffffff" />
        <g className="r-pupils">
          <circle cx="74" cy="107" r="10.5" fill="#121418" />
          <circle cx="126" cy="107" r="10.5" fill="#121418" />
          <circle cx="78.5" cy="102" r="3.6" fill="#ffffff" />
          <circle cx="130.5" cy="102" r="3.6" fill="#ffffff" />
        </g>
        <circle className="r-lid" cx="72" cy="105" r="20" fill="#1c2027" />
        <circle className="r-lid" cx="128" cy="105" r="20" fill="#1c2027" />
        <ellipse cx="48" cy="146" rx="12" ry="7" fill="#ff8a4c" opacity="0.35" />
        <ellipse cx="152" cy="146" rx="12" ry="7" fill="#ff8a4c" opacity="0.35" />
        <path d="M62 146 C62 126 80 120 100 120 C120 120 138 126 138 146 C138 166 120 176 100 176 C80 176 62 166 62 146 Z" fill="url(#rd-cheek)" />
        <path d="M87 132 C87 124 113 124 113 132 C113 140 105 145 100 145 C95 145 87 140 87 132 Z" fill="url(#rd-nose)" />
        <ellipse cx="95" cy="129" rx="5" ry="2.4" fill="#ffffff" opacity="0.55" />
        <g stroke="#1c2027" strokeWidth="4.5" strokeLinecap="round" fill="none">
          <path className="r-mouth r-m-neutral" d="M90 157 Q100 162 110 157" />
          <path className="r-mouth r-m-happy" d="M84 153 Q100 169 116 153" />
          <path className="r-mouth r-m-worried" d="M88 163 Q100 155 112 163" />
        </g>
        <path className="r-mouth r-m-cheer" d="M82 152 Q100 178 118 152 Z" fill="#1c2027" stroke="#1c2027" strokeWidth="3" strokeLinejoin="round" />
        <path className="r-tongue" d="M91 162 Q100 175 109 162 Q100 157 91 162 Z" fill="#ff6f7d" />
        <path className="r-sweat" d="M170 70 C163 84 165 91 171 91 C177 91 179 84 170 70 Z" fill="#7cc4f2" />
        <path d="M100 38 C152 38 180 66 180 114 C150 80 60 70 24 100 C30 62 56 38 100 38 Z" fill="url(#rd-gloss)" />
      </g>
    </svg>
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
