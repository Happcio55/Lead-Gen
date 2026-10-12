// Uniswap v4 trades on Robinhood Chain through the official Universal Router (2.1.2).
// Pools are found on DexScreener; their PoolKey is recovered from the PoolManager's Initialize event and
// checked against the pool id. Every trade is simulated, and a pool is only used if the simulation shows
// the tokens actually arriving at the recipient (some hook pools ignore router swaps).
import { encodeAbiParameters, decodeAbiParameters, encodeFunctionData, parseAbi, keccak256, toHex } from 'viem';
import { client, getLogs, topicToAddr } from './rpc.js';
import { simulate } from './curve.js';
import { chain } from './indexer.js';
import { config, TOPIC, ADDR } from './config.js';

export const UNIVERSAL_ROUTER = '0x204faca1764b154221e35c0d20abb3c525710498';
const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';
const ETH = '0x0000000000000000000000000000000000000000';
const ETH_LOG = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; // eth_simulateV1 traceTransfers pseudo-address
const INITIALIZE = keccak256(toHex('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)'));
const V4_SWAP = '0x10';
const ACTIONS = '0x070b0e'; // SWAP_EXACT_IN, SETTLE, TAKE

const urAbi = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);
const erc20 = parseAbi(['function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)']);
const permit2Abi = parseAbi([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)'
]);
const swapParams = { type: 'tuple', components: [
  { name: 'currencyIn', type: 'address' },
  { name: 'path', type: 'tuple[]', components: [
    { name: 'intermediateCurrency', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' }, { name: 'hookData', type: 'bytes' }] },
  { name: 'maxHopSlippage', type: 'uint256[]' },
  { name: 'amountIn', type: 'uint128' },
  { name: 'amountOutMinimum', type: 'uint128' }] };

const pools = new Map();
const PROBE = '0x00000000000000000000000000000000000c0ffe';

export async function poolKey(poolId, createdAt) {
  const tip = BigInt(chain.tip || await client.getBlockNumber());
  const est = createdAt ? tip - BigInt(Math.max(0, Math.round((Date.now() - createdAt) / (chain.blockMs || 100)))) : tip;
  const logs = await getLogs({ address: POOL_MANAGER, topics: [INITIALIZE, poolId] }, est - 60000n, est + 60000n < tip ? est + 60000n : tip).catch(() => []);
  if (!logs.length) return null;
  const [fee, tickSpacing, hooks] = decodeAbiParameters([{ type: 'uint24' }, { type: 'int24' }, { type: 'address' }], logs[0].data);
  const key = { currency0: topicToAddr(logs[0].topics[2]), currency1: topicToAddr(logs[0].topics[3]), fee, tickSpacing, hooks: hooks.toLowerCase() };
  const id = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
    [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
  return id === poolId.toLowerCase() ? key : null;
}

const ADDRESS_THIS = '0x0000000000000000000000000000000000000002'; // router-internal recipient
const WRAP_ETH = '0x0b', UNWRAP_WETH = '0x0c';

function v4Input(currencyIn, hop, amountIn, minOut, currencyOut, recipient, payerIsUser) {
  const swap = encodeAbiParameters([swapParams], [{ currencyIn, path: [{ intermediateCurrency: currencyOut, fee: hop.fee, tickSpacing: hop.tickSpacing, hooks: hop.hooks, hookData: '0x' }], maxHopSlippage: [], amountIn, amountOutMinimum: minOut }]);
  const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }], [currencyIn, 0n, payerIsUser]);
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [currencyOut, recipient, 0n]);
  return encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [ACTIONS, [swap, settle, take]]);
}
const exec = (commands, inputs) => encodeFunctionData({ abi: urAbi, functionName: 'execute', args: [commands, inputs, BigInt(Math.floor(Date.now() / 1000) + 1200)] });
const addrAmount = (a, n) => encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [a, n]);

