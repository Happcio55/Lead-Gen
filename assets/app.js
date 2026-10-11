/* Kairo landing — all market data below is simulated client-side for the demo. */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- helpers ----------
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = rng(Date.now());
  const pick = (arr, r = rand) => arr[Math.floor(r() * arr.length)];
  const randAddr = (r = rand) => '0x' + Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
  const short = a => a.slice(0, 6) + '…' + a.slice(-4);
  const fmtUsd = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + n.toFixed(0);
  const fmtNum = n => n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 0 });
  const fmtPct = n => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  const scoreClass = s => s >= 7 ? 's-hi' : s >= 4 ? 's-mid' : 's-lo';
  const scoreColor = s => s >= 7 ? '#3ee59a' : s >= 4 ? '#ffb547' : '#ff5470';
  const scoreLabel = s => s >= 8 ? 'Clean launch' : s >= 7 ? 'Looks healthy' : s >= 5 ? 'Proceed with care' : s >= 4 ? 'Mixed signals' : s >= 2 ? 'High risk' : 'Likely rug';
  const ago = ms => { const s = Math.floor(ms / 1000); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h'; };
  const hues = ['#b6ff3c', '#6ae3ff', '#a87bff', '#ff8ad8', '#ffb547', '#3ee59a', '#ff7a59', '#7aa2ff'];
  const avatar = (sym, seed, cls = '') => {
    const r = rng(hash(seed));
    const a = pick(hues, r), b = pick(hues, r);
    return `<span class="tk ${cls}" style="background:linear-gradient(135deg,${a},${b})">${sym.slice(0, 3)}</span>`;
  };
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- token model ----------
  const P1 = ['Orbit', 'Neon', 'Turbo', 'Pixel', 'Moon', 'Hyper', 'Lucky', 'Based', 'Feather', 'Cosmic', 'Glitch', 'Velvet', 'Rocket', 'Quantum', 'Frog', 'Shiba', 'Laser', 'Mega', 'Cyber', 'Bonk'];
  const P2 = ['Cat', 'Pepe', 'Dog', 'Ape', 'Coin', 'Inu', 'AI', 'Hood', 'Wif', 'Duck', 'Bull', 'Bear', 'Fish', 'Panda', 'Bot', 'Owl', 'Kong', 'Gnome'];
  const FLAGS = {
    bad: ['Deployer sold into the bonding curve', 'Bundled snipers grabbed 18% in block 1', 'Top 10 wallets hold over 60%', 'Wallets routing around the buy tax', 'Name and logo copy a token that already ran', 'Liquidity is not locked', 'Mint authority still active'],
    warn: ['Holder count growing slowly', 'Volume concentrated in 3 wallets', 'Contract not verified yet', 'Dev wallet funded via a fresh bridge'],
    ok: ['Liquidity locked for 12 months', 'Deployer holds under 2%', 'No sniper cluster detected', 'Contract verified, no mint function', 'Organic holder growth', 'Tax matches what the contract says']
  };
  const AI = {
    hi: [
      'Clean launch. The deployer kept a tiny bag, liquidity is locked and buyers look organic — the main risk here is ordinary volatility.',
      'Nothing alarming. Holders are spread out, there was no sniper rush, and the contract does what it says.'
    ],
    mid: [
      'Not a red flag yet, but buying is concentrated in a handful of wallets. If they exit, the price has little support.',
      'Mostly fine on paper, but the contract is unverified and the dev wallet was funded minutes before launch. Size small.'
    ],
    lo: [
      'The deployer has been selling into every buy since launch. That pattern usually ends with an empty chart.',
      'Snipers bundled into block one and still hold a big chunk. Expect them to dump on the first pump.',
      'This copies the name and art of a token that already pumped. Classic copycat — the original is the real one.'
    ]
  };

  function makeToken(addr, opts = {}) {
    addr = (addr || randAddr()).toLowerCase();
    const r = rng(hash(addr));
    const name = opts.name || pick(P1, r) + ' ' + pick(P2, r);
    const sym = opts.sym || name.split(' ').map(w => w.slice(0, w.length > 4 ? 3 : w.length)).join('').toUpperCase().slice(0, 5);
    const launch = Math.max(1, Math.min(10, Math.round((opts.bias != null ? opts.bias : r() * 10) + (r() - .5) * 2)));
    const market = Math.max(1, Math.min(10, Math.round(launch + (r() - .5) * 4)));
    const score = Math.max(1, Math.min(10, Math.round(launch * .6 + market * .4)));
    const nb = score <= 3 ? 2 : score <= 5 ? 1 : 0;
    const nw = score <= 6 ? 1 : 0;
    const flags = [];
    const take = (k, n) => { const pool = FLAGS[k].slice(); for (let i = 0; i < n && pool.length; i++) flags.push({ k, t: pool.splice(Math.floor(r() * pool.length), 1)[0] }); };
    take('bad', nb); take('warn', nw); take('ok', 4 - nb - nw);
    const tier = score >= 7 ? 'hi' : score >= 4 ? 'mid' : 'lo';
    return {
      addr, name, sym, score, launch, market, flags,
      ai: pick(AI[tier], r),
      price: Math.pow(10, -2 - r() * 5),
      vol: 2000 + r() * r() * 900000,
      change: (r() - .4) * (score < 4 ? 140 : 70),
      born: opts.born || Date.now() - r() * 3600e3 * 6
    };
  }

  const known = [];
  for (let i = 0; i < 14; i++) known.push(makeToken());
  const seeded = [
    makeToken('0x7a11000000000000000000000000000000c0ffee', { name: 'Orbit Cat', sym: 'ORBIT', bias: 8.5 }),
    makeToken('0x5c0de00000000000000000000000000000beef01', { name: 'Hood Frog', sym: 'HFROG', bias: 5 }),
    makeToken('0xdead00000000000000000000000000000000ba5e', { name: 'Pepe Hood', sym: 'PEPEH', bias: 1.5 })
  ];
  known.push(...seeded);
  const findToken = q => {
    q = q.trim().toLowerCase();
    if (!q) return null;
    if (/^0x[0-9a-f]{40}$/.test(q)) return known.find(t => t.addr === q) || makeToken(q);
    return known.find(t => t.sym.toLowerCase() === q || t.name.toLowerCase().includes(q)) || null;
  };

  // ---------- score card ----------
  const ARC = 2 * Math.PI * 22 * 0.75;
  function scoreCardHTML(id) {
    return `<div class="scorevis">
      <div class="dialbox">
        <svg viewBox="0 0 52 52" aria-hidden="true">
          <circle class="trk" cx="26" cy="26" r="22" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="${ARC} 999"/>
          <circle class="val" id="${id}Arc" cx="26" cy="26" r="22" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="${ARC} 999" stroke-dashoffset="${ARC}"/>
        </svg>
        <div class="n"><span id="${id}N">—</span><small>/ 10</small></div>
      </div>
      <div class="sright">
        <div class="stok" id="${id}Tok"></div>
        <span class="slabel" id="${id}Lab"></span>
        <ul class="flags" id="${id}Flags"></ul>
      </div>
      <div class="sai">
        <div class="aih"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" fill="currentColor"/></svg>Kairo AI</div>
        <p id="${id}Ai"><span class="skl w100"></span><span class="skl w70"></span></p>
      </div>
      <p class="snote">Describes how the token launched and trades. Not financial advice.</p>
    </div>`;
  }
  const typers = {};
  function fillScore(id, t) {
    const arc = $('#' + id + 'Arc'), n = $('#' + id + 'N');
    arc.style.stroke = scoreColor(t.score); arc.style.color = scoreColor(t.score);
    requestAnimationFrame(() => { arc.style.strokeDashoffset = ARC * (1 - t.score / 10); });
    countTo(n, t.score, 900);
    $('#' + id + 'Tok').innerHTML = avatar(t.sym, t.addr, 'lg') + `<div><b>${t.name}</b><small>$${t.sym} · ${short(t.addr)}</small></div>`;
    const lab = $('#' + id + 'Lab');
    lab.textContent = scoreLabel(t.score); lab.className = 'slabel ' + scoreClass(t.score);
    const icon = { bad: '!', warn: '~', ok: '✓' };
    $('#' + id + 'Flags').innerHTML = t.flags.map(f => `<li class="${f.k}"><i>${icon[f.k]}</i>${f.t}</li>`).join('');
    typeText($('#' + id + 'Ai'), t.ai, id);
  }
  function typeText(el, text, key) {
    clearInterval(typers[key]);
    if (reduced) { el.textContent = text; return; }
    let i = 0;
    el.innerHTML = '<span class="caret"></span>';
    setTimeout(() => {
      typers[key] = setInterval(() => {
        i += 2;
        el.innerHTML = text.slice(0, i) + '<span class="caret"></span>';
        if (i >= text.length) { clearInterval(typers[key]); el.textContent = text; }
      }, 18);
    }, 450);
  }
  function countTo(el, to, dur, suffix = '') {
    if (reduced) { el.textContent = to.toLocaleString('en-US') + suffix; return; }
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e).toLocaleString('en-US') + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  // section score card
  $('#scoreCard').innerHTML = scoreCardHTML('sc');
  let scIdx = 0;
  const scList = [seeded[0], seeded[2], seeded[1]];
  function showSection(t) {
    fillScore('sc', t);
    $('#sLaunch').textContent = t.launch + '/10';
    $('#sMarket').textContent = t.market + '/10';
    $('#sLaunchBar').style.width = t.launch * 10 + '%';
    $('#sMarketBar').style.width = t.market * 10 + '%';
  }
  let scTimer;
  function cycleScore() {
    showSection(scList[scIdx++ % scList.length]);
    clearTimeout(scTimer);
    scTimer = setTimeout(cycleScore, 9000);
  }
  $('#nextScore').addEventListener('click', e => {
    e.preventDefault();
    scList.push(makeToken());
    scIdx = scList.length - 1;
    cycleScore();
  });

  // ---------- report modal ----------
  const modal = $('#report');
  let current = null, lastFocus = null;
  function openReport(t) {
    current = t;
    lastFocus = document.activeElement;
    $('#repBody').innerHTML = scoreCardHTML('rp');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    fillScore('rp', t);
    $('[data-close]', modal).focus();
  }
  function closeReport() {
    modal.hidden = true;
    document.body.style.overflow = '';
    clearInterval(typers.rp);
    if (lastFocus) lastFocus.focus();
  }
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) closeReport(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeReport(); });
  $('#repCopy').addEventListener('click', () => {
    if (!current) return;
    (navigator.clipboard ? navigator.clipboard.writeText(current.addr) : Promise.reject())
      .then(() => toast('Address copied'), () => toast(current.addr));
  });
  $('#repBuy').addEventListener('click', () => {
    if (!current) return;
    setTarget(current);
    closeReport();
    $('#hero').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });

  function handleQuery(q, input) {
    q = q.trim();
    if (!q) { input.focus(); toast('Paste a token address or type a ticker'); return; }
    const t = findToken(q);
    if (!t) { toast(/^0x/i.test(q) ? 'That doesn’t look like a valid address (0x + 40 hex)' : `No token matching "${q}"`); return; }
    if (!known.includes(t)) known.push(t);
    openReport(t);
  }
  ['#heroCheck', '#ctaCheck', '#navSearch'].forEach(sel => {
    const f = $(sel);
    f.addEventListener('submit', e => { e.preventDefault(); const i = $('input', f); handleQuery(i.value, i); });
  });

  // try chips
  $('#tryChips').innerHTML = seeded.map((t, i) =>
    `<button class="trychip" type="button" data-i="${i}">${avatar(t.sym, t.addr)}${t.name}<span class="sc ${scoreClass(t.score)}">${t.score}</span></button>`).join('');
  $('#tryChips').addEventListener('click', e => {
    const b = e.target.closest('.trychip');
    if (!b) return;
    const t = seeded[+b.dataset.i];
    $('#heroCa').value = t.addr;
    openReport(t);
  });

  // ---------- feed ----------
  let feedMode = 'recent';
  const feedRows = $('#feedRows');
  feedRows.innerHTML = Array.from({ length: 6 }, () =>
    '<div class="frow sk"><span class="fn"><span class="tk"></span><div><b>Loading token</b><small>0x0000…0000</small></div></span><span class="fhide"><small>—</small></span><span class="fhide"><small>—</small></span><span><small>—</small></span><span class="fs">0</span></div>').join('');
  function renderFeed(newAddr) {
    let list = known.slice();
    if (feedMode === 'recent') list.sort((a, b) => b.born - a.born);
    else if (feedMode === 'trending') list.sort((a, b) => b.vol - a.vol);
    else list.sort((a, b) => b.score - a.score || b.vol - a.vol);
    if ($('#hideRisky').checked) list = list.filter(t => t.score >= 4);
    feedRows.innerHTML = list.slice(0, 7).map(t => `
      <div class="frow${t.addr === newAddr ? ' new' : ''}" data-a="${t.addr}" role="button" tabindex="0">
        <span class="fn">${avatar(t.sym, t.addr)}<div><b>${t.name}</b><small>$${t.sym}</small></div></span>
        <span class="fhide">${ago(Date.now() - t.born)}</span>
        <span class="fhide">${fmtUsd(t.vol)}</span>
        <span class="${t.change >= 0 ? 'up' : 'dn'}">${fmtPct(t.change)}</span>
        <span class="fs ${scoreClass(t.score)}">${t.score}</span>
      </div>`).join('');
  }
  const openRow = e => {
    const row = e.target.closest('.frow[data-a]');
    if (!row) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openReport(known.find(t => t.addr === row.dataset.a));
  };
  feedRows.addEventListener('click', openRow);
  feedRows.addEventListener('keydown', openRow);
  $$('.ftabs button').forEach(b => b.addEventListener('click', () => {
    $$('.ftabs button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    feedMode = b.dataset.feed;
    renderFeed();
  }));
  $('#hideRisky').addEventListener('change', () => renderFeed());
  $('#feedMore').addEventListener('click', e => { e.preventDefault(); $('#navQ').focus(); toast('Search any token from the bar above'); });

  setTimeout(() => renderFeed(), 700);
  setInterval(() => {
    known.forEach(t => { t.vol *= 1 + rand() * .02; t.change += (rand() - .5) * 2; });
    let fresh = null;
    if (rand() < .55) { fresh = makeToken(null, { born: Date.now() }); known.push(fresh); pulse.tokens++; if (fresh.score < 4) pulse.flagged++; }
    if (known.length > 60) known.splice(0, known.length - 60 + 0);
    if (!seeded.every(s => known.includes(s))) seeded.forEach(s => { if (!known.includes(s)) known.push(s); });
    renderFeed(fresh && feedMode === 'recent' ? fresh.addr : null);
  }, 4200);

  // ---------- pulse strip ----------
  const pulse = { flagged: 312, tokens: 1874, block: 48211903, blockMs: 100, stocks: 64 };
  function setPulse(k, v) {
    $$(`[data-pulse="${k}"]`).forEach(el => {
      if (el.textContent !== v) { el.textContent = v; if (k !== 'block') { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }
    });
  }
  function tickPulse() {
    pulse.block += 9 + Math.floor(rand() * 3);
    pulse.blockMs = 96 + Math.floor(rand() * 9);
    setPulse('flagged', pulse.flagged.toLocaleString('en-US'));
    setPulse('tokens', pulse.tokens.toLocaleString('en-US'));
    setPulse('block', pulse.block.toLocaleString('en-US'));
    setPulse('blockMs', pulse.blockMs + ' ms');
    setPulse('stocks', String(pulse.stocks));
  }
  tickPulse();
  setInterval(tickPulse, 1000);

  // marquee
  function renderMarq() {
    const items = known.slice(-12).map(t =>
      `<span class="mi">${avatar(t.sym, t.addr)}<b>$${t.sym}</b><i class="${t.change >= 0 ? 'up' : 'dn'}">${fmtPct(t.change)}</i><span class="fs ${scoreClass(t.score)}">${t.score}</span></span>`).join('');
    $('#marq').innerHTML = items + items;
  }
  renderMarq();
  setInterval(renderMarq, 30000);

  // ---------- chains ----------
  const CHAINS = [
    ['Ethereum', 'ETH', '#a8b3ff', 45], ['Base', 'ETH', '#3b7bff', 10], ['Arbitrum', 'ETH', '#2d9cdb', 8], ['Optimism', 'ETH', '#ff3b4a', 10],
    ['BNB Chain', 'BNB', '#f3ba2f', 15], ['Polygon', 'POL', '#8247e5', 20], ['Linea', 'ETH', '#61dfff', 15], ['Scroll', 'ETH', '#ffeeda', 20],
    ['zkSync', 'ETH', '#8c8dfc', 15], ['Blast', 'ETH', '#fcfc03', 12], ['Mode', 'ETH', '#dffe00', 12], ['Mantle', 'ETH', '#65b3ae', 15],
    ['Zora', 'ETH', '#a1c4fd', 12], ['Unichain', 'ETH', '#ff4fd8', 8], ['Ink', 'ETH', '#7132f5', 10], ['Soneium', 'ETH', '#e0e0e0', 12],
    ['Robinhood', 'ETH', '#b6ff3c', 1]
  ];
  const PRICES = { ETH: 3420, BNB: 610, POL: 0.42 };
  let srcChain = 1; // Base
  function renderChains() {
    $('#chainGrid').innerHTML = CHAINS.map((c, i) => {
      const dest = c[0] === 'Robinhood';
      const fg = ['#3b7bff', '#ff3b4a', '#8247e5', '#7132f5', '#2d9cdb'].includes(c[2]) ? '#fff' : '#000';
      return `<button type="button" class="chain${dest ? ' dest' : ''}${i === srcChain ? ' on' : ''}" data-i="${i}">
        <span class="ci" style="background:${c[2]};color:${fg}">${c[0].slice(0, 2)}</span>${dest ? 'Robinhood Chain · destination' : c[0]}</button>`;
    }).join('');
    const c = CHAINS[srcChain];
    $('#routeLine').innerHTML = `<b>${c[1]}</b> on ${c[0]}<span class="pipe"></span><b>~${c[3] >= 45 ? '<1 min' : c[3] + ' s'}</b><span class="pipe"></span>Robinhood Chain`;
  }
  $('#chainGrid').addEventListener('click', e => {
    const b = e.target.closest('.chain');
    if (!b) return;
    const i = +b.dataset.i;
    if (CHAINS[i][0] === 'Robinhood') { toast('That’s where your tokens arrive'); return; }
    srcChain = i;
    renderChains();
    payIdx = PAY.findIndex(p => p.chain === i);
    if (payIdx < 0) { PAY.push({ sym: CHAINS[i][1], chain: i }); payIdx = PAY.length - 1; }
    renderSwap();
    toast(`Paying from ${CHAINS[i][0]}`);
  });

  // ---------- swap ----------
  const PAY = [{ sym: 'ETH', chain: 1 }, { sym: 'ETH', chain: 0 }, { sym: 'BNB', chain: 4 }, { sym: 'POL', chain: 5 }, { sym: 'ETH', chain: 2 }];
  let payIdx = 0, mode = 'buy', target = seeded[0], slip = 1.0, account = null, balance = 0;
  const SLIPS = [0.5, 1.0, 2.0, 3.0];
  const coinAvatar = sym => {
    const col = { ETH: '#a8b3ff', BNB: '#f3ba2f', POL: '#8247e5' }[sym];
    return `<span class="tk" style="background:${col};color:${sym === 'POL' ? '#fff' : '#000'}">${sym}</span>`;
  };
  const selHTML = (av, sym, sub) => `${av}<span>${sym}${sub ? `<br><span class="chainbadge">${sub}</span>` : ''}</span><svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;
  function setTarget(t) { target = t; renderSwap(); toast(`${t.name} loaded into swap`); }
  function renderSwap() {
    const p = PAY[payIdx], chain = CHAINS[p.chain];
    const payBtn = selHTML(coinAvatar(p.sym), p.sym, chain[0]);
    const tokBtn = selHTML(avatar(target.sym, target.addr), target.sym, 'Robinhood');
    const amt = parseFloat($('#payAmt').value.replace(',', '.')) || 0;
    const coinUsd = PRICES[p.sym];
    let usd, out;
    if (mode === 'buy') {
      $('#paySel').innerHTML = payBtn; $('#getSel').innerHTML = tokBtn;
      usd = amt * coinUsd; out = usd * 0.997 / target.price;
      $('#rate').textContent = `1 ${p.sym} ≈ ${fmtNum(coinUsd / target.price)} ${target.sym}`;
    } else {
      $('#paySel').innerHTML = tokBtn; $('#getSel').innerHTML = payBtn;
      usd = amt * target.price; out = usd * 0.997 / coinUsd;
      $('#rate').textContent = `1 ${target.sym} ≈ ${fmtNum(target.price / coinUsd)} ${p.sym}`;
    }
    $('#getAmt').value = amt ? fmtNum(out) : '';
    $('#payUsd').textContent = '$' + usd.toLocaleString('en-US', { maximumFractionDigits: 2 });
    $('#getUsd').textContent = '$' + (usd * 0.997).toLocaleString('en-US', { maximumFractionDigits: 2 });
    $('#payBal').textContent = account ? `Balance ${mode === 'buy' ? balance.toFixed(4) + ' ' + p.sym : '0 ' + target.sym}` : 'Balance —';
    $('#dRoute').textContent = mode === 'buy' ? `${chain[0]} → Robinhood` : `Robinhood → ${chain[0]}`;
    $('#dTime').textContent = chain[3] >= 45 ? '< 1 min' : '~' + chain[3] + ' s';
    $('#dSlip').textContent = slip.toFixed(1) + '%';
    const t = target;
    $('#swScore').innerHTML = `<span class="sc ${scoreClass(t.score)}">${t.score}/10</span><p><b>${scoreLabel(t.score)}.</b> ${t.flags[0].t}.</p>`;
    const go = $('#swGo');
    go.disabled = false;
    if (!account) go.textContent = 'Connect wallet';
    else if (!amt) { go.textContent = 'Enter an amount'; go.disabled = true; }
    else if (mode === 'buy' && amt > balance) { go.textContent = `Not enough ${p.sym}`; go.disabled = true; }
    else if (mode === 'sell') { go.textContent = `No ${t.sym} to sell`; go.disabled = true; }
    else go.textContent = t.score < 4 ? `Buy anyway (score ${t.score})` : `Buy ${t.sym}`;
  }
  $('#payAmt').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^0-9.,]/g, ''); renderSwap(); });
  $('#paySel').addEventListener('click', () => {
    if (mode === 'buy') { payIdx = (payIdx + 1) % PAY.length; srcChain = PAY[payIdx].chain; renderChains(); renderSwap(); }
    else cycleTarget();
  });
  $('#getSel').addEventListener('click', () => { if (mode === 'buy') cycleTarget(); else { payIdx = (payIdx + 1) % PAY.length; renderSwap(); } });
  function cycleTarget() {
    const pool = known.filter(t => t.score >= 4);
    target = pool[(pool.indexOf(target) + 1) % pool.length] || seeded[0];
    renderSwap();
  }
  $('#flipBtn').addEventListener('click', () => setMode(mode === 'buy' ? 'sell' : 'buy'));
  $$('.swtabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  function setMode(m) {
    mode = m;
    $$('.swtabs button').forEach(b => { b.classList.toggle('on', b.dataset.mode === m); b.setAttribute('aria-selected', b.dataset.mode === m); });
    $('#payLab').textContent = m === 'buy' ? 'You pay' : 'You sell';
    $('#getLab').textContent = m === 'buy' ? 'You receive' : 'You get';
    renderSwap();
  }
  $('#maxBtn').addEventListener('click', () => {
    if (!account) { toast('Connect a wallet to use MAX'); return; }
    $('#payAmt').value = mode === 'buy' ? Math.max(0, balance - 0.002).toFixed(4) : '0';
    renderSwap();
  });
  $('#slipBtn').addEventListener('click', () => {
    slip = SLIPS[(SLIPS.indexOf(slip) + 1) % SLIPS.length];
    renderSwap(); toast(`Max slippage set to ${slip.toFixed(1)}%`);
  });
  $('#swGo').addEventListener('click', () => {
    if (!account) { connect(); return; }
    const steps = $$('#steps li');
    const amt = $('#getAmt').value;
    toast('Demo mode — no transaction is sent');
    steps.forEach(li => { li.className = ''; });
    steps[2].lastElementChild.textContent = `${amt} ${target.sym} landed in your wallet`;
    steps[0].className = 'now';
    $('#wallet').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => { steps[0].className = 'done'; steps[1].className = 'now'; }, 1200);
    setTimeout(() => { steps[1].className = 'done'; steps[2].className = 'now'; }, 1200 + CHAINS[PAY[payIdx].chain][3] * 60);
  });

  // ---------- wallet ----------
  async function connect() {
    let addr = null;
    if (window.ethereum && window.ethereum.request) {
      try {
        const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
        addr = accs && accs[0];
        try {
          const hex = await window.ethereum.request({ method: 'eth_getBalance', params: [addr, 'latest'] });
          balance = parseInt(hex, 16) / 1e18;
        } catch (_) { balance = 0; }
      } catch (err) { toast('Wallet connection was rejected'); return; }
    } else {
      addr = randAddr();
      balance = 1.2847;
      toast('No browser wallet found — using a demo wallet');
    }
    if (!addr) return;
    account = addr;
    $('#navConnect').hidden = true;
    $('#navAcct').hidden = false;
    $('#acctAddr').textContent = short(addr);
    $('#wc2Label').textContent = 'Connected · ' + short(addr);
    renderSwap();
  }
  function disconnect() {
    account = null; balance = 0;
    $('#navConnect').hidden = false; $('#navAcct').hidden = true;
    $('#wc2Label').textContent = 'Connect wallet';
    renderSwap(); toast('Disconnected');
  }
  $('#navConnect').addEventListener('click', connect);
  $('#walletConnect2').addEventListener('click', () => account ? toast('Already connected') : connect());
  $('#navAcct').addEventListener('click', disconnect);

  // ---------- stocks ----------
  const STOCKS = [['NVDA', 'NVIDIA', 182.4], ['TSLA', 'Tesla', 248.1], ['AAPL', 'Apple', 231.7], ['MSFT', 'Microsoft', 438.2],
    ['AMZN', 'Amazon', 197.6], ['META', 'Meta', 612.9], ['GOOGL', 'Alphabet', 176.3], ['HOOD', 'Robinhood', 64.8]]
    .map(([sym, name, px]) => ({ sym, name, px, open: px * (1 + (rand() - .5) * .04), hist: Array.from({ length: 24 }, () => px) }));
  STOCKS.forEach(s => { let v = s.open; s.hist = s.hist.map(() => (v *= 1 + (rand() - .5) * .006)); s.px = v; });
  function spark(h, up) {
    const min = Math.min(...h), max = Math.max(...h), rng = max - min || 1;
    const pts = h.map((v, i) => `${(i / (h.length - 1) * 64).toFixed(1)},${(24 - (v - min) / rng * 22).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 64 26" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? '#3ee59a' : '#ff5470'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  function renderStocks() {
    $('#stockGrid').innerHTML = STOCKS.map(s => {
      const ch = (s.px / s.open - 1) * 100;
      return `<div class="stile"><span class="tk" style="background:linear-gradient(135deg,#1d2133,#2a3048);color:#fff">${s.sym}</span>
        <b>${s.name}</b><span class="px">$${s.px.toFixed(2)}</span><span class="ch ${ch >= 0 ? 'up' : 'dn'}">${fmtPct(ch)}</span>${spark(s.hist, ch >= 0)}</div>`;
    }).join('');
  }
  renderStocks();
  setInterval(() => {
    STOCKS.forEach(s => { s.px *= 1 + (rand() - .5) * .004; s.hist.push(s.px); s.hist.shift(); });
    renderStocks();
  }, 2500);

  // ---------- chrome: nav, menu, shortcuts, fx ----------
  const nav = $('#topnav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const mBtn = $('#mBtn'), mSheet = $('#mSheet');
  mBtn.addEventListener('click', () => { const open = mSheet.hidden; mSheet.hidden = !open; mBtn.setAttribute('aria-expanded', open); });
  mSheet.addEventListener('click', e => { if (e.target.closest('a')) { mSheet.hidden = true; mBtn.setAttribute('aria-expanded', 'false'); } });

  document.addEventListener('keydown', e => {
    if (e.key !== '/' || /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) || !modal.hidden) return;
    e.preventDefault();
    const q = $('#navQ');
    (q.offsetParent ? q : $('#heroCa')).focus();
  });

  if (!reduced) {
    const spot = $('.spot');
    addEventListener('pointermove', e => {
      spot.style.setProperty('--mx', e.clientX + 'px');
      spot.style.setProperty('--my', e.clientY + 'px');
    }, { passive: true });
    $$('.cpanel').forEach(p => p.addEventListener('pointermove', e => {
      const r = p.getBoundingClientRect();
      p.style.setProperty('--px', e.clientX - r.left + 'px');
      p.style.setProperty('--py', e.clientY - r.top + 'px');
    }));
    const sw = $('#swap');
    if (matchMedia('(hover: hover)').matches) {
      sw.addEventListener('pointermove', e => {
        const r = sw.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        sw.style.transform = `perspective(1000px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
      });
      sw.addEventListener('pointerleave', () => { sw.style.transform = ''; });
    }
  }

  // reveal + count-up
  const counted = new WeakSet();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
    });
  }, { threshold: .15 }) : null;
  $$('.rv').forEach(el => io ? io.observe(el) : el.classList.add('in'));
  $$('[data-count]').forEach(el => {
    if (counted.has(el)) return; counted.add(el);
    setTimeout(() => countTo(el, +el.dataset.count, 1600, el.dataset.suffix || ''), 300);
  });

  // boot
  renderChains();
  renderSwap();
  cycleScore();
})();
