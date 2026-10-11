"""Citizens intro soundtrack: 128 BPM chiptune, 64 beats (30 s), cut to the video's beat grid.

Sections (beats): 0-8 build, 8-32 drop, 32-44 breakdown (monitor boot), 44-56 drop, 56-64 end card.
Run: python3 soundtrack.py out.wav
"""
import sys
import wave
import numpy as np

SR = 44100
BPM = 128
BEAT = 60 / BPM
TOTAL = 64 * BEAT + 1.2
N = int(TOTAL * SR)
mix = np.zeros(N)
rng = np.random.default_rng(7)


def at(beat):
    return int(beat * BEAT * SR)


def add(sig, beat, gain=1.0):
    i = at(beat)
    j = min(N, i + len(sig))
    mix[i:j] += sig[: j - i] * gain


def env(n, a=0.002, d=0.1):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
    return e


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 50 + 120 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, 0.001, 0.12) * 1.1


def snare():
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    tone = np.sin(2 * np.pi * 190 * t)
    return (noise * 0.7 + tone * 0.4) * env(n, 0.001, 0.06)


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    noise = rng.uniform(-1, 1, n)
    noise = np.diff(noise, prepend=0)  # crude high-pass
    return noise * env(n, 0.0005, 0.06 if open_ else 0.015) * 0.5


def square(freq, dur, duty=0.5, d=0.15):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.where((t * freq) % 1 < duty, 1.0, -1.0)
    return s * env(n, 0.003, d)


def triangle(freq, dur, d=0.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = 2 * np.abs(2 * ((t * freq) % 1) - 1) - 1
    return s * env(n, 0.003, d)


def impact():
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    f = 30 + 60 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.5)
    crash = rng.uniform(-1, 1, n) * env(n, 0.001, 0.35) * 0.35
    return boom + crash


def riser(beats):
    n = at(beats)
    t = np.arange(n) / n
    noise = rng.uniform(-1, 1, n)
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 2400 * t ** 2) / SR)
    return (noise * 0.25 + sweep * 0.15) * t ** 2


# A minor: Am F C G, one chord per 2 beats in the drops
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ARP = [0, 1, 2, 1, 2, 1, 0, 2]


def drop(b0, b1):
    for b in range(b0, b1):
        add(kick(), b, 0.9)
        if b % 2 == 1:
            add(snare(), b, 0.55)
        for s in range(4):
            add(hat(open_=(s == 2)), b + s / 4, 0.25 if s == 2 else 0.18)
        ch = CHORDS[(b // 2) % 4]
        for e in range(2):
            add(square(hz(ch[0] - 24), BEAT / 2, 0.5, 0.12), b + e / 2, 0.22)
        for s in range(4):
            note = ch[ARP[(b * 4 + s) % 8]] + 12
            add(square(hz(note), BEAT / 4, 0.25, 0.07), b + s / 4, 0.12)
        if b % 8 == 0:
            for m in ch:
                add(triangle(hz(m), BEAT * 8, 1.4), b, 0.08)


# 0-8 build: kick on the word slams, a filtered arp, riser into the drop
for b in range(0, 8):
    if b % 2 == 0:
        add(kick(), b, 1.0)
        add(impact(), b, 0.25)
    for s in range(2):
        add(square(hz(CHORDS[0][ARP[(b * 2 + s) % 8]] + 12), BEAT / 2, 0.125, 0.05), b + s / 2, 0.06)
add(riser(4), 4, 0.6)
add(impact(), 8, 0.9)

drop(8, 32)
for b in (16, 24):
    add(impact(), b, 0.5)

# 32-44 breakdown: half-time kick, ticking hats, arp only
add(riser(2), 30, 0.4)
for b in range(32, 44):
    if b % 2 == 0:
        add(kick(), b, 0.7)
    for s in range(4):
        add(hat(), b + s / 4, 0.12)
        ch = CHORDS[(b // 2) % 4]
        add(square(hz(ch[ARP[(b * 4 + s) % 8]] + 24), BEAT / 4, 0.125, 0.05), b + s / 4, 0.08)
add(riser(4), 40, 0.7)
add(impact(), 44, 1.0)

drop(44, 56)

# 56-64 end card: big chord, pulses, final hit
add(impact(), 56, 0.9)
for b in range(56, 62):
    add(kick(), b, 0.8)
    if b % 2 == 1:
        add(snare(), b, 0.45)
for m in [45, 57, 60, 64, 69]:
    add(triangle(hz(m), BEAT * 6, 2.2), 56, 0.1)
    add(square(hz(m), BEAT * 6, 0.5, 1.2), 56, 0.035)
add(impact(), 62, 1.0)
add(kick(), 62, 1.0)

# master: soft clip and normalise
mix = np.tanh(mix * 1.3)
mix /= np.max(np.abs(mix)) * 1.05
fade = int(0.8 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)
pcm = (mix * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav', 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('ok', round(TOTAL, 2), 's')
