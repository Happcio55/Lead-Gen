// Robinhood Chain configuration shared by the server (indexer) and the web app (trading).
// Contract addresses were verified on-chain (eth_getCode) against chain id 4663.
import { defineChain, parseAbi, parseAbiItem } from 'viem';

export const CHAIN_ID = 4663;
export const DEFAULT_RPC = 'https://rpc.mainnet.chain.robinhood.com';
export const EXPLORER = 'https://robin.etherscan.io';

export const robinhood = defineChain({
  id: CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [DEFAULT_RPC] } },
  blockExplorers: { default: { name: 'Robinhood Explorer', url: EXPLORER } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
});

export const ADDR = {
  ETH: '0x0000000000000000000000000000000000000000',
  WETH: '0x0bd7d308f8e1639fab988df18a8011f41eacad73',
  POOL_MANAGER: '0x8366a39cc670b4001a1121b8f6a443a643e40951',
  V4_QUOTER: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',
  UNIVERSAL_ROUTER: '0x204FAca1764B154221e35c0d20aBb3c525710498',
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
};

// v4 hooks of known launchpads: their pools are standard launches, not unknown custom logic.
export const KNOWN_HOOKS = {
  '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044': 'Pons',
};
export const hookName = (hooks) => KNOWN_HOOKS[String(hooks).toLowerCase()] || null;

export const EVENTS = {
  initialize: parseAbiItem(
    'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)'
  ),
  swap: parseAbiItem(
    'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)'
  ),
};

export const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

export const PERMIT2_ABI = parseAbi([
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
]);

export const QUOTER_ABI = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
  'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
]);

export const ROUTER_ABI = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);

export const txUrl = (hash) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (a) => `${EXPLORER}/address/${a}`;
export const tokenUrl = (a) => `${EXPLORER}/token/${a}`;
