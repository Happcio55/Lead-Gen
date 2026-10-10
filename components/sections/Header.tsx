"use client";

import { useState } from "react";
import Logo from "@/components/Logo";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#earnings", label: "Earnings" },
  { href: "#hardware", label: "Hardware" },
  { href: "#faq", label: "FAQ" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#" aria-label="IdleAgents home">
          <Logo />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-muted transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a href="#dashboard" className="hidden px-3 py-2 text-sm text-ink hover:text-violet sm:inline-block">
            Log in
          </a>
          <a
            href="#setup"
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-violet"
          >
            Download
          </a>
          <button
            type="button"
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
              {open ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-line px-4 py-3 md:hidden">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block py-2.5 text-base text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
