"use client";

import { useId, useState } from "react";
import SectionHeading from "@/components/SectionHeading";

function Check({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-5 w-5 shrink-0 cursor-pointer rounded accent-amber"
    />
  );
}

export default function EarnMode() {
  const id = useId();
  const [idle, setIdle] = useState(15);
  const [plugged, setPlugged] = useState(true);
  const [gpu, setGpu] = useState(80);
  const [temp, setTemp] = useState(78);
  const [quiet, setQuiet] = useState(false);
  const [games, setGames] = useState(true);

  const parts = [
    `after ${idle} minutes away`,
    plugged && "only when plugged in",
    `using up to ${gpu}% of my GPU`,
    `below ${temp} °C`,
    quiet && "but never between 08:00 and 17:00",
    games && "and pause the second a game starts",
  ].filter(Boolean);

  return (
    <section id="earn-mode" className="scroll-mt-20 px-4 sm:px-6">
      <div className="mx-auto grid max-w-7xl items-center gap-12 rounded-[32px] bg-night-2 p-6 sm:p-12 lg:grid-cols-[1fr_1.05fr] lg:p-16">
        <div>
          <SectionHeading
            kicker="Earn Mode"
            title="Your rules. It sticks to them."
            description="IdleAgents only switches on when every condition is true, and switches off the instant one isn't. Gaming, a video call or a render of your own always wins."
          />
          <ul className="mt-8 space-y-3 text-fg">
            {["Defaults are conservative: cooler and quieter than most games", "Change any rule from the tray icon", "One click pauses everything"].map(
              (t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" aria-hidden="true" />
                  {t}
                </li>
              ),
            )}
          </ul>
        </div>

        <div className="rounded-3xl border border-line bg-night p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <p className="font-display text-xl font-bold">Earn Mode rules</p>
            <span className="rounded-full bg-mint/15 px-3 py-1 text-xs font-semibold text-mint">On</span>
          </div>

          <div className="mt-5 divide-y divide-line border-y border-line">
            <div className="flex items-center justify-between gap-4 py-4">
              <span className="text-fg">Start after I&apos;m away for</span>
              <div className="flex items-center rounded-full border border-line">
                <button type="button" aria-label="Fewer minutes" onClick={() => setIdle((v) => Math.max(5, v - 5))} className="h-9 w-9 text-lg text-muted hover:text-fg">
                  −
                </button>
                <span className="w-16 text-center font-mono text-sm tabular" aria-live="polite">
                  {idle} min
                </span>
                <button type="button" aria-label="More minutes" onClick={() => setIdle((v) => Math.min(60, v + 5))} className="h-9 w-9 text-lg text-muted hover:text-fg">
                  +
                </button>
              </div>
            </div>

            <label htmlFor={`${id}-plug`} className="flex cursor-pointer items-center gap-3 py-4">
              <Check id={`${id}-plug`} checked={plugged} onChange={setPlugged} />
              <span>Only when plugged in</span>
            </label>

            <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-4">
              <label htmlFor={`${id}-gpu`}>GPU limit</label>
              <span className="font-mono text-sm tabular">{gpu}%</span>
              <input id={`${id}-gpu`} type="range" min={20} max={100} step={5} value={gpu} onChange={(e) => setGpu(Number(e.target.value))} className="col-span-2 accent-amber" />
            </div>

            <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-4">
              <label htmlFor={`${id}-temp`}>Max temperature</label>
              <span className="font-mono text-sm tabular">{temp} °C</span>
              <input id={`${id}-temp`} type="range" min={60} max={85} value={temp} onChange={(e) => setTemp(Number(e.target.value))} className="col-span-2 accent-amber" />
            </div>

            <label htmlFor={`${id}-quiet`} className="flex cursor-pointer items-center gap-3 py-4">
              <Check id={`${id}-quiet`} checked={quiet} onChange={setQuiet} />
              <span>Never during work hours (08:00–17:00)</span>
            </label>

            <label htmlFor={`${id}-games`} className="flex cursor-pointer items-center gap-3 py-4">
              <Check id={`${id}-games`} checked={games} onChange={setGames} />
              <span>Pause when a game or video call starts</span>
            </label>
          </div>

          <p className="mt-5 rounded-2xl bg-night-3 p-4 leading-relaxed text-fg" aria-live="polite">
            <span className="text-muted">In plain words: </span>
            Work {parts.join(", ")}.
          </p>
        </div>
      </div>
    </section>
  );
}
