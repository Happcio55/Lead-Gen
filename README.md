# Ironclad Forge

A memecoin site for Robinhood Chain with an arc-reactor 3D scene and an actual purpose: **stop rug pulls before people buy.**

- **Scanner.** Paste any token address. The page reads the contract's bytecode straight from a Robinhood Chain RPC node, follows EIP-1967 and EIP-1167 proxies, checks `owner()`, and looks for the function selectors memecoins get rugged with: mint, adjustable tax, blacklist, pause, trading gates and wallet caps. It grades the token from 0 to 100. No backend, no API key.
- **Forge.** Deploys `IroncladToken` from the visitor's own wallet: a fixed-supply ERC-20 with no owner, no mint, no tax, no blacklist, no pause and no proxy. The whole supply goes to the deployer. After deploying, the page scans the new token automatically.
- **Live telemetry.** Block height, gas price, RPC latency and the current cost to forge a coin, polled from mainnet every 6 seconds.

The 3D scene is Three.js r147 with bloom. The reactor's coils split into an exploded view as you scroll, coins orbit the core, and the core turns amber or red when a scan finds problems.

## Run it

It's a static site. Serve the folder from any web server:

```sh
npm run serve        # http://localhost:8080
# or
python3 -m http.server 8080
```

To host it, turn on GitHub Pages for this branch (Settings → Pages → deploy from branch, root folder). Opening `index.html` straight from disk works for the visuals, but wallets only inject into pages served over http(s).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page markup |
| `assets/style.css` | Styles |
| `assets/scene.js` | Three.js reactor scene and scroll choreography |
| `assets/scanner.js` | Rug-vector scanner (works in Node too: `require("./assets/scanner.js")`) |
| `assets/app.js` | UI wiring: telemetry, scanner, wallet deploy, sound |
| `assets/forge-artifact.js` | Generated: compiled bytecode and source for the forge |
| `contracts/IroncladToken.sol` | The token contract |
| `contracts/IroncladToken.json` | Generated: ABI and bytecode |

Rebuild the contract bundle after editing the Solidity:

```sh
npm install
npm run build:contract
```

## Robinhood Chain

| | Mainnet | Testnet |
| --- | --- | --- |
| Chain ID | 4663 | 46630 |
| RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | https://robinhoodchain.blockscout.com | https://explorer.testnet.chain.robinhood.com |

Values come from [docs.robinhood.com/chain/connecting](https://docs.robinhood.com/chain/connecting). The public RPC endpoints are rate limited; the scanner batches its calls to stay under the limit.

## Limits

- The scanner is a heuristic. It matches standard function selectors, so a contract that hides rug logic behind custom names can pass. Issuer-run tokens such as stablecoins score low on purpose, because their issuer can mint and upgrade.
- `IroncladToken` can't lock liquidity for you. Burn or time-lock your LP tokens after you add liquidity.
- The contract is unaudited. It's about 70 lines; read it.
- Independent project, not affiliated with or endorsed by Robinhood. Not financial advice.
