export default function AnnouncementBar() {
  return (
    <div className="bg-violet text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-4 py-2 text-center text-[13px] sm:px-6">
        <span className="hidden rounded-full bg-lime px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-ink sm:inline">
          New
        </span>
        <span>
          Client 2.4 adds quiet hours and per-app pause rules.{" "}
          <a href="#setup" className="font-medium underline decoration-white/40 underline-offset-4 hover:decoration-white">
            See what changed →
          </a>
        </span>
      </div>
    </div>
  );
}
