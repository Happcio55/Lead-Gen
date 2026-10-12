// Token metadata (name, symbol, logo, socials) read from Robinhood Chain and cached at the edge.
// Metadata never changes after launch, so a hit is cached for a year and shared by every visitor.
export const config = { runtime: 'edge' }

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || '')
const isHash = (h) => /^0x[0-9a-fA-F]{64}$/.test(h || '')

function decodeString(res) {
  if (!res || res.length < 130) return null
  try {
    const len = Number(BigInt('0x' + res.slice(66, 130)))
    const bytes = new Uint8Array((res.slice(130, 130 + len * 2).match(/.{2}/g) || []).map((b) => parseInt(b, 16)))
    return new TextDecoder().decode(bytes).replace(/\0/g, '').trim() || null
  } catch {
    return null
  }
}

export default async function handler(req) {
  const q = new URL(req.url).searchParams
  const t = q.get('t'), tx = q.get('tx')
  if (!isAddr(t)) return new Response('bad token', { status: 400 })
  const calls = [
    { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: t, data: '0x06fdde03' }, 'latest'] },
    { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: t, data: '0x95d89b41' }, 'latest'] },
    { jsonrpc: '2.0', id: 3, method: 'eth_call', params: [{ to: t, data: '0xfb7f21eb' }, 'latest'] },
  ]
  if (isHash(tx)) calls.push({ jsonrpc: '2.0', id: 4, method: 'eth_getTransactionByHash', params: [tx] })
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(calls) })
  if (!r.ok) return new Response(JSON.stringify({ error: 'rpc ' + r.status }), { status: 502, headers: { 'cache-control': 'no-store' } })
  const res = Object.fromEntries((await r.json()).map((x) => [x.id, x.result]))
  const out = { name: decodeString(res[1]), symbol: decodeString(res[2]), logo: decodeString(res[3]), socials: [], websites: [] }
  const input = res[4]?.input
  if (input) {
    const txt = new TextDecoder('latin1').decode(new Uint8Array((input.slice(2).match(/.{2}/g) || []).map((b) => parseInt(b, 16))))
    const urls = txt.match(/https?:\/\/[\w\-./?=&%#~+@]+/g) || []
    if (!out.logo) out.logo = (txt.match(/ipfs:\/\/[a-zA-Z0-9]+/) || [])[0] || null
    const x = urls.find((u) => /(^https?:\/\/)(www\.)?(x|twitter)\.com\//.test(u))
    const tg = urls.find((u) => /t\.me\//.test(u))
    const web = urls.find((u) => !/(x|twitter)\.com\/|t\.me\/|t\.co\/|ipfs/.test(u))
    if (x) out.socials.push({ type: 'twitter', url: x })
    if (tg) out.socials.push({ type: 'telegram', url: tg })
    if (web) out.websites.push({ url: web })
  }
  const done = out.symbol != null
  return new Response(JSON.stringify(out), {
    headers: {
      'content-type': 'application/json',
      'cache-control': done ? 'public, max-age=86400, s-maxage=31536000, immutable' : 'public, s-maxage=60',
    },
  })
}
