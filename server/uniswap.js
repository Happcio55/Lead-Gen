// Direct Uniswap V3 swaps on Robinhood Chain (used for stock tokens, which Relay doesn't route).
// Quotes come from simulating the exact swap with eth_call, so the minimum output is real, not estimated.
import { encodeFunctionData, decodeFunctionResult, encodePacked, parseAbi } from 'viem';
import { client } from './rpc.js';
import { simulate } from './curve.js';
import { config, ADDR } from './config.js';

export const ROUTER = '0xcaf681a66d020601342297493863e78c959e5cb2';   // SwapRouter02
const FACTORY = '0x1f7d7550b1b028f7571e69a784071f0205fd2efa';          // Uniswap V3 factory
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002';

const routerAbi = parseAbi([
  'function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256)',
  'function unwrapWETH9(uint256 amountMinimum,address recipient) payable',
  'function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)'
]);
const poolAbi = parseAbi([
  'function token0() view returns (address)', 'function token1() view returns (address)',
  'function fee() view returns (uint24)', 'function factory() view returns (address)'
]);

const routes = new Map();

async function poolInfo(pool) {
  const r = await client.multicall({
    contracts: ['token0', 'token1', 'fee', 'factory'].map(functionName => ({ address: pool, abi: poolAbi, functionName })),
    allowFailure: true
  });
  if (r.some(x => x.status !== 'success') || r[3].result.toLowerCase() !== FACTORY) return null;
  return { token0: r[0].result.toLowerCase(), token1: r[1].result.toLowerCase(), fee: r[2].result };
}

// Most liquid Uniswap V3 pool for `token` quoted in WETH, or in USDG (then routed via WETH/USDG).
export async function findRoute(token) {
  const hit = routes.get(token);
  if (hit && Date.now() - hit.at < 3600e3) return hit.route;
  const pairs = await fetch(`${config.dexscreenerApi}/token-pairs/v1/robinhood/${token}`, { signal: AbortSignal.timeout(15000) })
    .then(r => r.json()).catch(() => []);
  const v3 = (Array.isArray(pairs) ? pairs : []).filter(p => p.dexId === 'uniswap' && (p.labels || []).includes('v3'))
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  let route = null;
  for (const p of v3) {
    const info = await poolInfo(p.pairAddress);
    if (!info) continue;
    const other = info.token0 === token ? info.token1 : info.token0;
    if (other === ADDR.WETH) { route = { hops: [{ fee: info.fee }], via: null, liquidityUsd: p.liquidity?.usd }; break; }
    if (other === ADDR.USDG) {
      const base = await findRoute(ADDR.USDG);
      if (base && !base.via) { route = { hops: [{ fee: base.hops[0].fee }, { fee: info.fee }], via: ADDR.USDG, liquidityUsd: p.liquidity?.usd }; break; }
    }
  }
  routes.set(token, { at: Date.now(), route });
  return route;
}

function path(route, token, buy) {
  const tokens = route.via ? [ADDR.WETH, route.via, token] : [ADDR.WETH, token];
  const fees = route.hops.map(h => h.fee);
  if (!buy) { tokens.reverse(); fees.reverse(); }
  const types = [], values = [];
  tokens.forEach((t, i) => { types.push('address'); values.push(t); if (i < fees.length) { types.push('uint24'); values.push(fees[i]); } });
  return encodePacked(types, values);
}

// Returns { amountOut, minOut, tx, approve|null } with amounts as BigInt. Sells are simulated together
// with the approval (eth_simulateV1), so the quote is exact even before the user has approved.
export async function buildSwap({ user, token, side, amount, slippageBps = 100, recipient }) {
  user = user.toLowerCase(); token = token.toLowerCase();
  const to = (recipient || user).toLowerCase();
  const amountIn = BigInt(amount);
  const route = await findRoute(token);
  if (!route) return null;
  const slip = BigInt(Math.max(10, Math.min(5000, Math.round(Number(slippageBps) || 100))));

  if (side !== 'sell') {
    const data = minOut => encodeFunctionData({ abi: routerAbi, functionName: 'exactInput', args: [{ path: path(route, token, true), recipient: to, amountIn, amountOutMinimum: minOut }] });
    const [c] = await simulate(user, [{ to: ROUTER, data: data(0n), value: amountIn }], amountIn + 10n ** 17n);
    if (c.status !== '0x1') throw new Error('The swap would fail at current prices');
    const amountOut = decodeFunctionResult({ abi: routerAbi, functionName: 'exactInput', data: c.returnData });
    const minOut = amountOut * (10000n - slip) / 10000n;
    return { amountOut, minOut, approve: null, tx: { to: ROUTER, data: data(minOut), value: amountIn } };
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const calls = minOut => [
    encodeFunctionData({ abi: routerAbi, functionName: 'exactInput', args: [{ path: path(route, token, false), recipient: ADDRESS_THIS, amountIn, amountOutMinimum: minOut }] }),
    encodeFunctionData({ abi: routerAbi, functionName: 'unwrapWETH9', args: [minOut, to] })
  ];
  const approve = { to: token, data: encodeFunctionData({ abi: routerAbi, functionName: 'approve', args: [ROUTER, amountIn] }), value: 0n };
  const swapTx = minOut => ({ to: ROUTER, data: encodeFunctionData({ abi: routerAbi, functionName: 'multicall', args: [deadline, calls(minOut)] }), value: 0n });
  const sim = await simulate(user, [approve, swapTx(0n)]);
  if (sim[1].status !== '0x1') throw new Error('The swap would fail (check your token balance)');
  const [first] = decodeFunctionResult({ abi: routerAbi, functionName: 'multicall', data: sim[1].returnData });
  const amountOut = decodeFunctionResult({ abi: routerAbi, functionName: 'exactInput', data: first });
  const minOut = amountOut * (10000n - slip) / 10000n;
  const allowance = await client.readContract({ address: token, abi: routerAbi, functionName: 'allowance', args: [user, ROUTER] });
  return { amountOut, minOut, approve: allowance >= amountIn ? null : approve, tx: swapTx(minOut) };
}
