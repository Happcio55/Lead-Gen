export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#5b3df5" />
      <path d="M19.5 8.5a8 8 0 1 0 4 14.9A9.5 9.5 0 0 1 19.5 8.5Z" fill="#c6f135" />
    </svg>
  );
}

export default function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className={`text-[17px] font-semibold tracking-tight ${dark ? "text-paper" : "text-ink"}`}>
        IdleAgents
      </span>
    </span>
  );
}
