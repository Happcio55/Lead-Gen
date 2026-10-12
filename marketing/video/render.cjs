// Renders comp.html frame by frame and encodes it with the soundtrack.
// node render.cjs intro|howto [--stills t1,t2,...]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const VID = process.argv[2] || 'intro';
const stills = (process.argv.find(a => a.startsWith('--stills=')) || '').slice(9);
const OUT = path.join(__dirname, '..', 'out');
const FPS = 30;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => console.error('pageerror', e.message));
  await p.goto('file://' + path.join(__dirname, 'comp.html') + '?v=' + VID);
  await p.evaluate(() => window.ready);
  await p.waitForTimeout(500);
  const dur = await p.evaluate(() => window.DURATION);
  if (stills) {
    for (const t of stills.split(',').map(Number)) {
      await p.evaluate(t => seek(t), t);
      await p.screenshot({ path: `${OUT}/${VID}-still-${t}.jpg`, type: 'jpeg', quality: 85 });
    }
    await b.close();
    return;
  }
  const frames = Math.round(dur * FPS);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-i', `${OUT}/${VID}.wav`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', `${OUT}/kairo-${VID}.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await p.evaluate(t => seek(t), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`${VID} frame ${i}/${frames} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await b.close();
  console.log('done', `${OUT}/kairo-${VID}.mp4`);
})();
