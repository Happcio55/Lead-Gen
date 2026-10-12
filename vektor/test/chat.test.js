// Runs the real /api/chat handler against a mock Anthropic API and checks the event stream.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { startMockAnthropic } from './mock-anthropic.js';

let mock, server, base;
before(async () => {
  mock = await startMockAnthropic({ text: '```js\nconsole.log(1)\n```\nPrints 1.' });
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = mock.url;
  process.env.RATE_LIMIT = '3';
  const { default: chat } = await import('../api/chat.js');
  server = createServer(chat);
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => { server.close(); mock.close(); });

const post = (body) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('streams thinking, text and done events', async () => {
  const res = await post({ mode: 'fix', messages: [{ role: 'user', content: 'print 1 in js' }] });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const events = (await res.text()).split('\n\n').filter(Boolean).map((c) => JSON.parse(c.replace(/^data: /, '')));
  const text = events.filter((e) => e.type === 'text').map((e) => e.text).join('');
  assert.equal(text, '```js\nconsole.log(1)\n```\nPrints 1.');
  assert.ok(events.some((e) => e.type === 'thinking' && e.text === 'Plan.'));
  const done = events.at(-1);
  assert.equal(done.type, 'done');
  assert.equal(done.usage.output, 17);

  const sent = mock.requests.at(-1);
  assert.equal(sent.body.model, 'claude-opus-5-5');
  assert.equal(sent.body.fallbacks, 'default');
  assert.match(sent.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.deepEqual(sent.body.thinking, { type: 'adaptive', display: 'summarized' });
  assert.match(sent.body.system, /Mode: fix a bug/);
  assert.deepEqual(sent.body.messages, [{ role: 'user', content: 'print 1 in js' }]);
});

test('rejects invalid bodies with 400', async () => {
  const res = await post({ messages: [{ role: 'assistant', content: 'x' }] });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).error);
});

test('rate limits per client', async () => {
  // RATE_LIMIT is 3 and two requests were made above, so the fourth is blocked.
  assert.equal((await post({ messages: [{ role: 'user', content: 'again' }] })).status, 200);
  const res = await post({ messages: [{ role: 'user', content: 'again' }] });
  assert.equal(res.status, 429);
  assert.ok(res.headers.get('retry-after'));
});

test('rejects GET', async () => {
  assert.equal((await fetch(base)).status, 405);
});
