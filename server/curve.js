// Bonding-curve trading for launches that haven't reached a DEX yet.
// The common Robinhood Chain launchpad curve exposes buy(uint256 ethIn, uint256 minOut, address recipient) payable
// and sell(uint256 tokensIn, uint256 minEthOut, address recipient). We locate a token's curve from real buy
// transactions and confirm it by simulation before trusting it.
import { encodeFunctionData, decodeFunctionResult, parseAbi, toFunctionSelector } from 'viem';
import { rpc, getLogs, topicToAddr } from './rpc.js';
import { TOPIC } from './config.js';

const abi = parseAbi([
  'function buy(uint256 amountIn, uint256 minOut, address recipient) payable returns (uint256)',
  'function sell(uint256 amountIn, uint256 minOut, address recipient) returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]);
const BUY = toFunctionSelector('buy(uint256,uint256,address)');
const SELL = toFunctionSelector('sell(uint256,uint256,address)');
const PROBE = '0x00000000000000000000000000000000000c0ffe';
const hex = n => '0x' + BigInt(n).toString(16);
const cache = new Map();

// Runs calls in sequence on top of current state (eth_simulateV1), returning each call's result and logs.
export async function simulate(from, calls, balance = 10n ** 20n) {
  const r = await rpc('eth_simulateV1', [{
    blockStateCalls: [{ stateOverrides: { [from]: { balance: hex(balance) } }, calls: calls.map(c => ({ from, to: c.to, data: c.data, value: hex(c.value || 0) })) }],
    validation: false,
    traceTransfers: true
  }, 'latest']);
  return r[0].calls;
}

async function verify(curve, token) {
  const data = encodeFunctionData({ abi, functionName: 'buy', args: [10n ** 14n, 0n, PROBE] });
  const [c] = await simulate(PROBE, [{ to: curve, data, value: 10n ** 14n }]).catch(() => [null]);
  if (!c || c.status !== '0x1') return false;
  return c.logs.some(l => l.address.toLowerCase() === token && l.topics[0] === TOPIC.TRANSFER && topicToAddr(l.topics[2]) === PROBE);
}

// Returns the curve address for `token`, or null if it isn't on an ETH-quoted curve (or has graduated).
export async function findCurve(token, hint = []) {
  token = token.toLowerCase();
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < (hit.curve ? 120e3 : 600e3)) return hit.curve;
  const candidates = new Set(hint.map(a => a.toLowerCase()));
  const tip = BigInt(await rpc('eth_blockNumber'));
  const logs = await getLogs({ address: token, topics: [TOPIC.TRANSFER] }, tip - 99999n, tip).catch(() => []);
  for (const l of logs.slice(-40).reverse()) {
    if (candidates.size >= 4) break;
    const tx = await rpc('eth_getTransactionByHash', [l.transactionHash]).catch(() => null);
    if (tx && tx.to && (tx.input.startsWith(BUY) || tx.input.startsWith(SELL))) candidates.add(tx.to.toLowerCase());
    if (l.topics.length === 3) candidates.add(topicToAddr(l.topics[1]));
  }
  let curve = null;
  for (const c of candidates) {
    if (c === '0x0000000000000000000000000000000000000000') continue;
    if (await verify(c, token)) { curve = c; break; }
  }
  cache.set(token, { at: Date.now(), curve });
  return curve;
}

// Buy: returns the tx plus a simulated output. Sell: approve (if needed) + sell, simulated together.
export async function buildCurveTrade({ user, token, side, amount, slippageBps = 100, recipient }) {
  const curve = await findCurve(token);
  if (!curve) return null;
  const amountIn = BigInt(amount);
  const slip = BigInt(Math.max(10, Math.min(5000, Math.round(Number(slippageBps) || 100))));
  const to = (recipient || user).toLowerCase();

  if (side !== 'sell') {
    const probe = encodeFunctionData({ abi, functionName: 'buy', args: [amountIn, 0n, to] });
    const [c] = await simulate(user, [{ to: curve, data: probe, value: amountIn }], amountIn + 10n ** 17n);
    if (c.status !== '0x1') throw new Error('The curve rejected this buy (it may have just graduated to a DEX)');
    const out = decodeFunctionResult({ abi, functionName: 'buy', data: c.returnData });
    const minOut = out * (10000n - slip) / 10000n;
    return { curve, amountOut: out, minOut, tx: { to: curve, data: encodeFunctionData({ abi, functionName: 'buy', args: [amountIn, minOut, to] }), value: amountIn } };
  }

  const approve = { to: token, data: encodeFunctionData({ abi, functionName: 'approve', args: [curve, amountIn] }), value: 0n };
  const probe = { to: curve, data: encodeFunctionData({ abi, functionName: 'sell', args: [amountIn, 0n, to] }), value: 0n };
  const calls = await simulate(user, [approve, probe]);
  const s = calls[1];
  if (calls[0].status !== '0x1' || s.status !== '0x1') throw new Error('The curve rejected this sell (check your token balance)');
  const out = decodeFunctionResult({ abi, functionName: 'sell', data: s.returnData });
  const minOut = out * (10000n - slip) / 10000n;
  return { curve, amountOut: out, minOut, approve, tx: { to: curve, data: encodeFunctionData({ abi, functionName: 'sell', args: [amountIn, minOut, to] }), value: 0n } };
}
