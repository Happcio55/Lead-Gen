import Logo from "@/components/Logo";

const columns = [
  { title: "Product", links: ["How it works", "Earnings", "Hardware", "Changelog"] },
  { title: "Trust", links: ["Security", "Sandbox audit", "Open source", "Status"] },
  { title: "Company", links: ["About", "For businesses", "Careers", "Contact"] },
];

export default function Footer() {
  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <div className="rounded-2xl bg-violet p-6 sm:flex sm:items-center sm:justify-between sm:p-10">
          <div>
            <p className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Tonight, let it earn.</p>
            <p className="mt-2 text-white/75">Free to install. Pause or uninstall whenever you like.</p>
          </div>
          <a
            href="#setup"
            className="mt-6 inline-flex rounded-lg bg-lime px-5 py-3 text-[15px] font-medium text-ink transition-colors hover:bg-lime-deep sm:mt-0"
          >
            Download IdleAgents
          </a>
        </div>

        <div className="grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo dark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-dark">
              Spare compute from people&apos;s own computers, for companies that need it.
            </p>
            <a href="mailto:hello@idleagents.com" className="mt-4 inline-block font-mono text-sm text-lime hover:underline">
              hello@idleagents.com
            </a>
          </div>
          {columns.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-dark">{c.title}</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-paper/85 hover:text-lime">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-ink-line py-8 text-xs text-muted-dark md:flex-row md:justify-between">
          <p className="max-w-2xl leading-relaxed">
            Earnings depend on hardware, availability, electricity prices and market demand, and are not guaranteed.
            Rates and figures shown are illustrative. You are responsible for any taxes on your earnings.
          </p>
          <div className="flex shrink-0 gap-5">
            <a href="#" className="hover:text-paper">Terms</a>
            <a href="#" className="hover:text-paper">Privacy</a>
            <a href="#" className="hover:text-paper">X / Twitter</a>
            <span>© 2026 IdleAgents</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
