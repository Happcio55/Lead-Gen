// Kairo score: launch health (60%) + market quality (40%), each 1-10, from on-chain data and DexScreener.
import { getLogs, client, topicToAddr } from './rpc.js';
import { erc20Abi, isContract, inspectContract, getMetadata } from './erc20.js';
import { fetchMarket } from './market.js';
import { db } from './store.js';
import { chain } from './indexer.js';
import { ADDR, TOPIC } from './config.js';

const SNIPE_BLOCKS = 30;          // ~3 seconds at 100 ms blocks
const MAX_LOGS = 60000;
const BURN = new Set([ADDR.ZERO, ADDR.DEAD]);
const RESERVED = new Set(['ETH', 'WETH', 'USDG', 'USDC', 'USDT', 'BTC', 'WBTC', 'HOOD']);

const pct = (a, b) => (b > 0n ? Number((a * 100000n) / b) / 1000 : 0);
const fmtPct = n => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10) + '%';
const clamp = n => Math.max(1, Math.min(10, n));

function balancesFromLogs(logs) {
  const bal = new Map();
  const add = (a, v) => bal.set(a, (bal.get(a) || 0n) + v);
  for (const l of logs) {
    if (l.topics.length !== 3) continue;
    const v = BigInt(l.data === '0x' ? 0 : l.data.slice(0, 66));
    add(topicToAddr(l.topics[1]), -v);
    add(topicToAddr(l.topics[2]), v);
  }
  bal.delete(ADDR.ZERO);
  return bal;
}

async function balancesOf(token, addrs) {
  const res = await client.multicall({
    contracts: addrs.map(a => ({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [a] })),
    allowFailure: true
  });
  const bal = new Map();
  addrs.forEach((a, i) => { if (res[i].status === 'success') bal.set(a, res[i].result); });
  return bal;
}

async function holderAnalysis(t, tip) {
  const address = t.address;
  const from = BigInt(t.createdBlock);
  // Without a known creation block we can't see the launch, so skip sniper checks and read balances directly.
  const early = t.knownCreation === false ? [] : await getLogs({ address, topics: [TOPIC.TRANSFER] }, from, from + BigInt(SNIPE_BLOCKS));
  let logs = null;
  if (t.knownCreation !== false) {
    try {
      logs = await getLogs({ address, topics: [TOPIC.TRANSFER] }, from, tip, { maxLogs: MAX_LOGS });
    } catch (e) {
      if (e.code !== 'LIMIT') throw e;
    }
  }
  let bal, complete = true;
  if (logs) {
    bal = balancesFromLogs(logs);
  } else {
    // Very active token: read exact balances for everyone seen at launch and in the last ~10 minutes.
    complete = false;
    const recent = await getLogs({ address, topics: [TOPIC.TRANSFER] }, tip - 6000n, tip).catch(() => []);
    const seen = new Set();
    for (const l of early.concat(recent)) if (l.topics.length === 3) { seen.add(topicToAddr(l.topics[1])); seen.add(topicToAddr(l.topics[2])); }
    seen.delete(ADDR.ZERO);
    if (t.creator) seen.add(t.creator);
    bal = await balancesOf(address, [...seen].slice(0, 400));
    logs = early;
  }
  return { bal, logs, early, complete };
}

