// Render post images and 16:9 videos for the Parabol² mainnet teaser.
//
//   node render.cjs images      -> ../images/post-XX.png (1920x1080)
//   node render.cjs videos      -> ../videos/*.mp4 (1920x1080, 30 fps, silent)
//
// Needs Playwright (Chromium) and ffmpeg. Video 2 and 3 are recorded live on useparabol.com.

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { chromium } = require(process.env.PW || "playwright");
const { posts, ROAD } = require("./scenes.cjs");

const ROOT = path.resolve(__dirname, "..");
const STUDIO = "file://" + path.join(__dirname, "studio.html");
const SITE = "https://useparabol.com/";
const FPS = 30;
const VIEW = { width: 1920, height: 1080 };

const ease = x => { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

async function studioPage(browser) {
  const page = await browser.newPage({ viewport: VIEW });
  await page.goto(STUDIO, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function renderImages(browser) {
  const out = path.join(ROOT, "images");
  fs.mkdirSync(out, { recursive: true });
  const page = await studioPage(browser);
  for (const p of posts) {
    const still = Object.assign({}, p, { heads: null });
    await page.evaluate(s => { setScene(s); setT(99); }, still);
    await page.screenshot({ path: path.join(out, `post-${p.id}.png`) });
    console.log("image", p.id);
  }
  await page.close();
}

// Captures `frames` frames into dir, calling step(i) before each.
async function capture(page, dir, start, frames, step) {
  for (let i = 0; i < frames; i++) {
    await step(i);
    await page.screenshot({ path: path.join(dir, String(start + i).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 92 });
  }
  return start + frames;
}

async function studioClip(browser, dir, start, scene, seconds) {
  const page = await studioPage(browser);
  await page.evaluate(s => setScene(s), scene);
  const n = await capture(page, dir, start, Math.round(seconds * FPS), i => page.evaluate(t => setT(t), i / FPS));
  await page.close();
  return n;
}

// Overlay injected on the live site: a site-styled caption card plus "mainnet coming soon" pill.
const OVERLAY_CSS = `
  html { scroll-behavior: auto !important; }
  #pp-ov { position: fixed; left: 0; right: 0; bottom: 0; height: 76px; z-index: 99999; background: #121826; color: #f7f8f6;
           display: flex; align-items: center; gap: 22px; padding: 0 36px; box-sizing: border-box; }
  #pp-ov .p { display: inline-flex; gap: 9px; align-items: center; background: #d6362b; color: #fff; white-space: nowrap;
              font: 500 12px/1 "IBM Plex Mono", monospace; letter-spacing: .12em; padding: 8px 11px; text-transform: uppercase; }
  #pp-ov .p i { width: 7px; height: 7px; border-radius: 50%; background: #fff; display: block; }
  #pp-ov .c { font: 850 28px/1 "Archivo", sans-serif; font-stretch: 118%; letter-spacing: -.02em; white-space: nowrap; }
  #pp-ov .c span { color: #ff6a5c; }
  #pp-ov .s { margin-left: auto; font: 400 13px/1.4 "IBM Plex Mono", monospace; color: #b9c0cc; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
`;

// The site is laid out for ~1280px, so record at 1280x720 CSS px with 1.5x pixels = 1920x1080.
async function sitePage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  await page.goto(SITE, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: OVERLAY_CSS });
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "pp-ov";
    d.innerHTML = '<div class="p"><i></i>Mainnet · coming soon</div><div class="c"></div><div class="s"></div>';
    document.body.appendChild(d);
    window.ppCaption = (c, s) => {
      const ov = document.getElementById("pp-ov");
      ov.querySelector(".c").innerHTML = c;
      ov.querySelector(".s").textContent = s || "";
    };
  });
  await page.waitForTimeout(800);
  return page;
}

const sectionY = (page, sel, off = 40) => page.evaluate(([s, off]) => {
  const e = document.querySelector(s);
  return Math.max(0, Math.round(e.getBoundingClientRect().top + window.scrollY - off));
}, [sel, off]);

