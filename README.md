# IdleAgents

Marketing site for IdleAgents. You install a desktop client that rents your idle CPU/GPU to sandboxed jobs while you're away, and you get paid weekly.

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Newsreader / Geist / Geist Mono.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

## Structure

- `app/` – layout, global styles/theme tokens, page
- `components/sections/` – one file per page section
- `data/` – typed mock data (hardware rates, live demand, payouts, FAQ, dashboard, setup snippets). Swap for a real API later.

All rates and figures are illustrative placeholders.
