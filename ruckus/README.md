# Ruckus

A social trading desk for Solana coins, hosted by Rudy the raccoon.
This is a front-end prototype: it runs entirely in the browser with no build step.

## Run it

```sh
cd ruckus
python3 -m http.server 8000
# open http://localhost:8000
```

## What's in it

| Page | What it does |
| --- | --- |
| Trade | Market list (Hot, New, Watchlist, Holding, Top), candle chart, live trades, buy/sell ticket with slippage, traders to follow |
| Tokens | Every coin in one sortable, filterable table |
| The Den | Social feed. `$TICKER` in a post links to that coin's chart |
| Launch | Create a coin with a name, ticker, image and first buy, with a live preview and bonding-curve fill |
| Rewards | Invite link, crumbs (points), leaderboard |
| Tasks | Manual and automatic tasks that award crumbs |
| Stats | Volume, trades, launches, online count, 14-day volume chart, top movers |

## What's real and what's simulated

- **Real:** SOL, BTC and ETH prices come from CoinGecko, refreshed every minute. If that request is blocked, the ticker says "Estimated prices".
- **Real:** "Connect wallet" connects to Phantom or Solflare if one is installed.
- **Simulated:** coin prices, trades, holders and stats. All trades use a $1,000 paper balance kept in `localStorage`.

Before going live, wire the ticket to a swap API (for example Jupiter), replace the
simulated markets with an indexer feed, and add a backend for posts, follows,
referrals and launches. Set `CONFIG.xUrl` and `CONFIG.refBase` at the top of `app.js`.

## Rudy

Rudy is inline SVG (see `rudy()` in `app.js`) with four moods: `neutral`, `happy`,
`cheer` and `worried`. A shared SVG filter in `index.html` gives the outlines a
hand-inked wobble that "boils" a few times a second. The boil is turned off for
people who prefer reduced motion.
