// Streaming background music (lobby / elevator / death). Separate from the WebAudio SFX in audio.js.
// Uses plain <audio> elements so the long tracks stream instead of decoding fully into memory.
const TRACKS = {
  lobby: 'assets/music/lobby.mp3',
  elevator: 'assets/music/elevator.mp3',
  death: 'assets/music/death.mp3',
  face: 'assets/music/face.mp3',
};

export class Music {
  constructor() {
    this.els = {};
    this.cur = null;
    this.volume = 0.6;
    this.enabled = true;
  }

  _el(name) {
    if (!this.els[name]) {
      const a = new Audio();
      a.src = TRACKS[name];
      a.preload = 'auto';
      a.volume = this.volume;
      this.els[name] = a;
    }
    return this.els[name];
  }

  setVolume(v) {
    this.volume = v;
    for (const n in this.els) this.els[n].volume = n === this.cur ? v : 0;
  }

  // Start a track. loop defaults true; death music plays once.
  play(name, { loop = true } = {}) {
    if (!this.enabled || !TRACKS[name]) return;
    if (this.cur === name) return;
    this.stop();
    const a = this._el(name);
    a.loop = loop;
    a.volume = this.volume;
    try { a.currentTime = 0; } catch (e) { /* not ready yet */ }
    const p = a.play();
    if (p && p.catch) p.catch(() => {});   // blocked until a user gesture; retried on next call
    this.cur = name;
  }

  // The face scream rides its own volume so it can swell as the thing approaches.
  faceVolume(v) { const a = this.els.face; if (a && this.cur === 'face') a.volume = Math.max(0, Math.min(1, v)) * this.volume; }

  stop() {
    if (!this.cur) return;
    const a = this.els[this.cur];
    try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ }
    this.cur = null;
  }

  // Retry the current track (call once from a user gesture if autoplay was blocked).
  resume() {
    if (this.cur) {
      const a = this.els[this.cur];
      if (a.paused) { const p = a.play(); if (p && p.catch) p.catch(() => {}); }
    }
  }
}
