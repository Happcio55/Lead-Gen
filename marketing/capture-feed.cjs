// Feed section on the Trending and Top rated tabs.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const BASE = process.argv[2] || 'https://kairo-0w1e.onrender.com';
const OUT = __dirname + '/shots/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await sleep(8000);
  await p.evaluate(() => document.querySelectorAll('.rv').forEach(e => e.classList.add('in')));
  await p.evaluate(() => document.querySelector('#feed').scrollIntoView({ block: 'center' }));
  for (const [tab, name] of [['Trending', 'feed-trending'], ['Top rated', 'feed-top']]) {
    await p.locator('#feed button', { hasText: tab }).first().click();
    await sleep(5000);
    await p.mouse.move(5, 5);
    await p.locator('#feed').screenshot({ path: OUT + name + '.png' });
    console.log(name, (await p.locator('#feedRows').innerText()).split('\n').filter((l, i) => i % 6 === 0).slice(0, 10).join(' | '));
  }
  await b.close();
})();