export async function analyze(t) {
  const tip = BigInt(chain.tip || await client.getBlockNumber());
  const supplyNow = await client.readContract({ address: t.address, abi: erc20Abi, functionName: 'totalSupply' }).catch(() => BigInt(t.totalSupply));
  const [{ bal, logs, early, complete }, code, market] = await Promise.all([
    holderAnalysis(t, tip),
    inspectContract(t.address).catch(() => null),
    fetchMarket(t.address).catch(() => null)
  ]);
  const supply = supplyNow > 0n ? supplyNow : 1n;
  const creator = t.creator;

  // Identify which large holders are contracts (bonding curve, pool, locker) vs wallets.
  const ranked = [...bal].filter(([a, v]) => v > 0n && !BURN.has(a)).sort((a, b) => (b[1] > a[1] ? 1 : -1));
  const contractSet = new Set();
  if (t.factory) contractSet.add(t.factory);
  await Promise.all(ranked.slice(0, 15).map(async ([a]) => { if (await isContract(a).catch(() => false)) contractSet.add(a); }));
  const burned = [...BURN].reduce((s, a) => s + (bal.get(a) || 0n), 0n);
  const holders = complete ? ranked.length : null;
  const wallets = ranked.filter(([a]) => !contractSet.has(a) && a !== t.creator);
  const top10 = wallets.slice(0, 10).reduce((s, [, v]) => s + v, 0n);
  const top10Pct = pct(top10, supply);
  const lockedPct = pct(ranked.filter(([a]) => contractSet.has(a)).reduce((s, [, v]) => s + v, 0n), supply);

  // Creator behaviour. Tokens sent to a contract count as a sale unless the same transaction
  // minted an LP token or position back to the creator (that's adding liquidity, not selling).
  let creatorIn = 0n, creatorToContracts = 0n, creatorToWallets = 0n;
  const outflows = [];
  for (const l of logs) {
    if (l.topics.length !== 3) continue;
    const f = topicToAddr(l.topics[1]), to = topicToAddr(l.topics[2]);
    const v = BigInt(l.data === '0x' ? 0 : l.data.slice(0, 66));
    if (to === creator) creatorIn += v;
    if (f === creator && !BURN.has(to)) outflows.push({ to, v, tx: l.transactionHash });
  }
  outflows.sort((a, b) => (b.v > a.v ? 1 : -1));
  const lpTx = new Set();
  await Promise.all(outflows.slice(0, 12).map(async o => {
    if (!(contractSet.has(o.to) || await isContract(o.to).catch(() => false))) { creatorToWallets += o.v; return; }
    const rc = await client.getTransactionReceipt({ hash: o.tx }).catch(() => null);
    const gotLp = rc?.logs.some(x => x.address.toLowerCase() !== t.address && x.topics[0] === TOPIC.TRANSFER &&
      x.topics[1] === TOPIC.ZERO32 && x.topics[2] && topicToAddr(x.topics[2]) === creator);
    if (gotLp) lpTx.add(o.tx); else creatorToContracts += o.v;
  }));
  const creatorHoldPct = creator ? pct(bal.get(creator) || 0n, supply) : 0;
  const creatorSoldPct = creatorIn > 0n ? Math.min(100, pct(creatorToContracts, creatorIn)) : 0;
  const creatorSpreadPct = pct(creatorToWallets, supply);

  // Snipers: wallets (not the creator) that bought within the first ~3 seconds.
  const snipers = new Set(), bundled = new Set();
  for (const l of early) {
    if (l.topics.length !== 3) continue;
    const f = topicToAddr(l.topics[1]), to = topicToAddr(l.topics[2]);
    if (f === ADDR.ZERO || to === creator || BURN.has(to) || contractSet.has(to)) continue;
    snipers.add(to);
    if (Number(BigInt(l.blockNumber)) === t.createdBlock) bundled.add(to);
  }
  const sniperList = [...snipers];
  const sniperBal = sniperList.length && complete
    ? sniperList.reduce((s, a) => s + (bal.get(a) || 0n), 0n)
    : sniperList.length ? [...(await balancesOf(t.address, sniperList.slice(0, 200))).values()].reduce((s, v) => s + v, 0n) : 0n;
  const sniperPct = pct(sniperBal, supply);

  // Copycats and impersonation.
  const sym = t.symbol.toUpperCase();
  const stockSymbols = new Set(Object.values(db.stocks).map(s => s.symbol.toUpperCase()));
  let copyOf = null;
  if (stockSymbols.has(sym)) copyOf = { kind: 'stock', symbol: sym };
  else if (RESERVED.has(sym)) copyOf = { kind: 'major', symbol: sym };
  else {
    const older = Object.values(db.tokens).find(o => o.address !== t.address && o.createdAt < t.createdAt &&
      (o.symbol.toUpperCase() === sym || o.name.toLowerCase() === t.name.toLowerCase()) &&
      ((o.market?.marketCap || 0) > (market?.marketCap || 0) || (o.score?.holders || 0) > (holders || 0)));
    if (older) copyOf = { kind: 'launch', symbol: older.symbol, address: older.address };
  }

  const flags = [];
  const flag = (id, level, text, weight = 0) => flags.push({ id, level, text, weight });

  // ---- Launch health ----
  let L = 10;
  if (lpTx.size) flag('dev_lp', 'ok', 'Creator added liquidity to a DEX pool');
  if (creatorSoldPct >= 50) { L -= 4; flag('dev_sold', 'bad', `Creator has sold ${fmtPct(creatorSoldPct)} of their tokens`, 4); }
  else if (creatorSoldPct >= 15) { L -= 2; flag('dev_selling', 'warn', `Creator has sold ${fmtPct(creatorSoldPct)} of their tokens`, 2); }
  if (creatorHoldPct >= 25) { L -= 3; flag('dev_holds', 'bad', `Creator still holds ${fmtPct(creatorHoldPct)} of supply`, 3); }
  else if (creatorHoldPct >= 10) { L -= 1.5; flag('dev_holds', 'warn', `Creator holds ${fmtPct(creatorHoldPct)} of supply`, 1.5); }
  else if (creator && creatorSoldPct < 15) flag('dev_ok', 'ok', `Creator holds ${fmtPct(creatorHoldPct)} of supply`);
  if (creatorSpreadPct >= 5) { L -= 1.5; flag('dev_spread', 'warn', `Creator sent ${fmtPct(creatorSpreadPct)} of supply to other wallets`, 1.5); }

  if (sniperPct >= 15) { L -= 3; flag('snipers', 'bad', `${snipers.size} sniper wallets bought in the first 3 seconds and hold ${fmtPct(sniperPct)}`, 3); }
  else if (sniperPct >= 5) { L -= 1.5; flag('snipers', 'warn', `Early snipers still hold ${fmtPct(sniperPct)} of supply`, 1.5); }
  else if (t.knownCreation !== false) flag('no_snipers', 'ok', snipers.size ? `Early buyers hold only ${fmtPct(sniperPct)}` : 'No sniper rush at launch');
  if (bundled.size >= 3) { L -= 1; flag('bundled', 'warn', `${bundled.size} wallets bought in the same block the token was created`, 1); }

  if (top10Pct >= 50) { L -= 2.5; flag('concentrated', 'bad', `Top 10 holders (excluding the creator) own ${fmtPct(top10Pct)} of supply`, 2.5); }
  else if (top10Pct >= 30) { L -= 1; flag('concentrated', 'warn', `Top 10 holders (excluding the creator) own ${fmtPct(top10Pct)} of supply`, 1); }
  else flag('spread', 'ok', `Top 10 holders own ${fmtPct(top10Pct)} of supply`);

  if (code) {
    const live = !code.renounced;
    if (code.canMint && live) { L -= 3; flag('mint', 'bad', 'Owner can still mint new tokens', 3); }
    if (code.canBlacklist && live) { L -= 2; flag('blacklist', 'bad', 'Owner can block wallets from selling', 2); }
    if (code.canPause && live) { L -= 1.5; flag('pause', 'warn', 'Owner can pause trading', 1.5); }
    if (code.canSetTax && live) { L -= 1.5; flag('tax', 'warn', 'Owner can change the buy/sell tax', 1.5); }
    if (code.proxy) { L -= 1; flag('proxy', 'warn', 'Contract is upgradeable — its code can be changed', 1); }
    if (!code.proxy && (code.renounced || !(code.canMint || code.canBlacklist || code.canPause || code.canSetTax)))
      flag('contract_ok', 'ok', code.renounced && code.owner ? 'Ownership renounced' : 'No owner powers over supply or trading');
  }
  if (copyOf) {
    L -= 3;
    flag('copycat', 'bad', copyOf.kind === 'stock' ? `Uses the ticker of the real ${copyOf.symbol} stock token`
      : copyOf.kind === 'major' ? `Imitates ${copyOf.symbol}` : `Copies $${copyOf.symbol}, an earlier and bigger launch`, 3);
  }
  if (pct(burned, BigInt(t.totalSupply) || 1n) >= 5) flag('burned', 'ok', `${fmtPct(pct(burned, BigInt(t.totalSupply) || 1n))} of supply burned`);

  // ---- Market quality ----
  let M;
  if (market?.listed) {
    const liq = market.liquidityUsd || 0;
    M = liq < 1000 ? 2 : liq < 5000 ? 4 : liq < 20000 ? 6 : liq < 100000 ? 8 : 9;
    if (liq < 5000) flag('low_liq', liq < 1000 ? 'bad' : 'warn', `Only $${Math.round(liq).toLocaleString('en-US')} of liquidity`, liq < 1000 ? 2 : 1);
    else flag('liq', 'ok', `$${Math.round(liq).toLocaleString('en-US')} of liquidity`);
    if (market.sells24 > 20 && market.sells24 > market.buys24 * 2) { M -= 2; flag('sell_pressure', 'warn', `Sellers outnumber buyers ${market.sells24}:${market.buys24} today`, 1.5); }
    if (market.change24 != null && market.change24 <= -70) { M -= 3; flag('crashed', 'bad', `Price down ${Math.round(-market.change24)}% in 24h`, 2.5); }
    if (market.vol24 > liq * 30 && liq > 0) { M -= 1; flag('wash', 'warn', 'Volume is very high relative to liquidity', 1); }
    if (market.pairCreatedAt && market.pairCreatedAt < t.createdAt - 864e5) { /* re-launch of an older token */ }
  } else {
    M = 4;
    flag('unlisted', 'warn', 'Not trading on a DEX yet (still on its launch curve)', 0.5);
  }
  if (holders != null) {
    if (holders < 20) { M -= 1; flag('few_holders', 'warn', `Only ${holders} holders`, 0.5); }
    else if (holders >= 300) { M += 1; flag('holders', 'ok', `${holders.toLocaleString('en-US')} holders`); }
    else flag('holders', 'ok', `${holders} holders`);
  }

  const launch = Math.round(clamp(L));
  const marketScore = Math.round(clamp(M));
  const score = Math.round(clamp(launch * 0.6 + marketScore * 0.4));
  const order = { bad: 0, warn: 1, ok: 2 };
  flags.sort((a, b) => order[a.level] - order[b.level] || b.weight - a.weight);
  const shown = flags.filter(f => f.level !== 'ok').concat(flags.filter(f => f.level === 'ok')).slice(0, 6);

  return {
    score: {
      score, launch, market: marketScore, label: label(score),
      flags: shown,
      holders, top10Pct, creatorHoldPct, creatorSoldPct, sniperPct, snipers: snipers.size, lockedPct,
      contract: code, complete,
      scoredAt: Date.now()
    },
    market
  };
}

