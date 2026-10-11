/* Scroll-driven intro: a pixel CRT TV in a night forest powers on, types live mainnet data,
   shows the agents, then the camera dives into the screen and the desk opens. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const { AGENTS } = Q;
  const track = $('#tvTrack'), stage = $('#tvStage'), cv = $('#tvScene'), g = cv.getContext('2d');
  const sky = $('#introSky'), sg = sky.getContext('2d');
  const scr = $('#tvScreen'), inner = $('#tvInner'), noise = $('#tvNoise'), ng = noise.getContext('2d');
  const text = $('#tvText'), agentsEl = $('#tvAgents'), bar = $('#tvBar'), flash = $('#tvFlash'), cue = $('#tvCue');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let P = 4, vw = 0, vh = 0, T = {}, stars = [], trees = [], hills = [];
  const rnd = (a, b) => a + Math.random() * (b - a);

  function layout() {
    P = Math.max(3, Math.round(Math.min(innerWidth, innerHeight) / 170));
    vw = Math.ceil(innerWidth / P); vh = Math.ceil(innerHeight / P);
    cv.width = vw; cv.height = vh;
    sky.width = vw; sky.height = vh;
    const portrait = vw < vh;
    const tvW = Math.floor(portrait ? vw * 0.86 : Math.min(vw * 0.58, vh * 0.6 * 1.32));
    const tvH = Math.floor(tvW / 1.32);
    const tvX = Math.floor((vw - tvW) / 2);
    const tvY = Math.floor(vh * (portrait ? 0.5 : 0.56) - tvH / 2);
    const sx = tvX + Math.round(tvW * 0.065), sy = tvY + Math.round(tvH * 0.1);
    const sw = Math.round(tvW * 0.67), sh = Math.round(tvH * 0.8);
    T = { tvW, tvH, tvX, tvY, sx, sy, sw, sh, ground: tvY + tvH + Math.max(3, Math.round(tvH * 0.07)) };
    Object.assign(scr.style, { left: sx * P + 'px', top: sy * P + 'px', width: sw * P + 'px', height: sh * P + 'px' });
    stage.style.transformOrigin = `${(sx + sw / 2) * P}px ${(sy + sh / 2) * P}px`;
    noise.width = Math.max(40, Math.round(sw / 1.5)); noise.height = Math.max(30, Math.round(sh / 1.5));
    const fs = Math.max(9, (sh * P) / 19);
    text.style.fontSize = fs + 'px';
    stars = Array.from({ length: Math.floor(vw * vh / 70) }, () => ({ x: rnd(0, vw) | 0, y: rnd(0, vh * 0.7) | 0, p: rnd(0, 6.3), s: rnd(0.4, 1.6), big: Math.random() < 0.04 }));
    hills = [0, 1].map((k) => { const pts = []; let y = T.ground - rnd(10, 30) * (k ? 0.6 : 1); for (let x = 0; x <= vw; x += 2) { y += rnd(-1.6, 1.6); y = Math.min(T.ground - 4, Math.max(T.ground - vh * (k ? 0.16 : 0.26), y)); pts.push(y | 0); } return pts; });
    trees = [];
    for (let x = -6; x < vw + 6; x += rnd(5, 11)) {
      const nearTv = x > T.tvX - 10 && x < T.tvX + T.tvW + 10;
      if (nearTv && Math.random() < 0.85) continue;
      const big = Math.abs(x - vw / 2) > T.tvW * 0.55;
      trees.push({ x: x | 0, h: (big ? rnd(vh * 0.16, vh * 0.34) : rnd(vh * 0.06, vh * 0.14)) | 0, lit: Math.random() < 0.18 });
    }
    trees.sort((a, b) => a.h - b.h);
  }

  /* ---------- painting ---------- */
  const BANDS = ['#05030b', '#090518', '#0e0824', '#160b34', '#220e45', '#331256', '#4a1460', '#6a1866', '#8e1d66'];
  function paintSky(ctx, t, w, h, horizon) {
    for (let i = 0; i < BANDS.length; i++) {
      const y0 = Math.floor(horizon * Math.pow(i / BANDS.length, 0.55)), y1 = Math.floor(horizon * Math.pow((i + 1) / BANDS.length, 0.55));
      ctx.fillStyle = BANDS[i]; ctx.fillRect(0, y0, w, y1 - y0 + 1);
      // dither seam
      ctx.fillStyle = BANDS[Math.min(i + 1, BANDS.length - 1)];
      for (let x = (i % 2); x < w; x += 2) ctx.fillRect(x, y1 - 1, 1, 1);
    }
    for (const s of stars) {
      if (s.y > horizon - 6) continue;
      const a = 0.25 + 0.75 * Math.abs(Math.sin(t / 1100 * s.s + s.p));
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.big && a > 0.8) { ctx.fillStyle = `rgba(255,255,255,${(a - 0.6).toFixed(2)})`; ctx.fillRect(s.x - 1, s.y, 3, 1); ctx.fillRect(s.x, s.y - 1, 1, 3); }
    }
    // moon
    const mx = Math.floor(w * 0.82), my = Math.floor(horizon * 0.22), r = Math.max(5, Math.floor(Math.min(w, h) * 0.05));
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const cut = (x + r * 0.45) ** 2 + (y - r * 0.2) ** 2 < r * r * 0.8;
      if (cut) continue;
      ctx.fillStyle = (x + y) % 5 === 0 ? '#ffe7b0' : '#fff4d6';
      ctx.fillRect(mx + x, my + y, 1, 1);
    }
  }

  function tree(ctx, x, base, h, lit) {
    const w = Math.max(5, Math.floor(h * 0.42));
    ctx.fillStyle = '#1a0d14'; ctx.fillRect(x - 1, base - Math.max(2, h * 0.12), 2, Math.max(2, h * 0.12));
    const tiers = 4;
    for (let k = 0; k < tiers; k++) {
      const ty = base - h * 0.12 - k * (h * 0.88 / tiers);
      const tw = w * (1 - k * 0.2);
      for (let y = 0; y < h * 0.36; y++) {
        const half = Math.floor(tw / 2 * (y / (h * 0.36)));
        ctx.fillStyle = '#071512'; ctx.fillRect(x - half, Math.floor(ty - h * 0.36 + y), half * 2 + 1, 1);
        ctx.fillStyle = '#0f2a24'; ctx.fillRect(x - half, Math.floor(ty - h * 0.36 + y), 1, 1);
      }
    }
    if (lit) { // crimson berries / lights
      ctx.fillStyle = '#ff3d7f';
      for (let k = 0; k < 4; k++) ctx.fillRect(x + ((k * 7) % w) - (w >> 1), Math.floor(base - h * (0.2 + k * 0.17)), 1, 1);
    }
  }

  function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function roundBox(ctx, x, y, w, h, c, r) {
    rect(ctx, x + r, y, w - 2 * r, h, c); rect(ctx, x, y + r, w, h - 2 * r, c);
    rect(ctx, x + 1, y + 1, w - 2, h - 2, c);
  }

  function paintTV(ctx, t, power) {
    const { tvW, tvH, tvX, tvY, sx, sy, sw, sh, ground } = T;
    // light spill on the ground
    if (power > 0) {
      for (let k = 0; k < 14; k++) {
        const rw = tvW * (0.5 + k * 0.08), a = 0.05 * power * (1 - k / 14);
        ctx.fillStyle = `rgba(57,255,136,${a.toFixed(3)})`;
        ctx.fillRect(Math.floor(tvX + tvW / 2 - rw / 2), ground + k, Math.floor(rw), 1);
      }
    }
    // legs
    const lh = ground - (tvY + tvH);
    rect(ctx, tvX + Math.floor(tvW * 0.12), tvY + tvH, Math.max(3, tvW * 0.05), lh, '#2a0717');
    rect(ctx, tvX + Math.floor(tvW * 0.83), tvY + tvH, Math.max(3, tvW * 0.05), lh, '#2a0717');
    // antenna
    const ax = tvX + Math.floor(tvW / 2), ay = tvY;
    rect(ctx, ax - 4, ay - 3, 9, 3, '#2a0717');
    const len = Math.floor(tvH * 0.5);
    for (let i = 0; i < len; i++) {
      rect(ctx, ax - Math.floor(i * 0.62), ay - 3 - i, 1, 1, '#c7b8e6');
      rect(ctx, ax + 1 + Math.floor(i * 0.42), ay - 3 - i, 1, 1, '#c7b8e6');
    }
    const blink = Math.floor(t / 500) % 2;
    rect(ctx, ax - Math.floor(len * 0.62) - 1, ay - 3 - len - 1, 3, 3, power > 0.5 && blink ? '#3de0ff' : '#5b4386');
    rect(ctx, ax + Math.floor(len * 0.42), ay - 3 - len - 1, 3, 3, power > 0.5 && !blink ? '#ff3d7f' : '#5b4386');
    // casing
    roundBox(ctx, tvX, tvY, tvW, tvH, '#a3124a', 3);
    rect(ctx, tvX + 3, tvY + 1, tvW - 6, 1, '#ff6a9b');
    rect(ctx, tvX + 1, tvY + 3, 1, tvH - 6, '#ff6a9b');
    rect(ctx, tvX + 3, tvY + tvH - 2, tvW - 6, 1, '#5e0a2b');
    rect(ctx, tvX + tvW - 2, tvY + 3, 1, tvH - 6, '#5e0a2b');
    // wood-grain trim along the bottom
    rect(ctx, tvX + 3, tvY + tvH - 6, tvW - 6, 3, '#6b2a1b');
    for (let x = tvX + 4; x < tvX + tvW - 4; x += 5) rect(ctx, x, tvY + tvH - 5, 2, 1, '#8a3c26');
    // bezel
    rect(ctx, sx - 3, sy - 3, sw + 6, sh + 6, '#1a0610');
    rect(ctx, sx - 2, sy - 2, sw + 4, sh + 4, '#07040d');
    rect(ctx, sx - 3, sy + sh + 2, sw + 6, 1, '#ff6a9b');
    // screen (glass) when off
    if (power < 1) {
      rect(ctx, sx, sy, sw, sh, '#0b0f14');
      for (let i = 0; i < Math.min(sw, sh) * 0.5; i++) rect(ctx, sx + 4 + i, sy + 3 + Math.floor(i * 0.5), 2, 1, 'rgba(255,255,255,.06)');
    }
    // control panel
    const px = sx + sw + Math.max(4, Math.round(tvW * 0.04)), pw = tvX + tvW - px - Math.max(3, Math.round(tvW * 0.03));
    const kr = Math.max(3, Math.floor(pw * 0.32));
    const knob = (cx, cy, ang) => {
      for (let y = -kr; y <= kr; y++) for (let x = -kr; x <= kr; x++) if (x * x + y * y <= kr * kr) rect(ctx, cx + x, cy + y, 1, 1, x + y < 0 ? '#ffd36b' : '#d48a00');
      rect(ctx, cx + Math.round(Math.cos(ang) * (kr - 1)), cy + Math.round(Math.sin(ang) * (kr - 1)), 1, 1, '#2a0717');
      rect(ctx, cx, cy, 1, 1, '#2a0717');
    };
    knob(px + Math.floor(pw / 2), sy + kr + 2, -1.2 + power * 2.4);
    knob(px + Math.floor(pw / 2), sy + kr * 3 + 6, 0.6);
    // speaker grill
    for (let y = sy + kr * 4 + 12; y < sy + sh - 6; y += 2) rect(ctx, px + 1, y, pw - 2, 1, '#5e0a2b');
    // power LED
    rect(ctx, px + Math.floor(pw / 2) - 1, sy + sh - 3, 3, 2, power > 0 ? '#39ff88' : '#2a0717');
    // badge
    rect(ctx, sx + Math.floor(sw / 2) - 6, tvY + tvH - 9, 12, 2, '#ffd36b');
  }

  function paintScene(t, power) {
    const { ground } = T;
    g.clearRect(0, 0, vw, vh);
    paintSky(g, t, vw, vh, ground);
    // hills
    hills.forEach((pts, k) => { g.fillStyle = k ? '#12091f' : '#1b0c33'; pts.forEach((y, i) => g.fillRect(i * 2, y, 2, ground - y)); });
    // back trees
    for (const tr of trees) if (tr.h < vh * 0.15) tree(g, tr.x, ground, tr.h, tr.lit);
    // ground with synthwave grid
    rect(g, 0, ground, vw, vh - ground, '#0a0612');
    g.fillStyle = 'rgba(255,61,127,.35)';
    const off = (t / 70) % 6;
    for (let y = ground + 1; y < vh; y += Math.max(1, Math.floor((y - ground) / 3) + 1)) g.fillRect(0, Math.floor(y + off * ((y - ground) / (vh - ground + 1))), vw, 1);
    for (let x = -vw; x < vw * 2; x += 10) {
      const x0 = vw / 2 + (x - vw / 2) * 0.12;
      for (let y = ground; y < vh; y += 1) { const k = (y - ground) / (vh - ground); g.fillRect(Math.floor(x0 + (x - x0) * k), y, 1, 1); }
    }
    paintTV(g, t, power);
    // front trees
    for (const tr of trees) if (tr.h >= vh * 0.15) tree(g, tr.x, ground + 2, tr.h, tr.lit);
    // fireflies
    for (let i = 0; i < 18; i++) {
      const fx = (Math.sin(t / 2400 + i * 7.1) * 0.5 + 0.5) * vw, fy = ground - 6 - (Math.sin(t / 1700 + i * 3.3) * 0.5 + 0.5) * vh * 0.18;
      if ((Math.floor(t / 300) + i) % 4) { g.fillStyle = i % 3 ? '#ffd36b' : '#39ff88'; g.fillRect(fx | 0, fy | 0, 1, 1); }
    }
  }

  function paintNoise(alpha) {
    if (alpha <= 0.01) { noise.style.opacity = 0; return; }
    const w = noise.width, h = noise.height;
    const img = ng.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255 | 0; img.data[i] = v * 0.8; img.data[i + 1] = v; img.data[i + 2] = v * 0.9; img.data[i + 3] = 255; }
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
      'QUBIT/OS v2.1 · ROYALE BIOS',
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

  /* ---------- agents card ---------- */
  function buildAgents() {
    agentsEl.innerHTML = '';
    for (const a of AGENTS) {
      const d = document.createElement('div');
      d.className = 'tva';
      d.style.setProperty('--c', a.glow);
      const c = Sprites.portrait(a.id, Math.max(3, Math.round(T.sh * P / 70)));
      const l = document.createElement('span'); l.textContent = a.name;
      const s = document.createElement('small'); s.textContent = 'ONLINE';
      d.append(c, l, s);
      agentsEl.appendChild(d);
    }
  }

  /* ---------- controller ---------- */
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => x * x * (3 - 2 * x);
  let lastLines = -1, lastText = '', poweredOnce = false, entering = false, autoScroll = null;

  function progress() {
    const top = track.offsetTop, span = track.offsetHeight - innerHeight;
    return clamp((scrollY - top) / Math.max(1, span));
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (document.body.classList.contains('in-os')) return;
    const p = progress();
    const power = ease(clamp((p - 0.04) / 0.08));
    // sky for the hero (fixed layer)
    sg.clearRect(0, 0, vw, vh);
    paintSky(sg, t, vw, vh, Math.floor(vh * 0.98));
    paintScene(t, power);

    // power-on: CRT line opens vertically
    inner.style.transform = `scale(${power < 1 ? Math.max(0.04, power) : 1}, ${power < 1 ? Math.max(0.006, power * power) : 1})`;
    inner.style.filter = `brightness(${1 + (1 - power) * 2})`;
    scr.classList.toggle('on', power > 0);
    if (power > 0 && !poweredOnce) { poweredOnce = true; Sound.blip('buy'); }
    if (power === 0) poweredOnce = false;
    paintNoise(p < 0.04 ? 0 : p < 0.14 ? 0.9 : Math.max(0.06, 0.9 - (p - 0.14) * 9) * (0.6 + Math.random() * 0.4));

    // typing live boot text
    const lines = bootLines();
    const tp = clamp((p - 0.15) / 0.42);
    const n = Math.ceil(tp * lines.length);
    const shown = lines.slice(0, n);
    const out = shown.join('\n') + (n ? (Math.floor(t / 400) % 2 ? '█' : ' ') : '');
    if (out !== lastText) { text.textContent = out; lastText = out; }
    if (n > lastLines && n > 0) Sound.blip();
    lastLines = n;
    const ap = clamp((p - 0.6) / 0.16);
    text.style.opacity = 1 - clamp(ap * 3);
    agentsEl.style.opacity = clamp(ap * 3 - 0.3);
    [...agentsEl.children].forEach((el, i) => el.classList.toggle('in', ap > 0.15 + i * 0.15));
    bar.style.opacity = clamp(ap * 3 - 0.3);
    bar.firstElementChild.style.width = (clamp((p - 0.66) / 0.14) * 100).toFixed(1) + '%';

    // dive into the screen
    const zp = ease(clamp((p - 0.8) / 0.17));
    const S = Math.max(innerWidth / (T.sw * P), innerHeight / (T.sh * P)) * 1.12;
    stage.style.transform = zp > 0 ? `scale(${(1 + (S - 1) * zp * zp).toFixed(4)})` : '';
    flash.style.opacity = clamp((zp - 0.82) / 0.18);
    cue.style.opacity = p > 0.02 && p < 0.8 ? 1 : 0;
    cue.textContent = p < 0.15 ? 'KEEP SCROLLING · POWERING ON' : p < 0.6 ? 'READING LIVE MAINNET DATA' : 'ENTERING MAINNET';

    if (p >= 0.995 && !entering) {
      entering = true;
      if (autoScroll) { cancelAnimationFrame(autoScroll); autoScroll = null; }
      QROS.enter();
      document.body.classList.add('os-powerup');
      setTimeout(() => document.body.classList.remove('os-powerup'), 900);
    }
    if (p < 0.9) entering = false;
  }

  function powerOn() {
    Sound.unlock();
    const start = scrollY, end = track.offsetTop + track.offsetHeight - innerHeight + 2;
    const dur = reduce ? 600 : 7000, t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / dur);
      scrollTo(0, start + (end - start) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
      if (k < 1 && !document.body.classList.contains('in-os')) autoScroll = requestAnimationFrame(step);
    };
    autoScroll = requestAnimationFrame(step);
  }
  ['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, () => { if (autoScroll) { cancelAnimationFrame(autoScroll); autoScroll = null; } }, { passive: true }));

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-intro=power]')) powerOn();
    else if (e.target.closest('[data-intro=skip]')) { QROS.enter(); }
    else if (e.target.closest('[data-intro=music]')) QROS.music();
  });

  function heroLive() {
    const d = QROS.data();
    const el = $('#heroLive');
    if (el && d.head) el.innerHTML = `<i></i>LIVE · BLOCK #${fmtN(d.head.number)}${d.market && d.market.ethUsd ? ' · ETH $' + fmtN(Math.round(d.market.ethUsd)) : ''}${d.market && d.market.tokens.length ? ' · ' + d.market.tokens.length + ' MEME PAIRS' : ''}`;
  }

  function heroParade() {
    const row = $('#heroAgents');
    row.innerHTML = '';
    for (const a of AGENTS) {
      const d = document.createElement('div'); d.className = 'ha'; d.style.setProperty('--c', a.glow);
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
