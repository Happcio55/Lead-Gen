// Trade building for the other pools memecoins launch into on Robinhood Chain (found through
// GeckoTerminal): Uniswap v2 pairs and v3 pools through the Universal Router, and Pons bonding
// curves, which take ETH directly. Pure builders plus small on-chain quote helpers.
import { encodeAbiParameters, encodeFunctionData, encodePacked, maxUint256, parseAbi } from 'viem';
import { ADDR, ERC20_ABI, ROUTER_ABI } from './chain.js';
import { deadlineIn } from './v4.js';

// Universal Router commands and its recipient sentinels. The router on this chain (v2.1) takes a
// trailing per-hop price limit list on v2/v3 swaps; it is left empty.
const CMD = { V3_EXACT_IN: '00', V2_EXACT_IN: '08', WRAP_ETH: '0b', UNWRAP_WETH: '0c' };
const MSG_SENDER = '0x0000000000000000000000000000000000000001';
const ROUTER_SELF = '0x0000000000000000000000000000000000000002';

export const PAIR_ABI = parseAbi([
  'function token0() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
]);
export const V3_POOL_ABI = parseAbi([
  'function token0() view returns (address)',
  'function fee() view returns (uint24)',
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
]);
export const PONS_ABI = parseAbi([
  'function buy(uint256 quoteIn, uint256 minTokensOut, address to) payable returns (uint256)',
  'function sell(uint256 tokensIn, uint256 minQuoteOut, address to) returns (uint256)',
  'function graduated() view returns (bool)',
]);

const weth = ADDR.WETH.toLowerCase();
const isWeth = (a) => a.toLowerCase() === weth;

function v3Input({ recipient, amountIn, minOut, tokenIn, fee, tokenOut, payerIsUser }) {
  const path = encodePacked(['address', 'uint24', 'address'], [tokenIn, fee, tokenOut]);
  return encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'bool' }, { type: 'uint256[]' }],
    [recipient, amountIn, minOut, path, payerIsUser, []]
  );
}

function v2Input({ recipient, amountIn, minOut, tokenIn, tokenOut, payerIsUser }) {
  return encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'bool' }, { type: 'uint256[]' }],
    [recipient, amountIn, minOut, [tokenIn, tokenOut], payerIsUser, []]
  );
}

const amountInput = (recipient, amount) => encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [recipient, amount]);

function execute(cmds, inputs, deadline) {
  return encodeFunctionData({ abi: ROUTER_ABI, functionName: 'execute', args: [`0x${cmds.join('')}`, inputs, deadline] });
}

// ETH -> token. pool: { route: 'v2' | 'v3', token, fee? }
export function buildRouteBuyTx(pool, { amountIn, minOut, deadline = deadlineIn() }) {
  const swap = { recipient: MSG_SENDER, amountIn, minOut, tokenIn: ADDR.WETH, tokenOut: pool.token, fee: pool.fee, payerIsUser: false };
  const [cmd, input] = pool.route === 'v3' ? [CMD.V3_EXACT_IN, v3Input(swap)] : [CMD.V2_EXACT_IN, v2Input(swap)];
  return {
    to: ADDR.UNIVERSAL_ROUTER,
    value: amountIn,
    data: execute([CMD.WRAP_ETH, cmd], [amountInput(ROUTER_SELF, amountIn), input], deadline),
  };
}

// token -> ETH, tokens pulled through Permit2 (same approvals as v4 sells).
export function buildRouteSellTx(pool, { amountIn, minOut, deadline = deadlineIn() }) {
  const swap = { recipient: ROUTER_SELF, amountIn, minOut: 0n, tokenIn: pool.token, tokenOut: ADDR.WETH, fee: pool.fee, payerIsUser: true };
  const [cmd, input] = pool.route === 'v3' ? [CMD.V3_EXACT_IN, v3Input(swap)] : [CMD.V2_EXACT_IN, v2Input(swap)];
  return {
    to: ADDR.UNIVERSAL_ROUTER,
    value: 0n,
    data: execute([cmd, CMD.UNWRAP_WETH], [input, amountInput(MSG_SENDER, minOut)], deadline),
  };
}

