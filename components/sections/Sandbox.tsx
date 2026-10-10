import SectionHeading from "@/components/SectionHeading";

const blocked = ["Your files and photos", "Camera and microphone", "Your home network", "Passwords and browser data", "Other apps"];
const allowed = ["Spare GPU and CPU time", "A wiped, encrypted scratch disk", "Two approved internet addresses"];

export default function Sandbox() {
  return (
    <section id="safety" className="scroll-mt-20">
      <div className="mx-auto grid max-w-7xl gap-14 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <SectionHeading
            kicker="Safety"
            title="Your stuff stays yours."
            description="Every job runs sealed off from the rest of your computer. When it's done, its scratch disk is wiped. Only verified businesses can send jobs at all."
          />
          <dl className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              ["Open source", "Read every line of the client"],
              ["Audited", "Independent sandbox review each year"],
              ["Verified", "Business customers only, no anonymous jobs"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-display text-lg font-bold">{k}</dt>
                <dd className="mt-1 text-sm text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative rounded-3xl border border-line bg-night-2 p-6 sm:p-8">
          <p className="text-sm text-muted">Your computer</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {blocked.map((b) => (
              <li key={b} className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm text-muted">
                <svg viewBox="0 0 12 12" className="h-3 w-3 text-coral" aria-hidden="true">
                  <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span>
                  {b}
                  <span className="sr-only"> (no access)</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-2xl border-2 border-dashed border-amber/70 bg-amber/5 p-5">
            <p className="flex items-center gap-2 font-display text-lg font-bold text-amber">
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
                <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              The job&apos;s sandbox
            </p>
            <p className="mt-1 text-sm text-muted">The only things a job can touch:</p>
            <ul className="mt-4 space-y-2">
              {allowed.map((a) => (
                <li key={a} className="flex items-center gap-2.5 text-fg">
                  <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 text-mint" aria-hidden="true">
                    <path d="M2.5 6.5l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
