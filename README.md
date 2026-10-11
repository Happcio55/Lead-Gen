# Sherwood

**Paper-trade Robinhood's 100 most popular stocks and ETFs, plus Robinhood's memecoins, with real quotes, live charts and $10,000 of virtual cash.**

## Features

- **Robinhood's 100 Most Popular**: NVDA, AAPL, TSLA, AMZN, MSFT, META, GOOGL, PLTR, HOOD, VOO, SPY, QQQ and the rest, in Robinhood's own order. Each company shows its official logo (ETFs show their issuer's).
- **Robinhood market data**: quotes including after-hours and 24 Hour Market prices, market hours, fundamentals (market cap, P/E, dividend yield, volume, 52-week range), company profile and analyst ratings with bull and bear cases.
- **Live charts**: 1D · 1W · 1M · 3M · 1Y · 5Y in line or candle mode, with volume and a previous-close line on 1D. Hover to scrub the price, Robinhood-style.
- **Paper trading**: fractional shares, buy in dollars or shares, market and limit orders, review-then-confirm, average cost, realized and unrealized P&L. Limit orders fill automatically when the price crosses.
- **Crypto tab**: the 13 memecoins on Robinhood Crypto (DOGE, SHIB, PEPE, TRUMP, BONK, CASHCAT and more), streaming from Coinbase and Kraken, trading 24/7.
- Portfolio with equity curve and allocation, activity log with CSV export, watchlist, search (`/`), market-status indicator, dark and light themes, and a phone layout.

Everything you do is stored in your browser's `localStorage`.

## Run it

```bash
node server.js          # Node 18+, no dependencies
# open http://localhost:8000
```

`server.js` serves the site and forwards a small allowlist of Robinhood's public, read-only market-data endpoints (quotes, historicals, fundamentals, market hours, ratings). Robinhood answers these without a login but sends no CORS headers, so the browser needs the proxy. Deploy it anywhere that runs Node (Render, Railway, Fly.io, a VPS). To use a proxy hosted elsewhere, set `window.SW_API` to its base URL before the scripts load.

## Data sources

| What | Source |
| --- | --- |
| Stock list | Robinhood "100 Most Popular" |
| Quotes, charts, fundamentals, hours, ratings | api.robinhood.com (via `server.js`) |
| Crypto prices and candles | Coinbase Exchange, Kraken, DexScreener, GeckoTerminal |
| Crypto supply | CoinGecko |
| Logos | Wikimedia Commons and each company's own site icon |

## Disclaimer

Sherwood is an independent simulator. It uses virtual money only, is not investment advice, and is not affiliated with, endorsed by, or connected to Robinhood Markets, Inc. All logos and trademarks belong to their respective owners.
