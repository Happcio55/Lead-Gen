import { faq } from "@/data/faq";
import SectionHeading from "@/components/SectionHeading";

export default function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeading
          eyebrow="FAQ"
          title="Fair questions."
          description={
            <>
              Something we missed? Write to{" "}
              <a href="mailto:hello@idleagents.com" className="text-violet underline underline-offset-4">
                hello@idleagents.com
              </a>
              .
            </>
          }
        />
        <div className="divide-y divide-line border-y border-line">
          {faq.map((item) => (
            <details key={item.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line font-mono text-sm transition-transform group-open:rotate-45 group-open:border-violet group-open:bg-violet group-open:text-white"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-5 leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
