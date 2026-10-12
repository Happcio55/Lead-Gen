// Screenshots of the live site that the promo videos are built from.
// node marketing/capture.cjs [baseUrl]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const BASE = process.argv[2] || 'https://kairo-0w1e.onrender.com';
const OUT = __dirname + '/shots/';
const CA = process.env.CA || '0x020bfc650a365f8bb26819deaabf3e21291018b4'; // a trending token with an active chart
// A public wallet with a mixed portfolio; its address is masked in every shot.
const WALLET = '0xb80d90fcf2ed0e4febe02d2a209109bf1f62df95';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  // Read-only wallet so the swap card and portfolio render as they do for a connected user.
  await p.addInitScript(addr => {
    window.ethereum = { request: async ({ method }) => ['eth_requestAccounts', 'eth_accounts'].includes(method) ? [addr] : method === 'eth_chainId' ? '0x1237' : method === 'eth_getBalance' ? '0x6f05b59d3b20000' : null, on() {}, removeListener() {} };
  }, WALLET);
  await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await sleep(9000);
  await p.evaluate(() => document.querySelectorAll('.rv').forEach(e => e.classList.add('in')));
  await p.screenshot({ path: OUT + 'hero.png' });

  const shotSection = async (sel, name) => {
    await p.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
    await sleep(1500);
    await p.locator(sel).screenshot({ path: OUT + name + '.png' });
  };
  for (const [sel, name] of [['#feed', 'feed'], ['#score', 'score'], ['#route', 'route'], ['#wallet', 'wallet'], ['#stocks', 'stocks']]) {
    await shotSection(sel, name).catch(e => console.log('skip', name, e.message));
  }
  await p.evaluate(() => scrollTo(0, 0)); await sleep(800);

  // Paste a CA -> report with live chart
  await p.fill('#heroCa', CA); await sleep(300);
  await p.locator('#heroCheck').screenshot({ path: OUT + 'search.png' });
  await p.screenshot({ path: OUT + 'hero-ca.png' });
  await p.locator('#heroCheck button').click();
  for (let i = 0; i < 45; i++) { await sleep(1000); if (await p.evaluate(() => /trade|buy|sell/i.test(document.querySelector('#report')?.innerText || '') && document.querySelectorAll('#report canvas').length > 0)) break; }
  await sleep(15000);
  await p.mouse.move(5, 5); await sleep(400);
  await p.screenshot({ path: OUT + 'report.png' });
  await p.locator('#report .sheet').screenshot({ path: OUT + 'report-sheet.png' }).catch(() => {});
  await p.evaluate(() => { const s = document.querySelector('#report .sheet'); if (s) s.scrollTop = s.scrollHeight * 0.45; });
  await sleep(800);
  await p.screenshot({ path: OUT + 'report-flags.png' });
  await p.keyboard.press('Escape'); await sleep(600);

  // Connect + swap card
  await p.click('#navConnect').catch(() => {}); await sleep(2500);
  // Show a generic address instead of the real one behind the mock wallet.
  const mask = () => p.evaluate(() => { for (const el of document.querySelectorAll('*')) if (el.children.length === 0 && /0xb80d/i.test(el.textContent)) el.textContent = el.textContent.replace(/0x[0-9a-fA-F…\.]+/g, '0x7a3f…c91e'); });
  await mask();
  await p.fill('#payAmt', '0.05'); await p.dispatchEvent('#payAmt', 'input');
  await sleep(9000); await mask();
  await p.screenshot({ path: OUT + 'swap-hero.png' });
  await p.locator('.swap, .swapcard, #swGo >> xpath=ancestor::*[contains(@class,"sw")][last()]').first().screenshot({ path: OUT + 'swap.png' }).catch(e => console.log('swap card', e.message));

  await p.click('#paySel'); await sleep(2000);
  await p.screenshot({ path: OUT + 'picker.png' });
  await p.keyboard.press('Escape'); await sleep(500);

  await p.click('.navlinks .navport').catch(e => console.log('portfolio', e.message));
  await sleep(9000); await mask();
  await p.screenshot({ path: OUT + 'portfolio.png' });
  console.log('swap button:', await p.textContent('#swGo'), '| route:', await p.textContent('#dRoute'));
  console.log('errors', errs);
  await b.close();
})();
