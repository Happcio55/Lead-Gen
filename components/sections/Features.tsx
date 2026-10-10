const features = [
  {
    n: "01",
    title: "Only when you're away",
    body: "Starts on screen lock, idle time or a schedule you set. Touch the mouse and your machine is yours again in under a second.",
  },
  {
    n: "02",
    title: "Sealed sandbox",
    body: "Jobs can't see your files, camera, microphone or home network. Every run gets a fresh encrypted volume that's wiped afterwards.",
  },
  {
    n: "03",
    title: "Paid every Monday",
    body: "Earnings settle weekly to your bank, PayPal or USDC. No minimum term, no fees on bank withdrawals.",
  },
];

export default function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
        {features.map((f) => (
          <div key={f.n} className="bg-paper p-6 sm:p-8">
            <p className="font-mono text-xs text-violet">{f.n}</p>
            <h3 className="mt-6 text-xl font-semibold tracking-tight">{f.title}</h3>
            <p className="mt-2 leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
