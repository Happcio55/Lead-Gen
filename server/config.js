// Runtime configuration. Everything can be overridden with environment variables.
export const config = {
  port: Number(process.env.PORT || 8080),
  // One or more RPC endpoints (comma-separated in RPC_URLS). Requests rotate across them and fail over on errors.
  rpcUrls: (process.env.RPC_URLS || process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com').split(',').map(s => s.trim()).filter(Boolean),
  get rpcUrl() { return this.rpcUrls[0]; },
  // HTTP requests per second sent to the RPC (each may carry a batch of up to 25 calls). The public endpoint rate-limits hard; raise this with a paid RPC.
  rpcRps: Number(process.env.RPC_RPS || 10),
  rpcConcurrency: Number(process.env.RPC_CONCURRENCY || 4),
  chainId: 4663,
  dataDir: process.env.DATA_DIR || new URL('../data/', import.meta.url).pathname,
  // How far back to look for launches when the server starts with an empty database.
  backfillHours: Number(process.env.BACKFILL_HOURS || 24),
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-opus-5-5',
  relayApi: process.env.RELAY_API || 'https://api.relay.link',
  relayApiKey: process.env.RELAY_API_KEY || '',
  dexscreenerApi: 'https://api.dexscreener.com',
  explorer: process.env.EXPLORER_URL || 'https://robin.etherscan.io'
};

// Well-known addresses on Robinhood Chain.
export const ADDR = {
  WETH: '0x0bd7d308f8e1639fab988df18a8011f41eacad73',
  USDG: '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
  MULTICALL3: '0xca11bde05977b3631167028862be2a173976ca11',
  ZERO: '0x0000000000000000000000000000000000000000',
  DEAD: '0x000000000000000000000000000000000000dead'
};

export const TOPIC = {
  TRANSFER: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  // TransferWithScaledUI(address,address,uint256,uint256): emitted by Robinhood stock tokens (ERC-8056).
  SCALED: '0x37e7f0db430edc9dd31bc66f25f8449353aa0818f503b906747dd8f286cd3802',
  ZERO32: '0x' + '0'.repeat(64)
};

// Stock tokens confirmed on-chain; more are discovered automatically from TransferWithScaledUI logs.
export const SEED_STOCKS = [
  '0x322f0929c4625ed5bad873c95208d54e1c003b2d', // TSLA
  '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9', // AAPL
  '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec', // NVDA
  '0x12f190a9f9d7d37a250758b26824b97ce941bf54', // AMZN
  '0xe93237c50d904957cf27e7b1133b510c669c2e74', // MSFT
  '0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3', // GOOGL
  '0xc0d6457c16cc70d6790dd43521c899c87ce02f35', // META
  '0xec262a75e413fafd0df80480274532c79d42da09', // MSTR
  '0x117cc2133c37b721f49de2a7a74833232b3b4c0c', // SPY
  '0x0f17206447090e464c277571124dd2688e48aea9', // QCOM
  '0x6330d8c3178a418788df01a47479c0ce7ccf450b', // COIN
  '0xd5f3879160bc7c32ebb4dc785f8a4f505888de68'  // QQQ
];
