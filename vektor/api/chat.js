// POST /api/chat — streams a Claude answer as server-sent events.
// Body: { mode: 'code' | 'fix' | 'explain' | 'solidity' | 'translate', messages: [{ role, content }] }
// Events: data: {"type":"thinking"|"text"|"notice","text":"..."} ... data: {"type":"done",...}
import Anthropic from '@anthropic-ai/sdk';
import { clientIp, corsHeaders, createRateLimiter, describeError, readJson, settings, streamAnswer, validateChat } from './_core.js';

const limiter = createRateLimiter({
  limit: Number(process.env.RATE_LIMIT) || 30,
  windowMs: (Number(process.env.RATE_WINDOW_MIN) || 10) * 60_000,
});
let client = null;

export default async function handler(req, res) {
  const cors = corsHeaders(req.headers.origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end();
    return;
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' }, cors);
  if (!settings().hasKey) return json(res, 503, { error: 'This site has no ANTHROPIC_API_KEY set yet.' }, cors);

  const rate = limiter(clientIp(req));
  if (!rate.ok) {
    const retry = Math.ceil((rate.reset - Date.now()) / 1000);
    return json(res, 429, { error: `Rate limit reached. Try again in ${Math.ceil(retry / 60)} min.` }, { ...cors, 'retry-after': String(retry) });
  }

  let chat;
  try {
    chat = validateChat(await readJson(req));
  } catch (err) {
    return json(res, 400, { error: err.message || 'Invalid request.' }, cors);
  }

  client ??= new Anthropic();
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  res.writeHead(200, {
    ...cors,
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
    'x-ratelimit-remaining': String(rate.remaining),
  });
  const send = (event) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await streamAnswer({ client, ...chat, send, signal: abort.signal });
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error('chat error:', err?.status ?? '', err?.message);
      send({ type: 'error', text: describeError(err).message });
    }
  }
  res.end();
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
