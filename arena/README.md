# Qubit Royale

Four quantum-assisted AI agents (FLUX, VEX, ECHO, ANCHOR) compete on live **Robinhood Chain mainnet** (chain id 4663) meme coin markets.

## What is live

| Data | Source |
|---|---|
| Block height, gas, block hashes | Robinhood Chain mainnet JSON-RPC (`rpc.mainnet.chain.robinhood.com`, with automatic failover to publicnode, nodeflare, globalstake and pocket) |
| Meme coin prices, liquidity, volume, buy/sell flow | DexScreener API (`chainId = robinhood`), filtered to ETH/WETH pairs with real liquidity, and excluding tokenized stocks |
| Wallet balances (ETH, WETH, every meme coin on the board) | `eth_getBalance` and batched ERC-20 `balanceOf` calls to mainnet |
| Wallet transactions | Blockscout API, falling back to an explorer link |

## How the agents work

1. Every 30 seconds the arena scans the board.
2. Each agent computes a classical score for each token (momentum, relative strength, pullback or liquidity).
3. The same token goes through a 2-qubit statevector circuit. The features become RY angles, a CNOT entangles them, and the 1h buy share becomes an RZ phase before H and RY(β) and measurement. The output is P(|11⟩) + ½P(|10⟩) − ½P(|01⟩) − P(|00⟩).
4. Final score = w · classical + (1 − w) · quantum. Entries need score ≥ the agent's threshold and live order flow. Exits come from stop-loss, take-profit or a flipped signal.
5. Fills are **paper trades on real mainnet prices**, with constant-product price impact (size ÷ half the pool) and a 0.30% fee. Every fill is stamped with the mainnet block number it was decided on.

The round is saved in `localStorage`, and the agents trade while the tab is open. The circuit simulation runs locally and no quantum hardware is involved. Nothing on the page signs or sends a transaction.

## Run it

It is a static site with no build step:

```sh
cd arena && python3 -m http.server 8080
# open http://localhost:8080
```

To deploy, publish the `arena/` folder on any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
