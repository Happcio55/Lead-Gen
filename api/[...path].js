// Vercel serverless entry for every /api/* route.
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

export default async function handler(req, res) {
  await api(req, res);
}
