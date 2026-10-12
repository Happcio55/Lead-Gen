// A tiny stand-in for the Anthropic Messages API that streams one canned answer.
import { createServer } from 'node:http';

export function startMockAnthropic({ text = 'Hello', thinking = 'Plan.', stopReason = 'end_turn' } = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    requests.push({ url: req.url, headers: req.headers, body });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 42, output_tokens: 0 } } });
    ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
    ev('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking } });
    ev('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'sig' } });
    ev('content_block_stop', { index: 0 });
    ev('content_block_start', { index: 1, content_block: { type: 'text', text: '' } });
    for (const part of text.match(/.{1,5}/gs) || []) ev('content_block_delta', { index: 1, delta: { type: 'text_delta', text: part } });
    ev('content_block_stop', { index: 1 });
    ev('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 17 } });
    ev('message_stop', {});
    res.end();
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ url: `http://localhost:${server.address().port}`, requests, close: () => server.close() })));
}
