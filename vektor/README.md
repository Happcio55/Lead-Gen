# Vektor

**Live:** https://lead-gen-vektor.vercel.app

A code-first AI assistant powered by Claude, built as a landing page you can put live in minutes.
Ask for a snippet, a fix or a smart contract and it streams back working code with one line of
explanation. Visitors can run JavaScript and Python answers in the browser, and any other site
can embed the assistant with one script tag.

## What's on the page

| Section | What it does |
| --- | --- |
| Hero | Animated vector field that bends around the pointer, a live typing terminal, token contract address (or "Soon") |
| Playground | Real streaming chat with Claude. Five modes: Code, Fix, Explain, Solidity, Translate. Shows Claude's reasoning summary, then the answer. Every code block has **▶ Run** (JS/Python), Save and Copy |
| Modes | Cards that jump into the playground in that mode |
| Live | API status with latency history, plus live token market data from DEX Screener (price, market cap, liquidity, volume, txns, 5m/1h/6h/24h change), refreshed every 15 s |
| Embed | Copy-paste `<script>` snippet and a button that previews the widget on the page |
| API | `curl` example for the public streaming endpoint |
| FAQ | Common questions |

## How it works

```
browser ──POST /api/chat──► api/chat.js ──stream──► Claude (Messages API)
   ▲          SSE events: thinking · text · done          │
   └──────────────────────────────────────────────────────┘
browser ──GET api.dexscreener.com──► live market data (no server needed)
browser ──Web Worker──► runs JS (5 s limit) or Python via Pyodide (20 s limit)
other sites ──embed.js──► iframe /widget (same chat, same origin, so no CORS needed)
```

- **Model**: `claude-opus-5-5` with adaptive thinking, summarized reasoning, and Anthropic's
  server-side fallback (`fallbacks: "default"`) so a declined request is retried on a fallback model.
- **Safety rails**: request validation (roles, lengths, history size), a per-visitor rate limit,
  and a capped `max_tokens`. The API key stays on the server.
- No build step. `public/` is plain HTML, CSS and ES modules.

## Put it live on Vercel

1. Get an API key at [console.anthropic.com](https://console.anthropic.com).
2. Open [vercel.com/new](https://vercel.com/new) and import this GitHub repo.
3. Set **Root Directory** to `vektor`. Keep the detected settings (they come from `vercel.json`).
4. Under **Environment Variables**, add `ANTHROPIC_API_KEY`. Then click **Deploy**.
5. Optional: add your own domain under **Settings → Domains**.

The status pill in the header turns green ("Online") once the key is set.

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | – | Required. Your Claude API key. |
| `VEKTOR_MODEL` | `claude-opus-5-5` | Model id. |
| `VEKTOR_EFFORT` | `low` | Thinking effort: `low`, `medium`, `high`, `xhigh`, `max`. Higher is slower and costs more. |
| `VEKTOR_MAX_TOKENS` | `8000` | Cap on each answer. |
| `RATE_LIMIT` / `RATE_WINDOW_MIN` | `30` / `10` | Requests per visitor per window (per server instance, best effort). For hard limits, add a rule in Vercel's firewall. |
| `ALLOWED_ORIGINS` | empty | Comma-separated origins allowed to call `/api/chat` directly from their own browser code (`*` for any). The embed widget does not need this. |

### Site settings

Edit `public/config.js`:

- `name`: brand name shown everywhere.
- `tokenTicker`, `tokenAddress`: once the address is set, the hero shows it with a copy button and
  the Live section shows market data from DEX Screener.
- `xUrl`, `githubUrl`: footer links (hidden when empty).

## Embed on another site

```html
<script src="https://YOUR-DOMAIN/embed.js" data-mode="code" data-accent="#8b6cff" async></script>
```

| Attribute | Values |
| --- | --- |
| `data-mode` | `code`, `fix`, `explain`, `solidity`, `translate` |
| `data-accent` | Any hex color for the launcher and highlights |
| `data-position` | `right` (default) or `left` |
| `data-target` | CSS selector: render the chat inline in that element instead of a floating launcher |
| `data-height` | Inline height, e.g. `700px` |
| `data-open` | `true` to open on load |

From the host page you can call `VektorEmbed.open()` and `VektorEmbed.close()`.

## API

```bash
curl -N https://YOUR-DOMAIN/api/chat \
  -H "content-type: application/json" \
  -d '{"mode":"code","messages":[{"role":"user","content":"Reverse a string in Go"}]}'
```

The response is `text/event-stream`. Each event is `data: {json}` with `type` one of
`thinking`, `text`, `notice`, `error`, and finally `done` (`model`, `stop`, `usage`).
`GET /api/health` returns `{ ok, model, modes }`.

## Run locally

Requires Node 22.

```bash
cd vektor
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run dev     # http://localhost:8800
npm test                                     # unit tests + the chat handler against a mock Claude API
```

Vektor is an independent project and is not affiliated with Anthropic.
