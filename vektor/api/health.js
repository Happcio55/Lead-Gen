// GET /api/health — whether the assistant is configured, and which model it runs.
import { MODES, settings } from './_core.js';

export default function handler(req, res) {
  const { model, hasKey } = settings();
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, s-maxage=30',
  });
  res.end(JSON.stringify({
    ok: hasKey,
    model,
    modes: Object.fromEntries(Object.entries(MODES).map(([id, m]) => [id, m.label])),
    time: new Date().toISOString(),
  }));
}
