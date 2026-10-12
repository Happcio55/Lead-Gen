import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAbiParameters, decodeFunctionData, parseEther } from 'viem';
import { ADDR, ROUTER_ABI } from '../shared/chain.js';
import { buildBuyTx, buildSellTx, ethPerToken, isTradable, virtualEthReserve, withSlippage } from '../shared/v4.js';

const pool = {
  currency0: ADDR.ETH,
  currency1: '0x75fb8000000000000000000000000000000cf79c',
  fee: 10000,
  tickSpacing: 200,
  hooks: '0x0000000000000000000000000000000000000000',
};

function decodeSwap(tx) {
  const { args } = decodeFunctionData({ abi: ROUTER_ABI, data: tx.data });
  const [commands, inputs] = args;
  const [actions, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], inputs[0]);
  return { commands, actions, params };
}

test('buy encodes a single V4_SWAP with exact-in, settle-all, take-all', () => {
  const amountIn = parseEther('0.01');
  const tx = buildBuyTx(pool, { amountIn, minOut: 123n, deadline: 999n });
  assert.equal(tx.to, ADDR.UNIVERSAL_ROUTER);
  assert.equal(tx.value, amountIn);
  const { commands, actions, params } = decodeSwap(tx);
  assert.equal(commands, '0x10');
  assert.equal(actions, '0x060c0f');
  assert.equal(params.length, 3);
  const [settleCurrency, settleAmount] = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], params[1]);
  assert.equal(settleCurrency, ADDR.ETH);
  assert.equal(settleAmount, amountIn);
  const [takeCurrency, takeMin] = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], params[2]);
  assert.equal(takeCurrency.toLowerCase(), pool.currency1.toLowerCase());
  assert.equal(takeMin, 123n);
});

test('sell sends no ETH and settles the token side', () => {
  const tx = buildSellTx(pool, { amountIn: 5000n, minOut: 7n, deadline: 999n });
  assert.equal(tx.value, 0n);
  const { params } = decodeSwap(tx);
  const [settleCurrency, settleAmount] = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], params[1]);
  assert.equal(settleCurrency.toLowerCase(), pool.currency1.toLowerCase());
  assert.equal(settleAmount, 5000n);
  const [takeCurrency] = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], params[2]);
  assert.equal(takeCurrency, ADDR.ETH);
});

test('slippage floors the minimum output', () => {
  assert.equal(withSlippage(10_000n, 1500), 8_500n);
  assert.equal(withSlippage(10_000n, 0), 10_000n);
});

test('only native-ETH pools are tradable', () => {
  assert.ok(isTradable(pool));
  assert.ok(!isTradable({ ...pool, currency0: ADDR.WETH }));
});

test('price math: sqrtPriceX96 -> ETH per token', () => {
  // 1 ETH = 1,000,000 tokens (18 decimals) => raw price 1e6 => sqrt = 1000
  const sqrt = 1000n * 2n ** 96n;
  const p = ethPerToken(sqrt, 18);
  assert.ok(Math.abs(p - 1e-6) / 1e-6 < 1e-9);
  // 6-decimal token at the same human price: raw ratio is 1e-6 => sqrt = 1e-3
  const sqrt6 = 2n ** 96n / 1000n;
  assert.ok(Math.abs(ethPerToken(sqrt6, 6) - 1e-6) / 1e-6 < 1e-6);
});

test('virtual ETH reserve: L / sqrtP', () => {
  const sqrt = 1000n * 2n ** 96n;
  const L = 10n ** 21n; // => 1e21 / 1000 wei = 1e18 wei = 1 ETH
  assert.ok(Math.abs(virtualEthReserve(L, sqrt) - 1) < 1e-9);
});
