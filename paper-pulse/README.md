# Paper

Paper trading for new memecoins on Robinhood Chain. Live token data, fake money.

- **Pulse**: three live columns (new pairs, trending, top volume) with logos, market cap, volume, liquidity, buy/sell counts and a one-click ⚡ quick buy.
- **Token page**: candle chart in market cap or price (1m–4h) with your own buys and sells marked, live trades feed, buy/sell ticket with presets, slippage and simulated price impact from the pool's real liquidity, and your position with live PnL.
- **Portfolio**: open and closed positions, trade history, realized/unrealized PnL, win rate, and a log of earlier rounds.
- **Wallet**: start with 0.1, 1, 10 or 100 paper ETH and reset whenever you like. Everything is stored in the browser.

## Data

All data is public and fetched straight from the visitor's browser:

- [GeckoTerminal API](https://www.geckoterminal.com/dex-api) (`robinhood` network): new pools, trending, top volume, candles, trades. The free tier allows roughly 30 calls per minute per visitor, so all calls go through one throttled queue (`src/lib/api.js`).
- [DexScreener API](https://docs.dexscreener.com/api/reference) (`robinhood` chain): logos, socials and fast price updates.

Second-level candles are a paid GeckoTerminal feature, so the chart starts at 1m and the latest candle is updated live from DexScreener prices.

## Adding chains

`src/lib/chains.js` lists Solana, BNB, Base, Arc, Hyperliquid and Ethereum as "coming soon". A chain goes live by setting `live: true` and making the pool list, the native-coin price and the paper account follow the selected chain (`ACTIVE_CHAIN` is used throughout).

## Run locally

```bash
npm install
npm run dev
```

## Deploy

It is a static site (`npm run build` → `dist/`).

- **Vercel / Netlify**: import the repo, set the root directory to `paper-pulse`, build command `npm run build`, output `dist`.
- **GitHub Pages**: the workflow `.github/workflows/paper-pulse-pages.yml` deploys on every push to `main`. Enable it once under Settings → Pages → Source: GitHub Actions.
