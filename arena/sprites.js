/* Pixel-art agents and the desktop wallpaper, drawn on low-res canvases and scaled up crisp. */
(function (global) {
  'use strict';
  const { AGENTS } = global.Q;

  // 12×14 sprites. Key: . empty, o outline, b body (agent colour), l light body, s screen/face, e eye, w white, f feet
  const BODY = {
    flux: [
      '....oooo....', '...obbbbo...', '..obllllbo..', '..osssssso..', '..oseesseo..', '..osssssso..', '...oooooo...',
      '..obbbbbbo..', '.obbllllbbo.', '.ob.bbbb.bo.', '..obbbbbbo..', '..ob.oo.bo..'],
    vex: [
      '.o........o.', '..o.oooo.o..', '...obbbbo...', '..obsssbbo..', '..obeesebo..', '..obsssbbo..', '...oooooo...',
      '..obbllbbo..', '.obbbllbbbo.', '.ob.bbbb.bo.', '..obbbbbbo..', '..ob.oo.bo..'],
    echo: [
      '...oooooo...', '..obbbbbbo..', '.obllbbllbo.', '.osssssssso.', '.osesssseso.', '.osssssssso.', '..oooooooo..',
      '...obbbbo...', '..obllllbo..', '.ob.bbbb.bo.', '..obbbbbbo..', '..ob.oo.bo..'],
    anchor: [
      '.....oo.....', '....obbo....', '..oobbbboo..', '.obssssssbo.', '.obseesesbo.', '.obssssssbo.', '..oooooooo..',
      '.obbbbbbbbo.', 'obbllllllbbo', 'ob.bbbbbb.bo', '.obbbbbbbbo.', '..ob.oo.bo..']
  };
  const FEET = [['..of....fo..', '..oo....oo..'], ['...of..fo...', '...oo..oo...']];

  function drawSprite(g, id, x, y, scale, frame, color, light) {
    const rows = BODY[id].concat(FEET[frame % 2]);
    const pal = { o: '#0a0612', b: color, l: light, s: '#120a1f', e: light, w: '#ffffff', f: '#0a0612' };
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < 12; c++) {
      const k = rows[r][c];
      if (k === '.') continue;
      g.fillStyle = pal[k];
      g.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }

  function portrait(id, px = 6) {
    const a = AGENTS.find((x) => x.id === id);
    const c = document.createElement('canvas');
    c.width = 12 * px; c.height = 14 * px;
    drawSprite(c.getContext('2d'), id, 0, 0, px, 0, a.color, a.glow);
    c.className = 'portrait';
    return c;
  }

  /* ---------- trading floor: agents wander, shout on trades ---------- */
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
      if (document.hidden) return;
      f++;
      g.clearRect(0, 0, W, H);
      // floor tiles
      g.fillStyle = 'rgba(255,255,255,.05)';
      for (let x = (f / 2) % 24 - 24; x < W; x += 24) g.fillRect(x, H - 6, 12, 2);
      const now = Date.now();
      for (const b of bots) {
        if (b.pause > 0) b.pause--;
        else {
          b.x += b.dir * b.speed;
          if (b.x < 8 || b.x > W - 12 * S - 8) b.dir *= -1;
          if (Math.random() < 0.002) b.pause = 120;
        }
        const y = H - 14 * S - 8 + (b.pause ? 0 : (Math.floor(f / 8) % 2));
        g.save();
        if (b.dir < 0) { g.translate(b.x * 2 + 12 * S, 0); g.scale(-1, 1); }
        drawSprite(g, b.a.id, Math.round(b.x), y, S, b.pause ? 0 : Math.floor(f / 8), b.a.color, b.a.glow);
        g.restore();
        if (b.bubble && now < b.until) {
          g.font = '12px "Silkscreen", monospace';
          const tw = g.measureText(b.bubble).width + 12;
          const bx = Math.max(4, Math.min(W - tw - 4, b.x + 6 * S - tw / 2)), by = y - 24;
          g.fillStyle = '#f4ecff'; g.fillRect(bx, by, tw, 18);
          g.fillStyle = '#0a0612'; g.fillText(b.bubble, bx + 6, by + 13);
        }
      }
    }
    frame();
    return {
      shout(i, text) { const b = bots[i]; if (b) { b.bubble = text; b.until = Date.now() + 4500; b.pause = 90; } }
    };
  }

  /* ---------- wallpaper: pixel sunset, skyline and twinkling stars ---------- */
  function wallpaper(canvas) {
    const g = canvas.getContext('2d');
    const P = 4; // virtual pixel size
    let w = 0, h = 0, stars = [], sky = [];
    function size() {
      w = Math.ceil(canvas.clientWidth / P); h = Math.ceil(canvas.clientHeight / P);
      canvas.width = w; canvas.height = h;
      stars = Array.from({ length: Math.floor(w * h / 90) }, () => ({ x: Math.random() * w | 0, y: Math.random() * h * 0.6 | 0, p: Math.random() * 6.28, s: Math.random() }));
      let x = 0; sky = [];
      while (x < w) { const bw = 3 + (Math.random() * 7 | 0), bh = 6 + (Math.random() * h * 0.18 | 0); sky.push({ x, bw, bh, lit: Array.from({ length: 6 }, () => Math.random() < 0.35) }); x += bw + (Math.random() < 0.3 ? 1 : 0); }
    }
    size();
    global.addEventListener('resize', size);
    const bands = ['#0a0612', '#120a24', '#1d0f38', '#2e1250', '#4a1460', '#74176a', '#a8206a', '#e0346a', '#ff6a4d', '#ffae42'];
    function draw(t) {
      requestAnimationFrame(draw);
      if (document.hidden) return;
      const horizon = Math.floor(h * 0.78);
      for (let i = 0; i < bands.length; i++) {
        const y0 = Math.floor(horizon * Math.pow(i / bands.length, 0.6)), y1 = Math.floor(horizon * Math.pow((i + 1) / bands.length, 0.6));
        g.fillStyle = bands[i]; g.fillRect(0, y0, w, y1 - y0 + 1);
      }
      // dithered sun
      const sx = Math.floor(w * 0.72), sy = horizon - 2, r = Math.floor(Math.min(w, h) * 0.13);
      for (let y = -r; y <= 0; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        if ((-y) % 5 === 2 && y > -r * 0.7) continue;
        g.fillStyle = y < -r * 0.5 ? '#ffd36b' : '#ff8a5c';
        g.fillRect(sx + x, sy + y, 1, 1);
      }
      for (const s of stars) {
        if (s.y > horizon - r) continue;
        const a = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 * (0.5 + s.s) + s.p));
        g.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        g.fillRect(s.x, s.y, 1, 1);
      }
      // skyline
      for (const b of sky) {
        g.fillStyle = '#0d0718'; g.fillRect(b.x, horizon - b.bh, b.bw, b.bh);
        for (let k = 0; k < 6; k++) if (b.lit[k]) { g.fillStyle = k % 2 ? '#ffb000' : '#3de0ff'; g.fillRect(b.x + 1 + (k % 2) * 2, horizon - b.bh + 2 + Math.floor(k / 2) * 3, 1, 1); }
      }
      // grid floor
      g.fillStyle = '#0a0612'; g.fillRect(0, horizon, w, h - horizon);
      g.fillStyle = '#ff3d7f55';
      const off = (t / 60) % 6;
      for (let y = horizon; y < h; y += Math.max(1, Math.floor((y - horizon) / 3) + 1)) g.fillRect(0, Math.floor(y + off * ((y - horizon) / (h - horizon))), w, 1);
      for (let x = -w; x < w * 2; x += 8) {
        const x0 = w / 2 + (x - w / 2) * 0.15;
        for (let y = horizon; y < h; y++) { const k = (y - horizon) / (h - horizon); g.fillRect(Math.floor(x0 + (x - x0) * k), y, 1, 1); }
      }
    }
    requestAnimationFrame(draw);
  }

  global.Sprites = { portrait, floor, wallpaper, drawSprite };
})(window);
