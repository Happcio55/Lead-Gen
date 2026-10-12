// Original synthesized soundtrack (no samples): four-on-the-floor kick, claps, hats, offbeat saw bass,
// plucked chord arps, a noise riser into the drop and an impact on the last hit.
// node beat.cjs <out.wav> <bpm> <totalBeats> <dropBeat> <endBeat>
const fs = require('fs');
const [out, bpm = 128, total = 60, drop = 8, end = 52] = process.argv.slice(2).map((v, i) => (i ? Number(v) : v));
const SR = 44100, beat = 60 / bpm, len = Math.ceil((total * beat + 1.5) * SR);
const L = new Float32Array(len), R = new Float32Array(len);
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const add = (i, l, r = l) => { if (i >= 0 && i < len) { L[i] += l; R[i] += r; } };

function kick(t0, g = 1) {
  const s = Math.floor(t0 * SR); let ph = 0;
  for (let i = 0; i < SR * 0.45; i++) {
    const t = i / SR, f = 46 + 110 * Math.exp(-t * 28);
    ph += (2 * Math.PI * f) / SR;
    const v = Math.sin(ph) * Math.exp(-t * 6.5) * 0.95 + (i < 60 ? rnd() * 0.3 * (1 - i / 60) : 0);
    add(s + i, Math.tanh(v * 1.6) * 0.8 * g);
  }
}
function clap(t0, g = 1) {
  const s = Math.floor(t0 * SR); let lp = 0, prev = 0;
  for (let i = 0; i < SR * 0.25; i++) {
    const t = i / SR;
    const env = (t < 0.03 ? (Math.floor(t / 0.01) % 2 ? 0.6 : 1) : 1) * Math.exp(-t * 16);
    const n = rnd(); lp += 0.35 * (n - lp); const hp = n - lp; // crude band-pass
    const v = (hp * 0.8 + (n - prev) * 0.2) * env * 0.42 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30) * 0.15;
    prev = n;
    add(s + i, v * g * 0.95, v * g);
  }
}
function hat(t0, g = 1, open = false) {
  const s = Math.floor(t0 * SR); let prev = 0;
  for (let i = 0; i < SR * (open ? 0.22 : 0.06); i++) {
    const t = i / SR, n = rnd(), hp = n - prev; prev = n;
    const v = hp * Math.exp(-t * (open ? 14 : 70)) * 0.16 * g;
    add(s + i, v * 0.8, v);
  }
}
// Offbeat saw bass with a quick filter envelope (ducked by the kick by construction).
function bass(t0, freq, dur, g = 1) {
  const s = Math.floor(t0 * SR); let ph = 0, lp = 0;
  for (let i = 0; i < SR * dur; i++) {
    const t = i / SR; ph = (ph + freq / SR) % 1;
    const saw = 2 * ph - 1 + (2 * ((ph * 2.006) % 1) - 1) * 0.5;
    const cut = 0.04 + 0.22 * Math.exp(-t * 18);
    lp += cut * (saw - lp);
    const env = Math.min(1, t / 0.004) * (t > dur - 0.02 ? (dur - t) / 0.02 : 1);
    add(s + i, Math.tanh(lp * 2) * 0.3 * env * g);
  }
}
function pluck(t0, freq, g = 1, pan = 0) {
  const s = Math.floor(t0 * SR); let lp = 0;
  for (let i = 0; i < SR * 0.35; i++) {
    const t = i / SR;
    const sq = (Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1) * 0.6 + Math.sin(2 * Math.PI * freq * 2.003 * t) * 0.4;
    lp += (0.06 + 0.4 * Math.exp(-t * 25)) * (sq - lp);
    const v = lp * Math.exp(-t * 9) * 0.11 * g;
    add(s + i, v * (1 - pan), v * (1 + pan));
  }
}
function riser(t0, t1, g = 1) {
  const s = Math.floor(t0 * SR), n = Math.floor((t1 - t0) * SR); let prev = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n, x = rnd(); lp += (0.02 + 0.6 * p * p) * (x - lp); const hp = lp - prev; prev = lp;
    const sweep = Math.sin(2 * Math.PI * (200 + 1800 * p * p) * (i / SR)) * 0.05 * p;
    add(s + i, (hp * 1.4 + sweep) * p * p * 0.5 * g);
  }
}
function impact(t0, g = 1) {
  const s = Math.floor(t0 * SR); let ph = 0, lp = 0;
  for (let i = 0; i < SR * 2.2; i++) {
    const t = i / SR, f = 38 + 60 * Math.exp(-t * 8); ph += (2 * Math.PI * f) / SR;
    const n = rnd(); lp += 0.08 * (n - lp);
    add(s + i, (Math.sin(ph) * Math.exp(-t * 2.2) * 0.9 + lp * Math.exp(-t * 3) * 0.5) * g);
  }
}

// A minor - F - C - G, one chord per bar.
const roots = [55, 43.65, 65.41, 49];
const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
for (let b = 0; b < total; b++) {
  const t = b * beat, bar = Math.floor(b / 4), ci = bar % 4, inBar = b % 4;
  const playing = b < end;
  const dropped = b >= drop;
  if (playing && dropped) {
    kick(t);
    if (inBar === 1 || inBar === 3) clap(t);
    bass(t + beat / 2, roots[ci], beat / 2 - 0.01);
    bass(t + beat * 0.75, roots[ci] * 2, beat / 4 - 0.01, 0.6);
    for (let k = 0; k < 4; k++) hat(t + k * beat / 4, k === 2 ? 1 : 0.45, k === 2 && b % 8 === 7);
  } else if (playing) {
    // Build: hats double up, a pulsing pluck, riser into the drop.
    hat(t + beat / 2, 0.7);
    if (b >= drop - 4) for (let k = 0; k < 4; k++) hat(t + k * beat / 4, 0.35);
    if (b >= drop - 2) { kick(t, 0.5); kick(t + beat / 2, 0.4); }
  }
  if (playing) {
    const ch = chords[ci];
    for (let k = 0; k < 4; k++) pluck(t + k * beat / 4, ch[(k + b) % 3] * (k === 3 ? 2 : 1), dropped ? 1 : 0.8, k % 2 ? 0.35 : -0.35);
  }
}
riser(Math.max(0, (drop - 4) * beat), drop * beat, 1);
impact(drop * beat, 0.7);
impact(end * beat, 1);
for (let k = 0; k < 4; k++) pluck(end * beat + k * 0.12, chords[0][k % 3] * 2, 1.2);

// Master: soft clip, normalise, fade edges.
let peak = 0;
for (let i = 0; i < len; i++) { L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const gain = 0.92 / peak, fade = SR * 1.2;
const buf = Buffer.alloc(44 + len * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + len * 4, 4); buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(len * 4, 40);
for (let i = 0; i < len; i++) {
  const f = Math.min(1, (len - i) / fade, i / (SR * 0.01));
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain * f)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain * f)) * 32767), 46 + i * 4);
}
fs.writeFileSync(out, buf);
console.log('wrote', out, (len / SR).toFixed(2) + 's');
