/* Live data layer: Robinhood Chain mainnet RPC, Blockscout explorer, DexScreener. */
(function (global) {
  'use strict';

  const CHAIN = {
    id: 4663,
    hex: '0x1237',
    name: 'Robinhood Chain',
    rpc: 'https://rpc.mainnet.chain.robinhood.com',
    // public mainnet endpoints (chainlist.org); we fail over when one is down or sends broken CORS headers
    rpcs: ['https://rpc.mainnet.chain.robinhood.com', 'https://robinhood-rpc.publicnode.com', 'https://rpc.nodeflare.app/robinhood/public', 'https://rpc-robinhood.globalstake.io', 'https://robinhood.api.pocket.network'],
    explorer: 'https://robinhoodchain.blockscout.com',
    weth: '0x0bd7d308f8e1639fab988df18a8011f41eacad73'
  };

  const DEX = 'https://api.dexscreener.com';
  const QUERIES = ['robinhood', 'hood', 'pepe', 'doge', 'cat', 'meme', 'frog', 'moon', 'inu', 'based', 'wallet', 'elon', 'trump', 'ai', 'shib', 'wif', 'bonk', 'chad'];
  // Tokenized equities / ETFs and stables live on the same chain; they are not meme coins.
  const NOT_MEME = new Set(['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'META', 'COIN', 'CRCL', 'SPCX', 'AMZN', 'GOOGL', 'GOOG', 'MSFT', 'HOOD', 'AMD', 'NFLX', 'PLTR', 'MSTR', 'INTC', 'ORCL', 'AVGO', 'MU', 'SNDK', 'USDC', 'USDT', 'USDG', 'WETH', 'ETH', 'WBTC', 'DAI', 'IWM', 'GLD', 'SLV', 'TLT', 'DIA', 'JPM', 'V', 'MA', 'BRK.B', 'UNH', 'XOM', 'GME', 'BABA', 'UBER', 'SHOP', 'PYPL', 'SQ', 'ARM', 'SMCI', 'RKLB', 'IBM', 'CSCO', 'DIS', 'KO', 'PEP', 'MCD', 'WMT', 'COST', 'NKE', 'SOFI']);

  const status = { rpc: null, dex: null, explorer: null };

  async function fetchJSON(url, opts = {}, timeout = 15000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  let rpcId = 1;
  let rpcIdx = 0;
  async function post(body) {
    let lastErr;
    for (let k = 0; k < CHAIN.rpcs.length; k++) {
      const url = CHAIN.rpcs[(rpcIdx + k) % CHAIN.rpcs.length];
      try {
        const j = await fetchJSON(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, 10000);
        rpcIdx = (rpcIdx + k) % CHAIN.rpcs.length;
        status.rpc = true;
        status.rpcUrl = url;
        return j;
      } catch (e) { lastErr = e; }
    }
    status.rpc = false;
    throw lastErr || new Error('All RPC endpoints failed');
  }
  async function rpc(method, params = []) {
    const j = await post({ jsonrpc: '2.0', id: rpcId++, method, params });
    if (j.error) throw new Error(j.error.message);
    return j.result;
  }
  async function rpcBatch(calls) {
    const j = await post(calls.map((c, i) => ({ jsonrpc: '2.0', id: i, method: c[0], params: c[1] })));
    if (!Array.isArray(j)) throw new Error('RPC does not support batches');
    const out = [];
    for (const r of j) out[r.id] = r.error ? null : r.result;
    return out;
  }

  async function head() {
    const [blk, gas] = await Promise.all([rpc('eth_getBlockByNumber', ['latest', false]), rpc('eth_gasPrice')]);
    return {
      number: parseInt(blk.number, 16),
      hash: blk.hash,
      time: parseInt(blk.timestamp, 16),
      txs: blk.transactions.length,
      gasGwei: parseInt(gas, 16) / 1e9
    };
  }

  function num(x) { const n = parseFloat(x); return Number.isFinite(n) ? n : 0; }

  function pairToToken(p) {
    const q = (p.quoteToken.symbol || '').toUpperCase();
    if (q !== 'ETH' && q !== 'WETH') return null;
    const sym = (p.baseToken.symbol || '').trim();
    if (!sym || NOT_MEME.has(sym.toUpperCase())) return null;
    const name = p.baseToken.name || sym;
    if (/\b(inc|corp|etf|trust|tokenized|xstock|shares?)\b/i.test(name)) return null;
    const liq = num(p.liquidity && p.liquidity.usd);
    const vol = num(p.volume && p.volume.h24);
    const mcap = num(p.marketCap || p.fdv);
    const priceEth = num(p.priceNative), priceUsd = num(p.priceUsd);
    if (!(priceEth > 0 && priceUsd > 0)) return null;
    const tx = p.txns || {};
    const h1 = tx.h1 || {}, h24 = tx.h24 || {};
    const pc = p.priceChange || {};
    return {
      addr: p.baseToken.address.toLowerCase(),
      sym, name,
      pair: p.pairAddress, url: p.url, dex: p.dexId + (p.labels && p.labels.length ? ' ' + p.labels.join('/') : ''),
      priceEth, priceUsd, ethUsd: priceUsd / priceEth,
      liq, vol, mcap,
      m5: num(pc.m5), h1: num(pc.h1), h6: num(pc.h6), h24: num(pc.h24),
      buys1h: num(h1.buys), sells1h: num(h1.sells), buys24: num(h24.buys), sells24: num(h24.sells),
      created: p.pairCreatedAt || 0,
      img: (p.info && p.info.imageUrl) || null
    };
  }

  // Liquidity numbers that are clearly spoofed (pool "worth" far more than the token's market cap, or no volume at all).
  function sane(t) {
    if (t.liq < 3000 || t.liq > 25e6) return false;
    if (t.vol < 300 && t.buys24 + t.sells24 < 15) return false;
    if (t.mcap > 0 && t.liq > t.mcap * 2.5) return false;
    return true;
  }

  async function loadMarket(mustTrack = []) {
    const tasks = QUERIES.map((q) => fetchJSON(`${DEX}/latest/dex/search?q=${encodeURIComponent(q)}`).then((j) => j.pairs || []).catch(() => []));
    tasks.push(fetchJSON(`${DEX}/token-profiles/latest/v1`).catch(() => []));
    tasks.push(fetchJSON(`${DEX}/token-boosts/latest/v1`).catch(() => []));
    const res = await Promise.all(tasks);
    const pairs = res.slice(0, QUERIES.length).flat().filter((p) => p.chainId === 'robinhood');
    const featured = res.slice(QUERIES.length).flat().filter((x) => x && x.chainId === 'robinhood').map((x) => x.tokenAddress.toLowerCase());
    const extra = [...new Set([...featured, ...mustTrack.map((a) => a.toLowerCase())])];
    for (let i = 0; i < extra.length; i += 30) {
      const chunk = extra.slice(i, i + 30);
      try { pairs.push(...(await fetchJSON(`${DEX}/tokens/v1/robinhood/${chunk.join(',')}`))); } catch (e) { /* keep going */ }
    }
    if (!pairs.length) { status.dex = false; throw new Error('DexScreener returned no Robinhood Chain pairs'); }
    status.dex = true;
    const best = new Map();
    for (const p of pairs) {
      const t = pairToToken(p);
      if (!t) continue;
      const prev = best.get(t.addr);
      if (!prev || t.liq > prev.liq) best.set(t.addr, t);
    }
    const tracked = new Set(mustTrack.map((a) => a.toLowerCase()));
    const list = [...best.values()].filter((t) => tracked.has(t.addr) || sane(t));
    list.sort((a, b) => b.vol - a.vol);
    const ethUsd = median(list.map((t) => t.ethUsd));
    return { tokens: list, ethUsd, at: Date.now() };
  }

  function median(xs) {
    if (!xs.length) return 0;
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  /* ---------- wallet reads ---------- */
  const pad = (a) => a.toLowerCase().replace('0x', '').padStart(64, '0');
  function isAddr(a) { return /^0x[0-9a-fA-F]{40}$/.test(a || ''); }

  async function walletBalances(addr, tokens) {
    const ethHex = await rpc('eth_getBalance', [addr, 'latest']);
    const eth = Number(BigInt(ethHex)) / 1e18;
    const holdings = [];
    for (let i = 0; i < tokens.length; i += 20) {
      const chunk = tokens.slice(i, i + 20);
      const calls = [];
      for (const t of chunk) {
        calls.push(['eth_call', [{ to: t.addr, data: '0x70a08231' + pad(addr) }, 'latest']]);
        calls.push(['eth_call', [{ to: t.addr, data: '0x313ce567' }, 'latest']]);
      }
      let out;
      try { out = await rpcBatch(calls); } catch (e) { continue; }
      chunk.forEach((t, k) => {
        const bal = out[2 * k], dec = out[2 * k + 1];
        if (!bal || bal === '0x' || /^0x0*$/.test(bal)) return;
        const d = dec && dec !== '0x' ? parseInt(dec, 16) : 18;
        const raw = BigInt(bal);
        if (raw === 0n) return;
        const amount = Number(raw) / 10 ** d;
        holdings.push({ token: t, amount, valueEth: amount * t.priceEth });
      });
    }
    holdings.sort((a, b) => b.valueEth - a.valueEth);
    return { eth, holdings };
  }

  async function walletTxs(addr) {
    try {
      const j = await fetchJSON(`${CHAIN.explorer}/api/v2/addresses/${addr}/transactions`, {}, 12000);
      status.explorer = true;
      return (j.items || []).slice(0, 12);
    } catch (e) {
      status.explorer = false;
      return null;
    }
  }

  /* Full public activity for one address: ERC-20 transfers, normal txs, internal ETH and current token balances. */
  async function addressActivity(addr) {
    const base = `${CHAIN.explorer}/api/v2/addresses/${addr}`;
    // follow next_page_params so older deposits and swaps are counted too
    const get = async (p, maxPages = 5) => {
      const items = [];
      let url = `${base}/${p}`;
      for (let i = 0; i < maxPages && url; i++) {
        const j = await fetchJSON(url, {}, 15000);
        items.push(...(j.items || []));
        const np = j.next_page_params;
        url = np ? `${base}/${p}${p.includes('?') ? '&' : '?'}${new URLSearchParams(np)}` : null;
      }
      return items;
    };
    try {
      const [transfers, txs, internals, tokens] = await Promise.all([
        get('token-transfers?type=ERC-20'), get('transactions'), get('internal-transactions'), get('tokens?type=ERC-20')
      ]);
      status.explorer = true;
      return { transfers, txs, internals, tokens };
    } catch (e) {
      status.explorer = false;
      throw new Error('Blockscout explorer is not reachable right now');
    }
  }

  async function tokenPrices(addrs) {
    const out = new Map();
    const list = [...new Set(addrs.map((a) => a.toLowerCase()))];
    for (let i = 0; i < list.length; i += 30) {
      try {
        const pairs = await fetchJSON(`${DEX}/tokens/v1/robinhood/${list.slice(i, i + 30).join(',')}`);
        for (const p of pairs) {
          const q = (p.quoteToken.symbol || '').toUpperCase();
          if (q !== 'ETH' && q !== 'WETH') continue;
          const a = p.baseToken.address.toLowerCase();
          const liq = num(p.liquidity && p.liquidity.usd);
          const prev = out.get(a);
          if (!prev || liq > prev.liq) out.set(a, { priceEth: num(p.priceNative), priceUsd: num(p.priceUsd), liq, url: p.url, sym: p.baseToken.symbol });
        }
      } catch (e) { /* unpriced tokens count as zero */ }
    }
    return out;
  }

  /* ---------- injected wallet (EIP-1193) ---------- */
  async function connect() {
    const eth = global.ethereum;
    if (!eth) throw new Error('No browser wallet found. Install MetaMask or Rabby, or paste an address instead.');
    const [account] = await eth.request({ method: 'eth_requestAccounts' });
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hex }] });
    } catch (e) {
      if (e && (e.code === 4902 || /unrecognized|not added/i.test(e.message || ''))) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [{ chainId: CHAIN.hex, chainName: CHAIN.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.explorer] }]
        });
      } else if (e && e.code !== 4001) { /* user stays on another chain; reads still go to our RPC */ }
    }
    return account;
  }

  global.Chain = { CHAIN, status, rpc, head, loadMarket, walletBalances, walletTxs, addressActivity, tokenPrices, connect, isAddr };
})(window);
