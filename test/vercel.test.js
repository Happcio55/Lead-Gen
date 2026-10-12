import test from 'node:test';
import assert from 'node:assert/strict';
import { originalUrl } from '../api/index.js';

test('rewritten Vercel URLs are restored to their original /api path', () => {
  assert.equal(originalUrl('/api?__path=board'), '/api/board');
  assert.equal(originalUrl('/api?__path=pool/0xabc&bucket=15000'), '/api/pool/0xabc?bucket=15000');
  assert.equal(originalUrl('/api?bucket=5000&__path=logo/0x12'), '/api/logo/0x12?bucket=5000');
  assert.equal(originalUrl('/api/board'), '/api/board'); // already original
});
