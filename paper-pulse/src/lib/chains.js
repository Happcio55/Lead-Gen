// Chains the app knows about. Only `live` chains have data feeds wired up;
// adding one later means filling in the gecko/dex network ids and flipping `live`.
export const CHAINS = [
  { id: 'robinhood', name: 'Robinhood Chain', short: 'RH', gecko: 'robinhood', dex: 'robinhood', native: 'ETH', live: true },
  { id: 'solana', name: 'Solana', short: 'SOL', gecko: 'solana', dex: 'solana', native: 'SOL', live: false },
  { id: 'bnb', name: 'BNB Chain', short: 'BNB', gecko: 'bsc', dex: 'bsc', native: 'BNB', live: false },
  { id: 'base', name: 'Base', short: 'BASE', gecko: 'base', dex: 'base', native: 'ETH', live: false },
  { id: 'arc', name: 'Arc', short: 'ARC', gecko: 'arc', dex: 'arc', native: 'USDC', live: false },
  { id: 'hyperliquid', name: 'Hyperliquid', short: 'HYPE', gecko: 'hyperevm', dex: 'hyperevm', native: 'HYPE', live: false },
  { id: 'eth', name: 'Ethereum', short: 'ETH', gecko: 'eth', dex: 'ethereum', native: 'ETH', live: false },
]

export const ACTIVE_CHAIN = CHAINS[0]

// Human labels for the launchpads and DEXes seen on Robinhood Chain.
const DEX_LABELS = {
  'uniswap-v2-robinhood': 'Uniswap v2',
  'uniswap-v3-robinhood': 'Uniswap v3',
  'uniswap-v4-robinhood': 'Uniswap v4',
  'pancakeswap-v2-robinhood': 'Pancake v2',
  'pancakeswap-v3-robinhood': 'Pancake v3',
  'pancakeswap-infinity-clmm-robinhood': 'Pancake ∞',
  'clanker-robinhood': 'Clanker',
  'clank-trade': 'Clank',
  'bankr-robinhood': 'Bankr',
  'virtuals-robinhood': 'Virtuals',
  'pons-v2': 'Pons',
  'pons-v2-dex': 'Pons',
  'pons-dot-family': 'Pons',
  hoodit: 'Hoodit',
  robinswap: 'RobinSwap',
  'frontier-fun': 'Frontier',
  'o1-launchpad-robinhood': 'O1',
  'mint-club-robinhood': 'Mint Club',
  'easya-kickstart-robinhood': 'Kickstart',
  uniswap: 'Uniswap',
  pancakeswap: 'Pancake',
}

export function dexLabel(id) {
  if (!id) return 'DEX'
  if (DEX_LABELS[id]) return DEX_LABELS[id]
  return id
    .replace(/-robinhood$/, '')
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}
