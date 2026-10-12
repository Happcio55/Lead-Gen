# Vestas — Robinhood Chain trading terminal

A live trading terminal for new Uniswap v4 launches on **Robinhood Chain** (chain id 4663).
Log in with email, Google, X or a wallet through Privy, fund your wallet with ETH, and trade new
tokens with one click. Take-profit, stop-loss and trailing stops are built in.

- **Live board** with three lanes: *Fresh pools* (< 30 min), *Surging* (≥ 15 trades and ≥ $1K volume in 5 min) and *Established*. Each lane has its own filters for liquidity, market cap, trade count, age and hooked pools, and pauses its row order while you hover.
- **One-click buys** (⚡) with configurable presets and slippage.
- **Token drawer** with a candle chart (5s/15s/1m/5m), live trade tape, stats, buy/sell and TP/SL.
- **Holdings** dock showing live value, unrealized and realized PnL, and partial or full sells.
- **Automation**: TP (with a partial-sell %), SL and trailing stop.
- Watchlist, activity log, a ⌘K command palette, accent themes, compact mode, and settings import/export.

## How it works

```
Robinhood Chain RPC ──► server/indexer.js ──/api/board──► web (React)
   PoolManager logs:       pools, prices,           board, chart, trade panel
   Initialize + Swap       volume, candles               │
                                                         ▼
                           server /api/rpc ◄──── reads (quotes, balances, receipts)
                                                         │
                       Privy embedded wallet / browser wallet signs ──► Universal Router
```

- **Indexer** (`server/indexer.js`): polls Uniswap v4 `PoolManager` logs and tracks every pool
  paired with native ETH. That covers most new launches on the chain. It derives price, market
  cap, liquidity, 5m/1h volume and candles from `Swap` events. ETH/USD comes from
  Coinbase, with CoinGecko and Kraken as fallbacks.
- **Trading** (`shared/v4.js`): buys and sells are single `V4_SWAP` calls on the Universal Router
  (`SWAP_EXACT_IN_SINGLE` → `SETTLE_ALL` → `TAKE_ALL`), quoted first with the v4 Quoter and
  protected by a minimum output. Sells use Permit2: the first sell of a token needs two approvals,
  and later sells need none.
- **Non-custodial**: transactions are built in the browser and signed by the user's wallet. The
  server never sees keys. Its RPC proxy only forwards reads and already-signed transactions.
- **TP/SL** is checked in the browser on every board update (every 2 seconds) while a Vestas tab is
  open. With a Privy embedded wallet, sells go through without a popup. A browser wallet asks
  you to confirm each one.

Contract addresses (in `shared/chain.js`) were checked on-chain:

| Contract | Address |
| --- | --- |
| Uniswap v4 PoolManager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` |
| Uniswap v4 Quoter | `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` |
| Universal Router | `0x204FAca1764B154221e35c0d20aBb3c525710498` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| WETH | `0x0bd7d308f8e1639fab988df18a8011f41eacad73` |

## Deploy to Vercel

The repo deploys to Vercel without changes. The web app is built into `dist/`, and every `/api/*`
route runs as a single serverless function (`api/[...path].js`). A warm instance keeps its index in
memory and fetches only new blocks on each request. A cold instance backfills the last hour in the
background (about 10–20 s) while the app shows "Syncing…". The CDN caches board responses for one
second, so all viewers share the same work.

1. **Privy**: create an app at [dashboard.privy.io](https://dashboard.privy.io).
   - Login methods: turn on Email, Google, X and/or Wallet.
   - Embedded wallets: turn on **Ethereum** and create wallets on login for users who don't have one.
   - Copy the **App ID**.
2. **Vercel**: open [vercel.com/new](https://vercel.com/new), import this GitHub repo and keep the
   detected settings (they come from `vercel.json`).
3. Under **Environment Variables**, add:
   - `PRIVY_APP_ID` *(optional)*: the App ID from step 1. Vestas's own app id is built in as the default, so only set this to use a different Privy app.
   - `RH_RPC_URL` *(optional)*: your own Robinhood Chain RPC, if you have one.

   Then click **Deploy**.
4. In Privy, add your Vercel URL (e.g. `https://vestas-yourname.vercel.app`) and any custom domain
   under **Configuration → App settings → Domains → Allowed origins**. Login doesn't work until the
   domain is on that list.

The app reads `PRIVY_APP_ID` at runtime through `/api/config`, so changing it only needs a redeploy.
Vercel builds production from the repo's default branch. Other branches get preview URLs.

## Running locally

Requires Node 22.

```bash
npm install
npm run build
PRIVY_APP_ID=<your app id> npm start    # http://localhost:8787 (background indexer, same API)
```

For development with hot reload (API on :8787, web on :5173):

```bash
PRIVY_APP_ID=<your app id> npm run dev
```

To run the API the way Vercel does (lazy, per-request indexing), build first and then run
`node scripts/serverless-preview.mjs` (http://localhost:8790). For local login, add
`http://localhost:8787` / `:5173` / `:8790` to Privy's allowed origins.

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PRIVY_APP_ID` | Vestas's app id | Privy app used for login (email/social plus embedded wallet). |
| `RH_RPC_URL` | `https://rpc.mainnet.chain.robinhood.com` | Robinhood Chain RPC. It must allow `eth_getLogs` over ranges of a few thousand blocks. |
| `BACKFILL_BLOCKS` | `36000` (~1 hour) | How much history to index on startup. |
| `PORT` | `8787` | HTTP port (local server only). |

Users fund their wallet by bridging ETH to Robinhood Chain (robinhood.com/chain) or by sending ETH
on Robinhood Chain to the address under the account menu. From the same menu they can export their
embedded wallet's private key.

## Testing

```bash
npm test     # unit tests: swap encoding, price math, indexer logic
```

Full buy/approve/sell round trip against a local fork, which spends no real funds:

```bash
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --chain-id 4663 &
node scripts/fork-check.mjs
```

## Risk notice

These are real trades with real money on very young, illiquid tokens. Pools can carry high or
dynamic fees and arbitrary v4 hooks; the board marks them, but it can't tell you whether a token
is safe. Start with small amounts. Vestas isn't affiliated with Vestas Wind Systems A/S, Robinhood, Uniswap or Privy.
