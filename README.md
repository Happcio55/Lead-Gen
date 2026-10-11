# Sherwood

**Paper-trade every memecoin listed on Robinhood — with live prices, live charts and $10,000 of virtual cash.**

Sherwood is a static web app (no build step, no backend, no API keys). Open it, pick a coin, trade.

## Features

- **All 13 Robinhood memecoins** — DOGE, SHIB, PEPE, TRUMP, PENGU, BONK, FLOKI, WIF, CASHCAT (Robinhood Chain), PNUT, POPCAT, MOODENG, MEW. List and descriptions come from robinhood.com; logos are each project's official artwork (bundled in `assets/logos/`).
- **Live market data** — Coinbase Exchange and Kraken websockets stream every trade; CASHCAT is polled from its Robinhood Chain Uniswap pool via DexScreener. If websockets are blocked, REST polling takes over automatically.
- **Live charts** — TradingView Lightweight Charts with line/candle modes, volume, 1H · 1D · 1W · 1M · 3M ranges, and the current candle updating tick by tick. Hover to scrub the price, Robinhood-style.
- **Paper trading engine** — market and limit orders, buy in dollars or coin units, 25/50/75/Max shortcuts, review-then-confirm, average cost, realized and unrealized P&L. Limit orders fill automatically when the live price crosses.
- **Portfolio** — equity curve, allocation donut, holdings, open orders, full activity log with CSV export, and account reset.
- Watchlist, search (`/`), 24h movers, ticker tape, dark + light themes, and a phone layout.

Everything you do is stored in your browser's `localStorage`.

## Run it

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or deploy the folder as-is to GitHub Pages, Netlify, Vercel, etc.

## Data sources

| What | Source |
| --- | --- |
| Live prices | Coinbase Exchange WS, Kraken WS v2, DexScreener |
| Candles | Coinbase Exchange, Kraken, GeckoTerminal |
| Supply / rank | CoinGecko |
| Coin list, descriptions | robinhood.com |

## Disclaimer

Sherwood is an independent simulator. It uses virtual money only, is not investment advice, and is not affiliated with, endorsed by, or connected to Robinhood Markets, Inc. All logos and trademarks belong to their respective owners.
