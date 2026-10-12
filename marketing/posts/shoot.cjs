// Exports each post as a 2160x2160 PNG.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 2 });
  await p.goto('file://' + __dirname + '/posts.html');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);
  const names = { p1: 'vestas-dev-supply-burnt', p2: 'vestas-dex-paid', p3: 'vestas-ca-on-web' };
  for (const [id, name] of Object.entries(names)) await p.locator('#' + id).screenshot({ path: `${__dirname}/../out/${name}.png` });
  await b.close();
})();
