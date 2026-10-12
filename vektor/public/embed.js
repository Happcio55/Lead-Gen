// Vektor embed. Add to any page:
//   <script src="https://YOUR-VEKTOR-SITE/embed.js" data-mode="code" data-accent="#8b6cff" async></script>
// Options (data attributes): mode, accent, position ("right" | "left"), target (CSS selector to render
// inline instead of a floating launcher), open ("true" to start opened).
(function () {
  if (window.VektorEmbed) return;
  var script = document.currentScript || document.querySelector('script[src*="embed.js"]');
  var base = new URL(script.src, location.href).origin;
  var d = script.dataset || {};
  var accent = /^#[0-9a-f]{3,8}$/i.test(d.accent || '') ? d.accent : '#8b6cff';
  var params = new URLSearchParams({ mode: d.mode || 'code', accent: accent, host: location.hostname });
  var src = base + '/widget?' + params.toString();

  function frame(style) {
    var f = document.createElement('iframe');
    f.src = src;
    f.title = 'Vektor code assistant';
    f.allow = 'clipboard-write';
    f.setAttribute('loading', 'lazy');
    f.style.cssText = 'border:0;color-scheme:dark;background:#0d0d12;' + style;
    return f;
  }

  if (d.target) {
    var host = document.querySelector(d.target);
    if (host) host.appendChild(frame('width:100%;height:' + (d.height || '620px') + ';border-radius:20px;'));
    window.VektorEmbed = { open: function () {}, close: function () {} };
    return;
  }

  var left = d.position === 'left';
  var side = left ? 'left:20px;' : 'right:20px;';
  var root = document.createElement('div');
  root.style.cssText = 'position:fixed;bottom:20px;' + side + 'z-index:2147483000;font-family:system-ui,sans-serif;';

  var panel = frame('position:absolute;bottom:72px;' + (left ? 'left:0;' : 'right:0;') +
    'width:min(400px,calc(100vw - 40px));height:min(620px,calc(100vh - 120px));border-radius:20px;' +
    'box-shadow:0 30px 80px -20px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1);' +
    'opacity:0;transform:translateY(12px) scale(.98);transform-origin:bottom ' + (left ? 'left' : 'right') + ';' +
    'transition:opacity .25s,transform .3s cubic-bezier(.22,1,.36,1);pointer-events:none;');
  panel.removeAttribute('loading');

  var button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Open the Vektor code assistant');
  button.setAttribute('aria-expanded', 'false');
  button.style.cssText = 'width:56px;height:56px;border:0;border-radius:18px;cursor:pointer;display:grid;place-items:center;' +
    'background:' + accent + ';color:#fff;box-shadow:0 12px 30px -8px ' + accent + ',0 0 0 1px rgba(255,255,255,.2) inset;' +
    'transition:transform .2s;';
  var iconOpen = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9l-4 3 4 3M16 9l4 3-4 3M13.5 6l-3 12"/></svg>';
  var iconClose = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  button.innerHTML = iconOpen;
  button.onmouseenter = function () { button.style.transform = 'scale(1.06)'; };
  button.onmouseleave = function () { button.style.transform = ''; };

  var isOpen = false;
  function set(open) {
    isOpen = open;
    panel.style.opacity = open ? '1' : '0';
    panel.style.transform = open ? 'none' : 'translateY(12px) scale(.98)';
    panel.style.pointerEvents = open ? 'auto' : 'none';
    button.innerHTML = open ? iconClose : iconOpen;
    button.setAttribute('aria-expanded', String(open));
    if (open) panel.contentWindow && panel.contentWindow.postMessage({ vektor: 'focus' }, base);
  }
  button.addEventListener('click', function () { set(!isOpen); });
  window.addEventListener('message', function (e) {
    if (e.origin === base && e.data && e.data.vektor === 'close') set(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) set(false); });

  root.appendChild(panel);
  root.appendChild(button);
  (document.body || document.documentElement).appendChild(root);
  window.VektorEmbed = { open: function () { set(true); }, close: function () { set(false); } };
  if (d.open === 'true') setTimeout(function () { set(true); }, 300);
})();
