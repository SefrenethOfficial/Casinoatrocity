// All sound is synthesised with WebAudio, so the game ships with no audio files.

const SHOTS = {
  pistol:   { dur: 0.16, freq: 1900, q: 0.8, gain: 0.55, thump: 190, thumpGain: 0.5 },
  smg:      { dur: 0.11, freq: 2400, q: 0.9, gain: 0.42, thump: 220, thumpGain: 0.3 },
  ar:       { dur: 0.17, freq: 1500, q: 0.7, gain: 0.55, thump: 150, thumpGain: 0.55 },
  lmg:      { dur: 0.19, freq: 1200, q: 0.7, gain: 0.58, thump: 130, thumpGain: 0.6 },
  shotgun:  { dur: 0.34, freq: 900,  q: 0.5, gain: 0.8,  thump: 100, thumpGain: 0.9 },
  sniper:   { dur: 0.5,  freq: 1100, q: 0.5, gain: 0.85, thump: 90,  thumpGain: 1.0 },
  revolver: { dur: 0.42, freq: 1300, q: 0.6, gain: 0.8,  thump: 110, thumpGain: 0.95 },
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.noise = null;
  }

  // Must be called from a user gesture at least once.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) { return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get ok() { return !!this.ctx && this.ctx.state === 'running'; }

  _noise(dur, filterType, freq, q, gain, when = 0, freqEnd = null) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  _tone(type, f0, f1, dur, gain, when = 0) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot(kind) {
    const s = SHOTS[kind] || SHOTS.pistol;
    this._noise(s.dur, 'bandpass', s.freq, s.q, s.gain, 0, s.freq * 0.35);
    this._noise(s.dur * 0.5, 'highpass', 3500, 0.5, s.gain * 0.35);
    this._tone('sine', s.thump, s.thump * 0.35, s.dur * 0.8, s.thumpGain);
  }
  empty() { this._tone('square', 900, 700, 0.04, 0.12); }
  reloadStart() { this._noise(0.06, 'bandpass', 2600, 4, 0.25); this._tone('square', 300, 200, 0.05, 0.1, 0.05); }
  reloadEnd() { this._noise(0.05, 'bandpass', 3200, 5, 0.3); this._tone('square', 500, 350, 0.05, 0.12, 0.04); }
  swap() { this._noise(0.09, 'bandpass', 1400, 2, 0.15); }
  hit() { this._tone('square', 1500, 1200, 0.035, 0.1); }
  headshot() { this._tone('square', 2200, 1600, 0.06, 0.16); this._tone('sine', 880, 440, 0.12, 0.2); }
  kill() { this._tone('triangle', 520, 780, 0.09, 0.16); }
  slash() { this._noise(0.1, 'highpass', 2600, 0.8, 0.22, 0, 900); }
  gore(big = false) {
    this._noise(big ? 0.3 : 0.16, 'lowpass', big ? 700 : 900, 1.2, big ? 0.6 : 0.35, 0, 160);
    this._tone('sine', big ? 110 : 150, 50, big ? 0.28 : 0.14, big ? 0.5 : 0.25);
    if (big) this._noise(0.22, 'bandpass', 1700, 2, 0.2, 0.05, 500);
  }
  roar() {
    this._tone('sawtooth', 62, 38, 1.1, 0.4);
    this._noise(0.9, 'bandpass', 320, 2, 0.3, 0, 140);
  }
  screech() {
    this._tone('sawtooth', 620, 300, 0.35, 0.12);
    this._noise(0.3, 'bandpass', 2200, 4, 0.14, 0, 900);
  }
  melee() { this._noise(0.12, 'bandpass', 900, 1.2, 0.3, 0, 300); }
  hurt() { this._tone('sawtooth', 160, 70, 0.25, 0.4); this._noise(0.12, 'lowpass', 500, 1, 0.5); }
  step() { this._noise(0.05, 'lowpass', 260, 1, 0.07); }
  jump() { this._noise(0.08, 'lowpass', 400, 1, 0.1); }
  groan(vol = 0.2) {
    const f = 70 + Math.random() * 50;
    this._tone('sawtooth', f, f * (0.6 + Math.random() * 0.3), 0.5 + Math.random() * 0.4, vol);
    this._noise(0.4, 'bandpass', 500 + Math.random() * 300, 3, vol * 0.5);
  }
  zombieSwing() { this._noise(0.18, 'bandpass', 700, 1.5, 0.22, 0, 250); }
  buy() { [988, 1319, 1568].forEach((f, i) => this._tone('triangle', f, f, 0.12, 0.2, i * 0.06)); }
  deny() { this._tone('square', 180, 140, 0.16, 0.15); }
  tick() { this._tone('square', 1300, 900, 0.025, 0.09); }
  powerup() { [523, 659, 784, 1047].forEach((f, i) => this._tone('triangle', f, f, 0.16, 0.22, i * 0.07)); }
  roundStart() {
    [196, 185, 174, 147].forEach((f, i) => this._tone('sawtooth', f, f * 0.98, 0.5, 0.2, i * 0.32));
  }
  roundEnd() { [392, 494, 587, 784].forEach((f, i) => this._tone('triangle', f, f, 0.3, 0.2, i * 0.14)); }
  gameOver() { [294, 262, 220, 147].forEach((f, i) => this._tone('sawtooth', f, f * 0.9, 0.7, 0.25, i * 0.4)); }
  reveal(order) {
    const base = [392, 440, 523, 587, 659][order] || 392;
    const n = 2 + order;
    for (let i = 0; i < n; i++) this._tone('triangle', base * Math.pow(1.26, i), 0, 0.5, 0.2, i * 0.08);
    if (order >= 3) this._noise(0.9, 'highpass', 5000, 0.5, 0.12, 0.1);
  }
}
