import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corsHeaders, createRateLimiter, LIMITS, MODES, systemPrompt, validateChat } from '../api/_core.js';

test('validateChat accepts a normal conversation and defaults the mode', () => {
  const out = validateChat({ messages: [{ role: 'user', content: ' hi ' }] });
  assert.deepEqual(out, { mode: 'code', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(validateChat({ mode: 'solidity', messages: [{ role: 'user', content: 'x' }] }).mode, 'solidity');
  assert.equal(validateChat({ mode: 'nope', messages: [{ role: 'user', content: 'x' }] }).mode, 'code');
});

test('validateChat rejects bad shapes', () => {
  assert.throws(() => validateChat(null), /JSON/);
  assert.throws(() => validateChat({ messages: [] }), /at least one/);
  assert.throws(() => validateChat({ messages: [{ role: 'system', content: 'x' }] }), /at least one|role/);
  assert.throws(() => validateChat({ messages: [{ role: 'user', content: '' }] }), /empty/);
  assert.throws(() => validateChat({ messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }] }), /alternate/);
  assert.throws(() => validateChat({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] }), /last message/);
  assert.throws(() => validateChat({ messages: [{ role: 'user', content: 'x'.repeat(LIMITS.messageChars + 1) }] }), /at most/);
  assert.throws(() => validateChat({ messages: [{ role: 'user', content: { evil: true } }] }), /empty/);
});

test('validateChat keeps only recent turns and starts on a user turn', () => {
  const messages = [];
  for (let i = 0; i < 40; i++) messages.push({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` });
  messages.push({ role: 'user', content: 'last' });
  const out = validateChat({ messages }).messages;
  assert.ok(out.length <= LIMITS.messages);
  assert.equal(out[0].role, 'user');
  assert.equal(out.at(-1).content, 'last');
});

test('rate limiter allows `limit` hits per window', () => {
  let now = 0;
  const check = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
  assert.equal(check('a').ok, true);
  assert.equal(check('a').ok, true);
  assert.equal(check('a').ok, false);
  assert.equal(check('b').ok, true);
  now = 1001;
  assert.equal(check('a').ok, true);
});

test('system prompt includes the mode instruction', () => {
  for (const id of Object.keys(MODES)) assert.ok(systemPrompt(id).includes(MODES[id].prompt));
  assert.ok(systemPrompt('unknown').includes(MODES.code.prompt));
});

test('CORS is closed unless origins are allowed', () => {
  assert.deepEqual(corsHeaders('https://a.com', {}), {});
  assert.deepEqual(corsHeaders('https://a.com', { ALLOWED_ORIGINS: 'https://b.com' }), {});
  assert.equal(corsHeaders('https://a.com', { ALLOWED_ORIGINS: 'https://b.com, https://a.com' })['access-control-allow-origin'], 'https://a.com');
  assert.equal(corsHeaders('https://a.com', { ALLOWED_ORIGINS: '*' })['access-control-allow-origin'], '*');
});
