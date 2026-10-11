# Citizens

Seven language models walk into a meme coin market. **Citizens** is an arena where seven trading bots compete on **Robinhood Chain mainnet** (chain id 4663) meme coins. Each bot has a persona inspired by a language-model family:

| Citizen | Inspired by | Temperament |
|---|---|---|
| CLAUDIUS | Claude | Careful analyst: deep liquidity only |
| GEMTWINS | Gemini | Two-signal consensus: 24h and 6h strength must agree |
| GROKSTAR | Grok | Contrarian dip buyer |
| GPTONY | GPT | Momentum generalist |
| MISTRO | Mistral | Five-minute scalper |
| LLAMBO | Llama | Volume herd follower |
| SEEKER | DeepSeek | Microcap value digger |

The personas are *inspired by* these models; they are not run by them. In the paper round every decision comes from the citizen's strategy plus the 2-qubit circuit. A model only makes the call once its API is connected to a trading engine.

The front page has a nav bar, a hero with the citizen lineup, citizen ID cards with live stats and a scroll-pinned CRT monitor that boots with live mainnet data and dives into the desk. The desk is a retro desktop OS: an app window per citizen, standings, a trade journal with transaction receipts, a market board, a circuit lab, a wallet inspector, a terminal and data status.

## Two modes

| Mode | What you see |
|---|---|
| **Live wallets** | The seven citizen wallets, read straight from the chain: ETH and token balances (RPC), every confirmed swap with its Blockscout receipt, deposits and withdrawals, and **funding-adjusted return** = (equity − deposits + withdrawals) ÷ deposits. |
| **Paper round** | The default when no wallets are linked. Each citizen trades 1.00 ETH of paper capital on live DexScreener prices, with pool-depth slippage and a 0.30% fee. Each fill is stamped with the mainnet block it was decided on. |

Link the wallets in the **Live wallets** app (saved per browser), or set them for every visitor in `config.js`:

```js
window.QR_CONFIG = { wallets: { claudius: '0x…', gemtwins: '0x…', grokstar: '0x…', gptony: '0x…', mistro: '0x…', llambo: '0x…', seeker: '0x…' } };
```

The site is read-only. It never asks for a private key and never signs a transaction.

## Data sources

- Robinhood Chain JSON-RPC, with automatic failover across five public endpoints
- Blockscout API v2 (`robinhoodchain.blockscout.com`) for transfers, transactions, internal transactions and token balances
- DexScreener API (`chainId = robinhood`) for prices, liquidity and order flow. Only ETH/WETH pairs are used, and tokenized stocks and spoofed liquidity are filtered out.

## The decision model

Score = classical × w + quantum × (1 − w). The quantum part is a 2-qubit statevector simulation (`quantum.js`). Two features become RY angles, a CNOT entangles them, and the 1h buy share becomes an RZ phase, followed by H and RY(β), then measurement. It runs locally, uses no quantum hardware, and is an experimental input rather than a forecast.

## Run it

It is a static site with no build step:

```sh
cd arena && python3 -m http.server 8080   # http://localhost:8080
```
