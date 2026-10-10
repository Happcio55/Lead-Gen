export type FaqItem = { q: string; a: string };

export const faq: FaqItem[] = [
  {
    q: "What exactly runs on my computer?",
    a: "Containerised jobs from verified business customers: agent sessions, batch inference, test suites, rendering and similar compute. Every job runs in an isolated sandbox with no access to your files, camera, microphone or local network.",
  },
  {
    q: "How does IdleAgents know I'm away?",
    a: "You choose the rule: screen locked, no input for a set number of minutes, or a fixed schedule such as 23:00–07:00. The moment you touch your keyboard or mouse, the job is paused and your machine is yours again, usually in under a second.",
  },
  {
    q: "How much can I realistically earn?",
    a: "It depends on your hardware, how many hours you're away and current demand. A mid-range gaming GPU idle 8 hours a day typically earns $30–60 a month before electricity. The calculator above subtracts electricity, so you see what you'd actually keep. All figures are after our flat 20% fee.",
  },
  {
    q: "Will it wear out my hardware?",
    a: "Jobs run within the temperature and power limits you set. By default GPUs are capped at 80% power and 78 °C, which is gentler than most games. You can lower the caps at any time.",
  },
  {
    q: "How and when do I get paid?",
    a: "Earnings are settled every Monday for the previous week. Withdraw to your bank account (SEPA, ACH), PayPal or USDC. The minimum withdrawal is $10, and there are no withdrawal fees on bank transfers.",
  },
  {
    q: "Is my data safe?",
    a: "Jobs can't read your disk. They get an encrypted scratch volume that is wiped after every run, and network access is limited to the customer's own endpoints. The client is open source, and its sandbox is independently audited every year.",
  },
  {
    q: "Can I stop at any time?",
    a: "Yes. Pause from the tray icon, set quiet hours or uninstall. There's no contract and no minimum commitment. Unpaid earnings above $10 are paid out when you close your account.",
  },
];
