"use client";

import { useId, useState } from "react";
import { hardware, monthlyGross, monthlyPowerCost } from "@/data/hardware";
import { usd } from "@/lib/format";

export default function EarningsCalculator() {
  const ids = { hw: useId(), hours: useId(), kwh: useId() };
  const [hwId, setHwId] = useState("rtx-4080s");
  const [hours, setHours] = useState(8);
  const [kwh, setKwh] = useState("0.30");
  const [shown, setShown] = useState(false);

  const hw = hardware.find((h) => h.id === hwId) ?? hardware[0];
  const price = Math.max(0, Number.parseFloat(kwh) || 0);
  const gross = monthlyGross(hw, hours);
  const power = monthlyPowerCost(hw, hours, price);
  const net = gross - power;

  return (
    <section id="earnings" className="scroll-mt-20 px-4 sm:px-6">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-violet text-white">
        <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:p-14">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-lime">Earnings calculator</p>
            <h2 className="mt-3 font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl">
              What&apos;s your idle time worth?
            </h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-white/75">
              Pick your hardware and how long you&apos;re usually away. We subtract the electricity, so you see what
              actually lands in your account.
            </p>
          </div>

          <form
            className="rounded-2xl bg-paper p-5 text-ink sm:p-7"
            onSubmit={(e) => {
              e.preventDefault();
              setShown(true);
            }}
          >
            <div className="grid gap-5">
              <div>
                <label htmlFor={ids.hw} className="text-sm font-medium">
                  Your hardware
                </label>
                <select
                  id={ids.hw}
                  value={hwId}
                  onChange={(e) => setHwId(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[15px] outline-none focus:border-violet focus:ring-2 focus:ring-violet/20"
                >
                  {hardware.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.vendor} {h.name} · {h.memory}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor={ids.hours} className="text-sm font-medium">
                    Hours away per day
                  </label>
                  <span className="font-mono text-sm tabular">{hours} h</span>
                </div>
                <input
                  id={ids.hours}
                  type="range"
                  min={1}
                  max={20}
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                  className="mt-3 w-full accent-violet"
                />
              </div>

              <div>
                <label htmlFor={ids.kwh} className="text-sm font-medium">
                  Electricity price
                </label>
                <div className="mt-2 flex items-center rounded-lg border border-line bg-white focus-within:border-violet focus-within:ring-2 focus-within:ring-violet/20">
                  <span className="pl-3 font-mono text-muted">$</span>
                  <input
                    id={ids.kwh}
                    inputMode="decimal"
                    value={kwh}
                    onChange={(e) => setKwh(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="w-full bg-transparent px-2 py-2.5 font-mono text-[15px] outline-none"
                  />
                  <span className="pr-3 text-sm text-muted">per kWh</span>
                </div>
              </div>

              <button
                type="submit"
                className="rounded-lg bg-ink px-5 py-3 text-[15px] font-medium text-paper transition-colors hover:bg-violet"
              >
                See what you&apos;d earn
              </button>
            </div>

            {shown && (
              <div className="animate-feed-in mt-6 border-t border-line pt-5" aria-live="polite">
                <dl className="grid grid-cols-3 gap-3">
                  <div>
                    <dt className="text-xs text-muted">Gross / month</dt>
                    <dd className="mt-1 font-mono text-lg tabular">{usd(gross)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Electricity</dt>
                    <dd className="mt-1 font-mono text-lg tabular text-muted">−{usd(power)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Net / month</dt>
                    <dd className={`mt-1 font-mono text-lg font-medium tabular ${net >= 0 ? "text-violet" : "text-coral"}`}>
                      {usd(net)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 rounded-lg bg-paper-2 px-3 py-2 font-mono text-xs text-muted">
                  ≈ {usd(net * 12, 0)} a year · {usd(hw.ratePerHour)}/hr at {hw.watts} W · demand {hw.demand.toLowerCase()}
                </p>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
