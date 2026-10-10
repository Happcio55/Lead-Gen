"use client";

import { useEffect, useState } from "react";
import { num, usd } from "@/lib/format";

export default function Ticker() {
  const [online, setOnline] = useState(18204);
  const [paid, setPaid] = useState(41880.12);
  const [jobs, setJobs] = useState(9311);

  useEffect(() => {
    const t = setInterval(() => {
      setOnline((v) => v + Math.round((Math.random() - 0.4) * 6));
      setPaid((v) => v + Math.random() * 0.9);
      setJobs((v) => v + Math.round((Math.random() - 0.5) * 8));
    }, 2000);
    return () => clearInterval(t);
  }, []);

  const items = [
    ["Machines online", num(online)],
    ["Paid this week", usd(paid)],
    ["Jobs running", num(jobs)],
    ["Avg. payout", "$0.21/hr"],
    ["Next payout", "Mon 09:00 UTC"],
  ];

  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={hidden || undefined}>
      {items.map(([k, v]) => (
        <li key={k} className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-muted">{k}</span>
          <span className="font-mono text-fg tabular">{v}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="overflow-hidden border-b border-line bg-night-2 text-[13px]">
      <div className="mx-auto flex max-w-7xl items-center">
        <span className="z-10 flex shrink-0 items-center gap-2 bg-night-2 py-2 pl-4 pr-4 font-semibold text-mint sm:pl-6">
          <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-mint" aria-hidden="true" />
          Live
        </span>
        <div className="flex min-w-0 flex-1 overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,#000_4%,#000_96%,transparent)]">
          <div className="animate-marquee flex">
            {row(false)}
            {row(true)}
          </div>
        </div>
      </div>
    </div>
  );
}
