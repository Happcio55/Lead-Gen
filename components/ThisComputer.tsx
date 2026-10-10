"use client";

import { useEffect, useId, useState } from "react";
import Mascot from "@/components/Mascot";
import { hardware } from "@/data/hardware";
import { usePrefersReducedMotion } from "@/lib/hooks";

type Device = { gpu: string | null; threads: number | null; memory: number | null; mobile: boolean; rate: number };

const DEMO_SPEED = 60; // one real second shows one minute of earnings

function cleanRenderer(raw: string) {
  let s = raw;
  const angle = s.match(/^ANGLE \((.*)\)$/);
  if (angle) s = angle[1].split(", ")[1] ?? angle[1];
  s = s
    .replace(/ANGLE Metal Renderer: /, "")
    .replace(/ Direct3D.*$/, "")
    .replace(/ \(0x[0-9A-Fa-f]+\)/, "")
    .replace(/\/PCIe.*$/, "")
    .trim();
  if (/swiftshader|llvmpipe|software|microsoft basic/i.test(s)) return null;
  return s;
}

function detect(): Device {
  let gpu: string | null = null;
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && ext) gpu = cleanRenderer(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)));
  } catch {
    gpu = null;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lower = (gpu ?? "").toLowerCase();
  const match = hardware.find((h) => lower.includes(h.name.replace(/^(GeForce|Radeon) /, "").toLowerCase()));
  const fallback = /nvidia|geforce/.test(lower) ? 0.15 : /amd|radeon/.test(lower) ? 0.12 : /apple/.test(lower) ? 0.09 : 0.05;
  return {
    gpu,
    threads: nav.hardwareConcurrency || null,
    memory: nav.deviceMemory ?? null,
    mobile: /android|iphone|ipad/i.test(navigator.userAgent),
    rate: match?.ratePerHour ?? fallback,
  };
}

export default function ThisComputer() {
  const switchId = useId();
  const reduced = usePrefersReducedMotion();
  const [device, setDevice] = useState<Device | null>(null);
  const [on, setOn] = useState(true);
  const [earned, setEarned] = useState(1.2431);

  useEffect(() => setDevice(detect()), []);

  const rate = device?.rate ?? 0.15;

  useEffect(() => {
    if (!on || reduced) return;
    const t = setInterval(() => setEarned((e) => e + (rate / 3600) * DEMO_SPEED * 0.25), 250);
    return () => clearInterval(t);
  }, [on, rate, reduced]);

  const specs = [device?.threads && `${device.threads} threads`, device?.memory && `${device.memory}+ GB RAM`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="relative rounded-3xl border border-line bg-night-2/90 p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur sm:p-7">
      <div className="flex items-start gap-4">
        <Mascot awake={on} className="h-20 w-20 shrink-0 sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-sm text-muted">This computer</p>
          <p className="mt-0.5 truncate font-display text-xl font-bold" title={device?.gpu ?? undefined}>
            {device?.gpu ?? "Your graphics card"}
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted">{specs || "Reading your hardware…"}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-2xl bg-night-3 px-4 py-3.5">
        <label htmlFor={switchId} className="cursor-pointer">
          <span className="block font-semibold">Earn Mode</span>
          <span className={`block text-sm ${on ? "text-mint" : "text-muted"}`}>
            {on ? "Working a sandboxed job" : "Asleep · not earning"}
          </span>
        </label>
        <button
          id={switchId}
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => setOn((o) => !o)}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-mint" : "bg-line"}`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-night transition-[left] ${on ? "left-7" : "left-1"}`}
          />
        </button>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Tonight so far</p>
          <p className={`font-mono text-4xl font-medium tabular tracking-tight sm:text-5xl ${on ? "text-mint" : "text-muted"}`}>
            ${earned.toFixed(4)}
          </p>
        </div>
        <p className="pb-1.5 text-right font-mono text-xs text-muted">
          ≈ ${rate.toFixed(2)}/hr
          <br />
          preview at 60× speed
        </p>
      </div>

      <dl className="mt-6 grid gap-3 border-t border-line pt-5 text-sm">
        {[
          ["CPU", "up to 50%", 50],
          ["GPU", "up to 80%", 80],
        ].map(([k, v, pct]) => (
          <div key={k as string} className="grid grid-cols-[48px_1fr_auto] items-center gap-3">
            <dt className="text-muted">{k}</dt>
            <dd className="h-1.5 overflow-hidden rounded-full bg-night-3">
              <span
                className={`block h-full rounded-full transition-[width] duration-700 ${on ? "bg-amber" : "bg-line"}`}
                style={{ width: on ? `${pct}%` : "4%" }}
              />
            </dd>
            <dd className="font-mono text-xs text-muted">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-xs leading-relaxed text-muted">
        {device?.mobile
          ? "Phones aren't supported. Open this page on your desktop or laptop to see its numbers."
          : "Live preview. Your hardware is read by this browser tab and never leaves the page."}
      </p>
    </div>
  );
}
