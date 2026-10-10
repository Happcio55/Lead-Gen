"use client";

import { useId, useState } from "react";
import { hardware, monthlyGross, monthlyPowerCost } from "@/data/hardware";
import { usd } from "@/lib/format";

const QUICK = ["rtx-4090", "rtx-4070", "rtx-3060", "m2-pro", "rx-7800xt"];

export default function Calculator() {
  const id = useId();
  const [hwId, setHwId] = useState("rtx-4070");
  const [hours, setHours] = useState(10);
  const [kwh, setKwh] = useState("0.30");

  const hw = hardware.find((h) => h.id === hwId) ?? hardware[0];
  const price = Math.max(0, Number.parseFloat(kwh) || 0);
  const gross = monthlyGross(hw, hours);
  const power = monthlyPowerCost(hw, hours, price);
  const net = gross - power;

  return (
    <section id="earnings" className="scroll-mt-16 mt-24 bg-amber text-night sm:mt-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <h2 className="font-display text-4xl font-bold leading-[1.02] tracking-tight sm:text-[56px]">
            What&apos;s your machine worth while you sleep?
          </h2>
          <p className="mt-8 text-lg font-medium">You&apos;d keep about</p>
          <p className="font-display text-[88px] font-extrabold leading-none tracking-[-0.04em] tabular sm:text-[140px]" aria-live="polite">
            {usd(Math.max(0, net), 0)}
          </p>
          <p className="mt-2 text-lg font-medium">a month, after electricity.</p>
          <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-2 font-mono text-sm">
            <div className="flex gap-2">
              <dt className="opacity-70">Earned</dt>
              <dd className="tabular">{usd(gross)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="opacity-70">Power</dt>
              <dd className="tabular">−{usd(power)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="opacity-70">Per year</dt>
              <dd className="tabular">{usd(Math.max(0, net) * 12, 0)}</dd>
            </div>
          </dl>
        </div>

        <form className="rounded-3xl bg-night p-6 text-fg sm:p-8" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend className="text-sm font-semibold">Pick your hardware</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK.map((q) => {
                const h = hardware.find((x) => x.id === q)!;
                const on = hwId === q;
                return (
                  <button
                    key={q}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setHwId(q)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      on ? "border-amber bg-amber font-semibold text-night" : "border-line text-fg hover:border-muted"
                    }`}
                  >
                    {h.name.replace(/^(GeForce|Radeon) /, "")}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label htmlFor={`${id}-hw`} className="mt-5 block text-sm text-muted">
            Or find yours
          </label>
          <select
            id={`${id}-hw`}
            value={hwId}
            onChange={(e) => setHwId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-line bg-night-2 px-3 py-3 text-[15px] text-fg outline-none focus:border-amber"
          >
            {hardware.map((h) => (
              <option key={h.id} value={h.id}>
                {h.vendor} {h.name}
              </option>
            ))}
          </select>

          <div className="mt-7 flex items-baseline justify-between">
            <label htmlFor={`${id}-hours`} className="text-sm font-semibold">
              Hours away per day
            </label>
            <span className="font-mono text-sm tabular">{hours} h</span>
          </div>
          <input
            id={`${id}-hours`}
            type="range"
            min={1}
            max={20}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="mt-3 w-full accent-amber"
          />

          <label htmlFor={`${id}-kwh`} className="mt-7 block text-sm font-semibold">
            Your electricity price
          </label>
          <div className="mt-2 flex items-center rounded-xl border border-line bg-night-2 focus-within:border-amber">
            <span className="pl-3 font-mono text-muted">$</span>
            <input
              id={`${id}-kwh`}
              inputMode="decimal"
              value={kwh}
              onChange={(e) => setKwh(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-full bg-transparent px-2 py-3 font-mono text-[15px] outline-none"
            />
            <span className="pr-3 text-sm text-muted">per kWh</span>
          </div>

          <p className="mt-6 font-mono text-xs leading-relaxed text-muted">
            {usd(hw.ratePerHour)}/hr at {hw.watts} W · demand {hw.demand.toLowerCase()} · 30-day average after our fee
          </p>
        </form>
      </div>
    </section>
  );
}
