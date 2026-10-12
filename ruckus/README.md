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
| Home | Rudy front and centre, with live cards around him: the top trending coin, its biggest buyer, a buy box and a ticker of real trades. Rudy's speech bubble gives live tips. Below: the coins moving right now. |
| Trade | Live coin lists (Hot, New, Top, Watchlist, Holding) with mini charts, a candle chart (1m/5m/15m/1h), live trades, top buyers, coin details, safety badges, Rudy's safety read on the coin, and buy/sell through Jupiter (amount in USD or SOL) |
| Coins | Card grid with 24-hour mini charts. Sort by trending, most traded, newest, market cap or top gainers |
| Den | Feed where `$TICKER` turns into a live coin card; wallets you follow; wallets buying now; your positions |
| Wallet | Your holdings, their value now and your P&L on coins traded here. Any wallet address opens as a profile you can follow (`#w-<address>`) |
| Launch | Coin form with live preview and bonding-curve fill (saves a draft) |
| Rewards | Invite link, crumbs (points) and tasks |
| Pulse | SOL daily candles, trending volume, new coins in the last hour, biggest movers |

Search at the top (press `/`) finds any coin by name, ticker or mint, and opens any wallet address.
Every coin has a shareable link: `#c-<mint>`.

### Rudy

Rudy is inline SVG (see `rudy()` in `app.js`) with four moods: `neutral`, `happy`, `cheer`
and `worried`. His eyes follow the pointer, he blinks, and he reacts to the selected coin:
worried when the coin has a red flag (active mint, freeze authority, concentrated holders,
thin liquidity), cheering when a trade lands. Animations turn off for people who prefer
reduced motion.

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

Ruckus is deployed on Vercel as its own project, separate from the other apps in this repo:

- **Root Directory:** `ruckus`
- **Framework Preset:** Other (no build step)

Every push to `main` updates the live site, and every other branch gets a preview link.
