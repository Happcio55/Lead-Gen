import SectionHeading from "@/components/SectionHeading";

const steps = [
  {
    title: "You step away",
    body: "Lock the screen, go to bed, head to work. IdleAgents waits until your rules say you're really gone.",
    detail: "idle 15 min · plugged in",
    icon: (
      <path d="M20 6a10 10 0 1 0 6 18A12 12 0 0 1 20 6Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    ),
  },
  {
    title: "Your PC takes a job",
    body: "A verified company's workload runs in a sealed sandbox, within the power and heat limits you set.",
    detail: "sandboxed · GPU ≤ 80%",
    icon: (
      <>
        <rect x="5" y="9" width="22" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M5 14h22M12 9V6h8v3" fill="none" stroke="currentColor" strokeWidth="2" />
      </>
    ),
  },
  {
    title: "You get paid Monday",
    body: "Every minute is metered. Earnings settle weekly to your bank, PayPal or USDC. No fee on bank transfers.",
    detail: "min. withdrawal $10",
    icon: (
      <>
        <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M19.5 12.5c-.6-1.2-2-2-3.5-2-2 0-3.5 1.1-3.5 2.7 0 3.8 7 2 7 5.6 0 1.7-1.6 2.7-3.5 2.7-1.6 0-3-.8-3.6-2M16 8.5v15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
        <SectionHeading
          kicker="How it works"
          title={
            <>
              Away <span className="text-muted">→</span> Working <span className="text-muted">→</span> Paid
            </>
          }
          description="One loop that runs quietly in the background. You never pick jobs, manage servers or touch a setting after day one."
        />

        <ol className="mt-16 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl bg-night-2 p-7">
              <div className="flex items-center justify-between">
                <svg viewBox="0 0 32 32" className="h-10 w-10 text-amber" aria-hidden="true">
                  {s.icon}
                </svg>
                {i < steps.length - 1 && (
                  <span className="hidden font-display text-2xl text-line md:block" aria-hidden="true">
                    →
                  </span>
                )}
              </div>
              <h3 className="mt-10 font-display text-2xl font-bold tracking-tight">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-muted">{s.body}</p>
              <p className="mt-6 inline-block rounded-full bg-night-3 px-3 py-1 font-mono text-xs text-fg">{s.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
