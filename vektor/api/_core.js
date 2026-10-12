// Shared logic for the chat endpoint: modes, request validation, rate limiting and the Claude stream.
// Files in api/ that start with an underscore are not routes on Vercel.
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-opus-5-5';

const BASE_PROMPT = `You are Vektor, a code-first programming assistant on a public website.

How you answer:
- Lead with the code in a fenced block tagged with its language. Then at most two short sentences.
- No preamble, no restating the question, no closing offers.
- Prefer small, complete, runnable snippets over fragments. Use current, idiomatic APIs.
- If the request is ambiguous, pick the most common reading and say which in one sentence.
- Reply in the language the user writes in. Code comments stay in English.
- If something cannot be done safely or correctly, say so plainly instead of guessing.`;

export const MODES = {
  code: {
    label: 'Code',
    prompt: 'Mode: write code. Return the snippet the user asked for.',
  },
  fix: {
    label: 'Fix',
    prompt: 'Mode: fix a bug. Return the corrected code, then one sentence naming what was wrong.',
  },
  explain: {
    label: 'Explain',
    prompt: 'Mode: explain code. Give a plain-language explanation in at most five short bullets. Quote only the lines that matter.',
  },
  solidity: {
    label: 'Solidity',
    prompt: 'Mode: smart contracts. Write Solidity ^0.8.20, prefer OpenZeppelin v5 imports, and flag any risky pattern in one line. End with: "Get an audit before deploying with real funds."',
  },
  translate: {
    label: 'Translate',
    prompt: 'Mode: translate code. Port the given code to the target language the user names (ask for it in one line if missing), keeping behavior identical and using that language\'s idioms.',
  },
};

export const LIMITS = {
  messages: 16,
  messageChars: 12_000,
  totalChars: 40_000,
};

export function systemPrompt(mode) {
  return `${BASE_PROMPT}\n\n${(MODES[mode] || MODES.code).prompt}`;
}

// Accepts { mode, messages: [{ role, content }] } where content is a string.
// Returns { mode, messages } or throws an Error with a user-facing message.
export function validateChat(body) {
  if (!body || typeof body !== 'object') throw new Error('Expected a JSON body.');
  const mode = typeof body.mode === 'string' && MODES[body.mode] ? body.mode : 'code';
  const raw = Array.isArray(body.messages) ? body.messages : null;
  if (!raw || raw.length === 0) throw new Error('Send at least one message.');

  // Keep the latest turns only, and start on a user turn.
  let list = raw.slice(-LIMITS.messages);
  while (list.length && list[0]?.role !== 'user') list = list.slice(1);

  let total = 0;
  const messages = list.map((m, i) => {
    const role = m?.role;
    const content = typeof m?.content === 'string' ? m.content.trim() : '';
    if (role !== 'user' && role !== 'assistant') throw new Error('Each message needs a role of user or assistant.');
    if (!content) throw new Error('Messages cannot be empty.');
    if (content.length > LIMITS.messageChars) throw new Error(`Each message can be at most ${LIMITS.messageChars.toLocaleString('en')} characters.`);
    if (i > 0 && role === list[i - 1].role) throw new Error('Messages must alternate between user and assistant.');
    total += content.length;
    return { role, content };
  });
  if (!messages.length) throw new Error('Send at least one message.');
  if (messages.at(-1).role !== 'user') throw new Error('The last message must come from the user.');
  if (total > LIMITS.totalChars) throw new Error('This conversation is too long. Start a new one.');
  return { mode, messages };
}

// Best-effort, per-instance limiter. Use Vercel's firewall or a shared store for hard limits.
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  return function check(key) {
    const t = now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
    let entry = hits.get(key);
    if (!entry || entry.reset <= t) {
      entry = { count: 0, reset: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return { ok: entry.count <= limit, remaining: Math.max(0, limit - entry.count), reset: entry.reset };
  };
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function settings(env = process.env) {
  return {
    model: env.VEKTOR_MODEL || DEFAULT_MODEL,
    effort: env.VEKTOR_EFFORT || 'low',
    maxTokens: Number(env.VEKTOR_MAX_TOKENS) || 8000,
    hasKey: Boolean(env.ANTHROPIC_API_KEY),
  };
}

// Streams one answer from Claude. `send(event)` receives
// { type: 'thinking' | 'text', text } chunks and finally { type: 'done', ... }.
export async function streamAnswer({ client, mode, messages, env = process.env, send, signal }) {
  const { model, effort, maxTokens } = settings(env);
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      // Server-side fallback: if a safety classifier declines, the API retries on Anthropic's
      // recommended fallback model inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort },
      system: systemPrompt(mode),
      messages,
    },
    { signal },
  );

  for await (const event of stream) {
    if (event.type !== 'content_block_delta') continue;
    if (event.delta.type === 'text_delta') send({ type: 'text', text: event.delta.text });
    else if (event.delta.type === 'thinking_delta' && event.delta.thinking) send({ type: 'thinking', text: event.delta.thinking });
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') {
    send({ type: 'notice', text: 'Claude declined this request. Try rephrasing it.' });
  } else if (final.stop_reason === 'max_tokens') {
    send({ type: 'notice', text: 'The answer hit the length limit. Ask to continue.' });
  }
  send({
    type: 'done',
    model: final.model,
    stop: final.stop_reason,
    usage: { input: final.usage?.input_tokens ?? 0, output: final.usage?.output_tokens ?? 0 },
  });
}

export function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return { status: 500, message: 'The server has an invalid Anthropic API key.' };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: 'Claude is busy right now. Try again in a moment.' };
  if (err instanceof Anthropic.BadRequestError) return { status: 400, message: 'Claude could not process this request.' };
  if (err instanceof Anthropic.APIError) return { status: 502, message: 'Claude returned an error. Try again.' };
  return { status: 500, message: 'Something went wrong. Try again.' };
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 200_000) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

// CORS for the public API. The widget runs on this site's own origin, so it never needs CORS.
export function corsHeaders(origin, env = process.env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.length) return {};
  if (allowed.includes('*') || allowed.includes(origin)) {
    return {
      'access-control-allow-origin': allowed.includes('*') ? '*' : origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      vary: 'origin',
    };
  }
  return {};
}
