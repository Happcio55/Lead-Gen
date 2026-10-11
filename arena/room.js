/* The front: a pixel living room at night. A 70s wood-veneer TV shows QUBIT-TV teletext on
   channel 4663. Scrolling (or the remote) flips pages; the last page tunes in and the camera
   dives into the screen, which opens the desk. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const track = $('#tvTrack'), stage = $('#tvStage'), cv = $('#roomCv'), g = cv.getContext('2d');
  const scr = $('#tvScreen'), wrap = $('#ttWrap'), ttEl = $('#tt'), mosaic = $('#ttMosaic');
  const noise = $('#tvNoise'), ng = noise.getContext('2d'), flash = $('#tvFlash'), cue = $('#tvCue'), vcr = $('#vcr');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bayer = Sprites.bayer;
  const K = {
    wall: '#1a1428', wall2: '#211a33', wallD: '#110d1b', trim: '#2c2340', floor: '#2a1a10', floor2: '#22150c', seam: '#140c07',
    rug1: '#6e1f2e', rug2: '#9c3a3a', rug3: '#d9a441', wood: '#7a4422', wood2: '#5e331a', wood3: '#9a5a2c', woodD: '#3b1f0f',
    chrome: '#dcdce2', chrome2: '#9a9aa6', chrome3: '#5c5c68', fab: '#2e231c', fab2: '#46362a', vcr: '#16151a', vcr2: '#2a2930',
    lamp: '#f2c26b', glow: '#ffcf7a', leaf: '#2f7a3a', leaf2: '#58b065', pot: '#b5562e', sky1: '#0b1236', sky2: '#1c2a6b', city: '#0a0d1f', lit: '#ffd36b',
    curt: '#5a1d36', curt2: '#7a2a4a', black: '#050407'
  };

  let P = 4, vw = 0, vh = 0, L = {};
  const stat = document.createElement('canvas'), sg = stat.getContext('2d');
  const glowBuf = document.createElement('canvas'), gg = glowBuf.getContext('2d');
  const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const disc = (c, cx, cy, r, colFn) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) { c.fillStyle = colFn(x, y); c.fillRect(cx + x, cy + y, 1, 1); } };

  /* ---------- layout ---------- */
  function layout() {
    P = Math.max(3, Math.round(Math.min(innerWidth, innerHeight) / 190));
    vw = Math.ceil(innerWidth / P); vh = Math.ceil(innerHeight / P);
    for (const c of [cv, stat, glowBuf]) { c.width = vw; c.height = vh; }
    const portrait = vw < vh * 1.05;
    const floorY = Math.round(vh * (portrait ? 0.74 : 0.8));
    const cabH = Math.round(vh * (portrait ? 0.12 : 0.15));
    let tvW = Math.round(portrait ? vw * 0.9 : Math.min(vw * 0.5, (floorY - cabH - vh * 0.16) * 1.38));
    const tvH = Math.round(tvW / 1.38);
    const tcx = Math.round(portrait ? vw / 2 : vw * 0.47);
    const tvX = tcx - Math.round(tvW / 2), tvY = floorY - cabH - tvH;
    const cabW = Math.min(vw - 4, Math.round(tvW * (portrait ? 1.04 : 1.32))), cabX = tcx - Math.round(cabW / 2), cabY = floorY - cabH;
    const sx = tvX + Math.round(tvW * 0.06), sy = tvY + Math.round(tvH * 0.1), sw = Math.round(tvW * 0.68), sh = Math.round(tvH * 0.78);
    const px = sx + sw + Math.round(tvW * 0.04), pw = tvX + tvW - Math.round(tvW * 0.045) - px;
    L = { portrait, floorY, cabH, tvW, tvH, tcx, tvX, tvY, cabW, cabX, cabY, sx, sy, sw, sh, px, pw };
    L.win = portrait ? null : { x: Math.round(vw * 0.05), y: Math.round(vh * 0.15), w: Math.round(Math.min(tvX - vw * 0.1, vw * 0.2)), h: Math.round(vh * 0.42) };
    if (L.win && L.win.w < 28) L.win = null;
    L.lamp = portrait ? null : { x: cabX + cabW + Math.round(vw * 0.05) };
    if (L.lamp && L.lamp.x > vw * 0.86) L.lamp = null;
    Object.assign(scr.style, { left: sx * P + 'px', top: sy * P + 'px', width: sw * P + 'px', height: sh * P + 'px' });
    stage.style.transformOrigin = `${(sx + sw / 2) * P}px ${(sy + sh / 2) * P}px`;
    noise.width = Math.max(40, Math.round(sw / 1.5)); noise.height = Math.max(30, Math.round(sh / 1.5));
    // VCR display window, in the open shelf of the cabinet
    const shelf = { x: cabX + Math.round(cabW * 0.07), y: cabY + Math.round(cabH * 0.22), w: Math.round(cabW * 0.46), h: Math.round(cabH * 0.6) };
    L.shelf = shelf;
    L.vcrBox = { x: shelf.x + 2, y: shelf.y + Math.round(shelf.h * 0.38), w: shelf.w - 4, h: Math.round(shelf.h * 0.62) - 1 };
    L.vcrDisp = { x: L.vcrBox.x + Math.round(L.vcrBox.w * 0.58), y: L.vcrBox.y + Math.round(L.vcrBox.h * 0.25), w: Math.round(L.vcrBox.w * 0.32), h: Math.max(3, Math.round(L.vcrBox.h * 0.42)) };
    Object.assign(vcr.style, { left: L.vcrDisp.x * P + 'px', top: L.vcrDisp.y * P + 'px', width: L.vcrDisp.w * P + 'px', height: L.vcrDisp.h * P + 'px', fontSize: Math.max(8, L.vcrDisp.h * P * 0.95) + 'px' });
    paintStatic();
    sizeTT();
    lastTint = null;
  }

  /* ---------- static room ---------- */
  function paintStatic() {
    const c = sg, { floorY } = L;
    // wall with damask-ish dithered stripes
    rect(c, 0, 0, vw, floorY, K.wall);
    for (let x = 0; x < vw; x++) if (x % 10 < 2) rect(c, x, 0, 1, floorY, K.wall2);
    for (let y = 0; y < floorY; y += 1) for (let x = 0; x < vw; x++) if (((x + y * 2) % 20 === 0) && (y % 10 === 5)) rect(c, x, y, 1, 1, K.trim);
    // vignette on the wall
    for (let y = 0; y < floorY; y++) for (let x = 0; x < vw; x++) {
      const dx = (x - vw / 2) / (vw / 2), dy = (y - floorY * 0.5) / floorY;
      if ((dx * dx + dy * dy) * 0.55 - 0.15 > bayer(x, y)) rect(c, x, y, 1, 1, K.wallD);
    }
    // skirting board
    rect(c, 0, floorY - 4, vw, 4, K.trim); rect(c, 0, floorY - 4, vw, 1, '#3a2f52');
    // floor boards
    rect(c, 0, floorY, vw, vh - floorY, K.floor);
    for (let y = floorY + 2; y < vh; y += 5) {
      rect(c, 0, y, vw, 1, K.seam);
      for (let x = ((y * 7) % 23); x < vw; x += 23 + (y % 11)) rect(c, x, y - 4, 1, 4, K.seam);
    }
    for (let y = floorY; y < vh; y++) for (let x = 0; x < vw; x++) if (((y - floorY) / (vh - floorY)) * 0.6 > bayer(x, y) + 0.25) rect(c, x, y, 1, 1, K.floor2);
    // rug
    const rw = Math.round(L.cabW * 1.25), rx = L.tcx - Math.round(rw / 2), ry = floorY + Math.round((vh - floorY) * 0.25), rh = Math.round((vh - floorY) * 0.6);
    rect(c, rx, ry, rw, rh, K.rug1);
    rect(c, rx + 2, ry + 2, rw - 4, rh - 4, K.rug2);
    for (let x = rx + 4; x < rx + rw - 4; x += 6) rect(c, x, ry + 3, 3, rh - 6, K.rug1);
    rect(c, rx + 2, ry + 2, rw - 4, 1, K.rug3); rect(c, rx + 2, ry + rh - 3, rw - 4, 1, K.rug3);
    for (let x = rx; x < rx + rw; x += 2) { rect(c, x, ry - 1, 1, 1, K.rug3); rect(c, x, ry + rh, 1, 1, K.rug3); }
    if (L.win) paintWindowFrame(c);
    if (L.lamp) paintLamp(c);
    paintCabinet(c);
    paintTVBody(c);
  }

  function paintWindowFrame(c) {
    const { x, y, w, h } = L.win;
    rect(c, x - 3, y - 3, w + 6, h + 6, '#2b2236');
    rect(c, x - 2, y - 2, w + 4, h + 4, '#3d3150');
    // curtains
    const cw = Math.round(w * 0.22);
    for (const side of [0, 1]) {
      const cx = side ? x + w - cw + 4 : x - 6;
      for (let yy = y - 6; yy < y + h + 10; yy++) for (let xx = 0; xx < cw + 2; xx++) {
        const fold = Math.sin((xx / (cw + 2)) * Math.PI * 3);
        rect(c, cx + xx, yy, 1, 1, fold > 0.3 ? K.curt2 : fold > -0.4 || bayer(cx + xx, yy) > 0.5 ? K.curt : '#3d1426');
      }
    }
    rect(c, x - 8, y - 8, w + 16, 3, '#8a7a5a'); // curtain rod
  }
  function paintWindowSky(c, t) {
    const { x, y, w, h } = L.win;
    const cw = Math.round(w * 0.22);
    const gx = x + cw - 2, gw = w - cw * 2 + 4;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < gw; xx++) c.fillStyle = yy / h * 0.9 > bayer(xx, yy) ? K.sky2 : K.sky1, c.fillRect(gx + xx, y + yy, 1, 1);
    // moon and skyline
    disc(c, gx + Math.round(gw * 0.7), y + Math.round(h * 0.2), Math.max(2, Math.round(gw * 0.09)), () => '#f4ead0');
    let bx = gx;
    let k = 1;
    while (bx < gx + gw) {
      const bw = 3 + ((k * 7) % 6), bh = Math.round(h * (0.2 + ((k * 13) % 10) / 22));
      rect(c, bx, y + h - bh, Math.min(bw, gx + gw - bx), bh, K.city);
      for (let wy = y + h - bh + 2; wy < y + h - 1; wy += 3) for (let wx = bx + 1; wx < Math.min(bx + bw - 1, gx + gw); wx += 2) if ((wx * 31 + wy * 17 + k) % 5 === 0) rect(c, wx, wy, 1, 1, K.lit);
      bx += bw + 1; k++;
    }
    // rain
    c.fillStyle = 'rgba(160,180,255,.55)';
    for (let i = 0; i < Math.round(gw * 0.6); i++) {
      const rx = gx + ((i * 37 + Math.floor(t / 40) * 3) % gw), ry = y + ((i * 53 + Math.floor(t / 22) * 4) % h);
      c.fillRect(rx, ry, 1, 2);
    }
    // window cross
    rect(c, gx + Math.round(gw / 2), y, 1, h, '#3d3150'); rect(c, gx, y + Math.round(h / 2), gw, 1, '#3d3150');
  }
  function paintLamp(c) {
    const lx = L.lamp.x, fy = L.floorY, top = Math.round(vh * 0.28);
    for (let y = 0; y < fy; y++) for (let x = Math.max(0, lx - 60); x < Math.min(vw, lx + 60); x++) {
      const d = Math.hypot((x - lx) / 1.3, y - top);
      if ((1 - d / 55) * 0.55 > bayer(x, y)) rect(c, x, y, 1, 1, '#3a2a2e');
    }
    rect(c, lx - 1, top, 2, fy - top, '#3a3542');
    rect(c, lx - 5, fy - 2, 10, 2, '#3a3542');
    const sw = 14, sh = 10;
    for (let y = 0; y < sh; y++) rect(c, lx - Math.round(sw / 2 - y * 0.3) - 3, top - sh + y, Math.round(sw - y * 0.6) + 6 - Math.round((sh - y) * 0.6), 1, y < 2 ? '#ffe2a0' : K.lamp);
    rect(c, lx - 6, top, 12, 1, K.glow);
  }
  function paintCabinet(c) {
    const { cabX, cabY, cabW, cabH } = L;
    rect(c, cabX, cabY, cabW, cabH - 3, K.wood);
    rect(c, cabX, cabY, cabW, 2, K.wood3);
    for (let y = cabY + 3; y < cabY + cabH - 3; y += 3) for (let x = cabX; x < cabX + cabW; x++) if (Math.sin(x * 0.18 + y) > 0.85) rect(c, x, y, 1, 1, K.wood2);
    rect(c, cabX + 3, cabY + cabH - 3, 3, 3, K.woodD); rect(c, cabX + cabW - 6, cabY + cabH - 3, 3, 3, K.woodD);
    // open shelf with VCR
    const s = L.shelf;
    rect(c, s.x, s.y, s.w, s.h, '#140b06');
    const v = L.vcrBox;
    rect(c, v.x, v.y, v.w, v.h, K.vcr); rect(c, v.x, v.y, v.w, 1, K.vcr2);
    rect(c, v.x + 3, v.y + Math.round(v.h * 0.35), Math.round(v.w * 0.42), 2, '#050407'); // tape slot
    for (let i = 0; i < 4; i++) rect(c, v.x + 3 + i * 4, v.y + v.h - 3, 2, 1, K.chrome3);
    rect(c, L.vcrDisp.x - 1, L.vcrDisp.y - 1, L.vcrDisp.w + 2, L.vcrDisp.h + 2, '#06120a');
    // tapes on the right shelf
    const t = { x: s.x + s.w + Math.round(cabW * 0.06), y: s.y, w: cabX + cabW - (s.x + s.w + Math.round(cabW * 0.06)) - Math.round(cabW * 0.06), h: s.h };
    rect(c, t.x, t.y, t.w, t.h, '#140b06');
    const cols = ['#ff3b3b', '#3bff6e', '#ffe23b', '#3b55ff', '#ff3bdc', '#3beeff', '#f4f4f4'];
    for (let i = 0, x = t.x + 2; x < t.x + t.w - 3; i++, x += 4) { rect(c, x, t.y + 3 + (i % 2), 3, t.h - 4 - (i % 2), '#1b1b1f'); rect(c, x, t.y + Math.round(t.h * 0.4), 3, 2, cols[i % cols.length]); }
    // plant on the cabinet, right of the TV
    const pxp = Math.min(cabX + cabW - 8, L.tvX + L.tvW + Math.round((cabX + cabW - L.tvX - L.tvW) / 2));
    if (cabX + cabW - (L.tvX + L.tvW) > 10) {
      rect(c, pxp - 4, cabY - 7, 8, 7, K.pot); rect(c, pxp - 5, cabY - 8, 10, 2, '#cf6b3c');
      const leaves = [[-6, -16], [-3, -22], [1, -25], [5, -19], [8, -13], [-9, -11]];
      for (const [lx, ly] of leaves) for (let i = 0; i < 9; i++) { const k = i / 8; rect(c, pxp + Math.round(lx * k), cabY - 8 + Math.round(ly * k), 2, 1, i > 5 ? K.leaf2 : K.leaf); }
    }
  }
  function paintTVBody(c) {
    const { tvX, tvY, tvW, tvH, sx, sy, sw, sh, px, pw } = L;
    // wood veneer cabinet with grain
    rect(c, tvX + 2, tvY, tvW - 4, tvH, K.wood); rect(c, tvX, tvY + 2, tvW, tvH - 4, K.wood); rect(c, tvX + 1, tvY + 1, tvW - 2, tvH - 2, K.wood);
    for (let y = tvY + 2; y < tvY + tvH - 2; y++) for (let x = tvX + 1; x < tvX + tvW - 1; x++) {
      const gr = Math.sin(x * 0.07 + Math.sin(y * 0.3) * 1.8 + y * 0.9);
      if (gr > 0.92) rect(c, x, y, 1, 1, K.wood2); else if (gr < -0.97) rect(c, x, y, 1, 1, K.wood3);
    }
    rect(c, tvX + 2, tvY, tvW - 4, 1, K.wood3); rect(c, tvX + 2, tvY + tvH - 1, tvW - 4, 1, K.woodD); rect(c, tvX + tvW - 1, tvY + 2, 1, tvH - 4, K.woodD);
    // chrome bezel around the tube
    for (let i = 0; i < 4; i++) {
      const col = [K.chrome3, K.chrome, K.chrome2, '#1d1d22'][i];
      rect(c, sx - 4 + i, sy - 4 + i, sw + 8 - i * 2, sh + 8 - i * 2, col);
    }
    rect(c, sx - 4, sy - 4, sw + 8, 1, '#ffffff');
    rect(c, sx, sy, sw, sh, '#0b0c10');
    // control panel
    rect(c, px - 1, sy - 4, pw + 2, sh + 8, '#2a1a10');
    rect(c, px - 1, sy - 4, pw + 2, 1, '#4a3020');
    const dr = Math.max(4, Math.round(pw * 0.36));
    L.dial = { x: px + Math.round(pw / 2), y: sy + dr + 2, r: dr };
    disc(c, L.dial.x, L.dial.y, dr, (x, y) => (x + y < -dr * 0.6 ? '#ffffff' : x + y < 0 ? K.chrome : K.chrome2));
    disc(c, L.dial.x, L.dial.y, dr - 2, () => '#1a1a1f');
    for (let i = 0; i < 6; i++) { const a = -2.4 + i * 0.95; rect(c, L.dial.x + Math.round(Math.cos(a) * (dr - 1)), L.dial.y + Math.round(Math.sin(a) * (dr - 1)), 1, 1, '#ffe23b'); }
    const kr = Math.max(2, Math.round(dr * 0.45)), ky = L.dial.y + dr + kr + 4;
    for (const kx of [px + Math.round(pw * 0.28), px + Math.round(pw * 0.72)]) disc(c, kx, ky, kr, (x, y) => (x + y < 0 ? K.chrome : K.chrome3));
    // speaker fabric
    const fy = ky + kr + 4;
    for (let y = fy; y < sy + sh; y++) for (let x = px + 1; x < px + pw - 1; x++) rect(c, x, y, 1, 1, (x + y) % 2 ? K.fab : K.fab2);
    L.led = { x: px + Math.round(pw / 2) - 1, y: sy + sh + 1 };
    // chrome brand plate with tiny letters
    const plate = { w: 21, h: 5 }, bx = sx + Math.round(sw / 2) - 10, by = sy + sh + Math.max(3, Math.round((tvY + tvH - sy - sh) / 2) - 2);
    rect(c, bx - 1, by - 1, plate.w + 2, plate.h + 2, K.chrome3); rect(c, bx, by, plate.w, plate.h, K.chrome);
    const MINI = { Q: ['111', '101', '101', '111', '001'], U: ['101', '101', '101', '101', '111'], B: ['110', '101', '110', '101', '110'], I: ['111', '010', '010', '010', '111'], T: ['111', '010', '010', '010', '010'] };
    'QUBIT'.split('').forEach((ch, i) => MINI[ch].forEach((r, yy) => [...r].forEach((b, xx) => { if (b === '1') rect(c, bx + 1 + i * 4 + xx, by + yy, 1, 1, '#23232a'); })));
    // antenna
    const ax = L.tcx, ay = tvY, len = Math.round(tvH * 0.42);
    disc(c, ax, ay - 1, 4, (x, y) => (y < -1 ? K.chrome : K.chrome2));
    for (let i = 0; i < len; i++) { rect(c, ax - 2 - Math.floor(i * 0.7), ay - 4 - i, 1, 1, K.chrome); rect(c, ax + 2 + Math.floor(i * 0.5), ay - 4 - i, 1, 1, K.chrome2); }
    L.tips = [[ax - 2 - Math.floor(len * 0.7), ay - 4 - len], [ax + 2 + Math.floor(len * 0.5), ay - 4 - len]];
    // feet
    rect(c, tvX + 6, tvY + tvH, 4, 1, K.woodD); rect(c, tvX + tvW - 10, tvY + tvH, 4, 1, K.woodD);
  }

  /* ---------- screen light thrown into the room ---------- */
  let lastTint = null;
  function paintGlow(col) {
    gg.clearRect(0, 0, vw, vh);
    gg.fillStyle = col;
    const cx = L.sx + L.sw / 2, cy = L.sy + L.sh / 2, R = L.tvW * 0.95;
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
      if (x >= L.tvX - 1 && x <= L.tvX + L.tvW && y >= L.tvY - 1 && y <= L.tvY + L.tvH) continue;
      const d = Math.hypot(x - cx, (y - cy) * (y > L.floorY ? 2.2 : 1.1)) / R;
      if ((1 - d) * 0.42 > bayer(x, y)) gg.fillRect(x, y, 1, 1);
    }
  }

  /* ---------- teletext sizing ---------- */
  let natW = 0, natH = 0;
  function sizeTT() {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;font:20px "VT323",monospace;white-space:pre';
    probe.textContent = 'M'.repeat(40);
    document.body.appendChild(probe);
    natW = probe.getBoundingClientRect().width || 400; probe.remove();
    natH = 24 * 20;
    Object.assign(wrap.style, { width: natW + 'px', height: natH + 'px' });
    Object.assign(mosaic.style, { width: natW + 'px', height: natH + 'px' });
    const W = L.sw * P, H = L.sh * P;
    wrap.style.transform = `translate(${W * 0.05}px, ${H * 0.045}px) scale(${(W * 0.9) / natW}, ${(H * 0.91) / natH})`;
  }

  /* ---------- state + controller ---------- */
  const PAGES = TT.PAGES, SEG = 0.16;
  let revealT = 0;
  let power = 0, powerTarget = 0, page = 100, shownPage = null, tick = 0, lastRender = 0, entering = false, autoScroll = null, lastFlip = 0, prog199 = 0;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => x * x * (3 - 2 * x);
  const progress = () => clamp((scrollY - track.offsetTop) / Math.max(1, track.offsetHeight - innerHeight));
  const pageAt = (p) => (p < SEG * 5 ? PAGES[Math.min(4, Math.floor(p / SEG))] : 199);
  const posOf = (pg) => (pg === 199 ? 0.85 : PAGES.indexOf(pg) * SEG + SEG * 0.45);

  function render(force) {
    const d = window.QROS ? QROS.data() : {};
    if (!d.market) d.market = { tokens: [] };
    const flip = shownPage !== page;
    if (!flip && !force) return;
    TT.renderPage(ttEl, mosaic, page, d, tick, prog199);
    if (flip) {
      ttEl.classList.remove('reveal'); void ttEl.offsetWidth; ttEl.classList.add('reveal');
      clearTimeout(revealT); revealT = setTimeout(() => ttEl.classList.remove('reveal'), 650); // live refreshes must not replay the reveal
      shownPage = page; lastFlip = performance.now();
      Sound.blip();
      $$('[data-go]').forEach((b) => b.classList.toggle('on', +b.dataset.go === page));
    }
  }

  function paintNoise(a) {
    if (a <= 0.01) { noise.style.opacity = 0; return; }
    const w = noise.width, h = noise.height, img = ng.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255 | 0; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255; }
    ng.putImageData(img, 0, 0); noise.style.opacity = a;
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (document.body.classList.contains('in-os') || !L.dial) return;
    const r = track.getBoundingClientRect();
    if (r.bottom < 0) return;
    const p = progress();
    page = pageAt(p);
    prog199 = clamp((p - SEG * 5) / 0.08);
    power += (powerTarget - power) * 0.12; if (Math.abs(powerTarget - power) < 0.01) power = powerTarget;

    g.drawImage(stat, 0, 0);
    if (L.win) paintWindowSky(g, t);
    const tint = TT.TINT[page];
    if (tint !== lastTint) { paintGlow(tint); lastTint = tint; }
    if (power > 0.5) { g.globalAlpha = 0.13 * power * (0.85 + Math.sin(t / 90) * 0.05 + Math.random() * 0.06); g.drawImage(glowBuf, 0, 0); g.globalAlpha = 1; }
    // channel dial pointer and LEDs
    const di = L.dial, a = -2.4 + Math.max(0, PAGES.indexOf(page)) * 0.95;
    for (let i = 1; i < di.r - 2; i++) rect(g, di.x + Math.round(Math.cos(a) * i), di.y + Math.round(Math.sin(a) * i), 1, 1, '#ff3b3b');
    rect(g, L.led.x, L.led.y, 3, 1, power > 0.5 ? '#3bff6e' : '#ff3b3b');
    const blink = Math.floor(t / 600) % 2;
    L.tips.forEach(([x, y], i) => disc(g, x, y, 1, () => (power > 0.5 && blink === i ? '#ff3b3b' : K.chrome)));

    scr.classList.toggle('on', power > 0.05);
    const pw = ease(clamp(power));
    wrap.parentElement.style.setProperty('--pw', pw.toFixed(3));
    paintNoise(power > 0.05 && power < 0.98 ? 0.7 : performance.now() - lastFlip < 140 ? 0.45 : 0);

    if (power > 0.9) {
      if (t - lastRender > 1000) { lastRender = t; tick++; render(true); } else render(false);
    }
    // dive into the tube
    const zp = ease(clamp((p - 0.9) / 0.09));
    const S = Math.max(innerWidth / (L.sw * P), innerHeight / (L.sh * P)) * 1.1;
    stage.style.transform = zp > 0 ? `scale(${(1 + (S - 1) * zp * zp).toFixed(4)})` : '';
    flash.style.opacity = clamp((p - 0.95) / 0.045).toFixed(3);
    cue.style.opacity = p < 0.86 ? 1 : 0;
    cue.textContent = p < 0.02 ? 'SCROLL TO CHANGE THE CHANNEL ▼' : page === 199 ? 'TUNING IN · KEEP SCROLLING' : `P${page} · SCROLL FOR THE NEXT PAGE`;
    vcr.textContent = (() => { const h = window.QROS && QROS.data().head; return h ? String(h.number % 100000).padStart(5, '0') : (blink ? '--:--' : '  :  '); })();

    if (p >= 0.995 && !entering) {
      entering = true;
      if (autoScroll) { cancelAnimationFrame(autoScroll); autoScroll = null; }
      QROS.enter();
      document.body.classList.add('os-powerup');
      setTimeout(() => document.body.classList.remove('os-powerup'), 900);
    }
    if (p < 0.9) entering = false;
  }

  function scrollToP(target, dur) {
    if (autoScroll) cancelAnimationFrame(autoScroll);
    const span = track.offsetHeight - innerHeight;
    const start = scrollY, end = track.offsetTop + span * target;
    const t0 = performance.now(); dur = reduce ? 1 : dur;
    const step = (now) => {
      const k = clamp((now - t0) / dur);
      scrollTo(0, start + (end - start) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
      autoScroll = k < 1 ? requestAnimationFrame(step) : null;
    };
    autoScroll = requestAnimationFrame(step);
  }
  ['wheel', 'touchstart'].forEach((ev) => addEventListener(ev, () => { if (autoScroll) { cancelAnimationFrame(autoScroll); autoScroll = null; } }, { passive: true }));

  function go(pg) {
    Sound.unlock();
    if (document.body.classList.contains('in-os')) QROS.leave();
    if (powerTarget === 0) powerTarget = 1;
    scrollToP(posOf(pg), Math.min(1400, 400 + Math.abs(PAGES.indexOf(pg) - PAGES.indexOf(page)) * 250));
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) { e.preventDefault(); go(+b.dataset.go); return; }
    const r = e.target.closest('[data-remote]');
    if (r) {
      Sound.unlock(); Sound.blip();
      const k = r.dataset.remote;
      const i = PAGES.indexOf(page);
      if (k === 'power') powerTarget = powerTarget ? 0 : 1;
      else if (k === 'up') go(PAGES[Math.min(PAGES.length - 1, i + 1)]);
      else if (k === 'down') go(PAGES[Math.max(0, i - 1)]);
      else if (k === 'ok') { QROS.enter(); }
      else if (k === 'music') QROS.music();
      return;
    }
    if (e.target.closest('[data-intro=skip]')) QROS.enter();
  });
  addEventListener('keydown', (e) => {
    if (document.body.classList.contains('in-os') || e.target.closest('input,select,textarea')) return;
    const map = { 1: 101, 2: 102, 3: 103, 4: 104, 0: 100, 9: 199 };
    if (map[e.key]) go(map[e.key]);
  });

  function liveBar() {
    const d = QROS.data();
    if (!d.head) return;
    $('#heroLive').innerHTML = `<i></i>CH 4663 · BLOCK #${d.head.number.toLocaleString('en-US')}${d.market && d.market.ethUsd ? ' · ETH $' + Math.round(d.market.ethUsd).toLocaleString('en-US') : ''}`;
  }

  const boot = () => { layout(); setTimeout(() => { powerTarget = 1; Sound.blip('buy'); }, reduce ? 0 : 700); };
  if (document.fonts && document.fonts.load) document.fonts.load('20px "VT323"').then(boot, boot); else boot();
  addEventListener('resize', () => { if (!document.body.classList.contains('in-os')) { layout(); shownPage = null; } });
  setInterval(liveBar, 1000);
  if (location.hash === '#desk') QROS.enter();
  requestAnimationFrame(frame);
})();
