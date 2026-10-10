import { faq } from "@/data/faq";
import SectionHeading from "@/components/SectionHeading";

export default function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[1fr_1.5fr]">
        <SectionHeading
          title="Questions people ask before installing."
          description={
            <>
              Something else? Write to <span className="select-all text-fg">hello@idleagents.com</span>
            </>
          }
        />
        <div className="divide-y divide-line border-y border-line">
          {faq.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-lg transition-transform group-open:rotate-45 group-open:border-amber group-open:bg-amber group-open:text-night"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-6 leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