export function label(s) {
  return s >= 8 ? 'Clean launch' : s >= 7 ? 'Looks healthy' : s >= 5 ? 'Proceed with care' : s >= 4 ? 'Mixed signals' : s >= 2 ? 'High risk' : 'Likely rug';
}

// Analyse any address on demand (not necessarily a launch we tracked).
export async function analyzeAddress(address) {
  const meta = await getMetadata(address);
  if (!meta) return null;
  // Walk back through up to ~1 day of logs to find the first mint.
  const tip = BigInt(chain.tip || await client.getBlockNumber());
  let createdBlock = null, firstLog = null;
  let end = tip;
  for (let i = 0; i < 9 && end > 0n; i++) {
    const start = end > 100000n ? end - 99999n : 0n;
    let window;
    try { window = await getLogs({ address, topics: [TOPIC.TRANSFER] }, start, end, { noSplit: true }); }
    catch (e) { if (e.code === 'LIMIT') break; throw e; }
    if (!window.length) { if (firstLog) createdBlock = Number(BigInt(firstLog.blockNumber)); break; }
    firstLog = window[0];
    end = start - 1n;
  }
  const from = createdBlock != null ? createdBlock : Number(tip - 864000n);
  let creator = null, factory = null, createdAt = null;
  if (createdBlock != null && firstLog) {
    const [tx, blk] = await Promise.all([
      client.getTransaction({ hash: firstLog.transactionHash }).catch(() => null),
      client.getBlock({ blockNumber: BigInt(createdBlock) }).catch(() => null)
    ]);
    creator = tx?.from?.toLowerCase() || null;
    factory = tx?.to?.toLowerCase() || null;
    createdAt = blk ? Number(blk.timestamp) * 1000 : null;
  }
  return { address, ...meta, creator, factory, createdBlock: from, createdAt, knownCreation: createdBlock != null };
}
