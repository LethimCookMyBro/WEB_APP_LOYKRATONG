// audio.js — music + sound effects.
// If /assets/audio/bgm-loykrathong.mp3 or splash-chime.mp3 exist they are used.
// Otherwise an original, generative soundtrack is synthesised with Web Audio
// (pentatonic mallet melody, drone, water ambience, ching/chap percussion).

const SCALE = [0, 2, 4, 7, 9]; // major pentatonic degrees
const ROOT = 220; // A3

import { assetFlags } from './assets.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.mode = 'off'; // off | calm | festival
    this.timer = null;
    this.nextNote = 0;
    this.step = 0;
    this.melodyPos = 7;
    this.bgmEl = null;
    this.chimeBuf = null;
    this.volume = 0.8;
  }

  async init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    this.reverb = this.makeReverb();
    this.reverb.connect(this.master);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    // optional assets
    const flags = await assetFlags();
    if (flags.bgm) {
      this.bgmEl = new Audio('/assets/audio/bgm-loykrathong.mp3');
      this.bgmEl.loop = true;
      this.bgmEl.crossOrigin = 'anonymous';
      this.bgmGain = this.ctx.createGain();
      this.ctx.createMediaElementSource(this.bgmEl).connect(this.bgmGain).connect(this.master);
    }
    if (flags.chime) {
      try {
        const buf = await (await fetch('/assets/audio/splash-chime.mp3')).arrayBuffer();
        this.chimeBuf = await this.ctx.decodeAudioData(buf);
      } catch { this.chimeBuf = null; }
    }
  }

  makeReverb() {
    const len = this.ctx.sampleRate * 2.6;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = buf;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.32;
    conv.connect(wet);
    const input = this.ctx.createGain();
    input.connect(conv);
    this.reverbIn = input;
    return wet;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  }

  /* ---------- building blocks ---------- */
  freq(degreeIndex) {
    const oct = Math.floor(degreeIndex / 5);
    const deg = SCALE[((degreeIndex % 5) + 5) % 5];
    return ROOT * Math.pow(2, oct + deg / 12);
  }

  mallet(t, f, vel = 0.25, dur = 1.2, bright = 1) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 4.01;
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.25 * bright, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o1.connect(g); o2.connect(g2).connect(g);
    g.connect(this.master); g.connect(this.reverbIn);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  gong(t, f = 110, vel = 0.3) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
    [1, 2.02, 2.76, 4.1].forEach((m, i) => {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f * m * 1.01, t); o.frequency.exponentialRampToValueAtTime(f * m, t + 0.3);
      const og = c.createGain(); og.gain.value = [1, 0.4, 0.25, 0.12][i];
      o.connect(og).connect(g); o.start(t); o.stop(t + 3.6);
    });
    g.connect(this.master); g.connect(this.reverbIn);
  }

  noiseBurst(t, { dur = 0.08, freq = 7000, q = 1, vel = 0.12, type = 'bandpass' } = {}) {
    const c = this.ctx;
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vel;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  ching(t, open = true) {
    // small cymbals: metallic partials, open (ching) or damped (chap)
    const c = this.ctx;
    const g = c.createGain();
    const dur = open ? 1.1 : 0.12;
    g.gain.setValueAtTime(open ? 0.07 : 0.05, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    [2860, 4120, 5310, 6870].forEach((fr) => {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = fr;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
      o.connect(hp).connect(g); o.start(t); o.stop(t + dur + 0.05);
    });
    g.connect(this.master);
    if (!open) this.noiseBurst(t, { dur: 0.06, freq: 5000, vel: 0.08 });
  }

  startAmbience() {
    if (this.ambience || !this.ctx) return;
    const c = this.ctx;
    // brown-ish noise for water
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = c.createGain(); g.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = c.createGain(); lfoG.gain.value = 0.025;
    lfo.connect(lfoG).connect(g.gain);
    src.connect(lp).connect(g).connect(this.master);
    src.start(); lfo.start();
    // drone (A2 + E3)
    const dg = c.createGain(); dg.gain.value = 0.0;
    [110, 164.81, 220.5].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = [0.5, 0.3, 0.15][i];
      o.connect(og).connect(dg); o.start();
    });
    dg.connect(this.master); dg.connect(this.reverbIn);
    dg.gain.setTargetAtTime(0.05, c.currentTime, 2);
    this.ambience = { src, lfo, dg, g };
  }

  /* ---------- generative music ---------- */
  setMode(mode) {
    if (!this.ctx) return;
    this.mode = mode;
    if (this.bgmEl) {
      // recorded music: quieter before the ceremony, full afterwards
      if (mode === 'off') { this.bgmEl.pause(); return; }
      this.bgmGain.gain.setTargetAtTime(mode === 'calm' ? 0.25 : 0.9, this.ctx.currentTime, 1.5);
      this.bgmEl.play().catch(() => {});
      this.startAmbience();
      return;
    }
    this.startAmbience();
    if (mode === 'off') { clearInterval(this.timer); this.timer = null; return; }
    if (!this.timer) {
      this.nextNote = this.ctx.currentTime + 0.2;
      this.timer = setInterval(() => this.schedule(), 60);
    }
  }

  schedule() {
    const c = this.ctx;
    const festival = this.mode === 'festival';
    const beat = festival ? 60 / 96 / 2 : 60 / 60; // eighth notes when festive
    while (this.nextNote < c.currentTime + 0.25) {
      const t = this.nextNote;
      const s = this.step;
      if (festival) {
        // melody: random walk over the pentatonic scale, phrase of 16 eighths
        const rest = (s % 16 === 15) || Math.random() < 0.12;
        if (!rest) {
          this.melodyPos += [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
          this.melodyPos = Math.max(4, Math.min(13, this.melodyPos));
          this.mallet(t, this.freq(this.melodyPos), 0.13, 0.7);
          if (s % 4 === 0) this.mallet(t, this.freq(this.melodyPos - 5), 0.08, 1.2, 0.4);
        }
        if (s % 2 === 0) this.ching(t, s % 4 === 0); // ching on beats, chap off-beats
        if (s % 16 === 0) this.gong(t, 98, 0.22);
        if (s % 8 === 4) this.gong(t, 146.8, 0.08);
      } else {
        // calm: sparse notes with long decay
        if (Math.random() < 0.55) {
          this.melodyPos += [-1, 0, 1, 2, -2][Math.floor(Math.random() * 5)];
          this.melodyPos = Math.max(5, Math.min(12, this.melodyPos));
          this.mallet(t, this.freq(this.melodyPos), 0.07, 2.4, 0.5);
        }
        if (s % 12 === 0) this.gong(t, 73.4, 0.06);
      }
      this.nextNote += beat * (festival ? 1 : (0.8 + Math.random() * 0.8));
      this.step++;
    }
  }

  /* ---------- effects ---------- */
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    if (this.chimeBuf) {
      const s = this.ctx.createBufferSource(); s.buffer = this.chimeBuf; s.connect(this.master); s.start(t); return;
    }
    this.noiseBurst(t, { dur: 0.35, freq: 900, q: 0.7, vel: 0.12 }); // splash
    [0, 0.09, 0.18].forEach((d, i) => this.mallet(t + d, this.freq(10 + i * 2), 0.12, 1.8));
  }

  swoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const c = this.ctx;
    const len = c.sampleRate * 0.9;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.8);
    const g = c.createGain(); g.gain.value = 0.15;
    src.connect(f).connect(g).connect(this.master); src.start(t);
  }

  fanfare() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    this.gong(t, 73.4, 0.45);
    [5, 7, 9, 10, 12].forEach((p, i) => this.mallet(t + 0.4 + i * 0.16, this.freq(p), 0.16, 2.2));
    [10, 12, 14].forEach((p) => this.mallet(t + 1.4, this.freq(p), 0.1, 3.0));
  }
}

export const audio = new AudioEngine();
