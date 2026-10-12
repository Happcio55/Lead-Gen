// Token metadata helpers: launchpad logo/socials parsing and the memecoin filter.

// Launchpad tokens on Robinhood Chain expose their artwork and links on-chain via
// logo() / socials(). Anything else has to pass a name check to count as a memecoin.
const NOT_MEME = [
  /^\d+$/, // test spam: "17", "84", …
  /\b(usd[a-z]?|usdg|usdc|usdt|dai|dollar|euro|stable)\b/i,
  /\b(wrapped|weth|wbtc|steth|staked)\b/i,
  /\b(class [abc]|inc|corp|holdings|ltd|plc|etf|trust|backed|xstock|tokenized)\b/i,
  /\b(test|testing|check|policy|debug)\b/i,
];

export function isMemecoin(token) {
  if (!token) return false;
  if (token.logo) return true; // launchpad template with on-chain artwork
  const text = `${token.symbol} ${token.name}`;
  return !NOT_MEME.some((re) => re.test(token.symbol) || re.test(text));
}

const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})(\/[\w.\-]{1,100})*$/;

// Normalise a logo() value to { cid } for IPFS or { url } for plain https, else null.
export function parseLogo(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.startsWith('ipfs://')) {
    const cid = s.slice(7).replace(/^ipfs\//, '');
    return CID.test(cid) ? { cid } : null;
  }
  const gw = s.match(/^https:\/\/[^/]+\/ipfs\/(.+)$/);
  if (gw && CID.test(gw[1])) return { cid: gw[1] };
  if (/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s"'<>]*)?$/i.test(s) && s.length < 500) return { url: s };
  return null;
}

// socials() returns (x, telegram, website); keep only safe https links.
export function parseSocials(res) {
  if (!Array.isArray(res)) return null;
  const ok = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]{4,300}$/i.test(u.trim()) ? u.trim() : null);
  const [x, tg, web] = res.map(ok);
  return x || tg || web ? { x, tg, web } : null;
}

export const IPFS_GATEWAYS = [
  'https://ipfs.filebase.io/ipfs/',
  'https://4everland.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
];
