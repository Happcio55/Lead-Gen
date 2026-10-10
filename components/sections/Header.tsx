"use client";

import { useState } from "react";
import Logo from "@/components/Logo";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#earn-mode", label: "Earn Mode" },
  { href: "#earnings", label: "Earnings" },
  { href: "#safety", label: "Safety" },
  { href: "#faq", label: "FAQ" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-line/70 bg-night/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <a href="#" aria-label="IdleAgents home">
          <Logo />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[15px] text-muted transition-colors hover:text-fg">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a href="#download" className="hidden px-3 py-2 text-[15px] text-fg hover:text-amber sm:inline-block">
            Log in
          </a>
          <a
            href="#download"
            className="rounded-full bg-amber px-4 py-2 text-[15px] font-semibold text-night transition-colors hover:bg-amber-deep"
          >
            Download
          </a>
          <button
            type="button"
            className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-line lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
              {open ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-line px-4 py-3 lg:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2.5 text-base text-fg">
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