// Some hook pools only accept sells from their launchpad's own router (the hook reverts with
// SellNotAllowed for the Universal Router). Known routers are tried, and only used when a simulation
// shows the sale paying out to the seller.
const LAUNCH_ROUTERS = ['0xf4275f2429562e9e588d2d229710d06d6b1fa3b8'];
// swap(PoolKey key, bool zeroForOne, uint256 amountIn, uint256 minOut, address recipient, uint256 deadline)
const LAUNCH_SWAP = '0xb3938887';
function launchSwapData(hop, token, amountIn, minOut, recipient) {
  const [c0, c1] = [hop.quote, token].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  return LAUNCH_SWAP + encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }, { type: 'bool' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
    [c0, c1, hop.fee, hop.tickSpacing, hop.hooks, c0 === token, amountIn, minOut, recipient, BigInt(Math.floor(Date.now() / 1000) + 1200)]
  ).slice(2);
}

// Pools are paired with native ETH or with WETH. WETH pools wrap ETH first on buys and unwrap on sells,
// so the user always pays and receives plain ETH.
function buyData(hop, token, amountIn, minOut, recipient) {
  if (hop.quote === ETH) return exec(V4_SWAP, [v4Input(ETH, hop, amountIn, minOut, token, recipient, true)]);
  return exec(WRAP_ETH + V4_SWAP.slice(2), [addrAmount(ADDRESS_THIS, amountIn), v4Input(ADDR.WETH, hop, amountIn, minOut, token, recipient, false)]);
}
function sellData(hop, token, amountIn, minOut, recipient) {
  if (hop.quote === ETH) return exec(V4_SWAP, [v4Input(token, hop, amountIn, minOut, ETH, recipient, true)]);
  return exec(V4_SWAP + UNWRAP_WETH.slice(2), [v4Input(token, hop, amountIn, minOut, ADDR.WETH, ADDRESS_THIS, true), addrAmount(recipient, minOut)]);
}

const received = (logs, asset, recipient) => logs
  .filter(l => l.address.toLowerCase() === asset && l.topics[0] === TOPIC.TRANSFER && l.topics.length === 3 && topicToAddr(l.topics[2]) === recipient)
  .reduce((s, l) => s + BigInt(l.data), 0n);

// Most liquid ETH- or WETH-paired v4 pool for `token` that really delivers tokens when swapped through the router.
export async function findV4Pool(token) {
  token = token.toLowerCase();
  const hit = pools.get(token);
  if (hit && Date.now() - hit.at < 1800e3) return hit.hop;
  const pairs = await fetch(`${config.dexscreenerApi}/token-pairs/v1/robinhood/${token}`, { signal: AbortSignal.timeout(15000) })
    .then(r => r.json()).catch(() => []);
  const v4 = (Array.isArray(pairs) ? pairs : []).filter(p => p.dexId === 'uniswap' && (p.labels || []).includes('v4'))
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)).slice(0, 3);
  let hop = null;
  for (const p of v4) {
    const key = await poolKey(p.pairAddress, p.pairCreatedAt);
    if (!key) continue;
    const pair = [key.currency0, key.currency1];
    const quote = pair.includes(ETH) ? ETH : pair.includes(ADDR.WETH) ? ADDR.WETH : null;
    if (!quote || !pair.includes(token)) continue;
    const h = { fee: key.fee, tickSpacing: key.tickSpacing, hooks: key.hooks, quote };
    const [c] = await simulate(PROBE, [{ to: UNIVERSAL_ROUTER, data: buyData(h, token, 10n ** 14n, 0n, PROBE), value: 10n ** 14n }]).catch(() => [null]);
    if (c && c.status === '0x1' && received(c.logs, token, PROBE) > 0n) { hop = h; break; }
  }
  pools.set(token, { at: Date.now(), hop, blocked: !hop && v4.length > 0 });
  return hop;
}

// True when the token has v4 pools but none of them accepts trades from public routers (hook-gated, usually bot-only).
export const v4Blocked = token => Boolean(pools.get(token.toLowerCase())?.blocked);

