import test from 'node:test';
import assert from 'node:assert/strict';
import { Indexer, candles, sample } from '../server/indexer.js';

const ETH = '0x0000000000000000000000000000000000000000';
const TOKEN = '0x1111111111111111111111111111111111111111';
const ID = '0x' + 'ab'.repeat(32);
const Q96 = 2n ** 96n;

function fresh() {
  const ix = new Indexer({ rpcUrl: 'http://127.0.0.1:1', log: {} });
  ix.ethUsd = 2000;
  ix.tokens.set(TOKEN, { address: TOKEN, name: 'Test', symbol: 'TST', decimals: 18, supply: 1e9 });
  ix.onInitialize(
    { args: { id: ID, currency0: ETH, currency1: TOKEN, fee: 10000, tickSpacing: 200, hooks: ETH, sqrtPriceX96: 1000n * Q96 }, blockNumber: 1n, transactionHash: '0x01' },
    1_000_000
  );
  return ix;
}

test('initialize registers an ETH pool with its starting price', () => {
  const ix = fresh();
  const row = ix.row(ix.pools.get(ID), 1_000_000);
  assert.equal(row.symbol, 'TST');
  assert.ok(Math.abs(row.priceEth - 1e-6) < 1e-15);
  assert.ok(Math.abs(row.mcapUsd - 1e-6 * 1e9 * 2000) < 1e-3);
});

test('swap direction: ETH paid in (amount0 < 0) is a buy', () => {
  const ix = fresh();
  const base = { id: ID, sender: ETH, sqrtPriceX96: 1100n * Q96, liquidity: 10n ** 21n, tick: 0, fee: 10000 };
  ix.onSwap({ args: { ...base, amount0: -(10n ** 17n), amount1: 9n * 10n ** 22n }, blockNumber: 2n, transactionHash: '0x02' }, 1_001_000);
  ix.onSwap({ args: { ...base, amount0: 5n * 10n ** 16n, amount1: -(4n * 10n ** 22n) }, blockNumber: 3n, transactionHash: '0x03' }, 1_002_000);
  const p = ix.pools.get(ID);
  assert.equal(p.buys, 1);
  assert.equal(p.sells, 1);
  assert.ok(Math.abs(p.volEth - 0.15) < 1e-12);
  const row = ix.row(p, 1_002_500);
  assert.equal(row.buys5m, 1);
  assert.equal(row.sells5m, 1);
  assert.ok(row.liqUsd > 0);
});

test('swaps on unknown pools are ignored', () => {
  const ix = fresh();
  const r = ix.onSwap({ args: { id: '0x' + 'cd'.repeat(32), amount0: -1n, amount1: 1n, sqrtPriceX96: Q96, liquidity: 1n } }, 1);
  assert.equal(r, null);
});

test('candles bucket prices into OHLC', () => {
  const c = candles(
    [
      { t: 0, p: 1 },
      { t: 500, p: 3 },
      { t: 900, p: 2 },
      { t: 1000, p: 4 },
    ],
    1000
  );
  assert.equal(c.length, 2);
  assert.deepEqual([c[0].o, c[0].h, c[0].l, c[0].c], [1, 3, 1, 2]);
  assert.deepEqual([c[1].o, c[1].c], [2, 4]);
});

test('sample carries the last value forward', () => {
  const s = sample([{ t: 0, p: 1 }, { t: 50, p: 2 }], 3, 0);
  assert.deepEqual(s, [1, 1, 2]);
});
