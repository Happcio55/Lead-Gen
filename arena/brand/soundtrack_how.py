"""Citizens 'How it works' soundtrack: calmer 100 BPM chiptune, 42 s, with a transition
whoosh and hit on each section change of the video (5.5 / 13.2 / 22.6 / 30.7 / 37.2 s).
Run: python3 soundtrack_how.py out.wav
"""
import sys
import wave
import numpy as np

SR = 44100
BPM = 100
BEAT = 60 / BPM
TOTAL = 42.0
N = int(TOTAL * SR)
mix = np.zeros(N)
rng = np.random.default_rng(11)
SECTIONS = [5.5, 13.2, 22.6, 30.7, 37.2]


def add(sig, t, gain=1.0):
    i = int(t * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    mix[i:j] += sig[: j - i] * gain


def env(n, a=0.002, d=0.1):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def kick():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = 48 + 100 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.11)


def hat():
    n = int(0.05 * SR)
    return np.diff(rng.uniform(-1, 1, n), prepend=0) * env(n, 0.0005, 0.015) * 0.5


def snap():
    n = int(0.15 * SR)
    return rng.uniform(-1, 1, n) * env(n, 0.001, 0.04)


def square(freq, dur, duty=0.25, d=0.12):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return np.where((t * freq) % 1 < duty, 1.0, -1.0) * env(n, 0.003, d)


def tri(freq, dur, d=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (2 * np.abs(2 * ((t * freq) % 1) - 1) - 1) * env(n, 0.01, d)


def whoosh(length=0.8):
    n = int(length * SR)
    k = np.arange(n) / n
    return rng.uniform(-1, 1, n) * k ** 2 * 0.35


def hit():
    n = int(1.0 * SR)
    t = np.arange(n) / SR
    f = 40 + 50 * np.exp(-t * 7)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.35) + rng.uniform(-1, 1, n) * env(n, 0.001, 0.2) * 0.2


# F major-ish, calm and confident: F  Dm  Bb  C
CHORDS = [[53, 57, 60], [50, 53, 57], [46, 50, 53], [48, 52, 55]]
ARP = [0, 1, 2, 1]

beats = int(TOTAL / BEAT)
for b in range(beats):
    t = b * BEAT
    sec = sum(1 for s in SECTIONS if t >= s)  # 0..5
    ch = CHORDS[(b // 4) % 4]
    # pads on every bar
    if b % 4 == 0:
        for m in ch:
            add(tri(hz(m), BEAT * 4, 1.6), t, 0.07)
    # arp from the first section on
    for s in range(2):
        add(square(hz(ch[ARP[(b * 2 + s) % 4]] + 12), BEAT / 2, 0.25, 0.09), t + s * BEAT / 2, 0.07 if sec == 0 else 0.1)
    if sec >= 1 and sec < 5:
        add(kick(), t, 0.75)
        add(square(hz(ch[0] - 24), BEAT / 2, 0.5, 0.1), t, 0.16)
        add(square(hz(ch[0] - 24), BEAT / 2, 0.5, 0.1), t + BEAT / 2, 0.12)
        for s in range(2):
            add(hat(), t + s * BEAT / 2 + BEAT / 4, 0.14)
        if b % 2 == 1:
            add(snap(), t, 0.25)
    if sec >= 3 and sec < 5:  # lift for trade + publish
        for s in range(4):
            add(square(hz(ch[ARP[(b * 4 + s) % 4]] + 24), BEAT / 4, 0.125, 0.05), t + s * BEAT / 4, 0.05)

for s in SECTIONS:
    add(whoosh(0.8), s - 0.8, 0.8)
    add(hit(), s, 0.7)
# end card chord
for m in [41, 53, 57, 60, 65]:
    add(tri(hz(m), 4.5, 2.0), 37.2, 0.09)

mix = np.tanh(mix * 1.4)
mix /= np.max(np.abs(mix)) * 1.05
fade = int(1.2 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)
fadein = int(0.4 * SR)
mix[:fadein] *= np.linspace(0, 1, fadein)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'soundtrack_how.wav', 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('ok')
