"use client";

import { useEffect, useState } from "react";
import { demoSteps } from "@/data/jobs";
import { usePrefersReducedMotion } from "@/lib/hooks";
import SectionHeading from "@/components/SectionHeading";

export default function JobDemo() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const step = demoSteps[active];

  useEffect(() => {
    if (!auto || reduced) return;
    const t = setInterval(() => setActive((a) => (a + 1) % demoSteps.length), 4200);
    return () => clearInterval(t);
  }, [auto, reduced]);

  return (
    <section id="how-it-works" className="scroll-mt-20 bg-ink text-paper">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          dark
          eyebrow="How it works"
          title="One night, start to finish."
          description="This is what the client does between you locking your screen and having coffee the next morning. Click through, or let it play."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[280px_1fr]">
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Steps">
            {demoSteps.map((s, i) => {
              const on = i === active;
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActive(i);
                      setAuto(false);
                    }}
                    aria-current={on ? "step" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                      on
                        ? "border-lime bg-lime text-ink"
                        : "border-ink-line text-paper hover:border-muted-dark"
                    }`}
                  >
                    <span className={`font-mono text-xs ${on ? "text-ink/70" : "text-muted-dark"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="whitespace-nowrap text-[15px] font-medium">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="overflow-hidden rounded-2xl border border-ink-line bg-ink-2">
            <div className="flex items-center justify-between border-b border-ink-line px-4 py-3">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-coral" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink-3" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink-3" />
              </div>
              <span className="font-mono text-xs text-muted-dark">idleagents · client log</span>
              <span className="font-mono text-xs text-lime">{step.time}</span>
            </div>
            <pre
              key={step.id}
              className="animate-feed-in min-h-[220px] overflow-x-auto p-5 font-mono text-[13px] leading-7 text-paper/90 sm:text-sm"
            >
              {step.log.map((line, i) => (
                <div key={i}>
                  <span className="text-muted-dark">{line.slice(0, 10)}</span>
                  <span className={i === step.log.length - 1 ? "text-lime" : ""}>{line.slice(10)}</span>
                </div>
              ))}
            </pre>
            <div className="flex gap-1 px-5 pb-5" aria-hidden="true">
              {demoSteps.map((s, i) => (
                <span key={s.id} className={`h-1 flex-1 rounded-full ${i <= active ? "bg-violet" : "bg-ink-3"}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
