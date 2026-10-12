// Landing page behavior: hero field, terminal, live status, market data, playground, embed preview.
import { copyText, createChat, escapeHtml, flash } from './chat.js';

const config = window.VEKTOR_CONFIG || {};
const API = (config.apiBase || '').replace(/\/$/, '');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Branding and links from config ---------- */
if (config.name) $$('[data-brand]').forEach((el) => { el.textContent = config.name; });
if (config.tokenTicker) $$('[data-ticker]').forEach((el) => { el.textContent = config.tokenTicker; });
for (const [id, url] of [['#f-github', config.githubUrl], ['#f-x', config.xUrl]]) {
  if (url) Object.assign($(id), { href: url, hidden: false });
}

/* ---------- Header and menu ---------- */
const header = $('#header');
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });
$('#menu-btn').addEventListener('click', (e) => {
  const open = document.body.classList.toggle('menu-open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});
$$('.nav a').forEach((a) => a.addEventListener('click', () => {
  document.body.classList.remove('menu-open');
  $('#menu-btn').setAttribute('aria-expanded', 'false');
}));

/* ---------- Reveal on scroll ---------- */
const revealItems = $$('.reveal');
if (reduceMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((el) => el.classList.add('is-visible'));
} else {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    }
  }, { threshold: 0.1 });
  revealItems.forEach((el, i) => { el.style.transitionDelay = `${(i % 5) * 60}ms`; io.observe(el); });
  setTimeout(() => revealItems.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-visible');
  }), 2500);
}

/* ---------- Hero: a flow field of vectors that bends around the pointer ---------- */
(function field() {
  const canvas = $('#field');
  const ctx = canvas.getContext('2d');
  let w, h, dpr, particles, raf;
  const pointer = { x: -9999, y: -9999 };
  const colors = ['139,108,255', '34,211,238', '167,139,250'];

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(900, (w * h) / 2200));
    particles = Array.from({ length: count }, () => spawn({}));
  }
  function spawn(p) {
    p.x = Math.random() * w; p.y = Math.random() * h;
    p.life = 60 + Math.random() * 180; p.c = colors[(Math.random() * colors.length) | 0];
    return p;
  }
  function angle(x, y, t) {
    const s = 0.0016;
    let a = Math.sin(x * s + t) * 1.6 + Math.cos(y * s * 1.3 - t * 0.7) * 1.6;
    const dx = x - pointer.x, dy = y - pointer.y, d2 = dx * dx + dy * dy;
    if (d2 < 40000) a += (1 - d2 / 40000) * 2.4;
    return a;
  }
  function frame(time) {
    const t = time * 0.00012;
    ctx.fillStyle = 'rgba(8, 8, 11, 0.09)';
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1.1;
    for (const p of particles) {
      const a = angle(p.x, p.y, t);
      const nx = p.x + Math.cos(a) * 1.3, ny = p.y + Math.sin(a) * 1.3;
      const alpha = Math.min(1, p.life / 60) * 0.5;
      ctx.strokeStyle = `rgba(${p.c},${alpha})`;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
      p.x = nx; p.y = ny;
      if (--p.life < 0 || nx < 0 || nx > w || ny < 0 || ny > h) spawn(p);
    }
    raf = requestAnimationFrame(frame);
  }
  resize();
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); resize(); if (!reduceMotion) raf = requestAnimationFrame(frame); });
  canvas.parentElement.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
  });
  canvas.parentElement.addEventListener('pointerleave', () => { pointer.x = pointer.y = -9999; });
  if (reduceMotion) { for (let i = 0; i < 120; i++) frame(i * 16); cancelAnimationFrame(raf); }
  else {
    // Pause while the hero is off screen.
    new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      if (e.isIntersecting) raf = requestAnimationFrame(frame);
    }).observe(canvas);
  }
})();

