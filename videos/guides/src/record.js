// Records the Luma how-to videos: 1920x1080, no audio.
// Usage: SITE=/path/to/local/site node record.js [number ...]
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('./demo-server.js');

const BASE = 'http://localhost:' + (process.env.PORT || 8765);
const OUT = path.join(__dirname, '..');
const TMP = path.join(OUT, '.raw');
const overlay = fs.readFileSync(path.join(__dirname, 'overlay.js'), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));

const intro = (n, title, sub) => `<img src="favicon.png"><div class="k">How to use Luma · ${String(n).padStart(2, '0')} / 10</div><div class="t">${title}</div><div class="s">${sub}</div>`;
const outro = `<img src="favicon.png"><div class="k">From payments to stocks</div><div class="t">Try it yourself</div><div class="u">tryluma.trade</div><div class="s" style="font-size:18px;letter-spacing:.14em;text-transform:uppercase">X / @trylumarh</div>`;

function helpers(page) {
  let pos = { x: 1125, y: 525 };
  const h = {
    async caption(step, text) { await page.evaluate(([s, t]) => GX.caption(s, t), [step, text]); await wait(400); },
    async raise() { await page.evaluate(() => GX.raise()); },
    async move(sel, opt = {}) {
      const el = page.locator(sel).first();
      await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox();
      const x = b.x + (opt.dx ?? Math.min(b.width / 2, 120)), y = b.y + b.height / 2;
      const d = Math.max(450, Math.min(1100, Math.hypot(x - pos.x, y - pos.y) * 0.9));
      await page.evaluate(([x, y, d]) => GX.move(x, y, d), [x, y, d]);
      pos = { x, y };
      await wait(d + 150);
      return el;
    },
    async click(sel, opt) {
      const el = await h.move(sel, opt);
      await page.evaluate(() => GX.click());
      await wait(220);
      await el.click();
      await wait(350);
      await h.raise();
    },
    async type(sel, text, opt) {
      const el = await h.move(sel, opt);
      await page.evaluate(() => GX.click());
      await el.click();
      await el.fill('');
      await el.pressSequentially(text, { delay: 90 });
      await wait(300);
    },
    async select(sel, value) {
      const el = await h.move(sel);
      await page.evaluate(() => GX.click());
      await wait(250);
      await el.selectOption(value);
      await wait(500);
    },
    async highlight(sel, ms = 1600) {
      await h.move(sel);
      await page.locator(sel).first().evaluate(e => GX.hl(e, true));
      await wait(ms);
      await page.locator(sel).first().evaluate(e => GX.hl(e, false));
    },
    async scroll(y) { await page.evaluate(y => document.getElementById('workspace').scrollTo({ top: y, behavior: 'smooth' }), y); await wait(900); },
    async go(label) { await h.click(`#app-nav button:has-text("${label}")`); await wait(900); },
  };
  return h;
}

async function connect(h) {
  await h.caption('Step 1', 'Click “Connect wallet” and approve in your browser wallet (MetaMask, Rabby…).');
  await h.click('#wallet-top');
  await wait(1500);
}

