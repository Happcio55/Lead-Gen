// Direct Uniswap V3 swaps on Robinhood Chain (used for stock tokens, which Relay doesn't route).
// Quotes come from simulating the exact swap with eth_call, so the minimum output is real, not estimated.
import { encodeFunctionData, decodeFunctionResult, encodePacked, parseAbi } from 'viem';
import { rpc, client } from './rpc.js';
import { erc20Abi } from './erc20.js';
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

const hex = n => '0x' + BigInt(n).toString(16);

async function simulate(from, to, data, value, overrideBalance) {
  const call = { from, to, data, value: hex(value) };
  const state = overrideBalance ? { [from]: { balance: hex(overrideBalance) } } : undefined;
  return rpc('eth_call', state ? [call, 'latest', state] : [call, 'latest']);
}

// Returns either { approve } (sell needs an allowance first) or { tx, amountOut, minOut }.
export async function buildSwap({ user, token, side, amount, slippageBps = 100 }) {
  user = user.toLowerCase(); token = token.toLowerCase();
  const amountIn = BigInt(amount);
  const route = await findRoute(token);
  if (!route) return { error: 'No Uniswap pool found for this token' };
  const slip = BigInt(Math.max(10, Math.min(5000, Math.round(Number(slippageBps) || 100))));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  if (side !== 'sell') {
    const params = r => [{ path: path(route, token, true), recipient: user, amountIn, amountOutMinimum: r }];
    const probe = encodeFunctionData({ abi: routerAbi, functionName: 'exactInput', args: params(0n) });
    const raw = await simulate(user, ROUTER, probe, amountIn, amountIn + 10n ** 17n);
    const amountOut = decodeFunctionResult({ abi: routerAbi, functionName: 'exactInput', data: raw });
    const minOut = amountOut * (10000n - slip) / 10000n;
    const data = encodeFunctionData({ abi: routerAbi, functionName: 'exactInput', args: params(minOut) });
    return { tx: { to: ROUTER, data, value: hex(amountIn), chainId: config.chainId }, amountOut: amountOut.toString(), minOut: minOut.toString() };
  }

  const [balance, allowance] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [user] }),
    client.readContract({ address: token, abi: routerAbi, functionName: 'allowance', args: [user, ROUTER] })
  ]);
  if (balance < amountIn) return { error: 'Not enough tokens in this wallet' };
  if (allowance < amountIn) {
    return { approve: { to: token, data: encodeFunctionData({ abi: routerAbi, functionName: 'approve', args: [ROUTER, amountIn] }), value: '0x0', chainId: config.chainId } };
  }
  const calls = minOut => [
    encodeFunctionData({ abi: routerAbi, functionName: 'exactInput', args: [{ path: path(route, token, false), recipient: ADDRESS_THIS, amountIn, amountOutMinimum: minOut }] }),
    encodeFunctionData({ abi: routerAbi, functionName: 'unwrapWETH9', args: [minOut, user] })
  ];
  const probe = encodeFunctionData({ abi: routerAbi, functionName: 'multicall', args: [deadline, calls(0n)] });
  const raw = await simulate(user, ROUTER, probe, 0n);
  const [first] = decodeFunctionResult({ abi: routerAbi, functionName: 'multicall', data: raw });
  const amountOut = decodeFunctionResult({ abi: routerAbi, functionName: 'exactInput', data: first });
  const minOut = amountOut * (10000n - slip) / 10000n;
  const data = encodeFunctionData({ abi: routerAbi, functionName: 'multicall', args: [deadline, calls(minOut)] });
  return { tx: { to: ROUTER, data, value: '0x0', chainId: config.chainId }, amountOut: amountOut.toString(), minOut: minOut.toString() };
}
