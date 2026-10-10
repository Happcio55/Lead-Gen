"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "@/lib/hooks";
import { num } from "@/lib/format";

type Props = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function CountUp({ value, decimals = 0, prefix = "", suffix = "", duration = 1400, className }: Props) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  // Server render shows the final value, so the number is right without JS.
  const [display, setDisplay] = useState(value);
  const done = useRef(false);

  // Once JS runs, reset to zero so it can count up when scrolled into view.
  useEffect(() => {
    if (!prefersReducedMotion()) setDisplay(0);
  }, []);

  useEffect(() => {
    if (!inView || done.current) return;
    done.current = true;
    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, value, duration]);

  return (
    <span ref={ref} className={`tabular ${className ?? ""}`}>
      {prefix}
      {num(display, decimals)}
      {suffix}
    </span>
  );
}
