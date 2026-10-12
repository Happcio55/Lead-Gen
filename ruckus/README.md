# Ruckus

A social trading desk for Solana coins, hosted by Rudy the raccoon.
It runs entirely in the browser: no build step and no server of its own.

## Run it

```sh
cd ruckus
python3 -m http.server 8000
# open http://localhost:8000
```

To put it online, see [Hosting](#hosting).

## What works

| Page | What it does |
| --- | --- |
| Trade | Live coin lists (Hot, New, Top, Watchlist, Holding), search by name, ticker or mint, candle chart (1m/5m/15m/1h), live trades with Solscan links, safety badges (mint renounced, freeze, top-holder share), buy/sell through Jupiter, top buyers you can follow |
| Tokens | Trending, new and top-traded coins in one sortable table |
| The Den | Feed where `$TICKER` links to the coin; wallets you follow |
| Launch | Coin form with live preview and bonding-curve fill (saves a draft) |
| Rewards | Invite link and crumbs (points) |
| Tasks | Tasks that award crumbs, some ticked off automatically |
| Stats | SOL price, trending volume, new coins in the last hour, biggest movers |

### Trading

- Quotes and swaps come from the **Jupiter Ultra API**. Ruckus builds nothing on-chain itself.
- Every trade is signed in the user's own wallet (Phantom, Solflare or Backpack). Ruckus never holds keys or funds.
- Slippage is set automatically by Jupiter. Users set a **max price impact** (default 5%), and any trade above it is blocked.
- Ruckus charges 0%. Jupiter's own fee (usually 0.05–0.1%) is shown before every trade.
- Wallet balances come from Jupiter, so no Solana RPC is needed.

### Demo mode

If the live APIs can't be reached (offline, or a sandboxed preview), Ruckus switches to
demo mode on its own: simulated coins and a $1,000 paper balance. The banner says which mode is on.

## Data sources

| What | Endpoint | Notes |
| --- | --- | --- |
| Coin lists, search, prices, safety data | `lite-api.jup.ag/tokens/v2/*` | Free, no key |
| Swap quotes and execution | `lite-api.jup.ag/ultra/v1/order`, `/execute` | Free, no key |
| Wallet balances | `lite-api.jup.ag/ultra/v1/balances/{wallet}` | |
| Charts and recent trades | `datapi.jup.ag/v2/charts`, `/v1/txs` | Undocumented (it's what jup.ag itself uses), so it may change without notice |

For heavier traffic, get a free key at <https://portal.jup.ag>, then in `app.js` set
`CONFIG.jupBase = 'https://api.jup.ag'` and `CONFIG.jupApiKey = '<your key>'`.

## Still needs a server

These parts are stored only on each user's device until a backend exists:

- **The Den** posts and likes
- **Rewards**: referrals, crumbs and the leaderboard
- **Launch**: real on-chain launches. Uploading coin metadata to pump.fun's IPFS endpoint
  isn't allowed from browsers, so a small server has to upload the image and metadata
  before PumpPortal's `trade-local` create transaction can be signed in the wallet.

## Before going live

1. Set `CONFIG.xUrl` (your X profile) and `CONFIG.refBase` (your domain) in `app.js`.
2. Optional: earn a fee on swaps through Jupiter's referral program (`referralAccount` and
   `referralFee` on the Ultra order). If you turn it on, change the "Ruckus 0%" label.
3. Get legal advice for the countries you serve. A swap front end that touches other
   people's money can bring licensing and consumer-protection rules.

## Hosting

`.github/workflows/pages.yml` publishes this folder to GitHub Pages on every push to `main`.
Turn it on once: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Rudy

Rudy is inline SVG (see `rudy()` in `app.js`) with four moods: `neutral`, `happy`,
`cheer` and `worried`. He reacts to the selected coin's last five minutes and cheers
when a trade lands. A shared SVG filter in `index.html` gives the outlines a
hand-inked wobble that "boils" a few times a second. The boil turns off for
people who prefer reduced motion.
