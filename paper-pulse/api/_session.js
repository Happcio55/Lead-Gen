import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = () => process.env.SESSION_SECRET || ''
const b64 = (s) => Buffer.from(s).toString('base64url')

export function issueToken(address, days = 30) {
  const payload = b64(JSON.stringify({ a: address.toLowerCase(), exp: Date.now() + days * 86400e3 }))
  const sig = createHmac('sha256', SECRET()).update(payload).digest('base64url')
  return payload + '.' + sig
}

// Returns the lowercase address for a valid, unexpired token, else null.
export function readToken(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  const [payload, sig] = token.split('.')
  if (!payload || !sig || !SECRET()) return null
  const want = createHmac('sha256', SECRET()).update(payload).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const { a, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return exp > Date.now() && /^0x[0-9a-f]{40}$/.test(a) ? a : null
  } catch {
    return null
  }
}

export async function readJson(req, limit = 900_000) {
  if (req.body && typeof req.body === 'object') return req.body
  let size = 0
  const chunks = []
  for await (const c of req) {
    size += c.length
    if (size > limit) throw Object.assign(new Error('too_large'), { status: 413 })
    chunks.push(c)
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}