/* ---------- Hero terminal: types a few sample exchanges ---------- */
(function terminal() {
  const el = $('#term');
  const scenes = [
    ['Reverse a string in Python', 'def reverse(s: str) -> str:\n    return s[::-1]', 'A step of -1 walks the string backwards.'],
    ['Debounce in TypeScript', 'function debounce<T extends (...a: any[]) => void>(fn: T, ms: number) {\n  let t: ReturnType<typeof setTimeout>;\n  return (...a: Parameters<T>) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...a), ms);\n  };\n}', 'Calls fire once input has been quiet for ms.'],
    ['Fix: for i in range(10) print(i)', 'for i in range(10):\n    print(i)', 'The loop header was missing a colon.'],
  ];
  if (reduceMotion) {
    const [q, code, note] = scenes[0];
    el.innerHTML = `<span class="t-p">›</span> <span class="t-u">${escapeHtml(q)}</span>\n\n${escapeHtml(code)}\n\n<span class="t-n">${escapeHtml(note)}</span>`;
    return;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    for (let i = 0; ; i = (i + 1) % scenes.length) {
      const [q, code, note] = scenes[i];
      let typed = '';
      for (const ch of q) {
        typed += ch;
        el.innerHTML = `<span class="t-p">›</span> <span class="t-u">${escapeHtml(typed)}</span><span class="caret"></span>`;
        await sleep(38 + Math.random() * 40);
      }
      await sleep(450);
      let out = '';
      for (const ch of code) {
        out += ch;
        el.innerHTML = `<span class="t-p">›</span> <span class="t-u">${escapeHtml(q)}</span>\n\n${escapeHtml(out)}<span class="caret"></span>`;
        await sleep(ch === '\n' ? 60 : 9);
      }
      el.innerHTML = `<span class="t-p">›</span> <span class="t-u">${escapeHtml(q)}</span>\n\n${escapeHtml(code)}\n\n<span class="t-n">${escapeHtml(note)}</span><span class="caret"></span>`;
      await sleep(3200);
    }
  })();
})();

/* ---------- Playground ---------- */
const stats = { count: 0, tokens: 0, ms: 0 };
const chat = createChat($('#chat'), {
  onStats({ tokens, ms }) {
    stats.count += 1; stats.tokens += tokens; stats.ms += ms;
    $('#s-count').textContent = stats.count;
    $('#s-tokens').textContent = stats.tokens.toLocaleString('en');
    $('#s-ms').textContent = `${(stats.ms / stats.count / 1000).toFixed(1)} s`;
  },
});
$$('[data-try]').forEach((card) => card.addEventListener('click', () => {
  chat.setMode(card.dataset.try);
  $('#playground').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  setTimeout(() => chat.focus(), 500);
}));

/* ---------- Live status: health check with latency history ---------- */
const latencies = [];
async function checkHealth() {
  const status = $('#status');
  const t0 = performance.now();
  try {
    const res = await fetch(`${API}/api/health`, { cache: 'no-store' });
    const data = await res.json();
    const ms = Math.round(performance.now() - t0);
    latencies.push(ms);
    if (latencies.length > 24) latencies.shift();
    status.classList.toggle('is-ok', data.ok);
    status.classList.toggle('is-down', !data.ok);
    $('.status-text', status).textContent = data.ok ? 'Online' : 'Setup needed';
    status.title = data.ok ? `Online · ${data.model}` : 'The API key is not set yet';
    $('#l-status').textContent = data.ok ? 'Online' : 'Setup needed';
    $('#l-model').textContent = data.ok ? data.model : 'Add ANTHROPIC_API_KEY in your hosting settings.';
    $('#s-model').textContent = data.model;
    $('#l-latency').textContent = `${ms} ms`;
    const max = Math.max(...latencies, 100);
    $('#l-spark').innerHTML = latencies.map((v) => `<i style="height:${Math.max(8, (v / max) * 100)}%"></i>`).join('');
  } catch {
    status.classList.remove('is-ok');
    status.classList.add('is-down');
    $('.status-text', status).textContent = 'Offline';
    $('#l-status').textContent = 'Offline';
    $('#l-model').textContent = 'The API could not be reached.';
  }
}
checkHealth();
setInterval(() => { if (!document.hidden) checkHealth(); }, 20_000);

