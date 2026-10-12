import test from 'node:test';
import assert from 'node:assert/strict';
import { isMemecoin, parseLogo, parseSocials } from '../server/meme.js';

test('launchpad tokens with on-chain artwork are memecoins', () => {
  assert.ok(isMemecoin({ symbol: 'USDG', name: 'Global Dollar', logo: { cid: 'x' } }));
});

test('non-launchpad stables, stocks, wrapped assets and test spam are filtered out', () => {
  for (const [symbol, name] of [
    ['84', '84'],
    ['USDG', 'Global Dollar'],
    ['GOOGL', 'Alphabet Class A 72d05'],
    ['WETH', 'Wrapped Ether'],
    ['RCC', 'Programmable Fee Policy Check'],
  ]) {
    assert.equal(isMemecoin({ symbol, name, logo: null }), false, name);
  }
  assert.ok(isMemecoin({ symbol: 'RRR', name: 'RRR', logo: null }));
  assert.ok(isMemecoin({ symbol: 'SI', name: 'smoking Inu', logo: null }));
});

test('parseLogo accepts ipfs and https only', () => {
  const cid = 'QmS4FTTweTYNsNaFhKeyA51Nj3sRYp2o1sUE9AxSKLNPpG';
  assert.deepEqual(parseLogo(`ipfs://${cid}`), { cid });
  assert.deepEqual(parseLogo(`https://gateway.pinata.cloud/ipfs/${cid}`), { cid });
  assert.deepEqual(parseLogo('https://cdn.example.com/a.png'), { url: 'https://cdn.example.com/a.png' });
  assert.equal(parseLogo('http://insecure.example.com/a.png'), null);
  assert.equal(parseLogo('javascript:alert(1)'), null);
  assert.equal(parseLogo('ipfs://not-a-cid'), null);
});

test('parseSocials keeps only https links', () => {
  assert.deepEqual(parseSocials(['https://x.com/i/communities/1', '', 'javascript:x']), { x: 'https://x.com/i/communities/1', tg: null, web: null });
  assert.equal(parseSocials(['', '', '']), null);
});
