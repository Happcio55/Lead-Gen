/* Citizens front page: pixel wordmark, the lineup, citizen ID cards with live stats, and the
   scroll-pinned monitor that boots, connects to mainnet and dives into the desk. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const { AGENTS } = Q;
  const BONE = '#f3e6c8', AMBER = '#ffb000', AMBER2 = '#c98400', SHADOW = '#4a2e08', TEAL = '#34d1bf', INK = '#120c07';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bayer = Sprites.bayer;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = (n) => n.toLocaleString('en-US');
  const pct = (x, d = 2) => (Number.isFinite(x) ? `<span class="${x > 0 ? 'up' : x < 0 ? 'dn' : ''}">${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}%</span>` : '—');

  /* ---------- 5×7 bitmap font ---------- */
  const F = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'], E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    ' ': ['000', '000', '000', '000', '000', '000', '000']
  };
  function wordmark(cv, lines) {
    const W = Math.max(...lines.map((l) => l.split('').reduce((w, ch) => w + (F[ch] || F[' '])[0].length + 1, 0))) + 2;
    const H = lines.length * 9 + 1;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    lines.forEach((line, li) => {
      let x = 0;
      const y0 = li * 9;
      for (const ch of line) {
        const gl = F[ch] || F[' '];
        for (let r = 0; r < 7; r++) for (let c = 0; c < gl[r].length; c++) if (gl[r][c] === '1') {
          g.fillStyle = SHADOW; g.fillRect(x + c + 1, y0 + r + 1, 1, 1);
        }
        for (let r = 0; r < 7; r++) for (let c = 0; c < gl[r].length; c++) if (gl[r][c] === '1') {
          // clean bands: a lit top edge, the face, and a darker base row
          g.fillStyle = r === 0 ? '#fffaf0' : r >= 5 ? '#d8c69c' : BONE;
          g.fillRect(x + c, y0 + r, 1, 1);
        }
        x += gl[0].length + 1;
      }
    });
    return { W, H };
  }
  function logoMark(cv) {
    const hc = Sprites.hatCanvas(1);
    cv.width = hc.width; cv.height = hc.height;
    cv.getContext('2d').drawImage(hc, 0, 0);
    // the same hat is the favicon
    const fav = document.createElement('canvas'); fav.width = fav.height = 32;
    const fg = fav.getContext('2d'); fg.fillStyle = INK; fg.fillRect(0, 0, 32, 32); fg.drawImage(hc, 3, 7);
    const link = document.getElementById('favicon'); if (link) link.href = fav.toDataURL('image/png');
  }

  /* ---------- lineup ---------- */
  function buildLineup() {
    const wall = $('#luWall');
    wall.innerHTML = [200, 190, 180, 170, 160, 150, 140].map((cm) => `<span>${cm}</span>`).join('');
    const row = $('#lineup');
    row.innerHTML = '';
    const px = Math.max(3, Math.min(7, Math.floor((row.clientWidth || innerWidth * 0.45) / (AGENTS.length * 15))));
    AGENTS.forEach((a, i) => {
      const d = document.createElement('button');
      d.type = 'button'; d.className = 'lu-bot'; d.dataset.desk = 'agent:' + a.id;
      d.style.setProperty('--c', a.glow);
      d.style.animationDelay = (i * 0.17) + 's';
      d.title = `${a.name}: ${a.style}, inspired by ${a.inspired}. Open its desk.`;
      const c = Sprites.portrait(a.id, px);
      const plate = document.createElement('span'); plate.className = 'lu-plate';
      plate.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b>${a.name}`;
      d.append(c, plate);
      row.appendChild(d);
    });
  }

  /* ---------- citizen ID cards ---------- */
  function buildIds() {
    $('#ids').innerHTML = AGENTS.map((a, i) => `
      <article class="idc" style="--c:${a.color};--g:${a.glow}">
        <header><span>CITIZEN ID · ROBINHOOD CHAIN</span><span>No. ${String(i + 1).padStart(2, '0')}</span></header>
        <div class="idc-body">
          <div class="idc-photo" data-photo="${a.id}"></div>
          <dl>
            <div><dt>Name</dt><dd class="idc-name">${a.name}</dd></div>
            <div><dt>Inspired by</dt><dd>${a.inspired}</dd></div>
            <div><dt>Temperament</dt><dd>${a.style}</dd></div>
            <div><dt>Equity</dt><dd data-f="eq">—</dd></div>
            <div><dt>Return</dt><dd data-f="ret">—</dd></div>
            <div><dt>Best pick now</dt><dd data-f="pick">—</dd></div>
          </dl>
        </div>
        <p class="idc-bio">${a.bio}</p>
        <footer><canvas class="barcode" aria-hidden="true"></canvas><button type="button" class="b-line small" data-desk="agent:${a.id}">Open desk →</button></footer>
      </article>`).join('');
    $$('[data-photo]').forEach((el) => el.appendChild(Sprites.portrait(el.dataset.photo, 6)));
  }
  function barcode(cv, seed) {
    cv.width = 120; cv.height = 24;
    const g = cv.getContext('2d');
    g.fillStyle = BONE; g.fillRect(0, 0, 120, 24);
    let x = 2, i = 0;
    while (x < 116) {
      const v = Math.abs(Math.sin(seed * 0.0137 + i * 12.9898) * 43758.5453) % 1;
      const w = v < 0.5 ? 1 : v < 0.8 ? 2 : 3;
      if (i % 2 === 0) { g.fillStyle = INK; g.fillRect(x, 2, w, 20); }
      x += w + (v > 0.7 ? 2 : 1); i++;
    }
  }

  function updateLive() {
    if (!window.QROS || document.body.classList.contains('in-os')) return;
    const d = QROS.data();
    if (d.head) {
      $('#heroLive').innerHTML = `<i></i>block #${fmtN(d.head.number)}`;
      $('#sBlock').textContent = '#' + fmtN(d.head.number);
      $('#luBlock').textContent = '#' + fmtN(d.head.number);
    }
    if (d.market && d.market.ethUsd) { $('#sEth').textContent = '$' + fmtN(Math.round(d.market.ethUsd)); $('#sPools').textContent = d.market.tokens.length; }
    if (!d.snap) return;
    const ranked = d.snap.agents.filter((x) => x.ret != null).sort((p, q) => q.ret - p.ret);
    if (ranked[0]) { const a = AGENTS.find((x) => x.id === ranked[0].id); $('#sLead').innerHTML = `${a.name} ${pct(ranked[0].ret)}`; }
    const toks = (d.market && d.market.tokens) || [];
    $$('.idc').forEach((card, i) => {
      const a = AGENTS[i], s = d.snap.agents.find((x) => x.id === a.id);
      $('[data-f=eq]', card).textContent = s && s.equity != null ? s.equity.toFixed(4) + ' ETH' : '—';
      $('[data-f=ret]', card).innerHTML = s ? pct(s.ret) : '—';
      const ev = d.evals && d.evals[a.id];
      if (ev && toks.length) {
        const t = toks.slice().sort((x, y) => ev[y.addr].score - ev[x.addr].score)[0];
        const sc = ev[t.addr].score;
        $('[data-f=pick]', card).innerHTML = `${esc(t.sym)} <span class="${sc >= a.buyAt ? 'up' : ''}">${sc >= 0 ? '+' : ''}${sc.toFixed(2)}</span>`;
      }
      if (d.head) barcode($('.barcode', card), (d.head.number % 100000) * 7 + i * 7919);
    });
  }

  /* ---------- the monitor ---------- */
  const track = $('#monitor'), stage = $('#tvStage'), cv = $('#monCv'), g = cv.getContext('2d');
  const scr = $('#tvScreen'), inner = $('#tvInner'), noise = $('#tvNoise'), ng = noise.getContext('2d');
  const text = $('#tvText'), botsEl = $('#tvAgents'), bar = $('#tvBar'), flash = $('#tvFlash'), cue = $('#tvCue');
  let P = 4, vw = 0, vh = 0, M = {}, land = null;
  const stat = document.createElement('canvas'), stg = stat.getContext('2d');
  const buf = document.createElement('canvas'), bg = buf.getContext('2d');
  const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const C1 = '#efe2c2', C2 = '#cdb68a', C3 = '#9a8158', C4 = '#5e4a2c';

  function shadeBox(c, x, y, w, h, light) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const s = (xx / w) * 0.55 + (yy / h) * 0.45 - light;
      c.fillStyle = s > 0.66 + bayer(x + xx, y + yy) * 0.25 ? C3 : s > 0.38 + bayer(x + xx, y + yy) * 0.25 ? C2 : C1;
      c.fillRect(x + xx, y + yy, 1, 1);
    }
  }

  function layoutMon() {
    P = Math.max(3, Math.round(Math.min(innerWidth, innerHeight) / 180));
    vw = Math.ceil(innerWidth / P); vh = Math.ceil(innerHeight / P);
    for (const c of [cv, stat, buf]) { c.width = vw; c.height = vh; }
    const portrait = vw < vh;
    const monW = Math.round(portrait ? vw * 0.92 : Math.min(vw * 0.6, vh * 0.6 * 1.25));
    const monH = Math.round(monW / 1.25);
    const baseW = Math.round(monW * 1.12), baseH = Math.round(monH * 0.15);
    const kbW = Math.round(monW * 1.18), kbH = Math.round(monH * 0.13);
    const total = monH + baseH + kbH + 4;
    const top = Math.round(vh * (portrait ? 0.46 : 0.5) - total / 2);
    const cx = Math.round(vw / 2);
    M = { portrait, monW, monH, baseW, baseH, kbW, kbH, cx, monX: cx - Math.round(monW / 2), monY: top };
    M.baseX = cx - Math.round(baseW / 2); M.baseY = M.monY + monH;
    M.kbX = cx - Math.round(kbW / 2); M.kbY = M.baseY + baseH + 4;
    M.ground = M.baseY + baseH;
    M.sx = M.monX + Math.round(monW * 0.085); M.sy = M.monY + Math.round(monH * 0.085);
    M.sw = monW - Math.round(monW * 0.17); M.sh = Math.round(monH * 0.74);
    Object.assign(scr.style, { left: M.sx * P + 'px', top: M.sy * P + 'px', width: M.sw * P + 'px', height: M.sh * P + 'px' });
    stage.style.transformOrigin = `${(M.sx + M.sw / 2) * P}px ${(M.sy + M.sh / 2) * P}px`;
    noise.width = Math.max(40, Math.round(M.sw / 1.5)); noise.height = Math.max(30, Math.round(M.sh / 1.5));
    text.style.fontSize = Math.max(9, (M.sh * P) / 21) + 'px';
    land = Sprites.makeLand(vw, vh, M.ground + Math.round(kbH * 0.5));
    land.trees = land.trees.filter((t) => !(t.front && t.x > M.kbX - 8 && t.x < M.kbX + kbW + 8));
    paintMachine();
    buildBots();
    lastLand = 0;
  }

  function paintMachine() {
    const c = stg;
    c.clearRect(0, 0, vw, vh);
    const { monX, monY, monW, monH, sx, sy, sw, sh } = M;
    // monitor shell
    shadeBox(c, monX, monY, monW, monH, 0);
    rect(c, monX, monY, 2, 2, 'rgba(0,0,0,0)');
    c.clearRect(monX, monY, 2, 1); c.clearRect(monX, monY, 1, 2); c.clearRect(monX + monW - 2, monY, 2, 1); c.clearRect(monX + monW - 1, monY, 1, 2);
    rect(c, monX + 2, monY, monW - 4, 1, '#fffaf0');
    rect(c, monX, monY + monH - 1, monW, 1, C4); rect(c, monX + monW - 1, monY + 1, 1, monH - 2, C4);
    // vents on top
    for (let x = monX + Math.round(monW * 0.3); x < monX + monW * 0.7; x += 3) rect(c, x, monY + 2, 2, 1, C3);
    // recessed bezel with dithered depth
    for (let i = 0; i < 6; i++) {
      const col = i < 2 ? C3 : i < 4 ? C4 : '#2a1f12';
      rect(c, sx - 6 + i, sy - 6 + i, sw + 12 - i * 2, sh + 12 - i * 2, col);
    }
    for (let y = sy - 6; y < sy + sh + 6; y++) for (let x = sx - 6; x < sx + sw + 6; x++) {
      if (x >= sx - 2 && x < sx + sw + 2 && y >= sy - 2 && y < sy + sh + 2) continue;
      if (bayer(x, y) < 0.25) rect(c, x, y, 1, 1, C4);
    }
    rect(c, sx, sy, sw, sh, '#0a0704');
    // chin: badge, buttons and the power LED
    const chinY = sy + sh + 6, chinH = monY + monH - chinY;
    const bw = Math.min(62, Math.round(monW * 0.42)), bx = M.cx - Math.round(bw / 2), by = chinY + Math.round(chinH / 2) - 2;
    rect(c, bx - 1, by - 1, bw + 2, 6, C4); rect(c, bx, by, bw, 4, '#1d150c');
    const MINI = { M: ['101', '111', '101', '101'], O: ['111', '101', '101', '111'], D: ['110', '101', '101', '110'], E: ['111', '110', '100', '111'], L: ['100', '100', '100', '111'], C: ['111', '100', '100', '111'], I: ['111', '010', '010', '111'], T: ['111', '010', '010', '010'], Z: ['111', '001', '100', '111'], N: ['101', '111', '111', '101'], S: ['011', '110', '011', '110'] };
    // badge: the hatband, one stripe per citizen
    const seg = Math.max(1, Math.floor((bw - 4) / AGENTS.length));
    AGENTS.forEach((a, i) => rect(c, bx + 2 + i * seg, by + 1, seg, 2, a.color));
    M.led = { x: monX + monW - Math.round(monW * 0.1), y: chinY + Math.round(chinH / 2) - 1 };
    for (let i = 0; i < 3; i++) rect(c, monX + Math.round(monW * 0.08) + i * 6, chinY + Math.round(chinH / 2) - 1, 4, 2, C3);
    // base unit with floppy drive
    shadeBox(c, M.baseX, M.baseY, M.baseW, M.baseH, 0.1);
    rect(c, M.baseX, M.baseY, M.baseW, 1, C4);
    rect(c, M.baseX, M.baseY + M.baseH - 1, M.baseW, 1, C4);
    for (let x = M.baseX + 4; x < M.baseX + M.baseW * 0.35; x += 3) rect(c, x, M.baseY + 3, 1, M.baseH - 6, C3);
    const fx = M.baseX + Math.round(M.baseW * 0.55), fw = Math.round(M.baseW * 0.32), fy = M.baseY + Math.round(M.baseH * 0.35);
    rect(c, fx, fy, fw, 3, C4); rect(c, fx + 1, fy + 1, fw - 2, 1, '#1d150c');
    M.drive = { x: fx + fw - 4, y: fy + 5 };
    // keyboard
    for (let r = 0; r < 4; r++) {
      const y = M.kbY + 2 + r * Math.max(2, Math.round((M.kbH - 4) / 4));
      const inset = (3 - r) * 2;
      rect(c, M.kbX + inset - 1, y - 1, M.kbW - inset * 2 + 2, Math.max(2, Math.round((M.kbH - 4) / 4)) + 1, C4);
      for (let x = M.kbX + inset; x < M.kbX + M.kbW - inset - 3; x += 4) rect(c, x, y, 3, Math.max(1, Math.round((M.kbH - 4) / 4) - 1), r === 3 && x > M.cx - 20 && x < M.cx + 16 ? C2 : C1);
    }
    rect(c, M.cx - 20, M.kbY + M.kbH - 1, 40, 1, C3);
  }

  function buildBots() {
    botsEl.innerHTML = '';
    for (const a of AGENTS) {
      const d = document.createElement('div'); d.className = 'mb';
      const c = Sprites.portrait(a.id, Math.max(2, Math.round(M.sh * P / 95)));
      const l = document.createElement('span'); l.textContent = a.name;
      const s = document.createElement('small'); s.textContent = 'ONLINE';
      d.append(c, l, s); botsEl.appendChild(d);
    }
  }

  function bootLines() {
    const d = window.QROS ? QROS.data() : {};
    const h = d.head, m = d.market || { tokens: [] };
    const dots = '.'.repeat(1 + (Math.floor(performance.now() / 300) % 3));
    const pick = (a) => {
      const ev = d.evals && d.evals[a.id];
      if (!ev || !m.tokens.length) return 'calibrating' + dots;
      const t = m.tokens.slice().sort((x, y) => ev[y.addr].score - ev[x.addr].score)[0];
      return `${t.sym.toUpperCase().slice(0, 9).padEnd(9)} ${ev[t.addr].score >= 0 ? '+' : ''}${ev[t.addr].score.toFixed(2)}`;
    };
    return [
      'CITIZEN/OS 1.0 · CITIZENS',
      'MEMORY 7 CITIZENS ............... OK',
      'NET    ROBINHOOD CHAIN 4663 ..... ' + (h ? 'OK' : '..'),
      '       BLOCK ' + (h ? '#' + fmtN(h.number) + '  GAS ' + h.gasGwei.toFixed(4) : 'syncing' + dots),
      'FEED   ' + (m.tokens.length ? m.tokens.length + ' MEME POOLS · ETH $' + fmtN(Math.round(m.ethUsd)) : 'scanning' + dots),
      '',
      ...AGENTS.map((a) => `> ${a.name.padEnd(9)}${pick(a)}`),
      '',
      'ALL CITIZENS PRESENT. ENTERING MARKET'
    ];
  }

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => x * x * (3 - 2 * x);
  let lastLand = 0, lastText = '', lastLines = -1, powered = false, entering = false;
  const progress = () => clamp((scrollY - track.offsetTop) / Math.max(1, track.offsetHeight - innerHeight));

  function paintNoise(a) {
    if (a <= 0.01) { noise.style.opacity = 0; return; }
    const w = noise.width, h = noise.height, img = ng.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255 | 0; img.data[i] = v; img.data[i + 1] = v * 0.72; img.data[i + 2] = v * 0.3; img.data[i + 3] = 255; }
    ng.putImageData(img, 0, 0); noise.style.opacity = a;
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (document.body.classList.contains('in-os') || !land) return;
    const r = track.getBoundingClientRect();
    if (r.top > innerHeight || r.bottom < 0) return;
    if (t - lastLand > 120) { lastLand = t; Sprites.paintLand(bg, land, t, { moonX: 0.84 }); }
    g.drawImage(buf, 0, 0);
    const p = progress();
    const power = ease(clamp((p - 0.03) / 0.08));
    // amber light from the tube on the ground
    if (power > 0) for (let k = 0; k < 18; k++) {
      const rw = M.monW * (0.6 + k * 0.09);
      for (let x = 0; x < rw; x += 1) if (0.45 * power * (1 - k / 18) > bayer(x, k)) { g.fillStyle = '#4a3110'; g.fillRect(Math.floor(M.cx - rw / 2 + x), land.ground + k, 1, 1); }
    }
    g.drawImage(stat, 0, 0);
    rect(g, M.led.x, M.led.y, 3, 2, power > 0.5 ? TEAL : '#5e4a2c');
    rect(g, M.drive.x, M.drive.y, 2, 1, power > 0.5 && Math.floor(t / 180) % 3 === 0 ? AMBER : '#5e4a2c');

    inner.style.transform = power < 1 ? `scale(${Math.max(0.04, power)}, ${Math.max(0.006, power * power)})` : '';
    inner.style.filter = power < 1 ? `brightness(${1 + (1 - power) * 2})` : '';
    scr.classList.toggle('on', power > 0);
    if (power > 0 && !powered) { powered = true; Sound.blip('buy'); }
    if (power === 0) powered = false;
    paintNoise(p < 0.03 ? 0 : p < 0.13 ? 0.8 : Math.max(0.05, 0.8 - (p - 0.13) * 9) * (0.6 + Math.random() * 0.4));

    const lines = bootLines();
    const n = Math.ceil(clamp((p - 0.14) / 0.42) * lines.length);
    const out = lines.slice(0, n).join('\n') + (n ? (Math.floor(t / 400) % 2 ? '█' : ' ') : '');
    if (out !== lastText) { text.textContent = out; lastText = out; }
    if (n > lastLines && n > 0) Sound.blip();
    lastLines = n;
    const ap = clamp((p - 0.6) / 0.16);
    text.style.opacity = 1 - clamp(ap * 3);
    botsEl.style.opacity = clamp(ap * 3 - 0.3);
    [...botsEl.children].forEach((el, i) => el.classList.toggle('in', ap > 0.1 + i * 0.1));
    bar.style.opacity = clamp(ap * 3 - 0.3);
    bar.firstElementChild.style.width = (clamp((p - 0.66) / 0.14) * 100).toFixed(1) + '%';

    const zp = ease(clamp((p - 0.8) / 0.17));
    const S = Math.max(innerWidth / (M.sw * P), innerHeight / (M.sh * P)) * 1.12;
    stage.style.transform = zp > 0 ? `scale(${(1 + (S - 1) * zp * zp).toFixed(4)})` : '';
    flash.style.opacity = clamp((zp - 0.82) / 0.18).toFixed(3);
    cue.style.opacity = p > 0.01 && p < 0.8 ? 1 : 0;
    cue.textContent = p < 0.14 ? 'Keep scrolling · warming up the tube' : p < 0.6 ? 'Reading live mainnet data' : 'Connecting to mainnet';
    if (p >= 0.995 && !entering) {
      entering = true;
      QROS.enter();
      document.body.classList.add('os-powerup');
      setTimeout(() => document.body.classList.remove('os-powerup'), 900);
    }
    if (p < 0.9) entering = false;
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const desk = e.target.closest('[data-desk]');
    if (desk && desk.closest('.intro')) { QROS.enter(); QROS.open(desk.dataset.desk); return; }
    if (e.target.closest('[data-intro=skip]')) QROS.enter();
    else if (e.target.closest('[data-intro=music]')) QROS.music();
  });

  function init() {
    const wm = $('#wordmark'); const dims = wordmark(wm, ['CITIZENS']);
    wm.style.aspectRatio = `${dims.W} / ${dims.H}`;
    logoMark($('#logoMark'));
    buildLineup(); buildIds(); layoutMon();
    updateLive();
  }
  init();
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (!document.body.classList.contains('in-os')) { buildLineup(); layoutMon(); } }, 150); });
  setInterval(updateLive, 1500);
  if (location.hash === '#desk') QROS.enter();
  requestAnimationFrame(frame);
})();
