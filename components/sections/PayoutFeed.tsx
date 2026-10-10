"use client";

import { useEffect, useState } from "react";
import { initialPayouts, randomPayout, type Payout } from "@/data/payouts";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { ago, usd } from "@/lib/format";

const MAX_ROWS = 7;

export default function PayoutFeed() {
  const reduced = usePrefersReducedMotion();
  const [rows, setRows] = useState<Payout[]>(initialPayouts);

  // Age every row once a second.
  useEffect(() => {
    const t = setInterval(() => setRows((r) => r.map((p) => ({ ...p, age: p.age + 1 }))), 1000);
    return () => clearInterval(t);
  }, []);

  // Push a new payout every few seconds.
  useEffect(() => {
    if (reduced) return;
    let id = 100;
    const t = setInterval(() => {
      id += 1;
      setRows((r) => [randomPayout(id), ...r].slice(0, MAX_ROWS));
    }, 3800);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    <div className="flex flex-col rounded-2xl bg-ink p-5 text-paper sm:p-7">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-lime">Recent payouts</p>
        <span className="inline-flex items-center gap-2 font-mono text-xs text-muted-dark">
          <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />
          live
        </span>
      </div>

      <ul className="mt-6 flex-1 divide-y divide-ink-line" aria-label="Recent payouts">
        {rows.map((p) => (
          <li key={p.id} className="animate-feed-in flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[15px]">
                {p.device} <span className="text-muted-dark">· {p.city}</span>
              </p>
              <p className="font-mono text-xs text-muted-dark tabular">
                {p.hours.toFixed(1)} h · {ago(p.age)}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[15px] tabular text-lime">+{usd(p.amount)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-ink-line pt-4 text-xs text-muted-dark">
        Anonymised weekly payouts across the network. Cities are approximate.
      </p>
    </div>
  );
}
