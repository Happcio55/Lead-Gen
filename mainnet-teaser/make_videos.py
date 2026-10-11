#!/usr/bin/env python3
"""Render the three mainnet teaser videos (1080x1080 MP4, silent) for @ParabolNow.

Usage: python mainnet-teaser/make_videos.py
Needs Pillow and ffmpeg (libx264).
"""

import math
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "videos")
SIZE = 1080
SS = 2  # supersampling factor for smooth lines/text
W = SIZE * SS
FPS = 30

BG = (11, 11, 15)
FG = (244, 244, 245)
MUTED = (138, 138, 147)
BULL = (61, 220, 151)
BEAR = (255, 92, 122)
AMBER = (255, 196, 61)

FONT_DIR = "/usr/share/fonts/opentype/inter"


def font(name, px):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), px * SS)


F_HUGE = font("InterDisplay-Black.otf", 120)
F_BIG = font("InterDisplay-Bold.otf", 84)
F_MED = font("InterDisplay-SemiBold.otf", 52)
F_SMALL = font("Inter-Medium.otf", 30)
F_TINY = font("Inter-Regular.otf", 22)


def ease(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def mix(c, a):
    """Blend colour c over the background with alpha a (0..1)."""
    return tuple(int(BG[i] + (c[i] - BG[i]) * a) for i in range(3))


def fade(t, start, end, fade_in=0.4, fade_out=0.4):
    """Opacity of an element visible from start to end (seconds)."""
    if t < start or t > end:
        return 0.0
    a = ease((t - start) / fade_in) if fade_in else 1.0
    if end - t < fade_out:
        a = min(a, ease((end - t) / fade_out))
    return a


def text_c(d, y, s, f, color, alpha, rise=0):
    if alpha <= 0:
        return
    w = d.textlength(s, font=f)
    d.text(((W - w) / 2, (y + rise * (1 - alpha)) * SS), s, font=f, fill=mix(color, alpha))


def chrome(d, t, total):
    """Wordmark, handle and progress bar shown on every frame."""
    a = fade(t, 0, total + 1, 0.6, 0)
    d.text((60 * SS, 56 * SS), "PARABOL²", font=F_SMALL, fill=mix(FG, a))
    hw = d.textlength("@ParabolNow", font=F_SMALL)
    d.text((W - 60 * SS - hw, 56 * SS), "@ParabolNow", font=F_SMALL, fill=mix(MUTED, a))
    bar = int((W - 120 * SS) * min(1, t / total))
    d.rectangle([60 * SS, 1040 * SS, 60 * SS + bar, 1043 * SS], fill=mix(FG, 0.35))


def disclaimer(d, t, start, end):
    a = fade(t, start, end, 0.4, 0)
    text_c(d, 990, "Mainnet trading is not live. Test tokens have no value.", F_TINY, MUTED, a)


def curve(d, fn, progress, color, alpha, box, width=6):
    """Draw fn(x) for x in [0.25, 2] inside box=(x0, y0, x1, y1), up to progress."""
    if alpha <= 0 or progress <= 0:
        return
    x0, y0, x1, y1 = box
    xs = [0.25 + 1.75 * i / 400 for i in range(int(400 * min(1, progress)) + 1)]
    ymax = 4.0
    pts = []
    for x in xs:
        y = fn(x)
        if y > ymax:
            continue
        px = x0 + (x - 0.25) / 1.75 * (x1 - x0)
        py = y1 - y / ymax * (y1 - y0)
        pts.append((px * SS, py * SS))
    if len(pts) > 1:
        d.line(pts, fill=mix(color, alpha), width=width * SS, joint="curve")
        ex, ey = pts[-1]
        r = 9 * SS
        d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=mix(color, alpha))


def axes(d, alpha, box):
    if alpha <= 0:
        return
    x0, y0, x1, y1 = box
    c = mix(MUTED, alpha * 0.6)
    d.line([(x0 * SS, y1 * SS), (x1 * SS, y1 * SS)], fill=c, width=2 * SS)
    d.line([(x0 * SS, y0 * SS), (x0 * SS, y1 * SS)], fill=c, width=2 * SS)


# --- Video 1: "We've been quiet." -----------------------------------------
def video1(d, t):
    total = 12
    text_c(d, 430, "We've been quiet.", F_BIG, FG, fade(t, 0.3, 2.8), rise=20)
    text_c(d, 430, "Heads down.", F_BIG, FG, fade(t, 3.0, 5.2), rise=20)
    text_c(d, 430, "Building.", F_BIG, BULL, fade(t, 5.4, 7.4), rise=20)
    box = (260, 250, 820, 640)
    a = fade(t, 7.6, total + 1, 0.4, 0)
    axes(d, a, box)
    curve(d, lambda x: x * x, ease((t - 7.6) / 1.6), BULL, a, box)
    text_c(d, 700, "Mainnet.", F_HUGE, FG, fade(t, 8.6, total + 1, 0.5, 0), rise=20)
    text_c(d, 870, "News soon.", F_MED, AMBER, fade(t, 9.6, total + 1, 0.5, 0), rise=10)
    chrome(d, t, total)
    disclaimer(d, t, 9.6, total + 1)
    return total


