# Kairo

AI token scanner and cross-chain swap front-end for Robinhood Chain (chain ID 4663).

- **Live launch feed.** The server follows the chain block by block, detects every new ERC-20 launch and scores it, usually within a minute.
- **Kairo score (1–10).** Launch health (60%) plus market quality (40%). Launch health covers creator selling and holdings, sniper wallets in the first ~3 seconds, holder concentration, mint/blacklist/pause/tax powers, upgradeable proxies and copycat tickers. Market quality covers DexScreener liquidity, volume, buy/sell balance and crashes.
- **AI explanation.** One or two plain sentences per token. It uses Claude when `ANTHROPIC_API_KEY` is set, and a rule-based summary otherwise. It is only generated when someone opens a report, and the result is cached.
- **Buy from 30 chains.** Pay with ETH, BNB or POL on any chain Relay supports, in one signature through [Relay](https://relay.link). Selling works the same way.
- **Stock tokens.** These are discovered on-chain from their `TransferWithScaledUI` events and priced from DexScreener. They trade through Uniswap V3 on Robinhood Chain. Quotes come from simulating the exact swap, so the minimum output protects you.
- **Self-custody.** Any browser wallet (EIP-6963 / `window.ethereum`) works. Every transaction is signed by the user.

## Run it

```bash
npm install
npm start            # http://localhost:8080
```

On first start the server backfills the last 24 hours of launches in the background, then keeps following the chain. State is saved to `data/state.json`.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `RPC_URL` | `https://rpc.mainnet.chain.robinhood.com` | Robinhood Chain RPC. The public one works but is rate-limited. A paid RPC (Alchemy, QuickNode, …) scores faster |
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
| `POST /api/quote` | Relay cross-chain quote with the transactions to sign |
| `POST /api/swap` | Uniswap V3 swap on Robinhood Chain, with a simulated quote |
| `GET /api/balance?chainId=&address=&token=` | Native or ERC-20 balance |

## Notes

- Scores describe on-chain data at the time shown. They are not price predictions or financial advice.
- Stock tokens are not available to persons in the United States and are restricted in other jurisdictions.