// Expected output of a v2 swap: constant product with the 0.3% fee.
export function v2Out(amountIn, reserveIn, reserveOut) {
  if (!reserveIn || !reserveOut) return 0n;
  const inFee = amountIn * 997n;
  return (inFee * reserveOut) / (reserveIn * 1000n + inFee);
}

// Expected output of a v3 swap inside the current tick range. Memecoin pools are usually one wide
// range, and if the swap crosses into thinner liquidity the slippage limit makes it revert safely.
export function v3Out(amountIn, { sqrtPriceX96, liquidity, fee, zeroForOne }) {
  const L = liquidity;
  if (!L || !sqrtPriceX96) return 0n;
  const Q96 = 2n ** 96n;
  const x = (amountIn * (1_000_000n - BigInt(fee))) / 1_000_000n;
  const s = sqrtPriceX96;
  if (zeroForOne) {
    const s2 = (L * Q96 * s) / (L * Q96 + x * s);
    return (L * (s - s2)) / Q96;
  }
  const s2 = s + (x * Q96) / L;
  return (L * Q96 * (s2 - s)) / (s * s2);
}

// Quote for a v2/v3 route: reads the pool and returns the expected output in raw units.
export async function quoteRoute(client, pool, { side, amountIn }) {
  const tokenIn = side === 'buy' ? ADDR.WETH : pool.token;
  if (pool.route === 'v2') {
    const [token0, [r0, r1]] = await Promise.all([
      client.readContract({ address: pool.poolAddress, abi: PAIR_ABI, functionName: 'token0' }),
      client.readContract({ address: pool.poolAddress, abi: PAIR_ABI, functionName: 'getReserves' }),
    ]);
    const inIs0 = token0.toLowerCase() === tokenIn.toLowerCase();
    return v2Out(amountIn, inIs0 ? r0 : r1, inIs0 ? r1 : r0);
  }
  const [token0, fee, liquidity, slot0] = await Promise.all(
    ['token0', 'fee', 'liquidity', 'slot0'].map((functionName) => client.readContract({ address: pool.poolAddress, abi: V3_POOL_ABI, functionName }))
  );
  return v3Out(amountIn, { sqrtPriceX96: slot0[0], liquidity, fee, zeroForOne: token0.toLowerCase() === tokenIn.toLowerCase() });
}

// Pons bonding curve: buy and sell straight on the pool. Quotes are simulations of the real call.
export function buildPonsBuyTx(pool, { amountIn, minOut, to }) {
  return { to: pool.poolAddress, value: amountIn, data: encodeFunctionData({ abi: PONS_ABI, functionName: 'buy', args: [amountIn, minOut, to] }) };
}

export function buildPonsSellTx(pool, { amountIn, minOut, to }) {
  return { to: pool.poolAddress, value: 0n, data: encodeFunctionData({ abi: PONS_ABI, functionName: 'sell', args: [amountIn, minOut, to] }) };
}

export async function quotePons(client, pool, { side, amountIn, account }) {
  const { result } = await client.simulateContract({
    account,
    address: pool.poolAddress,
    abi: PONS_ABI,
    functionName: side,
    args: [amountIn, 0n, account],
    value: side === 'buy' ? amountIn : undefined,
  });
  return result;
}

// Approval a Pons sell needs: the pool pulls the tokens itself.
export async function ponsSellApprovals(client, { owner, token, pool, amount }) {
  const allowance = await client.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [owner, pool] });
  if (allowance >= amount) return [];
  return [
    {
      to: token,
      value: 0n,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [pool, maxUint256] }),
      label: 'Approve token for Pons',
    },
  ];
}

export { isWeth };
