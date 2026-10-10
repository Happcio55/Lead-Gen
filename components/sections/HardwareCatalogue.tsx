"use client";

import { useMemo, useState } from "react";
import { hardware, monthlyGross, type Vendor } from "@/data/hardware";
import { usd } from "@/lib/format";
import SectionHeading from "@/components/SectionHeading";

const filters: ("All" | Vendor)[] = ["All", "NVIDIA", "AMD", "Apple", "Intel"];

const vendorColor: Record<Vendor, string> = {
  NVIDIA: "bg-lime text-ink",
  AMD: "bg-coral text-white",
  Apple: "bg-ink text-paper",
  Intel: "bg-violet text-white",
};

const demandStyle = {
  High: "text-violet",
  Medium: "text-ink",
  Low: "text-muted",
};

export default function HardwareCatalogue() {
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState<(typeof filters)[number]>("All");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hardware.filter(
      (h) =>
        (vendor === "All" || h.vendor === vendor) &&
        (!q || `${h.vendor} ${h.name}`.toLowerCase().includes(q)),
    );
  }, [query, vendor]);

  return (
    <section id="hardware" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <SectionHeading
            eyebrow="Supported hardware"
            title="Find your machine."
            description="Typical rates across our network over the last 30 days, after our fee. Monthly figures assume 8 idle hours a day."
          />
          <p className="font-mono text-sm text-muted">{hardware.length} devices · 3 operating systems</p>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block sm:w-80">
            <span className="sr-only">Search hardware</span>
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search, e.g. 4090 or M3"
              className="w-full rounded-lg border border-line bg-white py-2.5 pl-9 pr-3 text-[15px] outline-none focus:border-violet focus:ring-2 focus:ring-violet/20"
            />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by vendor">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setVendor(f)}
                aria-pressed={vendor === f}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  vendor === f ? "border-ink bg-ink text-paper" : "border-line bg-white text-ink hover:border-ink/40"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-muted">
                <th scope="col" className="px-5 py-3.5 font-normal">Device</th>
                <th scope="col" className="px-5 py-3.5 font-normal">Type</th>
                <th scope="col" className="px-5 py-3.5 text-right font-normal">Rate / hour</th>
                <th scope="col" className="px-5 py-3.5 text-right font-normal">Est. / month</th>
                <th scope="col" className="px-5 py-3.5 text-right font-normal">Demand</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id} className="border-b border-line transition-colors last:border-0 hover:bg-paper">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold ${vendorColor[h.vendor]}`}
                        aria-hidden="true"
                      >
                        {h.vendor[0]}
                      </span>
                      <div>
                        <p className="font-medium">{h.name}</p>
                        <p className="text-xs text-muted">{h.vendor}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted">
                    {h.kind} · {h.memory}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular">{usd(h.ratePerHour)}</td>
                  <td className="px-5 py-3.5 text-right font-mono font-medium tabular text-violet">
                    {usd(monthlyGross(h, 8), 0)}
                  </td>
                  <td className={`px-5 py-3.5 text-right font-mono text-xs ${demandStyle[h.demand]}`}>{h.demand}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted">
                    No match. If your device has 6 GB VRAM or more, or 8+ CPU cores, it&apos;s very likely supported.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
