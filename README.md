# Surge — Robinhood Chain trading terminal

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
Robinhood Chain RPC ──► server/indexer.js ──SSE──► web (React)
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
- **TP/SL** is checked in the browser on every board update (once a second) while a Surge tab is
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

## Running it

Requires Node 20+.

```bash
npm install
npm run build          # builds the web app into dist/
PRIVY_APP_ID=<your app id> npm start    # http://localhost:8787
```

For development with hot reload (API on :8787, web on :5173):

```bash
PRIVY_APP_ID=<your app id> npm run dev
```

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PRIVY_APP_ID` | *(empty)* | Turns on Privy login (email/social plus embedded wallet). Without it, the app falls back to browser wallets (MetaMask, Rabby, …). |
| `RH_RPC_URL` | `https://rpc.mainnet.chain.robinhood.com` | Robinhood Chain RPC. It must allow `eth_getLogs` over ranges of a few thousand blocks. |
| `BACKFILL_BLOCKS` | `36000` (~1 hour) | How much history to index on startup. |
| `PORT` | `8787` | HTTP port. |

### Setting up Privy (email login + embedded wallets)

1. Create an app at [dashboard.privy.io](https://dashboard.privy.io).
2. Under **Login methods**, enable Email, Google, X and/or Wallet.
3. Under **Embedded wallets**, enable Ethereum wallets.
4. Under **App settings → Domains**, add the domain you serve Surge from (and `http://localhost:5173` / `http://localhost:8787` for local testing).
5. Copy the **App ID** and start the server with `PRIVY_APP_ID=...`.

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
is safe. Start with small amounts. Surge isn't affiliated with Robinhood, Uniswap or Privy.
