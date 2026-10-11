/* QUBIT-TV teletext: 40×24 pages with live arena data, mosaic block titles and fastext keys. */
(function (global) {
  'use strict';
  const { AGENTS } = global.Q;
  const C = { k: '#000000', r: '#ff3b3b', g: '#3bff6e', y: '#ffe23b', b: '#3b55ff', m: '#ff3bdc', c: '#3beeff', w: '#f4f4f4' };
  // agent colours mapped onto the teletext palette
  const AC = { flux: 'g', vex: 'm', echo: 'y', anchor: 'c' };
  const PAGES = [100, 101, 102, 103, 104, 199];
  const TINT = { 100: C.b, 101: C.g, 102: C.m, 103: C.y, 104: C.c, 199: C.w };

  // 5×7 mosaic font for block titles
  const F = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'], E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'], I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'], S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'], X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'], C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'], V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'], J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'], 3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (s, n) => { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };
  const lpad = (s, n) => { s = String(s); return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s; };
  const sgn = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '-' : ' ') + Math.abs(x).toFixed(d);
  function usd(x) { if (!Number.isFinite(x)) return '-'; return x >= 1e6 ? '$' + (x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(0) + 'K' : '$' + x.toFixed(0); }
  function price(x) {
    if (!(x > 0)) return '-';
    if (x >= 1) return '$' + x.toFixed(2);
    if (x >= 0.001) return '$' + x.toFixed(4);
    const z = -Math.floor(Math.log10(x)) - 1;
    return '$.0' + z + '|' + (x * 10 ** (z + 3)).toFixed(0);
  }

  /* A row is a list of segments [text, fg, bg?, extra?]. Rows are padded to 40 columns. */
  function row(...segs) { return segs; }
  const blank = () => [['', 'w']];
  function header(page, sub) {
    const d = new Date();
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const time = d.toLocaleTimeString('en-GB', { hour12: false });
    return row([`P${page} `, 'w'], ['QUBIT-TV ', 'y'], [`${page} `, 'c'], [pad(date, 7), 'w'], [time, 'y'], [sub ? ' ' + sub : '', 'w']);
  }
  function band(text, fg, bg) { return row([pad(' ' + text, 40), fg, bg]); }
  function fastext() {
    return row([pad(' Markets', 10), 'k', 'r', { go: 101 }], [pad(' Stand', 10), 'k', 'g', { go: 103 }], [pad(' Trades', 10), 'k', 'y', { go: 104 }], [pad(' Desk', 10), 'k', 'c', { go: 199 }]);
  }

  /* ---------- pages ---------- */
  function p100(d) {
    const h = d.head, m = d.market || { tokens: [] };
    const top = m.tokens.slice().sort((a, b) => b.h24 - a.h24).slice(0, 2);
    return {
      mosaic: [{ text: 'QUBIT', color: 'c', row: 3 }, { text: 'ROYALE', color: 'y', row: 7 }],
      rows: [
        header(100), band('CH 4663  ROBINHOOD CHAIN  LIVE ARENA', 'w', 'b'), blank(),
        blank(), blank(), blank(), blank(), blank(), blank(), blank(), blank(),
        row([' 4 QUANTUM TRADERS - 1 MEME COIN ARENA', 'c', null, { dh: 1 }]), blank(),
        row([' Markets ....................... ', 'w'], ['101', 'y', null, { go: 101 }]),
        row([' The decision .................. ', 'w'], ['102', 'y', null, { go: 102 }]),
        row([' Standings ..................... ', 'w'], ['103', 'y', null, { go: 103 }]),
        row([' Trade journal ................. ', 'w'], ['104', 'y', null, { go: 104 }]),
        row([' Enter the desk ................ ', 'w'], ['199', 'y', null, { go: 199 }]),
        blank(),
        row([' BLOCK ', 'g'], [h ? '#' + h.number.toLocaleString('en-US') : 'syncing...', 'w'], ['  ETH ', 'g'], [m.ethUsd ? '$' + Math.round(m.ethUsd).toLocaleString('en-US') : '...', 'w']),
        row([' HOT: ', 'r'], ...top.map((t) => [pad(t.sym.toUpperCase().slice(0, 8) + ' ' + sgn(t.h24, 0) + '%', 17), t.h24 >= 0 ? 'g' : 'r'])),
        blank(),
        fastext()
      ]
    };
  }
  function p101(d) {
    const m = d.market || { tokens: [] };
    const toks = m.tokens.slice().sort((a, b) => b.vol - a.vol).slice(0, 12);
    return {
      mosaic: [{ text: 'MARKETS', color: 'g', row: 3, scale: 1 }],
      rows: [
        header(101, '1/1'), band('MEME BOARD  ETH PAIRS  ROBINHOOD CHAIN', 'k', 'g'),
        blank(), blank(), blank(), blank(), blank(),
        row([' TOKEN    PRICE       1H     24H   LIQ', 'c']),
        ...(toks.length ? toks.map((t, i) => row([' ' + pad(t.sym.toUpperCase(), 8), i % 2 ? 'w' : 'y'], [pad(price(t.priceUsd), 11), 'w'], [lpad(sgn(t.h1), 6), t.h1 >= 0 ? 'g' : 'r'], [lpad(sgn(t.h24, 0) + '%', 7), t.h24 >= 0 ? 'g' : 'r'], [lpad(usd(t.liq), 6), 'c'])) : [row([' Scanning every meme pool...', 'w'])]),
        ...Array.from({ length: Math.max(0, 12 - toks.length) }, blank),
        row([' ' + (m.tokens.length || 0) + ' pools. Refreshed every 30 seconds.', 'm']),
        blank(),
        fastext()
      ]
    };
  }
  function p102(d, tick) {
    const a = AGENTS[Math.floor(tick / 5) % AGENTS.length];
    const ev = d.evals && d.evals[a.id];
    const toks = (d.market && d.market.tokens) || [];
    const rows = [header(102, (AGENTS.indexOf(a) + 1) + '/4'), band('THE DECISION  2-QUBIT CIRCUIT', 'k', 'm'), blank()];
    if (!ev || !toks.length) { rows.push(row([' Calibrating circuits...', 'w'])); while (rows.length < 23) rows.push(blank()); rows.push(fastext()); return { rows }; }
    const t = toks.slice().sort((x, y) => ev[y.addr].score - ev[x.addr].score)[0];
    const e = ev[t.addr];
    const v = e.score >= a.buyAt ? ['BUY SIGNAL', 'g'] : e.score <= a.sellAt ? ['AVOID', 'r'] : ['HOLD', 'y'];
    const lab = ['|00>', '|01>', '|10>', '|11>'];
    rows.push(row([' AGENT ', 'w'], [pad(a.name, 8), AC[a.id], null, { dh: 1 }], [a.style.toUpperCase(), 'w']), blank());
    rows.push(row([' BEST PICK ', 'w'], [t.sym.toUpperCase(), 'y'], ['  1H ' + sgn(t.h1) + '%', t.h1 >= 0 ? 'g' : 'r']), blank());
    for (const i of [3, 2, 1, 0]) {
      const n = Math.round(e.probs[i] * 26);
      rows.push(row([' ' + lab[i] + ' ', 'c'], ['█'.repeat(n), i >= 2 ? AC[a.id] : 'w'], ['░'.repeat(26 - n), 'b'], [lpad((e.probs[i] * 100).toFixed(0) + '%', 5), 'w']));
    }
    rows.push(blank(), row([' CLASSICAL ', 'w'], [sgn(e.classical, 3), 'c'], [' x ' + a.w, 'w']), row([' QUANTUM   ', 'w'], [sgn(e.quantum, 3), 'm'], [' x ' + (1 - a.w).toFixed(2), 'w']), blank());
    rows.push(row([' SCORE ', 'w'], [sgn(e.score, 3) + '  ', 'y', null, { dh: 1 }], [' ' + v[0] + ' ', 'k', v[1]]));
    while (rows.length < 22) rows.push(blank());
    rows.push(row([' Local simulation. Not a forecast.', 'm']), fastext());
    return { rows };
  }
  function p103(d) {
    const s = d.snap;
    const rows = [header(103, '1/1'), band('STANDINGS  ' + (s && s.mode === 'live' ? 'LIVE WALLETS' : 'PAPER ROUND'), 'k', 'y'), blank(),
      row([' POS AGENT      EQUITY ETH   RET  TRD', 'c'])];
    if (s) {
      const r = s.agents.map((x) => ({ x, a: AGENTS.find((y) => y.id === x.id) })).sort((p, q) => (q.x.ret ?? -1e9) - (p.x.ret ?? -1e9));
      r.forEach(({ x, a }, i) => {
        rows.push(row([' ' + lpad(i + 1, 2) + '  ', 'w'], [pad(a.name, 8), AC[a.id]], [lpad(x.equity != null ? x.equity.toFixed(4) : '-', 12), 'w'], [lpad(x.ret != null ? sgn(x.ret, 2) + '%' : '-', 8), (x.ret ?? 0) >= 0 ? 'g' : 'r'], [lpad(x.trades ?? 0, 5), 'w']));
        rows.push(row(['     ' + pad(a.style.toUpperCase(), 22), 'b']));
        rows.push(blank());
      });
    }
    while (rows.length < 21) rows.push(blank());
    rows.push(row([s && s.mode === 'live' ? ' Funding-adjusted. Read from chain.' : ' Each agent started with 1.00 ETH.', 'm']), blank(), fastext());
    return { rows };
  }
  function p104(d) {
    const s = d.snap;
    const rows = [header(104, '1/1'), band('TRADE JOURNAL  EVERY FILL STAMPED', 'k', 'c'), blank(), row([' TIME  AGENT   SIDE TOKEN      BLOCK', 'c'])];
    const items = s ? s.journal.slice(0, 16) : [];
    for (const j of items) {
      const a = AGENTS.find((x) => x.id === j.agent);
      const t = new Date(j.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      rows.push(row([' ' + t + ' ', 'w'], [pad(a.name, 8), AC[a.id]], [pad(j.side.toUpperCase(), 5), j.side === 'buy' ? 'g' : 'r'], [pad(j.sym.toUpperCase(), 11), 'y'], [j.hash ? 'tx' : j.block ? String(j.block).slice(-6) : '', 'w', null, j.hash ? { href: Chain.CHAIN.explorer + '/tx/' + j.hash } : j.block ? { href: Chain.CHAIN.explorer + '/block/' + j.block } : null]));
    }
    if (!items.length) rows.push(row([' No fills yet. First scan within 30s.', 'w']));
    while (rows.length < 22) rows.push(blank());
    rows.push(row([' Block numbers link to the explorer.', 'm']), fastext());
    return { rows };
  }
  function p199(d, tick, prog) {
    const n = Math.round(prog * 34);
    return {
      mosaic: [{ text: '4663', color: 'w', row: 4 }],
      rows: [header(199), band('CONNECTING TO MAINNET', 'k', 'w'), blank(), blank(), blank(), blank(), blank(), blank(), blank(), blank(), blank(),
        row([' ROBINHOOD CHAIN  CHAIN ID 4663', 'c', null, { dh: 1 }]), blank(),
        row([' BLOCK ', 'g'], [d.head ? '#' + d.head.number.toLocaleString('en-US') : '...', 'w']),
        row([' AGENTS ', 'g'], ...AGENTS.map((a) => [a.name + ' ', AC[a.id]])), blank(),
        row(['  ', 'w'], ['█'.repeat(n), 'r'], ['░'.repeat(34 - n), 'b']),
        row(['  ' + (prog < 1 ? 'TUNING IN ' + Math.round(prog * 100) + '%' : 'LOCKED - OPENING THE DESK'), 'y']),
        blank(), blank(), blank(), blank(),
        row([' Scroll on, or press OK on the remote', 'm']), fastext()]
    };
  }

  /* ---------- render ---------- */
  function drawMosaic(cv, items, sprites) {
    const W = 80, H = 72; // 2×3 sixels per character cell, 40×24 cells
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    for (const it of items || []) {
      const s = it.scale || 2;
      const chars = String(it.text).split('');
      const width = chars.length * 6 * s - s;
      let x = Math.max(1, Math.floor((W - width) / 2));
      const y = it.row * 3;
      g.fillStyle = C[it.color];
      for (const ch of chars) {
        const gl = F[ch] || F[' '];
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (gl[r][c] === '1') g.fillRect(x + c * s, y + r * s, s, s);
        x += 6 * s;
      }
    }
    if (sprites) {
      AGENTS.forEach((a, i) => {
        const y = 12 + i * 9;
        const px = (xx, yy) => g.fillRect(72 + xx, y + yy, 1, 1);
        g.fillStyle = C[AC[a.id]];
        // tiny 6×6 face: a head with two eyes
        ['011110', '111111', '101101', '111111', '011110', '010010'].forEach((r, yy) => [...r].forEach((b, xx) => { if (b === '1') px(xx, yy); }));
      });
    }
  }
  function renderPage(el, mosaic, page, d, tick, prog) {
    const pg = { 100: p100, 101: p101, 102: p102, 103: p103, 104: p104, 199: p199 }[page](d, tick, prog);
    const html = pg.rows.slice(0, 24).map((segs, i) => {
      let used = 0, dh = false;
      const spans = segs.map(([text, fg, bg, ex]) => {
        let t = text; if (used + t.length > 40) t = t.slice(0, 40 - used); used += t.length;
        if (ex && ex.dh) dh = true;
        const style = `color:${C[fg] || C.w}${bg ? ';background:' + C[bg] : ''}`;
        if (ex && ex.go) return `<button type="button" class="tt-go" data-go="${ex.go}" style="${style}">${esc(t)}</button>`;
        if (ex && ex.href) return `<a href="${ex.href}" target="_blank" rel="noopener" style="${style}">${esc(t)}</a>`;
        return `<span style="${style}">${esc(t)}</span>`;
      }).join('');
      return `<div class="tt-row${dh ? ' dh' : ''}" style="--i:${i}">${spans}${used < 40 ? `<span>${' '.repeat(40 - used)}</span>` : ''}</div>`;
    }).join('');
    el.innerHTML = html;
    drawMosaic(mosaic, pg.mosaic, pg.sprites);
  }

  global.TT = { PAGES, TINT, C, renderPage };
})(window);
