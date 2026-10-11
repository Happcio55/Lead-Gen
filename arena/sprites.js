/* Pixel art: agent sprites, a dithered monochrome night landscape, crimson ivy, and the trading floor. */
(function (global) {
  'use strict';
  const { AGENTS } = global.Q;
  const CREAM = '#f3e6c8', CREAM2 = '#b07a22', INK = '#120c07', HOT = '#34d1bf';

  /* ---------- dithering helpers ---------- */
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));
  const bayer = (x, y) => BAYER[y & 3][x & 3];
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
  }
  const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;

  // 12×14 sprites. Key: . empty, o outline, b body, l accent (agent colour), s visor, e eye, f feet
  const BODY = {
    claudius: ['....l..l....', '.....ll.....', '...oooooo...', '..obbbbbbo..', '.obssssssbo.', '.obseesesbo.', '.obssssssbo.', '..oooooooo..', '..obbllbbo..', '.obbbllbbbo.', '.ob.bbbb.bo.', '..obbbbbbo..'],
    gemtwins: ['.oo......oo.', '.obo....obo.', '..oooooooo..', '.obbbbbbbbo.', '.obssbbssbo.', '.obesbbesbo.', '.obssbbssbo.', '..oooooooo..', '...obllbo...', '..obbllbbo..', '.ob.bbbb.bo.', '..obbbbbbo..'],
    grokstar: ['..l..l..l...', '.olloolloo..', '.obbbbbbbbo.', '.osssssssso.', '.oseesseeso.', '.osssllssso.', '..oooooooo..', '...obbbbo...', '..obllllbo..', '.ob.bbbb.bo.', '..obbbbbbo..', '..ob.oo.bo..'],
    gptony: ['....oooo....', '...obbbbo...', '..obllllbo..', '..osssssso..', '..oseesseo..', '..osssssso..', '...oooooo...', '..obbbbbbo..', '.obbllllbbo.', '.ob.bbbb.bo.', '..obbbbbbo..', '..ob.oo.bo..'],
    mistro: ['...oooooo...', '..olllllllo.', '...oooooo...', '..obbbbbbo..', '..osssssso..', '..oseesseo..', '..osssssso..', '...oooooo...', '..obbbbbbo..', '.obbllllbbo.', '.ob.bbbb.bo.', '..obbbbbbo..'],
    llambo: ['..o......o..', '.olo....olo.', '.olo....olo.', '..obbbbbbo..', '.obssssssbo.', '.obseesesbo.', '.obssssssbo.', '..oooooooo..', '.obbbbbbbbo.', 'obbllllllbbo', 'ob.bbbbbb.bo', '.obbbbbbbbo.'],
    seeker: ['...oooooo...', '..obbbbbbo..', '.obbooooobbo', '.obosseesobo', '.obossssobo.', '.obboooobbo.', '..oooooooo..', '.obbllllbbo.', 'obbbllllbbbo', 'ob.bbbbbb.bo', '.obbbbbbbbo.', '..ob.oo.bo..']
  };
  const FEET = [['..of....fo..', '..oo....oo..'], ['...of..fo...', '...oo..oo...']];

  function drawSprite(g, id, x, y, scale, frame, accent) {
    const rows = BODY[id].concat(FEET[frame % 2]);
    const pal = { o: '#070503', b: CREAM, l: accent, s: '#1a1617', e: accent, f: '#070503' };
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < 12; c++) {
      const k = rows[r][c];
      if (k === '.') continue;
      g.fillStyle = k === 'b' && r < 3 && (c + r) % 3 === 0 ? '#d8c69c' : pal[k];
      g.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
  function portrait(id, px = 6) {
    const a = AGENTS.find((x) => x.id === id);
    const c = document.createElement('canvas');
    c.width = 12 * px; c.height = 14 * px;
    drawSprite(c.getContext('2d'), id, 0, 0, px, 0, a.glow);
    c.className = 'portrait';
    return c;
  }

  /* ---------- the night landscape (shared by the desk wallpaper and the TV scene) ---------- */
  function makeLand(w, h, ground) {
    const stars = Array.from({ length: Math.floor(w * h / 95) }, () => ({ x: Math.random() * w | 0, y: Math.random() * ground * 0.8 | 0, p: Math.random() * 6.3, s: 0.4 + Math.random() * 1.2 }));
    const ridge = (amp, base, f, seed) => Array.from({ length: w }, (_, x) => Math.floor(ground - base - fbm(x * f + seed, seed) * amp));
    const far = ridge(h * 0.22, h * 0.03, 0.012, 11), near = ridge(h * 0.12, 0, 0.025, 37);
    const trees = [];
    for (let x = -4; x < w + 4; x += 3 + Math.random() * 7) trees.push({ x: x | 0, h: (h * (0.07 + Math.random() * 0.2)) | 0, front: Math.random() < 0.35 });
    trees.sort((a, b) => a.h - b.h);
    // clouds: rendered once, twice as wide as the view, then scrolled
    const clouds = document.createElement('canvas');
    clouds.width = w * 2; clouds.height = Math.max(1, Math.floor(ground * 0.62));
    const cg = clouds.getContext('2d');
    cg.fillStyle = CREAM2;
    const y0 = Math.floor(h * 0.06), span = Math.max(1, ground * 0.56), period = w * 2;
    for (let y = y0; y < clouds.height; y++) {
      const band = Math.sin(((y - y0) / span) * Math.PI);
      for (let x = 0; x < period; x++) {
        // blend the wrap seam so the strip tiles
        const k = x / period;
        const v = (fbm(x * 0.018, y * 0.05) * (1 - k) + fbm((x - period) * 0.018, y * 0.05) * k) * band - 0.38;
        if (v > 0 && v * 2.6 > bayer(x, y)) cg.fillRect(x, y, 1, 1);
      }
    }
    return { w, h, ground, stars, far, near, trees, clouds };
  }
  function paintLand(g, L, t, opts = {}) {
    const { w, h, ground } = L;
    g.fillStyle = INK; g.fillRect(0, 0, w, h);
    for (const s of L.stars) {
      const a = Math.abs(Math.sin(t / 1300 * s.s + s.p));
      if (a > 0.35) { g.fillStyle = a > 0.85 ? CREAM : CREAM2; g.fillRect(s.x, s.y, 1, 1); }
    }
    // moon
    const mx = Math.floor(w * (opts.moonX || 0.8)), my = Math.floor(ground * 0.2), r = Math.max(4, Math.floor(Math.min(w, h) * 0.045));
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r || (x + r * 0.5) ** 2 + (y - r * 0.15) ** 2 < r * r * 0.75) continue;
      g.fillStyle = CREAM; g.fillRect(mx + x, my + y, 1, 1);
    }
    // dithered clouds drifting across the upper sky
    const off = Math.floor((t / 260) % (w * 2));
    g.drawImage(L.clouds, -off, 0);
    g.drawImage(L.clouds, w * 2 - off, 0);
    // ridges, forest and ground never move: render them once per layout
    const key = opts.trees === false ? 'noTrees' : 'trees';
    L.layers = L.layers || {};
    if (!L.layers[key]) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const lg = c.getContext('2d');
      const ridgePaint = (arr, dark, lit) => {
        for (let x = 0; x < w; x++) {
          const top = arr[x];
          lg.fillStyle = dark; lg.fillRect(x, top, 1, ground - top);
          for (let y = top; y < Math.min(ground, top + lit); y++) if ((1 - (y - top) / lit) * 0.9 > bayer(x, y)) { lg.fillStyle = CREAM2; lg.fillRect(x, y, 1, 1); }
        }
      };
      ridgePaint(L.far, '#1f150b', 6);
      ridgePaint(L.near, '#150e07', 4);
      for (const tr of L.trees) if (!tr.front) pine(lg, tr.x, ground, tr.h * 0.7, 0.55);
      lg.fillStyle = '#0d0905'; lg.fillRect(0, ground, w, h - ground);
      lg.fillStyle = '#3a2a14';
      for (let y = ground; y < h; y++) for (let x = (y & 1); x < w; x += 2) if (bayer(x, y) < 0.12 * (1 - (y - ground) / (h - ground + 1))) lg.fillRect(x, y, 1, 1);
      if (opts.trees !== false) for (const tr of L.trees) if (tr.front) pine(lg, tr.x, ground + 1, tr.h, 1);
      L.layers[key] = c;
    }
    g.drawImage(L.layers[key], 0, 0);
  }
  function pine(g, x, base, h, light) {
    const w = Math.max(5, Math.floor(h * 0.44));
    g.fillStyle = '#070503'; g.fillRect(x - 1, base - Math.max(2, h * 0.1), 2, Math.max(2, h * 0.1));
    const tiers = 4;
    for (let k = 0; k < tiers; k++) {
      const top = base - h * 0.1 - (k + 1) * (h * 0.9 / tiers) - h * 0.08;
      const th = h * 0.9 / tiers + h * 0.12;
      const tw = w * (1 - k * 0.18);
      for (let y = 0; y < th; y++) {
        const half = Math.floor((tw / 2) * (y / th));
        const yy = Math.floor(top + y);
        for (let dx = -half; dx <= half; dx++) {
          const xx = x + dx;
          // moonlight from the upper left: dithered cream on the left flank
          const lit = (dx < 0 ? 0.55 : 0.15) * (1 - y / th) * light;
          g.fillStyle = lit > bayer(xx, yy) ? CREAM2 : '#070503';
          g.fillRect(xx, yy, 1, 1);
        }
      }
    }
  }

  /* ---------- crimson ivy ---------- */
  function ivy(canvas, mode, seed = 1) {
    const P = 3;
    const W = Math.ceil(canvas.clientWidth / P) || 120, H = Math.ceil(canvas.clientHeight / P) || 40;
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, W, H);
    let rs = seed * 9301;
    const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280);
    const leaf = (x, y, s) => {
      g.fillStyle = HOT;
      for (let i = -s; i <= s; i++) { g.fillRect(x + i, y, 1, 1); g.fillRect(x, y + i, 1, 1); }
      g.fillRect(x - 1, y - 1, 3, 3);
      if (s > 1) { g.fillRect(x - s + 1, y - s + 1, 1, 1); g.fillRect(x + s - 1, y - s + 1, 1, 1); g.fillRect(x - s + 1, y + s - 1, 1, 1); g.fillRect(x + s - 1, y + s - 1, 1, 1); }
      g.fillStyle = '#ff7a8f'; g.fillRect(x, y - s, 1, 1);
    };
    const vine = (pts) => {
      g.fillStyle = '#9e1230';
      pts.forEach(([x, y]) => g.fillRect(Math.round(x), Math.round(y), 1, 1));
      pts.forEach(([x, y], i) => { if (i % 6 === 0 && rnd() < 0.85) leaf(Math.round(x + (rnd() - 0.5) * 6), Math.round(y + (rnd() - 0.5) * 6), 1 + (rnd() * 2.4 | 0)); });
    };
    const path = (x0, y0, x1, y1, amp, freq) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)), out = [];
      const nx = -(y1 - y0) / n, ny = (x1 - x0) / n;
      for (let i = 0; i <= n; i++) { const k = i / n, o = Math.sin(k * freq * Math.PI * 2 + seed) * amp; out.push([x0 + (x1 - x0) * k + nx * o, y0 + (y1 - y0) * k + ny * o]); }
      return out;
    };
    if (mode === 'band') { for (let r = 0; r < 3; r++) vine(path(0, H * (0.25 + r * 0.25), W, H * (0.3 + r * 0.2), H * 0.12, 3 + r)); }
    else { // frame
      const m = 6;
      vine(path(m, m, W - m, m, 4, 6)); vine(path(W - m, m, W - m, H - m, 4, 2));
      vine(path(W - m, H - m, m, H - m, 4, 6)); vine(path(m, H - m, m, m, 4, 2));
      vine(path(m, m + 3, W * 0.4, m + 6, 5, 3));
    }
  }

  /* ---------- trading floor ---------- */
  function floor(canvas, onPick) {
    const g = canvas.getContext('2d');
    const S = 3;
    let W = 0, H = 0;
    const bots = AGENTS.map((a, i) => ({ a, x: 60 + i * 140, dir: i % 2 ? -1 : 1, speed: 0.35 + i * 0.07, bubble: null, until: 0, pause: 0 }));
    function size() { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W; canvas.height = H; }
    size();
    global.addEventListener('resize', size);
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left;
      const hit = bots.find((b) => x >= b.x - 4 && x <= b.x + 12 * S + 4);
      if (hit) onPick(hit.a.id);
    });
    let f = 0;
    function frame() {
      requestAnimationFrame(frame);
      if (document.hidden || !W) return;
      f++;
      g.clearRect(0, 0, W, H);
      const now = Date.now();
      for (const b of bots) {
        if (b.pause > 0) b.pause--;
        else { b.x += b.dir * b.speed; if (b.x < 8 || b.x > W - 12 * S - 8) b.dir *= -1; if (Math.random() < 0.002) b.pause = 120; }
        const y = H - 14 * S - 8 + (b.pause ? 0 : (Math.floor(f / 8) % 2));
        g.save();
        if (b.dir < 0) { g.translate(b.x * 2 + 12 * S, 0); g.scale(-1, 1); }
        drawSprite(g, b.a.id, Math.round(b.x), y, S, b.pause ? 0 : Math.floor(f / 8), b.a.glow);
        g.restore();
        if (b.bubble && now < b.until) {
          g.font = '11px "Silkscreen", monospace';
          const tw = g.measureText(b.bubble).width + 12;
          const bx = Math.max(4, Math.min(W - tw - 4, b.x + 6 * S - tw / 2)), by = y - 24;
          g.fillStyle = CREAM; g.fillRect(bx, by, tw, 18);
          g.fillStyle = INK; g.fillText(b.bubble, bx + 6, by + 13);
        }
      }
    }
    frame();
    return { shout(i, text) { const b = bots[i]; if (b) { b.bubble = text; b.until = Date.now() + 4500; b.pause = 90; } } };
  }

  /* ---------- desk wallpaper ---------- */
  function wallpaper(canvas) {
    const g = canvas.getContext('2d');
    const P = 3;
    let L = null, last = 0;
    function size() {
      const w = Math.ceil(canvas.clientWidth / P), h = Math.ceil(canvas.clientHeight / P);
      if (!w || !h) return;
      canvas.width = w; canvas.height = h;
      L = makeLand(w, h, Math.floor(h * 0.8));
    }
    size();
    global.addEventListener('resize', size);
    function draw(t) {
      requestAnimationFrame(draw);
      if (document.hidden || !L || t - last < 120) return; // 8 fps is plenty for drifting clouds
      last = t;
      paintLand(g, L, t, { moonX: 0.32 });
    }
    requestAnimationFrame(draw);
  }

  global.Sprites = { portrait, floor, wallpaper, drawSprite, makeLand, paintLand, ivy, bayer };
})(window);
