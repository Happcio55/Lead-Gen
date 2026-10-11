/* Tiny WebAudio chiptune: square-wave lead, triangle bass, noise hats. Starts only after a click. */
(function (global) {
  'use strict';
  let ctx = null, master = null, timer = null, step = 0, nextT = 0, on = false;
  const BPM = 112, STEP = 60 / BPM / 4;
  // A minor → F → C → G, 16 steps per bar
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const LEAD = [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 2, 1, 0, 1];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function ensure() {
    if (ctx) return true;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);
    return true;
  }
  function tone(type, f, t, dur, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function hat(t, vol) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    s.buffer = noiseBuf; g.gain.value = vol;
    s.connect(hp); hp.connect(g); g.connect(master);
    s.start(t);
  }
  function schedule() {
    while (nextT < ctx.currentTime + 0.15) {
      const bar = Math.floor(step / 16) % 4, s = step % 16;
      const ch = CHORDS[bar];
      tone('square', hz(ch[LEAD[s]] + 12), nextT, STEP * 0.9, 0.05);
      if (s % 4 === 0) tone('triangle', hz(ch[0] - 12), nextT, STEP * 3.5, 0.22);
      if (s % 2 === 1) hat(nextT, 0.05);
      if (s === 0 || s === 8) tone('sine', 70, nextT, 0.12, 0.35);
      nextT += STEP; step++;
    }
  }
  function setMusic(v) {
    if (!ensure()) return false;
    on = v;
    if (ctx.state === 'suspended') ctx.resume();
    clearInterval(timer);
    if (on) { nextT = ctx.currentTime + 0.05; timer = setInterval(schedule, 40); }
    return on;
  }
  function blip(kind) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (kind === 'buy') { tone('square', 880, t, 0.08, 0.08); tone('square', 1320, t + 0.08, 0.12, 0.08); }
    else if (kind === 'sell') { tone('square', 660, t, 0.08, 0.08); tone('square', 440, t + 0.08, 0.14, 0.08); }
    else tone('square', 1200, t, 0.03, 0.04);
  }
  global.Sound = { setMusic, blip, get music() { return on; }, unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); } };
})(window);
