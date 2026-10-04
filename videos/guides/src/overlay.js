// Injected into the page before the app loads: demo wallet, cursor, captions,
// intro/end cards. Overlays use popovers so they sit above the app's <dialog>.
(() => {
  const DEMO = '0x7a3c5b19e2d4f6a8b0c1d2e3f4a5b6c7d8e9f0a1';
  const listeners = {};
  window.ethereum = {
    isDemo: true,
    on: (e, f) => { (listeners[e] ??= []).push(f); },
    removeListener() {},
    request: async ({ method }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [DEMO];
      if (method === 'eth_chainId') return '0x1237';
      throw Object.assign(new Error('Demo wallet: request not sent'), { code: 4001 });
    },
  };

  const css = `
  .gx{position:fixed;inset:auto;margin:0;border:0;padding:0;background:none;overflow:visible;font-family:nbarchitekt,Architekt,monospace;color:#edf3f0}
  #gx-cursor{left:0;top:0;width:28px;height:28px;transition:transform var(--d,700ms) cubic-bezier(.45,.05,.2,1);pointer-events:none}
  #gx-cursor svg{filter:drop-shadow(0 3px 8px #000a)}
  #gx-cursor i{position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;border:3px solid #c8f7dc;opacity:0;transform:scale(.3)}
  #gx-cursor.click i{animation:gxr .55s ease-out}
  @keyframes gxr{0%{opacity:1;transform:scale(.3)}100%{opacity:0;transform:scale(1.6)}}
  #gx-cap{left:50%;bottom:30px;transform:translateX(-50%);display:flex;align-items:center;gap:22px;background:#0b1418ee;border:1px solid #c8f7dc55;border-radius:22px;padding:15px 24px;max-width:1000px;box-shadow:0 20px 60px #000c;transition:opacity .35s}
  #gx-cap b{font-weight:normal;background:#c8f7dc;color:#0e211a;border-radius:12px;padding:8px 14px;font-size:17px;letter-spacing:.08em;white-space:nowrap}
  #gx-cap span{font-size:23px;line-height:1.3}
  #gx-tag{right:22px;top:18px;font-size:12px;letter-spacing:.14em;color:#c8f7dc;border:1px solid #c8f7dc66;border-radius:999px;padding:8px 16px;background:#0b1418cc}
  #gx-card{left:0;top:0;width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
    background:radial-gradient(ellipse at 50% 40%,#1d1636 0%,#07060d 65%,#000 100%);transition:opacity .6s}
  #gx-card img{width:180px;height:180px;border-radius:50%;-webkit-mask-image:radial-gradient(circle,#000 58%,transparent 71%)}
  #gx-card .k{margin-top:20px;font-size:18px;letter-spacing:.22em;color:#c4b0ed;text-transform:uppercase}
  #gx-card .t{margin-top:14px;font-size:64px;text-transform:uppercase;letter-spacing:.04em;max-width:1250px;line-height:1.05}
  #gx-card .s{margin-top:18px;font-size:25px;color:#b9b4cc;max-width:1000px;line-height:1.35}
  #gx-card .u{margin-top:30px;font-size:60px;padding:14px 40px;border:3px solid #c4b0ed;border-radius:20px;box-shadow:0 0 40px #c4b0ed88;letter-spacing:.06em;text-transform:uppercase}
  .gx-hl{outline:3px solid #c8f7dc!important;outline-offset:6px!important;border-radius:12px;transition:outline-color .3s}
  `;
  const mk = (id, html) => { const e = document.createElement('div'); e.id = id; e.className = 'gx'; e.popover = 'manual'; e.innerHTML = html; return e; };
  addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const card = mk('gx-card', ''), tag = mk('gx-tag', 'DEMO ACCOUNT'), cap = mk('gx-cap', '<b></b><span></span>');
    const cur = mk('gx-cursor', '<i></i><svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6L9.6 20z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>');
    document.body.append(card, tag, cap, cur);
    cap.style.opacity = 0;
    cur.style.transform = 'translate(1125px,525px)';
    window.GX = {
      raise() { for (const e of [tag, cap, cur, card]) if (e.matches(':popover-open')) { e.hidePopover(); e.showPopover(); } },
      show() { for (const e of [tag, cap, cur]) e.showPopover(); },
      card(html) { card.innerHTML = html; card.style.opacity = 1; card.showPopover(); GX.raise(); },
      hideCard() { card.style.opacity = 0; setTimeout(() => card.hidePopover(), 650); },
      caption(step, text) { cap.style.opacity = 0; setTimeout(() => { cap.querySelector('b').textContent = step; cap.querySelector('span').textContent = text; cap.style.opacity = text ? 1 : 0; }, 300); },
      move(x, y, d) { cur.style.setProperty('--d', d + 'ms'); cur.style.transform = `translate(${x}px,${y}px)`; },
      click() { cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); },
      hl(el, on) { el?.classList.toggle('gx-hl', on); },
    };
    if (window.GX_INTRO) GX.card(window.GX_INTRO);
  });
})();
