"use client";

import { useEffect, useRef } from "react";

type Win = { x: number; y: number; lit: boolean; glow: number };
type Building = { x: number; w: number; h: number; layer: 0 | 1; antenna: boolean };
type Floater = { x: number; y: number; born: number; text: string };

const WIN = 5;
const GAP = 6;

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Skyline at night. Every lit window is a computer earning; new ones pop a payout. */
export default function NightCity({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let buildings: Building[] = [];
    let windows: Win[] = [];
    let floaters: Floater[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let last = 0;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const rand = seeded(7);
      buildings = [];
      windows = [];
      floaters = [];
      for (const layer of [0, 1] as const) {
        let x = -20;
        while (x < width + 20) {
          const w = layer === 0 ? 40 + rand() * 60 : 50 + rand() * 80;
          const max = layer === 0 ? height * 0.8 : height * 0.62;
          const h = (layer === 0 ? 0.45 : 0.25) * height + rand() * (max - 0.3 * height);
          buildings.push({ x, w, h, layer, antenna: rand() > 0.82 });
          if (layer === 1) {
            for (let wy = height - h + 12; wy < height - 8; wy += WIN + GAP) {
              for (let wx = x + 9; wx < x + w - 9; wx += WIN + GAP) {
                windows.push({ x: wx, y: wy, lit: rand() < 0.28, glow: 0.55 + rand() * 0.45 });
              }
            }
          }
          x += w + (layer === 0 ? 2 : 6 + rand() * 10);
        }
      }
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const b of buildings) {
        ctx.fillStyle = b.layer === 0 ? "#121836" : "#0d1229";
        ctx.fillRect(b.x, height - b.h, b.w, b.h);
        if (b.antenna) {
          const ax = b.x + b.w / 2;
          ctx.fillRect(ax - 1, height - b.h - 14, 2, 14);
          const on = reduced || Math.floor(now / 900) % 2 === 0;
          ctx.fillStyle = on ? "#ff5a5f" : "#5a2a3a";
          ctx.fillRect(ax - 2, height - b.h - 17, 4, 3);
        }
      }
      for (const w of windows) {
        if (!w.lit) {
          ctx.fillStyle = "#151b3a";
        } else {
          ctx.fillStyle = `rgba(255, 178, 36, ${w.glow})`;
        }
        ctx.fillRect(w.x, w.y, WIN, WIN + 2);
      }
      ctx.font = "600 12px ui-monospace, monospace";
      ctx.textAlign = "center";
      floaters = floaters.filter((f) => now - f.born < 1800);
      for (const f of floaters) {
        const t = (now - f.born) / 1800;
        ctx.fillStyle = `rgba(69, 240, 181, ${1 - t})`;
        ctx.fillText(f.text, f.x, f.y - 8 - t * 30);
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible) return;
      if (now - last > 140 && windows.length) {
        last = now;
        const w = windows[Math.floor(Math.random() * windows.length)];
        w.lit = !w.lit;
        if (w.lit && floaters.length < 6 && Math.random() < 0.45) {
          floaters.push({ x: w.x + 2, y: w.y, born: now, text: `+$0.0${1 + Math.floor(Math.random() * 8)}` });
        }
      }
      draw(now);
    };

    build();
    draw(0);
    if (!reduced) frame = requestAnimationFrame(loop);

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      build();
      draw(performance.now());
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