// Video 2: a tour down useparabol.com.
async function siteTour(browser, dir, start) {
  const page = await sitePage(browser);
  const stops = [
    ["#top", "Practice & testnet. <span>Live.</span>", "useparabol.com"],
    ["#uses", "Bull². Bear². <span>Protect.</span>", "Pick a side. Square it."],
    ["#lab", "Curve lab.", "Explore a price scenario before you trade."],
    ["#protect", "Protect <span>calculator.</span>", "Model a hedge for shares you hold."],
    ["#sim", "Right call. <span>Still wiped out?</span>", "Bull² has no liquidation price."],
    ["#spec", "Spec sheet.", "No margin. No liquidation. No expiry."],
  ];
  const ys = [];
  for (const [sel] of stops) ys.push(await sectionY(page, sel));
  const hold = 1.4, move = 0.9;
  let n = start;
  for (let k = 0; k < stops.length; k++) {
    const [, cap, sub] = stops[k];
    if (k > 0) {
      const from = ys[k - 1], to = ys[k];
      n = await capture(page, dir, n, Math.round(move * FPS), i =>
        page.evaluate(y => window.scrollTo(0, y), from + (to - from) * ease((i + 1) / (move * FPS))));
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.evaluate(([c, s]) => ppCaption(c, s), [cap, sub]);
    n = await capture(page, dir, n, Math.round(hold * FPS), () => Promise.resolve());
  }
  await page.close();
  return n;
}

// Video 3: the Curve lab and liquidation simulator, live on the site.
async function curveLab(browser, dir, start) {
  const page = await sitePage(browser);
  const setRange = (id, v) => page.evaluate(([id, v]) => {
    const e = document.getElementById(id);
    e.value = v;
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }, [id, v]);
  let n = start;
  await page.evaluate(y => window.scrollTo(0, y), await sectionY(page, "#fig2", 110));
  await page.evaluate(() => ppCaption("Move the price. <span>Watch it square.</span>", "Curve lab · live on useparabol.com"));
  await setRange("move", -60);
  n = await capture(page, dir, n, 15, () => Promise.resolve());
  n = await capture(page, dir, n, 4.5 * FPS, i => setRange("move", Math.round(-60 + 160 * ease(i / (4.5 * FPS - 1)))));
  n = await capture(page, dir, n, 15, () => Promise.resolve());
  await page.evaluate(() => ppCaption("Hold longer. <span>Carry counts.</span>", "Days held · 1 to 180"));
  n = await capture(page, dir, n, 2.5 * FPS, i => setRange("days", Math.round(1 + 179 * ease(i / (2.5 * FPS - 1)))));
  n = await capture(page, dir, n, 15, () => Promise.resolve());
  await page.evaluate(y => window.scrollTo(0, y), await sectionY(page, "#fig3", 150));
  await page.evaluate(() => ppCaption("Right call. <span>Still wiped out?</span>", "Bull² has no liquidation price."));
  n = await capture(page, dir, n, 3.5 * FPS, i => setRange("sDip", Math.round(-2 - 38 * ease(i / (3.5 * FPS - 1)))));
  n = await capture(page, dir, n, 30, () => Promise.resolve());
  await page.close();
  return n;
}

function encode(dir, file) {
  const out = path.join(ROOT, "videos", file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(dir, "%05d.jpg"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", "18", "-preset", "medium",
    "-movflags", "+faststart", out]);
  console.log("video", out);
}

const tmp = name => fs.mkdtempSync(path.join(os.tmpdir(), name + "-"));

async function renderVideos(browser, only) {
  const p = Object.fromEntries(posts.map(x => [x.id, x]));
  const end = { pill: "Mainnet · coming soon", kick: "Stay close", h1: "Mainnet. <span>Coming soon.</span>", mono: "Follow <b>@ParabolNow</b>" };
  if (!only || only === "1") {
    const d = tmp("v1");
    await studioClip(browser, d, 0, p["01"], 13);
    encode(d, "video1-weve-been-quiet.mp4");
  }
  if (!only || only === "2") {
    const d = tmp("v2");
    let n = await siteTour(browser, d, 0);
    await studioClip(browser, d, n, Object.assign({}, p["06"], { panel: ROAD }), 5.5);
    encode(d, "video2-road-to-mainnet.mp4");
  }
  if (!only || only === "3") {
    const d = tmp("v3");
    let n = await curveLab(browser, d, 0);
    await studioClip(browser, d, n, end, 5);
    encode(d, "video3-curve-lab-live.mp4");
  }
}

(async () => {
  const [what = "images", only] = process.argv.slice(2);
  const browser = await chromium.launch();
  try {
    if (what === "images") await renderImages(browser);
    else if (what === "videos") await renderVideos(browser, only);
  } finally {
    await browser.close();
  }
})();
