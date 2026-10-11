// Small JSON-file persistence: state survives restarts without needing a database server.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const file = path.join(config.dataDir, 'state.json');

export const db = {
  cursor: null,          // last block processed by the live indexer
  backfill: null,        // { from, to, next } forward backfill window
  tokens: {},            // addr -> launch record (+ score, market)
  stocks: {},            // addr -> { symbol, name, decimals }
  oldTokens: {},         // addr -> 1 for tokens known to predate tracking
  ai: {}                 // cache key -> explanation text
};

export function load() {
  try {
    Object.assign(db, JSON.parse(fs.readFileSync(file, 'utf8')));
    console.log(`[store] loaded ${Object.keys(db.tokens).length} launches, ${Object.keys(db.stocks).length} stock tokens`);
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[store] could not read state:', e.message);
  }
}

let saving = false;
export function save() {
  if (saving) return;
  saving = true;
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.warn('[store] save failed:', e.message);
  } finally {
    saving = false;
  }
}

// Keep the file bounded: drop launches older than a week and cap the "old" set.
export function prune() {
  const cutoff = Date.now() - 7 * 864e5;
  for (const [a, t] of Object.entries(db.tokens)) if (t.createdAt < cutoff) delete db.tokens[a];
  const old = Object.keys(db.oldTokens);
  if (old.length > 50000) for (const a of old.slice(0, old.length - 40000)) delete db.oldTokens[a];
  const ai = Object.keys(db.ai);
  if (ai.length > 5000) for (const k of ai.slice(0, ai.length - 4000)) delete db.ai[k];
}
