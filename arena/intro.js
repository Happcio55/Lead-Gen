/* Scroll-driven intro: a cream CRT in a dithered moonlit forest powers on, types live mainnet data,
   brings the agents online, then the camera dives into the screen and the page continues below. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const { AGENTS } = Q;
  const track = $('#tvTrack'), stage = $('#tvStage'), cv = $('#tvScene'), g = cv.getContext('2d');
  const sky = $('#introSky'), sg = sky.getContext('2d');
  const scr = $('#tvScreen'), inner = $('#tvInner'), noise = $('#tvNoise'), ng = noise.getContext('2d');
  const text = $('#tvText'), agentsEl = $('#tvAgents'), bar = $('#tvBar'), flash = $('#tvFlash'), cue = $('#tvCue');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CREAM = '#ece6da', CREAM2 = '#b8b0a2', SHADE = '#8f8778', DARK = '#2b2526', HOT = '#e8274b';

  let P = 4, vw = 0, vh = 0, T = {}, land = null, skyLand = null;
  const buf = document.createElement('canvas'), bg = buf.getContext('2d');
  const skyBuf = document.createElement('canvas'), sbg = skyBuf.getContext('2d');
  const caseBuf = document.createElement('canvas');

  function layout() {
    P = Math.max(3, Math.round(Math.min(innerWidth, innerHeight) / 170));
    vw = Math.ceil(innerWidth / P); vh = Math.ceil(innerHeight / P);
    for (const c of [cv, sky, buf, skyBuf]) { c.width = vw; c.height = vh; }
    const portrait = vw < vh;
    const tvW = Math.floor(portrait ? vw * 0.86 : Math.min(vw * 0.56, vh * 0.6 * 1.32));
    const tvH = Math.floor(tvW / 1.32);
    const tvX = Math.floor((vw - tvW) / 2);
    const tvY = Math.floor(vh * (portrait ? 0.5 : 0.56) - tvH / 2);
    const sx = tvX + Math.round(tvW * 0.065), sy = tvY + Math.round(tvH * 0.1);
    const sw = Math.round(tvW * 0.67), sh = Math.round(tvH * 0.78);
    T = { tvW, tvH, tvX, tvY, sx, sy, sw, sh, ground: tvY + tvH + Math.max(3, Math.round(tvH * 0.07)) };
    Object.assign(scr.style, { left: sx * P + 'px', top: sy * P + 'px', width: sw * P + 'px', height: sh * P + 'px' });
    stage.style.transformOrigin = `${(sx + sw / 2) * P}px ${(sy + sh / 2) * P}px`;
    noise.width = Math.max(40, Math.round(sw / 1.5)); noise.height = Math.max(30, Math.round(sh / 1.5));
    text.style.fontSize = Math.max(9, (sh * P) / 19) + 'px';
    caseBuf.width = tvW; caseBuf.height = tvH;
    const cc = caseBuf.getContext('2d');
    for (let y = 0; y < tvH; y++) for (let x = 0; x < tvW; x++) {
      if ((x < 2 || x > tvW - 3) && (y < 2 || y > tvH - 3)) continue;
      const shade = (x / tvW) * 0.6 + (y / tvH) * 0.4;
      cc.fillStyle = shade > 0.62 + Sprites.bayer(x, y) * 0.3 ? SHADE : shade > 0.35 + Sprites.bayer(x, y) * 0.3 ? CREAM2 : CREAM;
      cc.fillRect(x, y, 1, 1);
    }
    land = Sprites.makeLand(vw, vh, T.ground);
    // keep the forest clear around the TV
    land.trees = land.trees.filter((tr) => !(tr.front && tr.x > T.tvX - 6 && tr.x < T.tvX + T.tvW + 6));
    skyLand = Sprites.makeLand(vw, vh, Math.floor(vh * 0.97));
    lastLand = 0;
  }

  const rect = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

  function paintTV(ctx, t, power) {
    const { tvW, tvH, tvX, tvY, sx, sy, sw, sh, ground } = T;
    if (power > 0) for (let k = 0; k < 16; k++) { // screen light on the ground
      const rw = tvW * (0.55 + k * 0.08);
      for (let x = 0; x < rw; x++) if (0.5 * power * (1 - k / 16) > Sprites.bayer(x, k)) rect(ctx, Math.floor(tvX + tvW / 2 - rw / 2 + x), ground + k, 1, 1, '#3a3431');
    }
    const lh = ground - (tvY + tvH);
    rect(ctx, tvX + Math.floor(tvW * 0.12), tvY + tvH, Math.max(3, tvW * 0.05), lh, '#141011');
    rect(ctx, tvX + Math.floor(tvW * 0.83), tvY + tvH, Math.max(3, tvW * 0.05), lh, '#141011');
    // antenna
    const ax = tvX + Math.floor(tvW / 2), ay = tvY, len = Math.floor(tvH * 0.5);
    rect(ctx, ax - 4, ay - 3, 9, 3, DARK);
    for (let i = 0; i < len; i++) { rect(ctx, ax - Math.floor(i * 0.62), ay - 3 - i, 1, 1, CREAM2); rect(ctx, ax + 1 + Math.floor(i * 0.42), ay - 3 - i, 1, 1, CREAM2); }
    const blink = Math.floor(t / 500) % 2;
    rect(ctx, ax - Math.floor(len * 0.62) - 1, ay - 4 - len, 3, 3, power > 0.5 && blink ? HOT : CREAM2);
    rect(ctx, ax + Math.floor(len * 0.42), ay - 4 - len, 3, 3, power > 0.5 && !blink ? HOT : CREAM2);
    ctx.drawImage(caseBuf, tvX, tvY); // cream casing with dithered shading, pre-rendered
    rect(ctx, tvX + 2, tvY, tvW - 4, 1, '#fffaf0');
    rect(ctx, tvX + 2, tvY + tvH - 1, tvW - 4, 1, '#5a5348');
    rect(ctx, tvX + tvW - 1, tvY + 2, 1, tvH - 4, '#5a5348');
    // bezel
    rect(ctx, sx - 3, sy - 3, sw + 6, sh + 6, '#5a5348');
    rect(ctx, sx - 2, sy - 2, sw + 4, sh + 4, '#050404');
    if (power < 1) {
      rect(ctx, sx, sy, sw, sh, '#0b0a0a');
      for (let i = 0; i < Math.min(sw, sh) * 0.5; i++) rect(ctx, sx + 4 + i, sy + 3 + Math.floor(i * 0.5), 2, 1, 'rgba(236,230,218,.07)');
    }
    // control panel
    const px = sx + sw + Math.max(4, Math.round(tvW * 0.045)), pw = tvX + tvW - px - Math.max(3, Math.round(tvW * 0.035));
    const kr = Math.max(3, Math.floor(pw * 0.3));
    const knob = (cx, cy, ang) => {
      for (let y = -kr; y <= kr; y++) for (let x = -kr; x <= kr; x++) if (x * x + y * y <= kr * kr) rect(ctx, cx + x, cy + y, 1, 1, x + y < -kr * 0.4 ? '#4a4243' : '#1b1718');
      rect(ctx, cx + Math.round(Math.cos(ang) * (kr - 1)), cy + Math.round(Math.sin(ang) * (kr - 1)), 1, 1, CREAM);
    };
    knob(px + Math.floor(pw / 2), sy + kr + 2, -1.2 + power * 2.4);
    knob(px + Math.floor(pw / 2), sy + kr * 3 + 6, 0.6);
    for (let y = sy + kr * 4 + 12; y < sy + sh - 6; y += 2) rect(ctx, px + 1, y, pw - 2, 1, SHADE);
    rect(ctx, px + Math.floor(pw / 2) - 1, sy + sh - 3, 3, 2, power > 0 ? HOT : '#5a5348');
    // badge: a tiny crimson plate
    rect(ctx, sx + Math.floor(sw / 2) - 7, tvY + tvH - Math.max(4, Math.round(tvH * 0.06)), 14, 2, HOT);
  }

  function paintNoise(alpha) {
    if (alpha <= 0.01) { noise.style.opacity = 0; return; }
    const w = noise.width, h = noise.height, img = ng.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255 | 0; img.data[i] = v; img.data[i + 1] = v * 0.96; img.data[i + 2] = v * 0.9; img.data[i + 3] = 255; }
    ng.putImageData(img, 0, 0);
    noise.style.opacity = alpha;
  }

  /* ---------- live boot text ---------- */
  const fmtN = (n) => n.toLocaleString('en-US');
  function bootLines() {
    const d = window.QROS ? QROS.data() : {};
    const h = d.head, m = d.market || { tokens: [] };
    const dots = '.'.repeat(1 + (Math.floor(performance.now() / 300) % 3));
    const top = m.tokens.slice().sort((a, b) => b.h24 - a.h24)[0];
    const pick = (a) => {
      const ev = d.evals && d.evals[a.id];
      if (!ev || !m.tokens.length) return 'calibrating' + dots;
      const t = m.tokens.slice().sort((x, y) => ev[y.addr].score - ev[x.addr].score)[0];
      return `→ ${t.sym.toUpperCase().slice(0, 10)} ${ev[t.addr].score >= 0 ? '+' : ''}${ev[t.addr].score.toFixed(2)}`;
    };
    return [
      'QUBIT/OS v2.2 · ROYALE BIOS',
      '(C) 2026 QUBIT ROYALE ARENA',
      '------------------------------------',
      'CPU   2-QUBIT STATEVECTOR CORE .. OK',
      'MEM   4 AGENT SLOTS ............. OK',
      'NET   ROBINHOOD CHAIN · ID 4663 . ' + (h ? 'OK' : '..'),
      '      BLOCK ' + (h ? '#' + fmtN(h.number) + ' · GAS ' + h.gasGwei.toFixed(4) : 'syncing' + dots),
      'FEED  DEXSCREENER ' + (m.tokens.length ? '· ' + m.tokens.length + ' MEME PAIRS . OK' : 'scanning' + dots),
      '      ' + (m.ethUsd ? 'ETH $' + fmtN(Math.round(m.ethUsd)) + (top ? ' · TOP ' + top.sym.toUpperCase().slice(0, 9) + ' ' + (top.h24 >= 0 ? '+' : '') + top.h24.toFixed(0) + '%' : '') : 'pricing' + dots),
      ...AGENTS.map((a) => `[ OK ] ${a.name.padEnd(7)}${pick(a)}`),
      'MODE  ' + (d.mode === 'live' ? 'LIVE WALLETS · ON-CHAIN' : 'PAPER ROUND · LIVE PRICES'),
      'ENTERING MAINNET'
    ];
  }

  function buildAgents() {
    agentsEl.innerHTML = '';
    for (const a of AGENTS) {
      const d = document.createElement('div'); d.className = 'tva';
      const c = Sprites.portrait(a.id, Math.max(3, Math.round(T.sh * P / 70)));
      const l = document.createElement('span'); l.textContent = a.name;
      const s = document.createElement('small'); s.textContent = 'ONLINE';
      d.append(c, l, s); agentsEl.appendChild(d);
    }
  }

  /* ---------- controller ---------- */
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => x * x * (3 - 2 * x);
  let lastLines = -1, lastText = '', poweredOnce = false, autoScroll = null, lastLand = 0;

  function progress() {
    const top = track.offsetTop, span = track.offsetHeight - innerHeight;
    return clamp((scrollY - top) / Math.max(1, span));
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (document.body.classList.contains('in-os')) return;
    const trackTop = track.getBoundingClientRect().top;
    const inTrack = trackTop < innerHeight && track.getBoundingClientRect().bottom > 0;
    // landscape buffers refresh at ~8 fps; everything else every frame
    if (t - lastLand > 120) {
      lastLand = t;
      Sprites.paintLand(sbg, skyLand, t, { trees: false, moonX: 0.82 });
      if (inTrack) Sprites.paintLand(bg, land, t, { moonX: 0.84 });
    }
    sg.drawImage(skyBuf, 0, 0);
    if (!inTrack) return;
    const p = progress();
    const power = ease(clamp((p - 0.04) / 0.08));
    g.drawImage(buf, 0, 0);
    paintTV(g, t, power);
    // fireflies in crimson and cream
    for (let i = 0; i < 16; i++) {
      const fx = (Math.sin(t / 2600 + i * 7.1) * 0.5 + 0.5) * vw, fy = T.ground - 6 - (Math.sin(t / 1800 + i * 3.3) * 0.5 + 0.5) * vh * 0.2;
      if ((Math.floor(t / 300) + i) % 4) rect(g, fx | 0, fy | 0, 1, 1, i % 3 ? CREAM : HOT);
    }

    inner.style.transform = power < 1 ? `scale(${Math.max(0.04, power)}, ${Math.max(0.006, power * power)})` : '';
    inner.style.filter = power < 1 ? `brightness(${1 + (1 - power) * 2})` : '';
    scr.classList.toggle('on', power > 0);
    if (power > 0 && !poweredOnce) { poweredOnce = true; Sound.blip('buy'); }
    if (power === 0) poweredOnce = false;
    paintNoise(p < 0.04 ? 0 : p < 0.14 ? 0.85 : Math.max(0.05, 0.85 - (p - 0.14) * 9) * (0.6 + Math.random() * 0.4));

    const lines = bootLines();
    const n = Math.ceil(clamp((p - 0.15) / 0.42) * lines.length);
    const out = lines.slice(0, n).join('\n') + (n ? (Math.floor(t / 400) % 2 ? '█' : ' ') : '');
    if (out !== lastText) { text.textContent = out; lastText = out; }
    if (n > lastLines && n > 0) Sound.blip();
    lastLines = n;
    const ap = clamp((p - 0.6) / 0.16);
    text.style.opacity = 1 - clamp(ap * 3);
    agentsEl.style.opacity = clamp(ap * 3 - 0.3);
    [...agentsEl.children].forEach((el, i) => el.classList.toggle('in', ap > 0.15 + i * 0.15));
    bar.style.opacity = clamp(ap * 3 - 0.3);
    bar.firstElementChild.style.width = (clamp((p - 0.66) / 0.14) * 100).toFixed(1) + '%';

    const zp = ease(clamp((p - 0.8) / 0.16));
    const S = Math.max(innerWidth / (T.sw * P), innerHeight / (T.sh * P)) * 1.12;
    stage.style.transform = zp > 0 ? `scale(${(1 + (S - 1) * zp * zp).toFixed(4)})` : '';
    stage.style.opacity = (1 - clamp((p - 0.955) / 0.045)).toFixed(3);
    flash.style.opacity = (clamp((p - 0.88) / 0.07) * (1 - clamp((p - 0.96) / 0.04))).toFixed(3);
    cue.style.opacity = p > 0.02 && p < 0.8 ? 1 : 0;
    cue.textContent = p < 0.15 ? 'KEEP SCROLLING · POWERING ON' : p < 0.6 ? 'READING LIVE MAINNET DATA' : 'CONNECTING TO MAINNET';
  }

  function powerOn() {
    Sound.unlock();
    if (document.body.classList.contains('in-os')) QROS.leave();
    const start = track.offsetTop - innerHeight * 0.2, end = track.offsetTop + track.offsetHeight - innerHeight * 0.3;
    scrollTo(0, Math.max(start, 0));
    const dur = reduce ? 600 : 8000, t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / dur);
      scrollTo(0, start + (end - start) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
      if (k < 1) autoScroll = requestAnimationFrame(step); else autoScroll = null;
    };
    autoScroll = requestAnimationFrame(step);
  }
  ['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, () => { if (autoScroll) { cancelAnimationFrame(autoScroll); autoScroll = null; } }, { passive: true }));

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-intro=power]')) powerOn();
    else if (e.target.closest('[data-intro=skip]')) QROS.enter();
    else if (e.target.closest('[data-intro=music]')) QROS.music();
  });

  function heroLive() {
    const d = QROS.data();
    if (!d.head) return;
    const txt = `BLOCK #${fmtN(d.head.number)}${d.market && d.market.ethUsd ? ' · ETH $' + fmtN(Math.round(d.market.ethUsd)) : ''}${d.market && d.market.tokens.length ? ' · ' + d.market.tokens.length + ' PAIRS' : ''}`;
    $('#heroLive').innerHTML = '<i></i>' + txt;
    document.querySelectorAll('[data-live]').forEach((el) => { el.textContent = '● LIVE · #' + fmtN(d.head.number); });
  }
  function heroParade() {
    const row = $('#heroAgents');
    if (!row) return;
    row.innerHTML = '';
    for (const a of AGENTS) {
      const d = document.createElement('div'); d.className = 'ha';
      const c = Sprites.portrait(a.id, 4);
      const n = document.createElement('b'); n.textContent = a.name;
      const s = document.createElement('small'); s.textContent = a.style;
      d.append(c, n, s); row.appendChild(d);
    }
  }

  layout(); buildAgents(); heroParade();
  addEventListener('resize', () => { if (!document.body.classList.contains('in-os')) { layout(); buildAgents(); } });
  setInterval(heroLive, 1000);
  if (location.hash === '#desk') QROS.enter();
  requestAnimationFrame(frame);
})();
