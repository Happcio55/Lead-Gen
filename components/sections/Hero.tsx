import NightCity from "@/components/NightCity";
import ThisComputer from "@/components/ThisComputer";

export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[radial-gradient(70%_60%_at_80%_0%,rgba(110,91,255,0.28),transparent_70%)]">
      {/* moon */}
      <div
        className="absolute -right-6 -top-6 -z-10 h-24 w-24 rounded-full sm:right-[8%] sm:top-10 bg-[#f4efd9] shadow-[0_0_80px_20px_rgba(244,239,217,0.15)] sm:h-32 sm:w-32"
        aria-hidden="true"
      >
        <span className="absolute left-5 top-6 h-4 w-4 rounded-full bg-[#e3dcc0]" />
        <span className="absolute bottom-7 right-6 h-6 w-6 rounded-full bg-[#e3dcc0]" />
      </div>
      <NightCity className="absolute inset-x-0 bottom-0 -z-10 h-[300px] w-full sm:h-[380px]" />
      <div
        className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-night to-transparent"
        aria-hidden="true"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-48 pt-16 sm:px-6 sm:pb-64 sm:pt-24 lg:grid-cols-[1.15fr_1fr] lg:gap-10">
        <div>
          <h1 className="font-display text-[52px] font-extrabold leading-[0.92] tracking-[-0.035em] sm:text-7xl lg:text-[96px]">
            Go to sleep.
            <br />
            <span className="text-amber">Your PC</span> clocks in.
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-relaxed text-muted sm:text-xl">
            IdleAgents rents out your computer&apos;s spare power to verified companies while you&apos;re away. It stops
            the moment you&apos;re back, and the money lands every Monday.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="#download"
              className="inline-flex items-center justify-center rounded-full bg-amber px-7 py-3.5 text-base font-semibold text-night transition-colors hover:bg-amber-deep"
            >
              Download free
            </a>
            <a
              href="#earnings"
              className="inline-flex items-center justify-center rounded-full border border-line bg-night-2/60 px-7 py-3.5 text-base font-semibold text-fg transition-colors hover:border-muted"
            >
              What would I earn?
            </a>
          </div>
          <p className="mt-6 text-sm text-muted">Windows, macOS and Linux · No card, no contract</p>
        </div>

        <ThisComputer />
      </div>
    </section>
  );
}