# --- Video 2: road to mainnet checklist ------------------------------------
STEPS = [
    ("Practice demo", True),
    ("Wallet testnet", True),
    ("Bull²  Bear²  VOL²  Protect", True),
    ("Mainnet", False),
]


def video2(d, t):
    total = 12
    text_c(d, 190, "The road to mainnet", F_BIG, FG, fade(t, 0.3, total + 1, 0.5, 0), rise=20)
    for i, (label, done) in enumerate(STEPS):
        start = 1.4 + i * 1.3
        a = fade(t, start, total + 1, 0.4, 0)
        if a <= 0:
            continue
        y = 360 + i * 120
        x = 230
        color = BULL if done else AMBER
        cx, cy, r = (x + 28) * SS, (y + 32) * SS, 28 * SS
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=mix(color, a), width=4 * SS)
        if done:
            d.line([(cx - 12 * SS, cy), (cx - 3 * SS, cy + 10 * SS), (cx + 14 * SS, cy - 10 * SS)],
                   fill=mix(color, a), width=5 * SS, joint="curve")
        else:
            # pulsing dot while mainnet is pending
            p = 0.55 + 0.45 * math.sin(t * 5)
            rr = 9 * SS
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=mix(color, a * p))
        d.text(((x + 80) * SS, (y + 6) * SS), label, font=F_MED,
               fill=mix(FG if done else AMBER, a))
    text_c(d, 870, "More news soon.", F_MED, FG, fade(t, 7.4, total + 1, 0.5, 0), rise=10)
    chrome(d, t, total)
    disclaimer(d, t, 7.4, total + 1)
    return total


# --- Video 3: squared, both ways -------------------------------------------
def video3(d, t):
    total = 13
    box = (200, 260, 880, 700)
    a = fade(t, 0.3, 6.6, 0.4, 0.5)
    axes(d, a, box)
    curve(d, lambda x: x * x, ease((t - 0.6) / 1.8), BULL, a, box)
    curve(d, lambda x: 1 / (x * x), ease((t - 2.4) / 1.8), BEAR, a, box)
    la = min(a, fade(t, 1.4, 6.6, 0.4, 0.5))
    d.text((200 * SS, 730 * SS), "Bull² tracks P²", font=F_MED, fill=mix(BULL, la))
    lb = min(a, fade(t, 3.2, 6.6, 0.4, 0.5))
    d.text((200 * SS, 800 * SS), "Bear² tracks 1/P²", font=F_MED, fill=mix(BEAR, lb))
    text_c(d, 360, "Stocks, squared.", F_BIG, FG, fade(t, 6.9, total + 1, 0.5, 0), rise=20)
    text_c(d, 460, "Both ways.", F_BIG, FG, fade(t, 7.5, total + 1, 0.5, 0), rise=20)
    text_c(d, 640, "Next stop: mainnet.", F_MED, AMBER, fade(t, 8.8, total + 1, 0.5, 0), rise=10)
    text_c(d, 720, "Stay close.", F_MED, MUTED, fade(t, 9.8, total + 1, 0.5, 0), rise=10)
    chrome(d, t, total)
    disclaimer(d, t, 8.8, total + 1)
    return total


def render(name, scene):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    probe = Image.new("RGB", (W, W))
    total = scene(ImageDraw.Draw(probe), 0)
    hold = 1.0  # hold the final frame a moment before the loop restarts
    frames = int((total + hold) * FPS)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{SIZE}x{SIZE}", "-r", str(FPS), "-i", "-",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high",
           "-crf", "18", "-preset", "medium", "-movflags", "+faststart", path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(frames):
        t = min(i / FPS, total)
        img = Image.new("RGB", (W, W), BG)
        scene(ImageDraw.Draw(img), t)
        proc.stdin.write(img.resize((SIZE, SIZE), Image.LANCZOS).tobytes())
    proc.stdin.close()
    if proc.wait():
        raise SystemExit(f"ffmpeg failed for {name}")
    print("wrote", path)


if __name__ == "__main__":
    render("video1-weve-been-quiet.mp4", video1)
    render("video2-road-to-mainnet.mp4", video2)
    render("video3-squared-both-ways.mp4", video3)