const VIDEOS = [
  { file: '01-connect-your-wallet', title: 'Connect your wallet', sub: 'Open the app and connect a browser wallet on Robinhood Chain.',
    async run(h) {
      await h.caption('Start', 'Go to tryluma.trade and open the app. You land on the Overview.');
      await wait(2200);
      await h.highlight('.card:has-text("Your live account")', 1800);
      await connect(h);
      await h.caption('Step 2', 'Luma now reads your real USDG balance, round-up pool and stock holdings.');
      await h.highlight('.stats', 2600);
      await h.caption('Step 3', 'Use Robinhood Chain (4663) — Luma asks your wallet to switch network if needed.');
      await h.highlight('.card:has-text("Protocol status")', 2600);
      await h.caption('Tip', 'No wallet yet? Paste any public address under “View address” to look around read-only.');
      await wait(2800);
    } },
  { file: '02-fund-your-wallet', title: 'Fund your wallet', sub: 'Get USDG on Robinhood Chain into your own wallet.',
    async run(h) {
      await connect(h);
      await h.caption('Step 2', 'Open “Wallet” in the menu.');
      await h.go('Wallet');
      await h.caption('Step 3', 'Under “Receive USDG” you see your own address — Luma never holds your funds.');
      await h.highlight('.card:has-text("Receive USDG")', 2400);
      await h.caption('Step 4', 'Click “Copy receiving address” and send USDG on Robinhood Chain to it.');
      await h.click('button:has-text("Copy receiving address")');
      await wait(1600);
      await h.caption('Step 5', 'Keep a little ETH for gas. The funding guide link shows how to bridge.');
      await h.highlight('a:has-text("funding guide")', 2400);
    } },
  { file: '03-link-your-spending-wallet', title: 'Link your spending wallet', sub: 'Tell the protocol which wallet your round-ups come from.', state: 'nolink',
    async run(h) {
      await connect(h);
      await h.caption('Step 2', 'Go to “Wallet” and find “Linked spending wallets”.');
      await h.go('Wallet');
      await h.highlight('.card:has-text("Linked spending wallets")', 1800);
      await h.caption('Step 3', 'Click “Link this wallet”.');
      await h.click('button:has-text("Link this wallet")');
      await h.caption('Step 4', 'Review the transaction, then click “Continue to wallet” and confirm.');
      await h.highlight('#modal h2', 1800);
      await h.move('#submit-transaction'); await wait(1800);
      await h.click('#cancel-transaction');
      await h.caption('Tip', 'Paying from another wallet? Use “Sign link permission” — up to 8 wallets per account.');
      await h.scroll(10000);
      await h.highlight('.card:has-text("Link another spending wallet")', 2600);
    } },
  { file: '04-set-your-round-up-rules', title: 'Set your round-up rules', sub: 'Choose how much spare change goes into stocks.',
    async run(h) {
      await connect(h);
      await h.caption('Step 2', 'Open “Round-up rules”.');
      await h.go('Round-up rules');
      await h.caption('Step 3', 'Pick what to round up to — the next $1, $5 or $10.');
      await h.select('select[name=roundTo]', '5');
      await h.caption('Step 4', 'Set a multiplier to invest 1× to 5× the round-up.');
      await h.select('select[name=multiplier]', '2');
      await h.caption('Step 5', 'Set a weekly cap so you never invest more than you want.');
      await h.type('input[name=cap]', '25');
      await h.caption('Step 6', 'Make sure “Enable new round-ups” is on, then click “Review and save on-chain”.');
      await h.highlight('.toggle-row', 1400);
      await h.click('#rule-form button.primary');
      await h.caption('Step 7', 'Check the summary and confirm in your wallet.');
      await h.highlight('#modal h2', 2200);
      await h.move('#submit-transaction'); await wait(1500);
      await h.click('#cancel-transaction');
    } },
  { file: '05-authorize-round-ups', title: 'Authorize round-ups', sub: 'Give Spare a limited, time-boxed permission to collect.',
    async run(h) {
      await connect(h);
      await h.caption('Step 2', 'Go to “Wallet” → “Round-up authorization”.');
      await h.go('Wallet');
      await h.highlight('.card:has-text("Round-up authorization")', 2000);
      await h.caption('Step 3', 'Enter the total USDG Spare may collect.');
      await h.type('#approval-form input[name=amount]', '50');
      await h.caption('Step 4', 'Choose how long the permission lasts: 1, 7 or 30 days.');
      await h.select('#approval-form select[name=days]', '30');
      await h.caption('Step 5', 'Click “Review authorization” — two wallet confirmations follow.');
      await h.click('#approval-form button.primary');
      await h.highlight('#modal h2', 2000);
      await h.move('#submit-transaction'); await wait(1400);
      await h.click('#cancel-transaction');
      await h.caption('Tip', 'You can revoke any time with “Revoke collection permission”.');
      await h.highlight('button:has-text("Revoke collection permission")', 2400);
    } },
  { file: '06-choose-your-stock-mix', title: 'Choose your stock mix', sub: 'Pick up to 6 stocks — weights must total exactly 100%.',
    async run(h) {
      await connect(h);
      await h.caption('Step 2', 'Open “Stock mix”. The protocol default is SPY 60% / NVDA 40%.');
      await h.go('Stock mix');
      await h.highlight('#mix-form', 1600);
      await h.caption('Step 3', 'Pick a stock under “Add an asset” and click “Add asset”.');
      await h.select('#add-mix', 'AAPL');
      await h.click('button:has-text("Add asset")');
      await h.caption('Step 4', 'Set the weights — the total must be exactly 100%.');
      await h.type('input[data-symbol=SPY]', '50', { dx: 60 });
      await h.type('input[data-symbol=NVDA]', '30', { dx: 60 });
      await h.type('input[data-symbol=AAPL]', '20', { dx: 60 });
      await h.highlight('.allocation-total', 1600);
      await h.caption('Step 5', 'Click “Review and save stock mix” and confirm in your wallet.');
      await h.click('#mix-form button.primary');
      await h.highlight('#modal h2', 2000);
      await h.click('#cancel-transaction');
    } },
  { file: '07-explore-the-stock-universe', title: 'Explore the stock universe', sub: 'Browse every stock and fund you can invest in.',
    async run(h) {
      await h.caption('Step 1', 'Open “Stock universe” — no wallet needed to browse.');
      await h.go('Stock universe');
      await h.highlight('.stock-grid', 1800);
      await h.caption('Step 2', 'Search by ticker or name.');
      await h.type('#stock-search', 'NVDA');
      await h.page.keyboard.press('Enter'); await wait(1200);
      await h.caption('Step 3', 'See price, oracle status and whether it is active right now.');
      await h.highlight('.stock-card', 2200);
      await h.caption('Step 4', 'Click “Check sweep quote” to see a live $5 quote.');
      await h.click('.stock-card button:has-text("Check sweep quote")');
      await wait(1800);
      await h.click('#modal-close');
      await h.caption('Step 5', 'Filter between ACTIVE, STANDBY and ALL assets.');
      await h.type('#stock-search', ' '); await h.page.keyboard.press('Backspace'); await h.page.keyboard.press('Enter'); await wait(500);
      await h.click('[data-filter=all]'); await wait(1600);
    } },
  { file: '08-make-a-payment', title: 'Make a payment', sub: 'Pay with USDG — the round-up is invested for you.',
    async run(h) {
      await connect(h);
      await h.caption('Step 2', 'On the Overview, find “Send a payment”.');
      await h.highlight('.card:has-text("Send a payment")', 1600);
      await h.caption('Step 3', 'Enter the recipient’s wallet address.');
      await h.type('#payment-form input[name=recipient]', '0x5f1c0a8e3b7d2c9a4e6f8b1d3c5e7a9b2d4f6e80');
      await h.caption('Step 4', 'Enter the amount — e.g. 4.35 USDG. Rounded up to 5.00, $0.65 gets invested.');
      await h.type('#payment-form input[name=amount]', '4.35');
      await wait(1000);
      await h.caption('Step 5', 'Click “Review USDG payment” and confirm in your wallet.');
      await h.click('#payment-form button.primary');
      await h.highlight('#modal h2', 2000);
      await h.click('#cancel-transaction');
      await h.caption('Done', 'After chain finality, the Spare keeper collects your round-up automatically.');
      await wait(2600);
    } },
  { file: '09-auto-invest-and-portfolio', title: 'Auto-invest & portfolio', sub: 'Watch your pool fill up and your stock tokens arrive.',
    async run(h) {
      await connect(h);
      await h.caption('Step 2', 'Open “Auto-invest” to see the keeper, market and fee status.');
      await h.go('Auto-invest');
      await h.highlight('.card:has-text("Keeper and market status")', 2000);
      await h.caption('Step 3', 'Your pool is invested automatically once it reaches the $5 threshold.');
      await h.scroll(10000);
      await h.highlight('.card:has-text("Your next sweep")', 2400);
      await h.caption('Step 4', 'Open “Portfolio” to see the stock tokens in your own wallet.');
      await h.go('Portfolio');
      await h.scroll(400);
      await h.highlight('.card:has-text("Stock tokens in your account")', 2600);
    } },
  { file: '10-activity-and-privacy', title: 'Activity & privacy', sub: 'See every on-chain event — and stay in control.',
    async run(h) {
      await connect(h);
      await h.caption('Step 2', 'Open “Activity” and click “Load on-chain events”.');
      await h.go('Activity');
      await h.click('button:has-text("Load on-chain events")');
      await h.caption('Step 3', 'Every round-up, sweep and delivery — with a transaction link.');
      await h.highlight('.card:has-text("Account activity")', 2600);
      await h.caption('Step 4', 'Open “Privacy”: Luma holds no keys and stores no account database.');
      await h.go('Privacy');
      await h.highlight('.card:has-text("Data providers")', 2600);
      await h.caption('Step 5', 'Want to stop? “Wallet” → “Revoke collection permission” any time.');
      await h.go('Wallet');
      await h.click('button:has-text("Revoke collection permission")');
      await wait(1400);
      await h.click('#cancel-transaction');
    } },
];

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const only = process.argv.slice(2).map(Number);
  const browser = await chromium.launch();
  for (const [i, v] of VIDEOS.entries()) {
    if (only.length && !only.includes(i + 1)) continue;
    await fetch(BASE + '/demo/state?s=' + (v.state || 'setup'));
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, recordVideo: { dir: TMP, size: { width: 1440, height: 810 } }, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.addInitScript(`window.GX_INTRO=${JSON.stringify(intro(i + 1, v.title, v.sub))};` + overlay);
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(BASE + '/#app/overview');
    await page.waitForFunction(() => window.GX && document.querySelector('#workspace .page-head'));
    await wait(3200);
    await page.evaluate(() => { GX.hideCard(); GX.show(); });
    await wait(900);
    const h = helpers(page); h.page = page;
    await v.run(h);
    await h.caption('', '');
    await page.evaluate(html => GX.card(html), outro);
    await wait(4200);
    const raw = await page.video().path();
    await ctx.close();
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-an', '-vf', 'fps=30,scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, v.file + '.mp4')]);
    fs.unlinkSync(raw);
    console.log('recorded', v.file, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(0);
})();
