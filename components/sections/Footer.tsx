import Logo from "@/components/Logo";
import Mascot from "@/components/Mascot";

const platforms = [
  { name: "Windows", note: "10 and 11" },
  { name: "macOS", note: "Apple Silicon & Intel" },
  { name: "Linux", note: "Ubuntu, Fedora, Arch" },
];

export default function Footer() {
  return (
    <footer>
      <div id="download" className="scroll-mt-16 px-4 sm:px-6">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[32px] bg-violet px-6 py-14 sm:px-14 sm:py-20">
          <div className="relative z-10 max-w-2xl">
            <h2 className="font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-7xl">
              Leave it on tonight.
            </h2>
            <p className="mt-5 max-w-md text-lg text-white/80">
              Install takes two minutes. Pause or uninstall whenever you like, and keep everything you&apos;ve earned.
            </p>
            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {platforms.map((p) => (
                <a
                  key={p.name}
                  href="#download"
                  className="rounded-2xl bg-night px-5 py-4 transition-colors hover:bg-night-2"
                >
                  <span className="block font-semibold">Download for {p.name}</span>
                  <span className="block text-sm text-muted">{p.note}</span>
                </a>
              ))}
            </div>
          </div>
          <Mascot awake={false} className="absolute -bottom-6 right-4 hidden h-72 w-72 opacity-95 lg:block" />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-10 py-16 md:flex-row md:justify-between">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Spare computing power from people&apos;s own computers, for companies that need it.
            </p>
            <p className="mt-4 select-all font-mono text-sm text-amber">hello@idleagents.com</p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {[
              ["Product", ["How it works", "Earnings", "Hardware list", "Changelog"]],
              ["Trust", ["Safety", "Sandbox audit", "Source code", "Status"]],
              ["Company", ["About", "For businesses", "Careers", "Press"]],
            ].map(([title, links]) => (
              <nav key={title as string} aria-label={title as string}>
                <p className="text-sm font-semibold">{title}</p>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {(links as string[]).map((l) => (
                    <li key={l}>
                      <a href="#" className="text-muted hover:text-fg">
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-line py-8 text-xs text-muted md:flex-row md:justify-between">
          <p className="max-w-2xl leading-relaxed">
            Earnings depend on your hardware, hours, electricity price and demand, and are not guaranteed. Figures on
            this page are illustrative. You&apos;re responsible for taxes on your earnings.
          </p>
          <div className="flex shrink-0 gap-5">
            <a href="#" className="hover:text-fg">Terms</a>
            <a href="#" className="hover:text-fg">Privacy</a>
            <span>© 2026 IdleAgents</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
