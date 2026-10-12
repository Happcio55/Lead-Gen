// Vercel serverless entry for every /api/* route.
// vercel.json rewrites /api/<anything> here as /api?__path=<anything>, because Vercel's file-based
// routing only matches single-segment paths for plain functions (/api/pool/<id> would 404).
// The indexer lives in module scope, so a warm instance keeps its index between requests and
// only fetches new blocks; a cold instance backfills first (a few seconds).
import { waitUntil } from '@vercel/functions';
import { DEFAULT_RPC } from '../shared/chain.js';
import { createApi } from '../server/app.js';
import { Indexer } from '../server/indexer.js';

const indexer = new Indexer({
  rpcUrl: process.env.RH_RPC_URL || DEFAULT_RPC,
  backfillBlocks: BigInt(process.env.BACKFILL_BLOCKS || 36_000),
});
const api = createApi({ indexer, lazy: true, defer: waitUntil });

// Restore the original /api/... path from the rewrite's query parameter.
export function originalUrl(raw) {
  const url = new URL(raw, 'http://localhost');
  const path = url.searchParams.get('__path');
  if (path == null) return raw;
  url.searchParams.delete('__path');
  return `/api/${path.replace(/^\/+/, '')}${url.search}`;
}

export default async function handler(req, res) {
  req.url = originalUrl(req.url);
  await api(req, res);
}
