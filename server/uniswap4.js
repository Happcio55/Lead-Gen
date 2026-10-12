// Uniswap v4 trades on Robinhood Chain through the official Universal Router (2.1.2).
// Pools are found on DexScreener; their PoolKey is recovered from the PoolManager's Initialize event and
// checked against the pool id. Every trade is simulated, and a pool is only used if the simulation shows
// the tokens actually arriving at the recipient (some hook pools ignore router swaps).
import { encodeAbiParameters, decodeAbiParameters, encodeFunctionData, parseAbi, keccak256, toHex } from 'viem';
import { client, getLogs, topicToAddr } from './rpc.js';
import { simulate } from './curve.js';
import { chain } from './indexer.js';
import { config, TOPIC } from './config.js';

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

async function poolKey(poolId, createdAt) {
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

function encode(currencyIn, hop, amountIn, minOut, currencyOut, recipient) {
  const swap = encodeAbiParameters([swapParams], [{ currencyIn, path: [{ intermediateCurrency: currencyOut, ...hop, hookData: '0x' }], maxHopSlippage: [], amountIn, amountOutMinimum: minOut }]);
  const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }], [currencyIn, 0n, true]);
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [currencyOut, recipient, 0n]);
  const input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [ACTIONS, [swap, settle, take]]);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  return encodeFunctionData({ abi: urAbi, functionName: 'execute', args: [V4_SWAP, [input], deadline] });
}

const received = (logs, asset, recipient) => logs
  .filter(l => l.address.toLowerCase() === asset && l.topics[0] === TOPIC.TRANSFER && l.topics.length === 3 && topicToAddr(l.topics[2]) === recipient)
  .reduce((s, l) => s + BigInt(l.data), 0n);

// Most liquid ETH-paired v4 pool for `token` that really delivers tokens when swapped through the router.
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
    if (!key || key.currency0 !== ETH || key.currency1 !== token) continue;
    const h = { fee: key.fee, tickSpacing: key.tickSpacing, hooks: key.hooks };
    const [c] = await simulate(PROBE, [{ to: UNIVERSAL_ROUTER, data: encode(ETH, h, 10n ** 14n, 0n, token, PROBE), value: 10n ** 14n }]).catch(() => [null]);
    if (c && c.status === '0x1' && received(c.logs, token, PROBE) > 0n) { hop = h; break; }
  }
  pools.set(token, { at: Date.now(), hop });
  return hop;
}

// Same result shape as the v3 and curve builders: { amountOut, minOut, tx, approve, approve2 }.
export async function buildV4Trade({ user, token, side, amount, slippageBps = 100, recipient }) {
  token = token.toLowerCase(); user = user.toLowerCase();
  const to = (recipient || user).toLowerCase();
  const hop = await findV4Pool(token);
  if (!hop) return null;
  const amountIn = BigInt(amount);
  const slip = BigInt(Math.max(10, Math.min(5000, Math.round(Number(slippageBps) || 100))));

  if (side !== 'sell') {
    const [c] = await simulate(user, [{ to: UNIVERSAL_ROUTER, data: encode(ETH, hop, amountIn, 0n, token, to), value: amountIn }], amountIn + 10n ** 17n);
    const out = c.status === '0x1' ? received(c.logs, token, to) : 0n;
    if (!out) throw new Error('The v4 pool rejected this buy');
    const minOut = out * (10000n - slip) / 10000n;
    return { amountOut: out, minOut, approve: null, tx: { to: UNIVERSAL_ROUTER, data: encode(ETH, hop, amountIn, minOut, token, to), value: amountIn } };
  }

  // Sells pull tokens through Permit2: token -> Permit2 allowance, then Permit2 -> router allowance.
  const expiration = Math.floor(Date.now() / 1000) + 30 * 86400;
  const approve = { to: token, data: encodeFunctionData({ abi: erc20, functionName: 'approve', args: [PERMIT2, amountIn] }), value: 0n };
  const approve2 = { to: PERMIT2, data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [token, UNIVERSAL_ROUTER, amountIn, expiration] }), value: 0n };
  const sim = await simulate(user, [approve, approve2, { to: UNIVERSAL_ROUTER, data: encode(token, hop, amountIn, 0n, ETH, to), value: 0n }]);
  const out = sim[2].status === '0x1' ? received(sim[2].logs, ETH_LOG, to) : 0n;
  if (!out) throw new Error('The v4 pool rejected this sell (check your token balance)');
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
    tx: { to: UNIVERSAL_ROUTER, data: encode(token, hop, amountIn, minOut, ETH, to), value: 0n }
  };
}
