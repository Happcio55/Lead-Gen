import MachineCard from "@/components/MachineCard";

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-28">
        <div>
          <a
            href="#how-it-works"
            className="group inline-flex items-center gap-2 rounded-full border border-line bg-white/60 py-1 pl-1 pr-3 text-[13px] text-muted transition-colors hover:border-ink/30"
          >
            <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-lime">
              Payouts
            </span>
            <span>
              Weekly payouts are now live in 41 countries{" "}
              <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </a>

          <h1 className="mt-6 font-serif text-[44px] leading-[0.98] tracking-tight text-ink sm:text-6xl lg:text-[76px]">
            Your computer
            <br />
            works the <em className="text-violet">night shift.</em>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
            IdleAgents puts your idle CPU and GPU to work on sandboxed jobs from verified companies while you&apos;re
            away, and stops the second you&apos;re back. You get paid every Monday.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#setup"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet px-5 py-3 text-[15px] font-medium text-white transition-colors hover:bg-violet-deep"
            >
              Download for free
            </a>
            <a
              href="#earnings"
              className="inline-flex items-center justify-center rounded-lg border border-ink/15 bg-white px-5 py-3 text-[15px] font-medium text-ink transition-colors hover:border-ink/40"
            >
              Estimate my earnings
            </a>
          </div>

          <dl className="mt-12 grid max-w-md grid-cols-2 gap-6 border-t border-line pt-6">
            <div>
              <dt className="text-sm text-muted">Hands back control in</dt>
              <dd className="mt-1 font-mono text-2xl text-ink">&lt;1 s</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Setup or monthly fees</dt>
              <dd className="mt-1 font-mono text-2xl text-ink">$0</dd>
            </div>
          </dl>
        </div>

        <MachineCard />
      </div>
    </section>
  );
}
