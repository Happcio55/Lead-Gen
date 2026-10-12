import { verifyMessage, isAddress } from 'viem'
import { issueToken, readJson } from './_session.js'

// POST { address, message, signature } -> { token }
// The message must be the Paper sign-in text for this address, issued in the last 10 minutes.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  try {
    const { address, message, signature } = await readJson(req, 10_000)
    if (!isAddress(address || '') || typeof message !== 'string' || typeof signature !== 'string')
      return res.status(400).json({ error: 'bad_request' })
    if (!/^Paper( Pulse)? wants you to sign in with your wallet\./.test(message)) return res.status(400).json({ error: 'bad_message' })
    const addrLine = (message.match(/^Address: (0x[0-9a-fA-F]{40})$/m) || [])[1]
    const issued = Date.parse((message.match(/^Issued at: (.+)$/m) || [])[1] || '')
    if (!addrLine || addrLine.toLowerCase() !== address.toLowerCase()) return res.status(400).json({ error: 'address_mismatch' })
    if (!(Math.abs(Date.now() - issued) < 10 * 60e3)) return res.status(400).json({ error: 'expired' })
    const ok = await verifyMessage({ address, message, signature })
    if (!ok) return res.status(401).json({ error: 'bad_signature' })
    return res.status(200).json({ token: issueToken(address), address: address.toLowerCase() })
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'server_error' })
  }
}