/* ---------- Token: contract address and live market data from DEX Screener ---------- */
const usd = (n, digits = 2) => {
  if (n == null || Number.isNaN(n)) return '–';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (abs > 0 && abs < 0.01) return `$${n.toPrecision(3)}`;
  return `$${n.toFixed(digits)}`;
};
const pct = (n) => (n == null ? '–' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);

if (config.tokenAddress) {
  const addr = config.tokenAddress.trim();
  $('#ca-addr').textContent = addr;
  $('#ca-addr').title = addr;
  const copy = $('#ca-copy');
  copy.hidden = false;
  copy.addEventListener('click', async () => flash(copy, (await copyText(addr)) ? 'Copied' : 'Failed'));

  let lastPrice = null;
  async function market() {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(addr)}`);
      const data = await res.json();
      const pairs = (data.pairs || []).filter((p) => p.baseToken?.address?.toLowerCase() === addr.toLowerCase());
      const pair = (pairs.length ? pairs : data.pairs || []).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      if (!pair) {
        $('#m-price').textContent = 'Not trading yet';
        $('#m-sub').textContent = 'No pools found for this address on DEX Screener yet.';
        return;
      }
      const price = Number(pair.priceUsd);
      const priceEl = $('#m-price');
      priceEl.textContent = usd(price, price < 1 ? 4 : 2);
      if (lastPrice != null && price !== lastPrice) {
        priceEl.classList.remove('flash-up', 'flash-down');
        void priceEl.offsetWidth;
        priceEl.classList.add(price > lastPrice ? 'flash-up' : 'flash-down');
      }
      lastPrice = price;
      $('#m-sub').textContent = `${pair.baseToken.name} on ${pair.dexId} · ${pair.chainId}`;
      $('#m-mcap').textContent = usd(pair.marketCap ?? pair.fdv);
      $('#m-liq').textContent = usd(pair.liquidity?.usd);
      $('#m-vol').textContent = usd(pair.volume?.h24);
      const tx = pair.txns?.h24;
      $('#m-tx').textContent = tx ? (tx.buys + tx.sells).toLocaleString('en') : '–';
      const ch = pair.priceChange || {};
      $('#m-changes').innerHTML = [['5m', ch.m5], ['1h', ch.h1], ['6h', ch.h6], ['24h', ch.h24]]
        .map(([k, v]) => `<div><span>${k}</span><b class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${pct(v)}</b></div>`).join('');
      Object.assign($('#m-link'), { href: pair.url, hidden: false });
    } catch {
      $('#m-sub').textContent = 'Market data is unavailable right now. Retrying…';
    }
  }
  market();
  setInterval(() => { if (!document.hidden) market(); }, 15_000);
}

/* ---------- Embed and API snippets ---------- */
const origin = API || location.origin;
$('#embed-code').innerHTML = escapeHtml(`<!-- Vektor assistant -->
<script
  src="${origin}/embed.js"
  data-mode="code"
  data-accent="#8b6cff"
  data-position="right"
  async
></script>`);
$('#api-code').innerHTML = escapeHtml(`curl -N ${origin}/api/chat \\
  -H "content-type: application/json" \\
  -d '{
    "mode": "code",
    "messages": [
      { "role": "user", "content": "Reverse a string in Go" }
    ]
  }'

# data: {"type":"thinking","text":"…"}
# data: {"type":"text","text":"\`\`\`go\\nfunc reverse…"}
# data: {"type":"done","usage":{"input":96,"output":142}}`);
if (window.hljs) {
  window.hljs.highlightElement($('#embed-code'));
} else {
  window.addEventListener('load', () => window.hljs?.highlightElement($('#embed-code')));
}
$$('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
  flash(btn, (await copyText($(btn.dataset.copy).textContent)) ? 'Copied' : 'Failed');
}));

$('#embed-try').addEventListener('click', (e) => {
  if (window.VektorEmbed) { window.VektorEmbed.open(); return; }
  const s = document.createElement('script');
  s.src = '/embed.js';
  s.dataset.mode = 'code';
  s.dataset.open = 'true';
  document.body.append(s);
  e.currentTarget.textContent = 'Look bottom right ↘';
});
