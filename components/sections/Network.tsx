"use client";

import { useEffect, useState } from "react";
import SectionHeading from "@/components/SectionHeading";
import { workloads } from "@/data/demand";
import { initialPayouts, randomPayout, type Payout } from "@/data/payouts";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { ago, num, usd } from "@/lib/format";

export default function Network() {
  const reduced = usePrefersReducedMotion();
  const [machines, setMachines] = useState(workloads.map((w) => w.machines));
  const [rows, setRows] = useState<Payout[]>(initialPayouts.slice(0, 6));

  useEffect(() => {
    const t = setInterval(() => {
      setRows((r) => r.map((p) => ({ ...p, age: p.age + 1 })));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (reduced) return;
    let id = 100;
    const a = setInterval(() => setMachines((m) => m.map((v) => v + Math.round((Math.random() - 0.45) * 5))), 1800);
    const b = setInterval(() => {
      id += 1;
      setRows((r) => [randomPayout(id), ...r].slice(0, 6));
    }, 3600);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [reduced]);

  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
        <SectionHeading
          kicker="Right now on the network"
          title="What your computer could be doing tonight."
          description="Real companies pay for compute they can't get cheaply in the cloud. You never choose. The client matches your hardware to the best-paying job it can safely run."
        />

        <div className="mt-14 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <ul className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2">
            {workloads.map((w, i) => (
              <li key={w.name} className="bg-night-2 p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-bold tracking-tight">{w.name}</h3>
                  <span className="font-mono text-sm text-amber">${w.rate.toFixed(2)}/h</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{w.description}</p>
                <p className="mt-5 flex items-center gap-2 font-mono text-sm tabular">
                  <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-mint" aria-hidden="true" />
                  {num(machines[i])} <span className="text-muted">machines on it</span>
                </p>
              </li>
            ))}
          </ul>

          <div className="flex flex-col rounded-3xl border border-line bg-night-2 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold tracking-tight">Latest payouts</h3>
              <span className="flex items-center gap-2 text-xs font-semibold text-mint">
                <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-mint" aria-hidden="true" />
                Live
              </span>
            </div>
            <ul className="mt-4 flex-1 divide-y divide-line" aria-label="Latest payouts">
              {rows.map((p) => (
                <li key={p.id} className="animate-feed-in flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate">
                      {p.device} <span className="text-muted">· {p.city}</span>
                    </p>
                    <p className="font-mono text-xs text-muted tabular">
                      {p.hours.toFixed(1)} h · {ago(p.age)}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-mint tabular">+{usd(p.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">Anonymised weekly payouts. Cities are approximate.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
