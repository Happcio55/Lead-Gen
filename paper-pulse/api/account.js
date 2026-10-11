import { get, put } from '@vercel/blob'
import { readToken, readJson } from './_session.js'

// GET  -> { state, updatedAt } for the signed-in wallet (state is null for a new wallet)
// PUT  { state } -> saves it. Each wallet can only read and write its own file.
export default async function handler(req, res) {
  const address = readToken(req)
  if (!address) return res.status(401).json({ error: 'not_signed_in' })
  const path = `accounts/${address}.json`
  res.setHeader('cache-control', 'no-store')
  try {
    if (req.method === 'GET') {
      const r = await get(path, { access: 'private', useCache: false })
      if (!r || r.statusCode !== 200) return res.status(200).json({ state: null })
      const doc = JSON.parse(await new Response(r.stream).text())
      return res.status(200).json({ state: doc.state ?? null, updatedAt: doc.updatedAt ?? null })
    }
    if (req.method === 'PUT') {
      const { state } = await readJson(req)
      if (!state || typeof state !== 'object' || !state.accounts) return res.status(400).json({ error: 'bad_state' })
      const updatedAt = Date.now()
      await put(path, JSON.stringify({ address, updatedAt, state }), {
        access: 'private',
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: 'application/json',
      })
      return res.status(200).json({ ok: true, updatedAt })
    }
    return res.status(405).json({ error: 'method_not_allowed' })
  } catch (e) {
    if (e.name === 'BlobNotFoundError') return res.status(200).json({ state: null })
    return res.status(e.status || 500).json({ error: e.message || 'server_error' })
  }
}
