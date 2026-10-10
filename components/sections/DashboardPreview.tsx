import CountUp from "@/components/CountUp";
import SectionHeading from "@/components/SectionHeading";
import { earningsByDay, jobBreakdown, kpis } from "@/data/dashboard";

const barColors = ["bg-violet", "bg-lime", "bg-coral", "bg-paper"];

export default function DashboardPreview() {
  const max = Math.max(...earningsByDay);

  return (
    <section id="dashboard" className="scroll-mt-20 bg-lime">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          eyebrow="Dashboard"
          title="Every cent, accounted for."
          description="See what ran, for how long, at what rate and what it cost you in power. Export it all as CSV when tax season comes."
          className="[&>p:first-child]:text-ink"
        />

        <div className="mt-12 rounded-2xl bg-ink p-4 text-paper sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-line pb-4">
            <div className="flex items-center gap-3">
              <span className="text-[15px] font-medium">DESKTOP-ATLAS</span>
              <span className="rounded-md bg-ink-3 px-2 py-0.5 font-mono text-xs text-muted-dark">RTX 4080 Super</span>
            </div>
            <div className="flex gap-1 rounded-lg bg-ink-2 p-1 font-mono text-xs" aria-hidden="true">
              <span className="rounded-md px-2.5 py-1 text-muted-dark">7d</span>
              <span className="rounded-md bg-ink-3 px-2.5 py-1 text-paper">14d</span>
              <span className="rounded-md px-2.5 py-1 text-muted-dark">30d</span>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-ink-line bg-ink-2 p-4">
                <dt className="text-xs text-muted-dark">{k.label}</dt>
                <dd className="mt-2 font-mono text-2xl tracking-tight sm:text-3xl">
                  {"text" in k ? (
                    <span className="text-lg sm:text-xl">{k.text}</span>
                  ) : (
                    <CountUp value={k.value} prefix={k.prefix} decimals={k.decimals} />
                  )}
                </dd>
                {k.delta && <p className="mt-1 font-mono text-xs text-lime">{k.delta}</p>}
              </div>
            ))}
          </dl>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-xl border border-ink-line bg-ink-2 p-4 sm:p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-sm">Net earnings per day</p>
                <p className="font-mono text-xs text-muted-dark">USD, after power</p>
              </div>
              <div className="mt-6 flex h-44 items-end gap-1.5 sm:gap-2" role="img" aria-label="Bar chart of daily net earnings over the last 14 days, between $0.92 and $3.24 per day">
                {earningsByDay.map((v, i) => (
                  <div key={i} className="group relative flex h-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-[3px] transition-colors ${i === earningsByDay.length - 1 ? "bg-lime" : "bg-violet group-hover:bg-lime"}`}
                      style={{ height: `${(v / max) * 100}%` }}
                    />
                    <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink group-hover:block">
                      ${v.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-dark">
                <span>Sep 27</span>
                <span>Oct 10</span>
              </div>
            </div>

            <div className="rounded-xl border border-ink-line bg-ink-2 p-4 sm:p-5">
              <p className="text-sm">By workload</p>
              <div className="mt-5 flex h-2 overflow-hidden rounded-full" aria-hidden="true">
                {jobBreakdown.map((j, i) => (
                  <div key={j.name} className={barColors[i]} style={{ width: `${j.share}%` }} />
                ))}
              </div>
              <ul className="mt-5 space-y-3.5">
                {jobBreakdown.map((j, i) => (
                  <li key={j.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2.5">
                      <span className={`h-2.5 w-2.5 rounded-sm ${barColors[i]}`} aria-hidden="true" />
                      {j.name}
                    </span>
                    <span className="font-mono text-muted-dark tabular">
                      {j.share}% · <span className="text-paper">${j.amount.toFixed(2)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
