import CountUp from "@/components/CountUp";
import { queuedValue, workloads } from "@/data/demand";

export default function LiveDemand() {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-violet">Live demand</p>
          <p className="mt-3 font-mono text-4xl tracking-tight sm:text-5xl">
            <CountUp value={queuedValue} prefix="$" />
          </p>
          <p className="mt-1 text-sm text-muted">of paid work queued right now, waiting for machines</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-xs text-muted">
          <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-coral" aria-hidden="true" />
          updated 12s ago
        </span>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-muted">
              <th scope="col" className="pb-3 font-normal">Workload</th>
              <th scope="col" className="pb-3 text-right font-normal">Open jobs</th>
              <th scope="col" className="pb-3 text-right font-normal">Avg. rate</th>
              <th scope="col" className="w-[30%] pb-3 pl-6 font-normal">Unfilled</th>
            </tr>
          </thead>
          <tbody>
            {workloads.map((w) => (
              <tr key={w.name} className="border-b border-line last:border-0">
                <td className="py-3.5 pr-4">
                  <p className="font-medium">{w.name}</p>
                  <p className="text-xs text-muted">{w.description}</p>
                </td>
                <td className="py-3.5 text-right font-mono tabular">{w.openJobs.toLocaleString("en-US")}</td>
                <td className="py-3.5 text-right font-mono tabular">${w.rate.toFixed(2)}/h</td>
                <td className="py-3.5 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-2">
                      <div className="h-full rounded-full bg-violet" style={{ width: `${w.demand}%` }} />
                    </div>
                    <span className="w-9 text-right font-mono text-xs tabular text-muted">{w.demand}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
