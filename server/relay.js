// Cross-chain buy/sell through Relay (relay.link): one signature bridges and swaps into any Robinhood Chain token.
import { config } from './config.js';

const NATIVE = '0x0000000000000000000000000000000000000000';
let chainsCache = { at: 0, list: [] };

async function relay(path, init = {}) {
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (config.relayApiKey) headers['x-api-key'] = config.relayApiKey;
  const res = await fetch(config.relayApi + path, { ...init, headers, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// Chains users can pay from: EVM, enabled, native gas in ETH, BNB or POL.
export async function originChains() {
  if (Date.now() - chainsCache.at < 3600e3 && chainsCache.list.length) return chainsCache.list;
  const { body } = await relay('/chains');
  const all = body.chains || [];
  const pick = c => ({
    id: c.id,
    name: c.displayName,
    symbol: c.currency.symbol,
    decimals: c.currency.decimals,
    icon: c.iconUrl || null,
    rpc: c.httpRpcUrl,
    explorer: c.explorerUrl
  });
  const rh = all.find(c => c.id === config.chainId);
  const list = all
    .filter(c => !c.disabled && c.vmType === 'evm' && c.depositEnabled && c.id !== config.chainId &&
      ['ETH', 'BNB', 'POL'].includes(c.currency?.symbol))
    .map(pick);
  chainsCache = { at: Date.now(), list, destination: rh ? pick(rh) : null };
  return list;
}

export async function destinationChain() {
  await originChains();
  return chainsCache.destination;
}

const isAddr = a => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

// Build a Relay quote. side=buy: native coin on originChainId -> token on Robinhood. side=sell: token -> native coin.
export async function quote(q) {
  const chains = await originChains();
  // chainId is where the user pays from (buy) or gets paid (sell); Robinhood Chain itself is allowed too.
  const chain = Number(q.chainId) === config.chainId ? { id: config.chainId } : chains.find(c => c.id === Number(q.chainId));
  if (!chain) return { status: 400, body: { message: 'Unsupported chain' } };
  if (!isAddr(q.user) || !isAddr(q.token)) return { status: 400, body: { message: 'Invalid address' } };
  if (!/^\d+$/.test(String(q.amount)) || BigInt(q.amount) <= 0n) return { status: 400, body: { message: 'Invalid amount' } };
  const buy = q.side !== 'sell';
  const payload = {
    user: q.user,
    recipient: q.user,
    originChainId: buy ? chain.id : config.chainId,
    destinationChainId: buy ? config.chainId : chain.id,
    originCurrency: buy ? NATIVE : q.token,
    destinationCurrency: buy ? q.token : NATIVE,
    amount: String(q.amount),
    tradeType: 'EXACT_INPUT'
  };
  const bps = Number(q.slippageBps);
  if (bps > 0 && bps <= 5000) payload.slippageTolerance = String(Math.round(bps));
  // Calls Relay executes on Robinhood Chain with the bridged ETH (curve or Uniswap buys in one signature).
  if (Array.isArray(q.txs) && q.txs.length) {
    payload.txs = q.txs.map(t => ({ to: t.to, value: String(t.value), data: t.data }));
    if (payload.txs.some(t => !isAddr(t.to) || !/^\d+$/.test(t.value) || !/^0x[0-9a-fA-F]*$/.test(t.data))) {
      return { status: 400, body: { message: 'Invalid destination call' } };
    }
  }
  return relay('/quote', { method: 'POST', body: JSON.stringify(payload) });
}

export function status(requestId) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(requestId)) return Promise.resolve({ status: 400, body: { message: 'bad requestId' } });
  return relay('/intents/status/v3?requestId=' + requestId);
}

// Signature steps tell the client to POST the signed payload to a Relay endpoint; only allow those paths.
export function postStep(path, body) {
  if (typeof path !== 'string' || !/^\/(execute|intents|authorize)\/[\w/?=&.-]*$/.test(path)) {
    return Promise.resolve({ status: 400, body: { message: 'endpoint not allowed' } });
  }
  return relay(path, { method: 'POST', body: JSON.stringify(body || {}) });
}

// Extra public RPCs for busy chains, tried after Relay's own endpoint.
const FALLBACK_RPC = {
  1: ['https://ethereum-rpc.publicnode.com'],
  10: ['https://optimism-rpc.publicnode.com', 'https://mainnet.optimism.io'],
  56: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org'],
  137: ['https://polygon-bor-rpc.publicnode.com'],
  8453: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
  42161: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com']
};

// Native or ERC-20 balance on any supported chain, read from that chain's public RPC.
export async function balance(chainId, address, token) {
  chainId = Number(chainId);
  if (!isAddr(address) || (token && !isAddr(token))) throw new Error('bad address');
  const chains = await originChains();
  const c = chainId === config.chainId ? { rpc: config.rpcUrl } : chains.find(x => x.id === chainId);
  if (!c) throw new Error('unsupported chain');
  const call = token
    ? { method: 'eth_call', params: [{ to: token, data: '0x70a08231' + address.slice(2).toLowerCase().padStart(64, '0') }, 'latest'] }
    : { method: 'eth_getBalance', params: [address, 'latest'] };
  let lastErr;
  for (const url of [c.rpc, ...(FALLBACK_RPC[chainId] || [])]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...call }),
        signal: AbortSignal.timeout(8000)
      });
      const body = await res.json();
      if (body.error || body.result == null) throw new Error(body.error?.message || 'no result');
      return BigInt(body.result === '0x' ? 0 : body.result).toString();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
