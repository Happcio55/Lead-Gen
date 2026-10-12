# Kairo

AI token scanner and cross-chain swap front-end for Robinhood Chain (chain ID 4663).

- **Live launch feed.** The server follows the chain block by block, detects every new ERC-20 launch and scores it, usually within a minute.
- **Kairo score (1–10).** Launch health (60%) plus market quality (40%). Launch health covers creator selling and holdings, sniper wallets in the first ~3 seconds, holder concentration, mint/blacklist/pause/tax powers, upgradeable proxies and copycat tickers. Market quality covers DexScreener liquidity, volume, buy/sell balance and crashes.
- **AI explanation.** One or two plain sentences per token. It uses Claude when `ANTHROPIC_API_KEY` is set, and a rule-based summary otherwise. It is only generated when someone opens a report, and the result is cached.
- **Buy any token from 30 chains in one signature.** The router picks the best venue for each token:
  - [Relay](https://relay.link) for DEX-listed tokens.
  - The launchpad bonding curve for fresh launches (`buy`/`sell(uint256,uint256,address)`).
  - Uniswap V3 for stock tokens.
  - Uniswap V4 (Universal Router) for hookless pools.

  When you pay from another chain, curve and Uniswap buys run as a Relay destination call, so it is still one signature.
- **Sell to any chain.** Relay when it can route the token. Otherwise curve or Uniswap to ETH on Robinhood Chain, then an automatic Relay bridge to the chain you picked.
- **Simulated quotes.** Every on-chain trade is simulated with `eth_simulateV1` before it is offered. The minimum output comes from that simulation, and a venue is only used if the tokens are shown to arrive at your address.
- **Stock tokens.** These are discovered on-chain from their `TransferWithScaledUI` events and priced from DexScreener.
- **Self-custody.** Any browser wallet (EIP-6963 / `window.ethereum`) works. Every transaction is signed by the user.

## Run it

```bash
npm install
npm start            # http://localhost:8080
```

### Deploy

- **Render:** New → Blueprint → pick this repo. `render.yaml` sets up the service, a persistent disk and the env vars.
- **Anywhere with Docker:** `docker build -t kairo . && docker run -p 8080:8080 -v kairo-data:/data -e ANTHROPIC_API_KEY=… kairo`

On first start the server backfills the last 24 hours of launches in the background, then keeps following the chain. State is saved to `data/state.json`.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `RPC_URLS` | `https://rpc.mainnet.chain.robinhood.com` | One or more Robinhood Chain RPCs, comma-separated. Requests rotate across them and fail over. Adding a paid RPC (Alchemy, QuickNode, …) scores faster |
| `RPC_RPS` | `10` | HTTP requests per second to the RPC. Each request carries up to 25 batched calls |
| `BACKFILL_HOURS` | `24` | How far back to look on first start |
| `ANTHROPIC_API_KEY` | – | Enables Claude-written explanations |
| `AI_MODEL` | `claude-opus-5-5` | Claude model used for explanations |
| `RELAY_API_KEY` | – | Optional Relay API key for higher limits |
| `DATA_DIR` | `./data` | Where state is stored |

Requires Node.js 20 or newer.

## API

| Endpoint | Returns |
| --- | --- |
| `GET /api/pulse` | Block, block time, launches and red flags in the last 24h, stock-token count |
| `GET /api/feed?tab=new\|trending\|top&limit=&minScore=` | Scored launches |
| `GET /api/token/:address` | Full report: score, flags, holders, market and AI explanation. Works for any token, not just tracked ones |
| `GET /api/search?q=` | Launches and stock tokens by ticker or name |
| `GET /api/stocks` | Stock tokens with price and 24h change |
| `GET /api/chains` | Chains you can pay from, via Relay |
| `POST /api/route` | Best route for a buy/sell (Relay, curve, Uniswap V3/V4) as steps for the wallet to sign |
| `POST /api/quote` | Raw Relay quote (used for the bridge leg of sells) |
| `GET /api/balance?chainId=&address=&token=` | Native or ERC-20 balance |

## Notes

- Scores describe on-chain data at the time shown. They are not price predictions or financial advice.
- Stock tokens are not available to persons in the United States and are restricted in other jurisdictions.
