"use client";

import { useEffect, useRef, useState } from "react";

const TEXT =
  "Most home computers are switched on for hours and do nothing for most of them. The hardware is paid for. The power is already on. IdleAgents gives those hours a job.";
const WORDS = TEXT.split(" ");

/** Words light up as the paragraph scrolls through the viewport. */
export default function Statement() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [lit, setLit] = useState(WORDS.length);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = (vh * 0.85 - r.top) / (r.height + vh * 0.35);
      setLit(Math.round(Math.max(0, Math.min(1, progress)) * WORDS.length));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
      <p
        ref={ref}
        className="max-w-5xl font-display text-[32px] font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-[64px]"
      >
        {WORDS.map((w, i) => (
          <span key={i} className={`transition-colors duration-300 ${i < lit ? "text-fg" : "text-line"}`}>
            {w}{" "}
          </span>
        ))}
      </p>
      <dl className="mt-16 grid max-w-4xl gap-8 border-t border-line pt-8 sm:grid-cols-3">
        {[
          ["16 h", "a typical desktop sits unused each day"],
          ["<1 s", "to hand your machine back when you return"],
          ["$0", "to install, keep or uninstall"],
        ].map(([v, k]) => (
          <div key={v}>
            <dt className="font-display text-5xl font-extrabold tracking-tight text-amber">{v}</dt>
            <dd className="mt-2 text-muted">{k}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
