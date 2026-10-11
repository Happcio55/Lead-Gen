/* Ironclad UI: live telemetry, threat scanner, forge (wallet deploy), sound. */
(function () {
  "use strict";
  var S = window.IroncladScanner;
  var Scene = function () { return window.IroncladScene || { setAlert: function () {}, pulse: function () {}, forge: function () {} }; };
  var ART = window.IRONCLAD_ARTIFACT || null;
  var $ = function (id) { return document.getElementById(id); };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DEPLOY_GAS = 500000; // eth_estimateGas for an IroncladToken deploy is ~457k

  // ---------------- sound ----------------
  var audio = null, soundOn = false;
  function blip(freq, dur, type, vol) {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, audio.currentTime);
      o.frequency.exponentialRampToValueAtTime(freq * 1.5, audio.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.05, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch (e) { /* no audio, no problem */ }
  }
  function chord(freqs) { freqs.forEach(function (f, i) { setTimeout(function () { blip(f, 0.25, "triangle", 0.04); }, i * 90); }); }
  $("sound-toggle").addEventListener("click", function () {
    soundOn = !soundOn;
    this.setAttribute("aria-pressed", String(soundOn));
    this.textContent = soundOn ? "Sound on" : "Sound off";
    if (soundOn) chord([440, 660, 880]);
  });
  document.addEventListener("pointerenter", function (e) {
    if (e.target.matches && e.target.matches(".btn, .chip-btn, .plate")) blip(1400, 0.05, "square", 0.012);
  }, true);

  // ---------------- reticle ----------------
  var ret = $("reticle"), retXY = $("reticle-xy");
  if (window.matchMedia("(pointer: fine)").matches && !reduced) {
    window.addEventListener("pointermove", function (e) {
      ret.classList.add("on");
      ret.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
      retXY.textContent = String(e.clientX).padStart(4, "0") + " · " + String(e.clientY).padStart(4, "0");
      var t = e.target;
      ret.classList.toggle("lock", !!(t.closest && t.closest("a, button, input, summary, label")));
    }, { passive: true });
    document.addEventListener("pointerleave", function () { ret.classList.remove("on"); });
  }

  // ---------------- clock + boot ----------------
  function tickClock() {
    var d = new Date();
    $("clock").textContent = d.toISOString().slice(11, 19) + " UTC";
  }
  tickClock();
  setInterval(tickClock, 1000);

  var boot = document.querySelector(".boot");
  if (!reduced && boot) {
    boot.classList.add("typing");
    var items = boot.querySelectorAll(".boot-log li");
    requestAnimationFrame(function () {
      boot.classList.remove("typing");
      items.forEach(function (li, i) {
        li.style.transitionDelay = (0.15 + i * 0.22) + "s";
      });
    });
  }

  // ---------------- nav highlight ----------------
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".topbar nav a"));
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll("section[id]").forEach(function (s) { io.observe(s); });
  }

  // ---------------- live telemetry ----------------
  var fmt = new Intl.NumberFormat("en-US");
  function gwei(hex) {
    var wei = parseInt(hex, 16);
    var g = wei / 1e9;
    return g >= 1 ? g.toFixed(2) : g >= 0.001 ? g.toFixed(3) : g.toExponential(1);
  }
  function setLive(state, text) {
    var pill = $("live-pill");
    pill.classList.remove("up", "down");
    if (state) pill.classList.add(state);
    $("live-pill-text").textContent = text;
  }
  var lastBlock = { mainnet: null, testnet: null };
  function poll() {
    var t0 = performance.now();
    S.rpcBatch(S.NETWORKS.mainnet.rpc, [["eth_blockNumber", []], ["eth_gasPrice", []]]).then(function (r) {
      var ms = Math.round(performance.now() - t0);
      var block = parseInt(r[0].result, 16);
      var gasWei = parseInt(r[1].result, 16);
      lastBlock.mainnet = block;
      $("t-block").textContent = fmt.format(block);
      $("t-gas").textContent = gwei(r[1].result) + " gwei";
      $("t-rpc").textContent = ms + " ms";
      var eth = (gasWei * DEPLOY_GAS) / 1e18;
      $("t-cost").textContent = (eth < 0.0001 ? eth.toPrecision(2) : eth.toFixed(5)) + " ETH";
      $("n-main-block").textContent = fmt.format(block);
      $("boot-chain").textContent = "block " + fmt.format(block);
      $("boot-chain").className = "ok";
      setLive("up", "4663 · #" + fmt.format(block));
    }).catch(function () {
      $("boot-chain").textContent = "offline";
      $("boot-chain").className = "bad";
      setLive("down", "RPC unreachable");
      $("foot-status").textContent = "FORGE OS 1.0 · chain uplink offline · scans unavailable from this page";
    });
    S.rpcBatch(S.NETWORKS.testnet.rpc, [["eth_blockNumber", []]]).then(function (r) {
      lastBlock.testnet = parseInt(r[0].result, 16);
      $("n-test-block").textContent = fmt.format(lastBlock.testnet);
    }).catch(function () {});
  }
  poll();
  setInterval(function () { if (!document.hidden) poll(); }, 6000);

  // ---------------- scanner ----------------
  var form = $("scan-form"), input = $("scan-address"), log = $("scan-log"), btn = $("scan-btn"), report = $("report");
  function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function logLine(text, cls) {
    var li = document.createElement("li");
    li.textContent = text;
    if (cls) li.className = cls;
    log.appendChild(li);
    while (log.children.length > 6) log.removeChild(log.firstChild);
  }
  function setNet(group, val) { var r = document.querySelector('input[name="' + group + '"][value="' + val + '"]'); if (r) r.checked = true; }
  function getNet(group) { var r = document.querySelector('input[name="' + group + '"]:checked'); return r ? r.value : "mainnet"; }

  document.querySelectorAll("[data-addr]").forEach(function (b) {
    b.addEventListener("click", function () {
      input.value = b.dataset.addr;
      setNet("net", b.dataset.net);
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true }));
    });
  });

  var VERDICT_TEXT = { ironclad: "Ironclad", caution: "Soft armor", danger: "No armor" };

  function render(r) {
    report.dataset.verdict = r.verdict;
    $("r-tag").textContent = "Live scan · block " + (r.block ? fmt.format(r.block) : "latest") + " · " + r.ms + " ms";
    $("r-verdict").textContent = VERDICT_TEXT[r.verdict];
    var tok = $("r-token");
    tok.textContent = r.name || "Unnamed contract";
    if (r.symbol) { var sp = document.createElement("span"); sp.textContent = r.symbol; tok.appendChild(sp); }
    $("r-addr").textContent = short(r.address) + " · " + r.network;
    $("r-supply").textContent = r.supply || "—";
    $("r-decimals").textContent = r.decimals != null ? r.decimals : "—";
    $("r-bytes").textContent = fmt.format(r.codeBytes) + " B";
    $("r-sealed").textContent = r.sealed + " / " + r.checks.length;
    $("r-explorer").href = r.explorer;
    var ul = $("r-checks");
    ul.textContent = "";
    r.checks.forEach(function (c, i) {
      var li = document.createElement("li");
      li.dataset.s = c.status;
      li.className = "in";
      li.style.animationDelay = (i * 0.06) + "s";
      var b = document.createElement("b"); b.textContent = c.label;
      var s = document.createElement("span"); s.textContent = c.detail;
      li.appendChild(b); li.appendChild(s);
      ul.appendChild(li);
    });
    animateScore(r.score);
    Scene().setAlert(r.verdict);
    if (r.verdict === "ironclad") chord([523, 659, 784]);
    else if (r.verdict === "caution") chord([440, 415]);
    else chord([220, 196, 175]);
  }

  function animateScore(score) {
    var el = $("r-score"), fill = $("g-fill");
    fill.setAttribute("stroke-dasharray", score + " 100");
    if (reduced) { el.textContent = score; return; }
    var start = performance.now(), from = 0;
    (function step(now) {
      var t = Math.min(1, (now - start) / 900);
      el.textContent = Math.round(from + (score - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var addr = input.value.trim();
    var net = getNet("net");
    if (!S.isAddress(addr)) {
      input.setAttribute("aria-invalid", "true");
      log.textContent = "";
      logLine("That isn't a contract address. Paste a 42-character address starting with 0x.", "err");
      return;
    }
    input.removeAttribute("aria-invalid");
    btn.disabled = true;
    btn.textContent = "Scanning…";
    report.classList.add("scanning");
    log.textContent = "";
    logLine("Target locked: " + short(addr) + " on " + S.NETWORKS[net].label);
    Scene().pulse();
    blip(320, 0.4, "sawtooth", 0.03);
    S.scan(addr, net, function (stepText) { logLine(stepText); Scene().pulse(); blip(760, 0.08, "square", 0.02); })
      .then(function (r) {
        logLine("Scan complete. " + r.sealed + " of " + r.checks.length + " plates sealed.", "done");
        render(r);
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
          msg = "Couldn't reach the Robinhood Chain RPC from this page. Live scans need the site running on its own host.";
        }
        logLine(msg, "err");
        Scene().setAlert("caution");
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Run threat scan";
        report.classList.remove("scanning");
      });
  });

  // ---------------- forge ----------------
  var fName = $("f-name"), fSym = $("f-symbol"), fSup = $("f-supply"), fMsg = $("forge-msg"), fBtn = $("forge-btn");
  if (ART) {
    $("sol-source").textContent = ART.source;
    $("s-bytes").textContent = "IroncladToken · " + fmt.format((ART.bytecode.length - 2) / 2) + " B";
  }
  function cleanSupply() { return fSup.value.replace(/[,_\s]/g, ""); }
  function syncSpec() {
    var name = fName.value.trim() || "Unnamed";
    var sym = fSym.value.trim().toUpperCase() || "???";
    $("coin-ticker").textContent = sym;
    $("s-token").textContent = name + " (" + sym + ")";
    var sup = cleanSupply();
    $("s-supply").textContent = /^\d+$/.test(sup) ? fmt.format(BigInt(sup)) : "—";
  }
  [fName, fSym, fSup].forEach(function (el) { el.addEventListener("input", syncSpec); });
  fSym.addEventListener("blur", function () { fSym.value = fSym.value.toUpperCase(); });
  document.querySelectorAll("[data-supply]").forEach(function (b) {
    b.addEventListener("click", function () { fSup.value = b.dataset.supply; syncSpec(); });
  });
  syncSpec();

  function say(text, cls, linkHref, linkText) {
    fMsg.className = "form-msg" + (cls ? " " + cls : "");
    fMsg.textContent = text;
    if (linkHref) {
      fMsg.appendChild(document.createTextNode(" "));
      var a = document.createElement("a");
      a.href = linkHref; a.target = "_blank"; a.rel = "noopener"; a.textContent = linkText;
      fMsg.appendChild(a);
    }
  }

  // ABI-encode (string, string, uint256) constructor args
  function encodeArgs(name, symbol, supply) {
    function word(n) { return BigInt(n).toString(16).padStart(64, "0"); }
    function str(s) {
      var bytes = new TextEncoder().encode(s);
      var hex = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      var padded = hex.padEnd(Math.ceil(hex.length / 64) * 64 || 0, "0");
      return word(bytes.length) + padded;
    }
    var a = str(name), b = str(symbol);
    var offA = 96, offB = offA + a.length / 2;
    return word(offA) + word(offB) + word(supply) + a + b;
  }

  function chainParams(net) {
    var n = S.NETWORKS[net];
    return {
      chainId: "0x" + n.chainId.toString(16),
      chainName: n.label,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: [n.rpc],
      blockExplorerUrls: [n.explorer],
    };
  }

  function switchChain(eth, net) {
    var p = chainParams(net);
    return eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: p.chainId }] }).catch(function (err) {
      if (err && (err.code === 4902 || /Unrecognized chain|not been added/i.test(err.message || ""))) {
        return eth.request({ method: "wallet_addEthereumChain", params: [p] });
      }
      throw err;
    });
  }

  function waitReceipt(eth, hash) {
    return new Promise(function (resolve, reject) {
      var tries = 0;
      (function check() {
        eth.request({ method: "eth_getTransactionReceipt", params: [hash] }).then(function (r) {
          if (r) return resolve(r);
          if (++tries > 120) return reject(new Error("Still waiting on the transaction after 3 minutes. Check it in the explorer."));
          setTimeout(check, 1500);
        }, reject);
      })();
    });
  }

  document.querySelectorAll("[data-addnet]").forEach(function (b) {
    b.addEventListener("click", function () {
      var eth = window.ethereum;
      if (!eth) { b.textContent = "No wallet found"; return; }
      switchChain(eth, b.dataset.addnet).then(function () { b.textContent = "Added"; }, function (err) { b.textContent = (err && err.code === 4001) ? "Cancelled" : "Couldn't add"; });
    });
  });

  $("forge-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = fName.value.trim(), sym = fSym.value.trim().toUpperCase(), sup = cleanSupply(), net = getNet("fnet");
    [fName, fSym, fSup].forEach(function (el) { el.removeAttribute("aria-invalid"); });
    if (!name || name.length > 32) { fName.setAttribute("aria-invalid", "true"); return say("Give the coin a name of 1 to 32 characters.", "err"); }
    if (!/^[A-Z0-9]{1,11}$/.test(sym)) { fSym.setAttribute("aria-invalid", "true"); return say("Tickers use 1 to 11 letters or digits, like PLATE.", "err"); }
    if (!/^\d+$/.test(sup) || BigInt(sup) < 1n || BigInt(sup) > 10n ** 18n) { fSup.setAttribute("aria-invalid", "true"); return say("Supply must be a whole number between 1 and 1,000,000,000,000,000,000.", "err"); }
    if (!ART) return say("The contract bundle didn't load. Reload the page and try again.", "err");
    var eth = window.ethereum;
    if (!eth) return say("No browser wallet found. Install MetaMask or Rabby, or open this page in your wallet's browser.", "err");

    var from;
    fBtn.disabled = true;
    fBtn.textContent = "Forging…";
    say("Waiting for your wallet to connect.");
    eth.request({ method: "eth_requestAccounts" }).then(function (accts) {
      from = accts[0];
      say("Switching your wallet to " + S.NETWORKS[net].label + ".");
      return switchChain(eth, net);
    }).then(function () {
      say("Confirm the deployment in your wallet. You'll receive all " + fmt.format(BigInt(sup)) + " " + sym + ".");
      return eth.request({ method: "eth_sendTransaction", params: [{ from: from, data: ART.bytecode + encodeArgs(name, sym, sup) }] });
    }).then(function (hash) {
      Scene().forge();
      $("coin").classList.add("flare");
      chord([392, 523, 659, 784]);
      say("Forging on-chain. Transaction " + short(hash) + ".", "", S.NETWORKS[net].explorer + "/tx/" + hash, "View transaction");
      return waitReceipt(eth, hash);
    }).then(function (rcpt) {
      $("coin").classList.remove("flare");
      if (rcpt.status !== "0x1" || !rcpt.contractAddress) throw new Error("The deployment reverted. Nothing was created; you only paid gas.");
      var addr = rcpt.contractAddress;
      say(sym + " is live at " + addr + ". Scanning it now.", "ok", S.NETWORKS[net].explorer + "/address/" + addr, "Open in explorer");
      input.value = addr;
      setNet("net", net);
      document.getElementById("scanner").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
      setTimeout(function () { form.requestSubmit ? form.requestSubmit() : null; }, 900);
    }).catch(function (err) {
      $("coin").classList.remove("flare");
      var msg = err && err.code === 4001 ? "You cancelled in your wallet. Nothing was deployed." : (err && err.message) || "The wallet returned an error.";
      say(msg, "err");
    }).then(function () {
      fBtn.disabled = false;
      fBtn.textContent = "Connect wallet and forge";
    });
  });

  // gentle lift on section heads as they arrive (content is visible without it)
  if ("IntersectionObserver" in window && !reduced) {
    var lifter = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("lift"); lifter.unobserve(en.target); } });
    }, { threshold: 0.2 });
    document.querySelectorAll(".section-head, .plate, .console, .report, .spec, .net-wrap").forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top > window.innerHeight) lifter.observe(el);
    });
  }
})();
