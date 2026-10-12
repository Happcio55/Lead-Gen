import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAbiParameters, decodeFunctionData, parseAbi } from 'viem';
import { ADDR } from '../shared/chain.js';
import { buildPonsBuyTx, buildRouteBuyTx, buildRouteSellTx, v2Out, v3Out } from '../shared/routes.js';
import { routeOf } from '../server/gecko.js';

const TOKEN = '0x1111111111111111111111111111111111111111';
const POOL = '0x2222222222222222222222222222222222222222';
const EXEC = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);
const V3_IN = [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'bool' }, { type: 'uint256[]' }];

test('routeOf maps GeckoTerminal DEXes to trade routes', () => {
  const id = '0x' + 'ab'.repeat(32);
  assert.equal(routeOf('pons-v2', POOL), 'pons');
  assert.equal(routeOf('pons-v2-dex', id), 'v4');
  assert.equal(routeOf('pons-dot-family', POOL), 'v3');
  assert.equal(routeOf('uniswap-v2-robinhood', POOL), 'v2');
  assert.equal(routeOf('uniswap-v4-robinhood', id), 'v4');
  assert.equal(routeOf('uniswap-v4-robinhood', POOL), null);
  assert.equal(routeOf('some-other-dex', POOL), null);
});

test('v3 buy wraps ETH then swaps WETH->token to the sender', () => {
  const tx = buildRouteBuyTx({ route: 'v3', token: TOKEN, fee: 10000 }, { amountIn: 10n ** 15n, minOut: 5n, deadline: 1n });
  assert.equal(tx.to, ADDR.UNIVERSAL_ROUTER);
  assert.equal(tx.value, 10n ** 15n);
  const { args } = decodeFunctionData({ abi: EXEC, data: tx.data });
  assert.equal(args[0], '0x0b00');
  const [recipient, amountIn, minOut, path, payerIsUser, hops] = decodeAbiParameters(V3_IN, args[1][1]);
  assert.equal(recipient, '0x0000000000000000000000000000000000000001');
  assert.equal(amountIn, 10n ** 15n);
  assert.equal(minOut, 5n);
  assert.equal(path.toLowerCase(), ADDR.WETH + '002710' + TOKEN.slice(2));
  assert.equal(payerIsUser, false);
  assert.deepEqual(hops, []);
});

test('v2 sell swaps through Permit2 then unwraps with the slippage floor', () => {
  const tx = buildRouteSellTx({ route: 'v2', token: TOKEN }, { amountIn: 7n, minOut: 3n, deadline: 1n });
  assert.equal(tx.value, 0n);
  const { args } = decodeFunctionData({ abi: EXEC, data: tx.data });
  assert.equal(args[0], '0x080c');
  const [, , , path, payerIsUser] = decodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'bool' }, { type: 'uint256[]' }],
    args[1][0]
  );
  assert.deepEqual(path.map((a) => a.toLowerCase()), [TOKEN, ADDR.WETH]);
  assert.equal(payerIsUser, true);
  const [to, min] = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], args[1][1]);
  assert.equal(to, '0x0000000000000000000000000000000000000001');
  assert.equal(min, 3n);
});

test('pons buy pays the pool directly', () => {
  const tx = buildPonsBuyTx({ poolAddress: POOL }, { amountIn: 9n, minOut: 4n, to: TOKEN });
  assert.equal(tx.to, POOL);
  assert.equal(tx.value, 9n);
  assert.equal(tx.data.slice(0, 10), '0x59a87bc1');
});

test('v2Out and v3Out agree with their pool math', () => {
  assert.equal(v2Out(1000n, 1_000_000n, 2_000_000n), 1992n);
  assert.equal(v2Out(1n, 0n, 5n), 0n);
  // At price 1 with deep liquidity a small swap returns ~amount minus the 1% fee.
  const Q96 = 2n ** 96n;
  for (const zeroForOne of [true, false]) {
    const out = v3Out(10n ** 18n, { sqrtPriceX96: Q96, liquidity: 10n ** 30n, fee: 10000, zeroForOne });
    assert.ok(out > 989n * 10n ** 15n && out < 990n * 10n ** 15n, String(out));
  }
});
