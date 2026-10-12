// Image proxy for token logos stored on IPFS. Tries several public gateways and caches the
// result at the edge for a week, so visitors don't hit gateway rate limits.
export const config = { runtime: 'edge' }

const FAST = ['https://ipfs.filebase.io/ipfs/', 'https://4everland.io/ipfs/', 'https://ipfs.io/ipfs/']
const SLOW = ['https://gateway.pinata.cloud/ipfs/', 'https://dweb.link/ipfs/']

export default async function handler(req) {
  const u = new URL(req.url).searchParams.get('u') || ''
  const m = u.match(/^ipfs:\/\/([a-zA-Z0-9]{20,100})(\/[\w.\-/]*)?$/)
  if (!m) return new Response('bad url', { status: 400 })
  const path = m[1] + (m[2] || '')
  const get = async (g, ms) => {
    const r = await fetch(g + path, { signal: AbortSignal.timeout(ms) })
    const type = r.headers.get('content-type') || ''
    if (!r.ok || /text|html|json/.test(type)) throw new Error('bad')
    const body = await r.arrayBuffer()
    if (body.byteLength > 5_000_000) throw new Error('too big')
    return new Response(body, { headers: { 'content-type': type || 'image/png', 'cache-control': 'public, max-age=86400, s-maxage=604800, immutable' } })
  }
  // race the fast gateways, then fall back to the slower ones
  try {
    return await Promise.any(FAST.map((g) => get(g, 5000)))
  } catch {}
  try {
    return await Promise.any(SLOW.map((g) => get(g, 9000)))
  } catch {}
  return new Response('not found', { status: 404, headers: { 'cache-control': 'public, s-maxage=300' } })
}
