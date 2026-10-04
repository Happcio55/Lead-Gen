// Renders the Luma perk videos: 1920x1080, 30 fps, H.264, no audio.
// Usage: node render.js [slug ...]   (no args = all videos)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const FPS = 30;
const OUT = path.join(__dirname, '..');
const VIDEOS = [
  { file: '01-round-ups', kind: 'perk', slug: 'roundups', dur: 10 },
  { file: '02-stock-mix', kind: 'perk', slug: 'mix', dur: 10 },
  { file: '03-auto-invest', kind: 'perk', slug: 'auto', dur: 10 },
  { file: '04-stock-universe', kind: 'perk', slug: 'stocks', dur: 10 },
  { file: '05-your-wallet', kind: 'perk', slug: 'wallet', dur: 10 },
  { file: '06-my-portfolio', kind: 'perk', slug: 'portfolio', dur: 10 },
  { file: '07-your-rules', kind: 'perk', slug: 'rules', dur: 10 },
  { file: '08-privacy-check', kind: 'perk', slug: 'privacy', dur: 10 },
  { file: '09-after-hours', kind: 'perk', slug: 'afterhours', dur: 10 },
  { file: '10-all-perks', kind: 'recap', dur: 13 },
];

(async () => {
  const only = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [i, v] of VIDEOS.entries()) {
    if (only.length && !only.includes(v.slug || v.kind)) continue;
    await page.goto('file://' + path.join(__dirname, 'template.html'));
    await page.evaluate(c => window.setup(c), { ...v, seed: i + 3 });
    const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS),
      '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', path.join(OUT, v.file + '.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise(r => ff.on('close', r));
    for (let f = 0; f < v.dur * FPS; f++) {
      await page.evaluate(t => window.render(t), f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await done;
    console.log('rendered', v.file);
  }
  await browser.close();
})();
