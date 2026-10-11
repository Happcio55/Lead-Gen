/* Bitmap serif headings: each line of an element marked [data-px] is drawn with a real serif at a
   small size, thresholded to hard pixels and scaled up crisp. The text stays in the DOM for
   screen readers and search; the canvas is decoration. */
(function (global) {
  'use strict';
  const FONT = '"Instrument Serif", "Times New Roman", serif';
  const GLYPH = 27; // bitmap pixels per em: lower = chunkier pixels

  function linesOf(el) {
    if (!el._pxSrc) el._pxSrc = [...el.children].length ? [...el.children].map((c) => ({ text: c.textContent, cls: c.className })) : [{ text: el.textContent, cls: '' }];
    return el._pxSrc;
  }

  function render(el) {
    const src = linesOf(el);
    const cs = getComputedStyle(el);
    const fsCss = parseFloat(cs.fontSize);
    const px = Math.max(2, Math.round(fsCss / GLYPH));
    const fs = Math.round(fsCss / px);
    const maxW = Math.max(40, Math.floor((el.clientWidth || el.parentElement.clientWidth) / px));
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `${fs}px ${FONT}`;
    // wrap each source line by words
    const rows = [];
    for (const s of src) {
      const words = s.text.trim().split(/\s+/);
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (probe.measureText(t).width > maxW && cur) { rows.push({ text: cur, cls: s.cls }); cur = w; } else cur = t;
      }
      if (cur) rows.push({ text: cur, cls: s.cls });
    }
    const lh = Math.round(fs * 1.02);
    const widths = rows.map((r) => Math.ceil(probe.measureText(r.text).width) + 2);
    const W = Math.max(...widths, 1), H = lh * rows.length + Math.round(fs * 0.28);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.font = `${fs}px ${FONT}`;
    g.textBaseline = 'alphabetic';
    const align = cs.textAlign === 'center' ? 'center' : 'left';
    const colors = rows.map((r) => {
      const probeEl = document.createElement('span');
      probeEl.className = r.cls; el.appendChild(probeEl);
      const col = getComputedStyle(probeEl).color; probeEl.remove();
      return col;
    });
    rows.forEach((r, i) => {
      const x = align === 'center' ? Math.round((W - widths[i]) / 2) + 1 : 1;
      g.fillStyle = '#fff';
      g.fillText(r.text, x, Math.round(lh * (i + 0.82)));
    });
    // threshold to hard pixels and tint each row
    const img = g.getImageData(0, 0, W, H), d = img.data;
    const rgb = colors.map((col) => (col.match(/\d+(\.\d+)?/g) || [255, 255, 255]).map(Number));
    for (let y = 0; y < H; y++) {
      const row = Math.min(rows.length - 1, Math.floor(y / lh));
      const [r, gg, b] = rgb[row];
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] > 118) { d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255; } else d[i + 3] = 0;
      }
    }
    g.putImageData(img, 0, 0);
    c.style.width = W * px + 'px';
    c.style.height = H * px + 'px';
    c.setAttribute('aria-hidden', 'true');
    c.className = 'px-canvas';
    let sr = el.querySelector('.sr');
    if (!sr) { sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = src.map((s) => s.text).join(' '); }
    el.replaceChildren(sr, c);
    el.classList.add('px-ready');
  }

  function renderAll() { document.querySelectorAll('[data-px]').forEach((el) => { if (el.offsetParent !== null || el.closest('.intro')) render(el); }); }
  let t;
  global.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(renderAll, 150); });
  const go = () => (document.fonts && document.fonts.load ? document.fonts.load(`40px ${FONT}`).then(renderAll, renderAll) : renderAll());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  global.PixelText = { render, renderAll };
})(window);
