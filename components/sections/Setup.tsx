"use client";

import { useState } from "react";
import { platforms } from "@/data/setup";
import SectionHeading from "@/components/SectionHeading";

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-ink-line bg-ink">
      <div className="flex items-center justify-between border-b border-ink-line px-4 py-2.5">
        <span className="font-mono text-xs text-muted-dark">{title}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              /* clipboard unavailable */
            }
          }}
          className="rounded-md border border-ink-line px-2 py-1 font-mono text-[11px] text-paper transition-colors hover:border-lime hover:text-lime"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-paper">
        {code.split("\n").map((line, i) => (
          <div key={i} className={line.trim().startsWith("#") ? "text-muted-dark" : ""}>
            {line || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}

const steps = [
  { title: "Install the client", body: "A 38 MB app that sits in your tray. Open source, signed and auto-updating." },
  { title: "Set your rules", body: "When to start, how hard to push and how hot your machine may run. The defaults are conservative." },
  { title: "Walk away", body: "That's it. Check earnings in the app or on the web, and get paid every Monday." },
];

export default function Setup() {
  const [active, setActive] = useState(platforms[0].id);
  const platform = platforms.find((p) => p.id === active) ?? platforms[0];

  return (
    <section id="setup" className="scroll-mt-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <SectionHeading
            eyebrow="Setup"
            title="Two commands, then go to bed."
            description="No accounts to link, no drivers to fiddle with. If your machine can run a modern game, it can run IdleAgents."
          />
          <ol className="mt-10 space-y-6">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet font-mono text-sm text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="mt-1 text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <div className="flex gap-1 rounded-xl border border-line bg-white p-1" role="tablist" aria-label="Operating system">
            {platforms.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active === p.id}
                onClick={() => setActive(p.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active === p.id ? "bg-ink text-paper" : "text-muted hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-3" role="tabpanel">
            <CodeBlock title="terminal" code={platform.install} />
            <CodeBlock title="config.toml · optional" code={platform.config} />
          </div>
          <p className="mt-4 text-sm text-muted">
            Prefer clicking? <a href="#" className="text-violet underline underline-offset-4">Download the installer</a>{" "}
            for {platform.label}.
          </p>
        </div>
      </div>
    </section>
  );
}
