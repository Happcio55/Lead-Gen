// ERC-20 metadata and bytecode helpers.
import { parseAbi, toFunctionSelector, hexToString } from 'viem';
import { client, rpc } from './rpc.js';
import { ADDR } from './config.js';

export const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function owner() view returns (address)'
]);

// Some tokens return bytes32 instead of string for name/symbol.
const bytes32Abi = parseAbi(['function name() view returns (bytes32)', 'function symbol() view returns (bytes32)']);

const clean = s => String(s || '').replace(/\0/g, '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 64);

export async function getMetadata(address) {
  const calls = ['name', 'symbol', 'decimals', 'totalSupply'].map(functionName => ({ address, abi: erc20Abi, functionName }));
  const [name, symbol, decimals, totalSupply] = await client.multicall({ contracts: calls, allowFailure: true });
  if (decimals.status !== 'success' || totalSupply.status !== 'success') return null;
  let n = name.status === 'success' ? name.result : null;
  let s = symbol.status === 'success' ? symbol.result : null;
  if (n == null || s == null) {
    const alt = await client.multicall({
      contracts: [{ address, abi: bytes32Abi, functionName: 'name' }, { address, abi: bytes32Abi, functionName: 'symbol' }],
      allowFailure: true
    });
    if (n == null && alt[0].status === 'success') n = hexToString(alt[0].result, { size: 32 });
    if (s == null && alt[1].status === 'success') s = hexToString(alt[1].result, { size: 32 });
  }
  return {
    name: clean(n) || 'Unnamed token',
    symbol: clean(s) || '???',
    decimals: Number(decimals.result),
    totalSupply: totalSupply.result.toString()
  };
}

const codeCache = new Map();
export async function getCode(address) {
  address = address.toLowerCase();
  if (codeCache.has(address)) return codeCache.get(address);
  const code = await rpc('eth_getCode', [address, 'latest']);
  if (codeCache.size > 20000) codeCache.clear();
  codeCache.set(address, code);
  return code;
}
export const isContract = async a => (await getCode(a)) !== '0x';

const EIP1967_IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

// Selector groups we look for in a token's bytecode (and its proxy implementation, if any).
const sel = sigs => sigs.map(s => toFunctionSelector(s).slice(2));
const SELECTORS = {
  mint: sel(['mint(address,uint256)', 'mint(uint256)', 'mintTo(address,uint256)']),
  blacklist: sel(['blacklist(address)', 'addToBlacklist(address)', 'setBlacklist(address,bool)', 'blacklistAddress(address,bool)',
    'addBots(address[])', 'setBots(address[],bool)', 'setBot(address,bool)', 'blockBots(address[])', 'addBlackList(address)']),
  pause: sel(['pause()', 'setTradingEnabled(bool)', 'enableTrading(bool)']),
  tax: sel(['setFee(uint256)', 'setFees(uint256,uint256)', 'setTaxes(uint256,uint256)', 'setBuyTax(uint256)', 'setSellTax(uint256)',
    'updateFees(uint256,uint256)', 'setTaxFeePercent(uint256)', 'setSellFee(uint256)', 'setBuyFee(uint256)']),
  maxTx: sel(['setMaxTxAmount(uint256)', 'setMaxWalletSize(uint256)', 'setMaxWallet(uint256)'])
};

// PUSH4 <selector> appears in the dispatcher of compiled Solidity, so a substring match is a good heuristic.
const has = (code, list) => list.some(s => code.includes('63' + s));

export async function inspectContract(address) {
  let code = await getCode(address);
  let proxy = false;
  const slot = await rpc('eth_getStorageAt', [address, EIP1967_IMPL, 'latest']).catch(() => null);
  if (slot && BigInt(slot) !== 0n) {
    proxy = true;
    const impl = '0x' + slot.slice(-40);
    code += (await getCode(impl)).slice(2);
  }
  let owner = null;
  try {
    owner = (await client.readContract({ address, abi: erc20Abi, functionName: 'owner' })).toLowerCase();
  } catch { /* no owner() */ }
  const renounced = !owner || owner === ADDR.ZERO || owner === ADDR.DEAD;
  return {
    proxy,
    owner,
    renounced,
    canMint: has(code, SELECTORS.mint),
    canBlacklist: has(code, SELECTORS.blacklist),
    canPause: has(code, SELECTORS.pause),
    canSetTax: has(code, SELECTORS.tax),
    canLimit: has(code, SELECTORS.maxTx)
  };
}
