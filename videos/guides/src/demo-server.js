// Local demo server for recording Luma how-to videos.
// Serves a local copy of the tryluma.trade app (SITE dir) with its real public
// data (health/universe/contracts), plus a mocked demo account and RPC so the
// screens show realistic values. Nothing here touches a real wallet or chain.
const http = require('http');
const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE;
const PORT = Number(process.env.PORT || 8765);
const DEMO = '0x7a3c5b19e2d4f6a8b0c1d2e3f4a5b6c7d8e9f0a1';
const universe = JSON.parse(fs.readFileSync(path.join(SITE, 'api/live/universe')));
const token = s => universe.assets.find(a => a.symbol === s).token;
const now = Date.now();
let state = 'setup';

function account() {
  const linked = state !== 'nolink';
  return {
    account: DEMO,
    accountUsdgBalance: '125.40',
    wallets: linked ? [{ wallet: DEMO, consent: 'Linked to itself · collection authorized' }] : [],
    rule: linked ? { active: true, enabled: true, roundTo: 1, multiplier: 1, weeklyCapUsd: '20' } : null,
    parkedUsd: '3.85',
    park: { sweepThresholdUsd: '5' },
    keeperWouldSweepNow: false,
    waitingFor: ['Pool is below the $5.00 investment threshold.', 'US equity market session is closed.'],
    pulledLast7dUsd: '3.85',
    remainingWeeklyCapUsd: '16.15',
    sweptThisEpoch: false,
    nextEpochAt: now + 9 * 3600e3,
    mixIsDefault: true,
    mix: [{ symbol: 'SPY', bps: 6000 }, { symbol: 'NVDA', bps: 4000 }],
    holdings: [
      { symbol: 'SPY', token: token('SPY'), balance: '0.0161', shares: '0.0161', valueUsd: 10.42, oracleStatus: 'Market closed · last close' },
      { symbol: 'NVDA', token: token('NVDA'), balance: '0.0379', shares: '0.0379', valueUsd: 6.95, oracleStatus: 'Market closed · last close' },
    ],
    holdingsValueUsd: 17.37,
    claimable: [],
  };
}

function activity() {
  const tx = i => '0x' + (i + 1).toString(16).padStart(2, '0').repeat(32);
  const ev = [
    ['Round-up collected', 2, '+$0.65 from a $4.35 payment'],
    ['Round-up collected', 7, '+$0.20 from a $11.80 payment'],
    ['Stock delivered', 26, 'NVDA 0.0379 tokens'],
    ['Investment sweep', 27, '$5.00 → SPY 60% / NVDA 40%'],
    ['Round-up collected', 31, '+$1.40 from a $23.60 payment'],
    ['Rule saved', 50, 'Round up to $1 · 1× · cap $20 / week'],
    ['Wallet linked', 51, 'Spending wallet linked to account'],
  ];
  return { events: ev.map(([kind, h, summary], i) => ({ kind, timestamp: now - h * 3600e3, summary, txHash: tx(i) })), window: { complete: true }, page: {} };
}

const word = n => BigInt(n).toString(16).padStart(64, '0');
function rpc(req) {
  const { method, params, id } = req;
  let result;
  if (method === 'eth_chainId') result = '0x1237';
  else if (method === 'eth_blockNumber') result = '0x4c86f00';
  else if (method === 'eth_call') {
    const sel = params[0].data.slice(0, 10);
    if (sel === '0x70a08231') result = '0x' + word(125_400_000n);                 // balanceOf: 125.40 USDG
    else if (sel === '0xdd62ed3e') result = '0x' + word(20_000_000n);             // USDG -> Permit2: 20
    else if (sel === '0x927da105') result = '0x' + word(16_150_000n) + word(Math.floor(now / 1000) + 6 * 86400) + word(1); // Permit2 allowance
    else result = '0x' + word(0);
  } else result = null;
  return { jsonrpc: '2.0', id, result };
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (url.pathname === '/demo/state') { state = url.searchParams.get('s') || 'setup'; return json({ state }); }
  if (url.pathname.startsWith('/api/live/account/')) return json(account());
  if (url.pathname.startsWith('/api/live/activity/')) return json(activity());
  if (url.pathname === '/api/rpc') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { const r = JSON.parse(body); json(Array.isArray(r) ? r.map(rpc) : rpc(r)); });
    return;
  }
  const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || (url.pathname.startsWith('/api/') ? 'application/json' : 'application/octet-stream') });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('demo server on', PORT));

module.exports = { DEMO };
