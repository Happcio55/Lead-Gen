/* Ironclad threat scanner.
 * Reads a token straight from a Robinhood Chain RPC node and looks for the
 * functions memecoins get rugged with. No backend, no API key: one batched
 * JSON-RPC round trip for metadata plus one or two for bytecode. */
(function (root) {
  "use strict";

  var NETWORKS = {
    mainnet: {
      key: "mainnet",
      label: "Robinhood Chain",
      chainId: 4663,
      rpc: "https://rpc.mainnet.chain.robinhood.com",
      explorer: "https://robinhoodchain.blockscout.com",
    },
    testnet: {
      key: "testnet",
      label: "Robinhood Chain Testnet",
      chainId: 46630,
      rpc: "https://rpc.testnet.chain.robinhood.com",
      explorer: "https://explorer.testnet.chain.robinhood.com",
    },
  };

  // keccak256("eip1967.proxy.implementation") - 1
  var EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  var ZERO_ADDR = "0x0000000000000000000000000000000000000000";

  // Function selectors grouped by the rug they enable.
  // weight: points removed from 100 when found and someone can still call them.
  var VECTORS = [
    {
      id: "mint",
      name: "Hidden mint",
      weight: 35,
      blurb: "Someone can print new supply and dump it on holders.",
      sels: { "40c10f19": "mint(address,uint256)", a0712d68: "mint(uint256)", "4e6ec247": "_mint(address,uint256)" },
    },
    {
      id: "tax",
      name: "Adjustable tax",
      weight: 25,
      blurb: "Sell tax can be raised to 99%, turning the token into a honeypot.",
      sels: {
        "69fe0e2d": "setFee(uint256)", "0b78f9c0": "setFees(uint256,uint256)", c4081a4c: "setTaxFee(uint256)",
        "0cc835a3": "setBuyFee(uint256)", "8b4cee08": "setSellFee(uint256)", "2e5bb6ff": "setTax(uint256)",
        "6db79437": "updateFees(uint256,uint256)",
      },
    },
    {
      id: "blacklist",
      name: "Blacklist",
      weight: 25,
      blurb: "Chosen wallets can be blocked from selling.",
      sels: {
        f9f92be4: "blacklist(address)", "44337ea1": "addToBlacklist(address)", "153b0d1e": "setBlacklist(address,bool)",
        "455a4396": "blacklistAddress(address,bool)", b515566a: "setBots(address[])",
      },
    },
    {
      id: "pause",
      name: "Kill switch",
      weight: 15,
      blurb: "All transfers can be frozen at once.",
      sels: { "8456cb59": "pause()" },
    },
    {
      id: "trading",
      name: "Trading gate",
      weight: 10,
      blurb: "Trading can be held closed while insiders buy.",
      sels: { c2e5ec04: "setTradingEnabled(bool)", "8a8c523c": "enableTrading()", c9567bf9: "openTrading()" },
    },
    {
      id: "limits",
      name: "Wallet limits",
      weight: 5,
      blurb: "Max-transaction or max-wallet caps can be tightened to trap sellers.",
      sels: { ec28438a: "setMaxTxAmount(uint256)", "5d0044ca": "setMaxWallet(uint256)", ea1644d5: "setMaxWalletSize(uint256)", "4fc3f41a": "setCooldown(uint256)" },
    },
  ];

  var CALLS = {
    name: "0x06fdde03",
    symbol: "0x95d89b41",
    decimals: "0x313ce567",
    totalSupply: "0x18160ddd",
    owner: "0x8da5cb5b",
    getOwner: "0x893d20e8",
  };

  var fetchImpl = root.fetch ? root.fetch.bind(root) : null;

  function rpcBatch(rpcUrl, calls) {
    var body = calls.map(function (c, i) {
      return { jsonrpc: "2.0", id: i + 1, method: c[0], params: c[1] };
    });
    return fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (r.status === 429) throw new Error("The public RPC is rate limiting requests. Wait a few seconds and scan again.");
      if (!r.ok) throw new Error("RPC answered HTTP " + r.status + ".");
      return r.json();
    }).then(function (res) {
      if (!Array.isArray(res)) throw new Error((res && res.error && res.error.message) || "RPC returned an unexpected reply.");
      var out = [];
      res.forEach(function (x) { out[x.id - 1] = x; });
      return out;
    });
  }

  function isAddress(a) { return /^0x[0-9a-fA-F]{40}$/.test(a || ""); }

  function decodeString(hex) {
    if (!hex || hex === "0x") return null;
    var h = hex.slice(2);
    try {
      if (h.length >= 192) {
        var off = parseInt(h.slice(0, 64), 16) * 2;
        var len = parseInt(h.slice(off, off + 64), 16) * 2;
        return utf8(h.slice(off + 64, off + 64 + len));
      }
      if (h.length === 64) return utf8(h).replace(/\0+$/, ""); // bytes32-style
    } catch (e) { /* fall through */ }
    return null;
  }

  function utf8(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return new TextDecoder().decode(bytes).replace(/\0/g, "");
  }

  function decodeAddress(hex) {
    if (!hex || hex.length < 66) return null;
    return "0x" + hex.slice(-40).toLowerCase();
  }

  function decodeUint(hex) {
    if (!hex || hex === "0x") return null;
    try { return BigInt(hex.length > 66 ? "0x" + hex.slice(2, 66) : hex); } catch (e) { return null; }
  }

  function formatUnits(v, decimals) {
    if (v == null) return null;
    var d = BigInt(decimals || 0);
    var whole = d > 0n ? v / 10n ** d : v;
    return compact(whole);
  }

  function compact(n) {
    var units = [["Qa", 15n], ["T", 12n], ["B", 9n], ["M", 6n], ["K", 3n]];
    for (var i = 0; i < units.length; i++) {
      var p = 10n ** units[i][1];
      if (n >= p) {
        var tenths = (n * 10n) / p;
        var s = (tenths / 10n).toString() + (tenths % 10n ? "." + (tenths % 10n).toString() : "");
        return s + units[i][0];
      }
    }
    return n.toString();
  }

  function findSelectors(code) {
    var c = (code || "").toLowerCase();
    var found = {};
    VECTORS.forEach(function (v) {
      Object.keys(v.sels).forEach(function (sel) {
        // Solidity dispatchers compare against PUSH4 <selector>
        if (c.indexOf("63" + sel) !== -1) (found[v.id] = found[v.id] || []).push(v.sels[sel]);
      });
    });
    return found;
  }

  function minimalProxyTarget(code) {
    var m = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/i.exec(code || "");
    return m ? "0x" + m[1].toLowerCase() : null;
  }

  /** Scan one token. onStep(label) is called as each stage starts. */
  function scan(address, networkKey, onStep) {
    var net = NETWORKS[networkKey] || NETWORKS.mainnet;
    var step = onStep || function () {};
    var addr = (address || "").trim();
    if (!isAddress(addr)) return Promise.reject(new Error("That isn't a contract address. Paste a 42-character address starting with 0x."));
    addr = addr.toLowerCase();
    var t0 = Date.now();
    var report = { address: addr, network: net.key, explorer: net.explorer + "/address/" + addr };

    step("Pulling bytecode and metadata from " + net.label);
    var keys = Object.keys(CALLS);
    var calls = [
      ["eth_getCode", [addr, "latest"]],
      ["eth_getStorageAt", [addr, EIP1967_IMPL_SLOT, "latest"]],
      ["eth_blockNumber", []],
    ].concat(keys.map(function (k) { return ["eth_call", [{ to: addr, data: CALLS[k] }, "latest"]]; }));

    return rpcBatch(net.rpc, calls).then(function (res) {
      var code = res[0] && res[0].result;
      if (res[0] && res[0].error) throw new Error(res[0].error.message);
      if (!code || code === "0x") {
        throw new Error("No contract lives at this address on " + net.label + ". Check the address, or switch networks.");
      }
      report.block = parseInt(res[2] && res[2].result, 16) || null;
      report.codeBytes = (code.length - 2) / 2;
      var r = {};
      keys.forEach(function (k, i) { var x = res[3 + i]; r[k] = x && !x.error ? x.result : null; });
      report.name = decodeString(r.name);
      report.symbol = decodeString(r.symbol);
      var dec = decodeUint(r.decimals);
      report.decimals = dec != null && dec < 78n ? Number(dec) : null;
      report.totalSupplyRaw = decodeUint(r.totalSupply);
      report.supply = report.totalSupplyRaw != null ? formatUnits(report.totalSupplyRaw, report.decimals || 0) : null;
      var ownerHex = r.owner || r.getOwner;
      report.hasOwnerFn = !!(ownerHex && ownerHex !== "0x");
      report.owner = report.hasOwnerFn ? decodeAddress(ownerHex) : null;

      var implSlot = res[1] && res[1].result;
      var impl = implSlot && !/^0x0*$/.test(implSlot) ? decodeAddress(implSlot) : minimalProxyTarget(code);
      report.proxy = impl && impl !== ZERO_ADDR ? impl : null;
      report.isErc20 = report.totalSupplyRaw != null && (report.symbol != null || report.decimals != null);

      if (!report.proxy) return code;
      step("Proxy detected. Following it to the implementation");
      return rpcBatch(net.rpc, [["eth_getCode", [report.proxy, "latest"]]]).then(function (r2) {
        return (r2[0] && r2[0].result) || code;
      });
    }).then(function (logicCode) {
      step("Sweeping bytecode for rug vectors");
      report.found = findSelectors(logicCode);
      report.ms = Date.now() - t0;
      return grade(report);
    });
  }

  function grade(report) {
    var renounced = report.hasOwnerFn && report.owner === ZERO_ADDR;
    var ownerLive = report.hasOwnerFn && !renounced;
    var checks = [];
    var score = 100;

    checks.push({
      id: "erc20",
      label: "Token standard",
      status: report.isErc20 ? "ok" : "warn",
      detail: report.isErc20 ? "Answers name, symbol, decimals and totalSupply like an ERC-20." : "Doesn't answer the basic ERC-20 calls. It may not be a token.",
    });
    if (!report.isErc20) score -= 10;

    var ownerCheck = { id: "owner", label: "Owner" };
    if (!report.hasOwnerFn) { ownerCheck.status = "ok"; ownerCheck.detail = "No owner() function. Nobody holds admin keys through the standard pattern."; }
    else if (renounced) { ownerCheck.status = "ok"; ownerCheck.detail = "Ownership renounced to the zero address."; }
    else { ownerCheck.status = "warn"; ownerCheck.detail = "Owner is live: " + report.owner + "."; score -= 5; }
    checks.push(ownerCheck);

    var proxyCheck = { id: "proxy", label: "Upgradeable" };
    if (report.proxy) {
      proxyCheck.status = "crit";
      proxyCheck.detail = "This is a proxy. Its code can be swapped for anything. Current logic: " + report.proxy + ".";
      score -= 25;
    } else {
      proxyCheck.status = "ok";
      proxyCheck.detail = "Not a proxy. The code you see is the code that runs.";
    }
    checks.push(proxyCheck);

    VECTORS.forEach(function (v) {
      var hits = report.found[v.id];
      var c = { id: v.id, label: v.name };
      if (!hits) {
        c.status = "ok";
        c.detail = "No " + v.name.toLowerCase() + " functions found.";
      } else if (renounced && !report.proxy) {
        // Gated functions usually die with the owner. Usually.
        c.status = "warn";
        c.detail = "Found " + hits.join(", ") + ". Owner is renounced, so it is probably uncallable. " + v.blurb;
        score -= Math.ceil(v.weight / 4);
      } else {
        c.status = v.weight >= 15 ? "crit" : "warn";
        c.detail = "Found " + hits.join(", ") + ". " + v.blurb;
        score -= v.weight;
      }
      checks.push(c);
    });

    if (ownerLive && Object.keys(report.found).length) score -= 10;
    score = Math.max(0, Math.min(100, score));
    report.score = score;
    report.verdict = score >= 85 ? "ironclad" : score >= 55 ? "caution" : "danger";
    report.checks = checks;
    report.sealed = checks.filter(function (c) { return c.status === "ok"; }).length;
    return report;
  }

  var api = {
    NETWORKS: NETWORKS,
    VECTORS: VECTORS,
    scan: scan,
    grade: grade,
    findSelectors: findSelectors,
    isAddress: isAddress,
    compact: compact,
    rpcBatch: rpcBatch,
    _setFetch: function (f) { fetchImpl = f; },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.IroncladScanner = api;
})(typeof window !== "undefined" ? window : globalThis);