// Same result shape as the v3 and curve builders: { amountOut, minOut, tx, approve, approve2 }.
export async function buildV4Trade({ user, token, side, amount, slippageBps = 100, recipient }) {
  token = token.toLowerCase(); user = user.toLowerCase();
  const to = (recipient || user).toLowerCase();
  const hop = await findV4Pool(token);
  if (!hop) return null;
  const amountIn = BigInt(amount);
  const slip = BigInt(Math.max(10, Math.min(5000, Math.round(Number(slippageBps) || 100))));

  if (side !== 'sell') {
    const [c] = await simulate(user, [{ to: UNIVERSAL_ROUTER, data: buyData(hop, token, amountIn, 0n, to), value: amountIn }], amountIn + 10n ** 17n);
    const out = c.status === '0x1' ? received(c.logs, token, to) : 0n;
    if (!out) throw new Error('The v4 pool rejected this buy');
    const minOut = out * (10000n - slip) / 10000n;
    return { amountOut: out, minOut, approve: null, tx: { to: UNIVERSAL_ROUTER, data: buyData(hop, token, amountIn, minOut, to), value: amountIn } };
  }

  // Sells pull tokens through Permit2: token -> Permit2 allowance, then Permit2 -> router allowance.
  const expiration = Math.floor(Date.now() / 1000) + 30 * 86400;
  const approve = { to: token, data: encodeFunctionData({ abi: erc20, functionName: 'approve', args: [PERMIT2, amountIn] }), value: 0n };
  const approve2 = { to: PERMIT2, data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [token, UNIVERSAL_ROUTER, amountIn, expiration] }), value: 0n };
  const sim = await simulate(user, [approve, approve2, { to: UNIVERSAL_ROUTER, data: sellData(hop, token, amountIn, 1n, to), value: 0n }]);
  const out = sim[2].status === '0x1' ? received(sim[2].logs, ETH_LOG, to) : 0n;
  if (!out) {
    const viaLaunchpad = await launchRouterSell(user, token, hop, amountIn, slip, to);
    if (viaLaunchpad) return viaLaunchpad;
    throw new Error('The v4 pool rejected this sell (check your token balance)');
  }
  const minOut = out * (10000n - slip) / 10000n;
  const [a1, a2] = await Promise.all([
    client.readContract({ address: token, abi: erc20, functionName: 'allowance', args: [user, PERMIT2] }),
    client.readContract({ address: PERMIT2, abi: permit2Abi, functionName: 'allowance', args: [user, token, UNIVERSAL_ROUTER] })
  ]);
  const permitOk = a2[0] >= amountIn && Number(a2[1]) > Date.now() / 1000 + 600;
  return {
    amountOut: out, minOut,
    approve: a1 >= amountIn ? null : approve,
    approve2: permitOk ? null : approve2,
    tx: { to: UNIVERSAL_ROUTER, data: sellData(hop, token, amountIn, minOut, to), value: 0n }
  };
}

async function launchRouterSell(user, token, hop, amountIn, slip, to) {
  const asset = hop.quote === ETH ? ETH_LOG : hop.quote;
  for (const router of LAUNCH_ROUTERS) {
    const approve = { to: token, data: encodeFunctionData({ abi: erc20, functionName: 'approve', args: [router, amountIn] }), value: 0n };
    const sim = await simulate(user, [approve, { to: router, data: launchSwapData(hop, token, amountIn, 0n, to), value: 0n }]).catch(() => null);
    const out = sim && sim[1].status === '0x1' ? received(sim[1].logs, asset, to) : 0n;
    if (!out) continue;
    const minOut = out * (10000n - slip) / 10000n;
    const allowance = await client.readContract({ address: token, abi: erc20, functionName: 'allowance', args: [user, router] });
    return {
      amountOut: out, minOut,
      approve: allowance >= amountIn ? null : approve, approve2: null,
      unwrapWeth: hop.quote === ADDR.WETH,
      tx: { to: router, data: launchSwapData(hop, token, amountIn, minOut, to), value: 0n }
    };
  }
  return null;
}
