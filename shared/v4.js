// Uniswap v4 trade building for native-ETH pools, routed through the Universal Router.
// Pure functions: they return unsigned transaction requests and never touch keys.
import { encodeAbiParameters, encodeFunctionData, maxUint160, maxUint256 } from 'viem';
import { ADDR, ERC20_ABI, PERMIT2_ABI, QUOTER_ABI, ROUTER_ABI } from './chain.js';

const CMD_V4_SWAP = '0x10';
// v4-periphery Actions: SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
const ACTIONS_EXACT_IN_SINGLE = '0x060c0f';

const POOL_KEY = {
  type: 'tuple',
  components: [
    { name: 'currency0', type: 'address' },
    { name: 'currency1', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' },
  ],
};

const EXACT_IN_SINGLE = {
  type: 'tuple',
  components: [
    { name: 'poolKey', ...POOL_KEY },
    { name: 'zeroForOne', type: 'bool' },
    { name: 'amountIn', type: 'uint128' },
    { name: 'amountOutMinimum', type: 'uint128' },
    { name: 'hookData', type: 'bytes' },
  ],
};

const CURRENCY_AMOUNT = [{ type: 'address' }, { type: 'uint256' }];

export function poolKeyOf(pool) {
  return {
    currency0: pool.currency0,
    currency1: pool.currency1,
    fee: Number(pool.fee),
    tickSpacing: Number(pool.tickSpacing),
    hooks: pool.hooks,
  };
}

export function isTradable(pool) {
  return pool.currency0.toLowerCase() === ADDR.ETH;
}

// amountOutMin after slippage (bps, e.g. 1500 = 15%).
export function withSlippage(amountOut, slippageBps) {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

export function deadlineIn(seconds = 300) {
  return BigInt(Math.floor(Date.now() / 1000) + seconds);
}

function encodeSwap({ key, zeroForOne, amountIn, minOut, deadline }) {
  const inCurrency = zeroForOne ? key.currency0 : key.currency1;
  const outCurrency = zeroForOne ? key.currency1 : key.currency0;
  const swap = encodeAbiParameters([EXACT_IN_SINGLE], [
    { poolKey: key, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: '0x' },
  ]);
  const settle = encodeAbiParameters(CURRENCY_AMOUNT, [inCurrency, amountIn]);
  const take = encodeAbiParameters(CURRENCY_AMOUNT, [outCurrency, minOut]);
  const input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [ACTIONS_EXACT_IN_SINGLE, [swap, settle, take]]);
  return encodeFunctionData({ abi: ROUTER_ABI, functionName: 'execute', args: [CMD_V4_SWAP, [input], deadline] });
}

// ETH -> token
export function buildBuyTx(pool, { amountIn, minOut, deadline = deadlineIn() }) {
  const key = poolKeyOf(pool);
  return {
    to: ADDR.UNIVERSAL_ROUTER,
    value: amountIn,
    data: encodeSwap({ key, zeroForOne: true, amountIn, minOut, deadline }),
  };
}

// token -> ETH (requires Permit2 allowances, see sellApprovals)
export function buildSellTx(pool, { amountIn, minOut, deadline = deadlineIn() }) {
  const key = poolKeyOf(pool);
  return {
    to: ADDR.UNIVERSAL_ROUTER,
    value: 0n,
    data: encodeSwap({ key, zeroForOne: false, amountIn, minOut, deadline }),
  };
}

export async function quote(client, pool, { side, amountIn }) {
  const { result } = await client.simulateContract({
    address: ADDR.V4_QUOTER,
    abi: QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [{ poolKey: poolKeyOf(pool), zeroForOne: side === 'buy', exactAmount: amountIn, hookData: '0x' }],
  });
  return result[0];
}

// Transactions the owner must send before selling `amount` of `token`.
// Universal Router pulls tokens through Permit2: token -> Permit2 (ERC20 approve), Permit2 -> router.
export async function sellApprovals(client, { owner, token, amount }) {
  const txs = [];
  const [erc20Allowance, permit] = await Promise.all([
    client.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [owner, ADDR.PERMIT2] }),
    client.readContract({ address: ADDR.PERMIT2, abi: PERMIT2_ABI, functionName: 'allowance', args: [owner, token, ADDR.UNIVERSAL_ROUTER] }),
  ]);
  if (erc20Allowance < amount) {
    txs.push({
      to: token,
      value: 0n,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [ADDR.PERMIT2, maxUint256] }),
      label: 'Approve token for Permit2',
    });
  }
  const [permitAmount, expiration] = permit;
  const now = Math.floor(Date.now() / 1000);
  if (permitAmount < amount || Number(expiration) < now + 60) {
    txs.push({
      to: ADDR.PERMIT2,
      value: 0n,
      data: encodeFunctionData({
        abi: PERMIT2_ABI,
        functionName: 'approve',
        args: [token, ADDR.UNIVERSAL_ROUTER, maxUint160, now + 30 * 24 * 3600],
      }),
      label: 'Allow router via Permit2',
    });
  }
  return txs;
}

// ---- Pricing helpers (sqrtPriceX96 of an ETH/token pool, ETH is currency0) ----

const Q96 = 2 ** 96;

// ETH per whole token.
export function ethPerToken(sqrtPriceX96, tokenDecimals) {
  const s = Number(sqrtPriceX96) / Q96;
  const rawTokenPerWei = s * s; // currency1 raw units per currency0 raw unit
  if (!rawTokenPerWei) return 0;
  return 10 ** (tokenDecimals - 18) / rawTokenPerWei;
}

// Virtual ETH reserve (in ETH) for in-range liquidity L at the current price.
export function virtualEthReserve(liquidity, sqrtPriceX96) {
  const s = Number(sqrtPriceX96) / Q96;
  if (!s) return 0;
  return Number(liquidity) / s / 1e18;
}
