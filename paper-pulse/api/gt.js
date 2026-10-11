// Edge proxy for GeckoTerminal with CDN caching. Every visitor shares the cached
// responses, so the browser no longer has to queue calls under the per-IP limit.
export const config = { runtime: 'edge' }

const ORIGIN = 'https://api.geckoterminal.com/api/v2'
const ALLOWED = /^\/(networks\/robinhood\/|search\/pools\?)/

// seconds a response stays fresh at the edge, by endpoint
function ttl(path) {
  if (path.includes('/new_pools')) return 4
  if (path.includes('/trades')) return 6
  if (path.includes('/ohlcv/')) return 15
  if (path.includes('/trending_pools') || path.includes('/pools?')) return 30
  if (path.startsWith('/search/')) return 60
  return 10
}

export default async function handler(req) {
  const p = new URL(req.url).searchParams.get('p') || ''
  if (!ALLOWED.test(p) || p.length > 600) return new Response('Bad path', { status: 400 })
  const r = await fetch(ORIGIN + p, { headers: { accept: 'application/json' } })
  const body = await r.text()
  const s = ttl(p)
  return new Response(body, {
    status: r.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': r.ok ? `public, max-age=0, s-maxage=${s}, stale-while-revalidate=${s * 6}` : 'no-store',
    },
  })
}
