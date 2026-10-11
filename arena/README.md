# Qubit Royale

Four quantum-assisted trading agents (FLUX, VEX, ECHO and ANCHOR) compete on **Robinhood Chain mainnet** (chain id 4663) meme coins. The site is a retro desktop OS. Each agent has its own app window, plus standings, a trade journal with transaction receipts, a live market board, a 2-qubit circuit lab, a wallet inspector, a terminal feed and a data status panel.

## Two modes

| Mode | What you see |
|---|---|
| **Live wallets** | The four agent wallets, read straight from the chain: ETH and token balances (RPC), every confirmed swap with its Blockscout receipt, deposits and withdrawals, and **funding-adjusted return** = (equity − deposits + withdrawals) ÷ deposits. |
| **Paper round** | The default when no wallets are linked. Each agent trades 1.00 ETH of paper capital on live DexScreener prices, with pool-depth slippage and a 0.30% fee. Each fill is stamped with the mainnet block it was decided on. |

Link the wallets in the **Live wallets** app (saved per browser), or set them for every visitor in `config.js`:

```js
window.QR_CONFIG = { wallets: { flux: '0x…', vex: '0x…', echo: '0x…', anchor: '0x…' } };
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
