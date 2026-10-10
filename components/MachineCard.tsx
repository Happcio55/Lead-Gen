"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks";

const RATE_PER_SEC = 0.27 / 3600;
const START_EARNED = 1.84;
const START_SECONDS = 6 * 3600 + 48 * 60 + 12;
const SPARK = [22, 30, 28, 46, 61, 72, 70, 78, 81, 79, 80, 82, 78, 80, 81, 79, 80, 80, 79, 81];

function hms(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export default function MachineCard() {
  const reduced = usePrefersReducedMotion();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [reduced]);

  const earned = START_EARNED + elapsed * RATE_PER_SEC;
  const progress = Math.min(100, 64 + elapsed * 0.02);
  const max = Math.max(...SPARK);
  const points = SPARK.map((v, i) => `${(i / (SPARK.length - 1)) * 100},${40 - (v / max) * 36}`).join(" ");

  return (
    <div className="relative">
      {/* colour block behind the card */}
      <div className="absolute -right-4 -top-4 bottom-8 left-8 rounded-2xl bg-lime sm:-right-6 sm:-top-6" aria-hidden="true" />

      <div className="relative rounded-2xl bg-ink p-5 text-paper shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-dark">Machine</p>
            <p className="mt-1 text-[15px] font-medium">DESKTOP-ATLAS</p>
            <p className="text-sm text-muted-dark">RTX 4080 Super · 16 GB</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-lime/10 px-3 py-1 font-mono text-xs text-lime">
            <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />
            Working
          </span>
        </div>

        <div className="mt-6 rounded-xl border border-ink-line bg-ink-2 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-dark">Earned tonight</p>
          <p className="mt-1 font-mono text-5xl tabular tracking-tight text-lime" aria-live="off">
            ${earned.toFixed(4)}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-dark tabular">
            away {hms(START_SECONDS + elapsed)} · $0.27/hr
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-ink-line p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-paper">Agent session</span>
            <span className="font-mono text-xs text-muted-dark">job 7f3a·c21</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-3">
            <div className="h-full rounded-full bg-violet transition-[width] duration-1000" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-xs text-muted-dark tabular">
            <span>{progress.toFixed(1)}%</span>
            <span>sandboxed · no file access</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            ["GPU load", "80%"],
            ["Temp", "71 °C"],
            ["Power", "256 W"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-ink-line px-3 py-2.5">
              <p className="text-[11px] text-muted-dark">{k}</p>
              <p className="font-mono text-sm text-paper">{v}</p>
            </div>
          ))}
        </div>

        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-4 h-12 w-full" aria-hidden="true">
          <polyline points={points} fill="none" stroke="#c6f135" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </svg>
        <p className="font-mono text-[11px] text-muted-dark">GPU utilisation · last 20 min · capped at 80%</p>
      </div>
    </div>
  );
}
