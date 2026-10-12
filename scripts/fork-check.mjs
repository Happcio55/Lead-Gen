// End-to-end check of the buy/sell encoding against a local fork of Robinhood Chain.
//
//   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --chain-id 4663 &
//   node scripts/fork-check.mjs [http://127.0.0.1:8545]
//
// Finds an active native-ETH v4 pool, buys with 0.002 ETH, approves via Permit2, sells
// everything back, and prints the balances and Swap-event signs along the way.
import { createPublicClient, createWalletClient, http, formatEther, formatUnits, parseEther, parseEventLogs } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { ADDR, DEFAULT_RPC, ERC20_ABI, EVENTS, robinhood } from '../shared/chain.js';
import { buildBuyTx, buildSellTx, isTradable, quote, sellApprovals, withSlippage } from '../shared/v4.js';

const forkUrl = process.argv[2] || 'http://127.0.0.1:8545';
const account = mnemonicToAccount('test test test test test test test test test test test junk');
const chain = { ...robinhood, rpcUrls: { default: { http: [forkUrl] } } };
const fork = createPublicClient({ chain, transport: http(forkUrl) });
const wallet = createWalletClient({ account, chain, transport: http(forkUrl) });
const live = createPublicClient({ chain: robinhood, transport: http(DEFAULT_RPC) });

const head = await live.getBlockNumber();
const forkHead = await fork.getBlockNumber();
const [inits, swaps] = await Promise.all([
  live.getLogs({ address: ADDR.POOL_MANAGER, event: EVENTS.initialize, fromBlock: head - 30000n, toBlock: forkHead }),
  live.getLogs({ address: ADDR.POOL_MANAGER, event: EVENTS.swap, fromBlock: head - 3000n, toBlock: forkHead }),
]);
const activity = new Map();
for (const s of swaps) activity.set(s.args.id, (activity.get(s.args.id) || 0) + 1);
const pools = inits
  .map((l) => ({ id: l.args.id, ...l.args }))
  .filter((p) => isTradable(p) && activity.get(p.id))
  .sort((a, b) => activity.get(b.id) - activity.get(a.id));
if (!pools.length) throw new Error('no active ETH pools found');

let ok = 0;
for (const pool of pools.slice(0, 3)) {
  const token = pool.currency1;
  const symbol = await fork.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => '?');
  const decimals = await fork.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' });
  console.log(`\n== ${symbol} pool ${pool.id.slice(0, 10)} fee=${pool.fee} hooks=${pool.hooks}`);
  try {
    const amountIn = parseEther('0.002');
    const out = await quote(fork, pool, { side: 'buy', amountIn });
    const buy = buildBuyTx(pool, { amountIn, minOut: withSlippage(out, 1500) });
    const bh = await wallet.sendTransaction(buy);
    const br = await fork.waitForTransactionReceipt({ hash: bh });
    const [bs] = parseEventLogs({ abi: [EVENTS.swap], logs: br.logs });
    const bal = await fork.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
    console.log(`buy  ${br.status}  quoted=${formatUnits(out, decimals)} got=${formatUnits(bal, decimals)}  swap amount0=${bs.args.amount0} amount1=${bs.args.amount1}`);

    for (const tx of await sellApprovals(fork, { owner: account.address, token, amount: bal })) {
      const r = await fork.waitForTransactionReceipt({ hash: await wallet.sendTransaction(tx) });
      console.log(`     ${tx.label}: ${r.status}`);
    }
    const ethBefore = await fork.getBalance({ address: account.address });
    const sellOut = await quote(fork, pool, { side: 'sell', amountIn: bal });
    const sell = buildSellTx(pool, { amountIn: bal, minOut: withSlippage(sellOut, 1500) });
    const sh = await wallet.sendTransaction(sell);
    const sr = await fork.waitForTransactionReceipt({ hash: sh });
    const [ss] = parseEventLogs({ abi: [EVENTS.swap], logs: sr.logs });
    const after = await fork.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
    const ethAfter = await fork.getBalance({ address: account.address });
    console.log(`sell ${sr.status}  quoted=${formatEther(sellOut)} ETH  net=${formatEther(ethAfter - ethBefore)} ETH (after gas)  left=${after}  swap amount0=${ss.args.amount0} amount1=${ss.args.amount1}`);
    if (br.status === 'success' && sr.status === 'success' && after === 0n) ok++;
  } catch (e) {
    console.log('FAILED', e.shortMessage || e.message);
  }
}
console.log(`\n${ok} round trip(s) succeeded`);
process.exit(ok ? 0 : 1);
