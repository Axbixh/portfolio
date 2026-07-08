/*
 * Sound: fully procedural WebAudio — no audio files, ~0 bytes of assets.
 * A warm room tone under everything, plus small mechanical gestures:
 * travel whoosh, console ticks, a shutter for the Shot Card.
 * Starts only after a user gesture; mute persists in localStorage.
 */

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('obs-mute') === '1';
    this._lastTick = 0;
  }

  /* call from any user gesture — safe to call repeatedly */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this._ambient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('obs-mute', m ? '1' : '0');
    if (this.master) {
      this.master.gain.linearRampToValueAtTime(
        m ? 0 : 1, this.ctx.currentTime + 0.25
      );
    }
  }

  /* warm room tone: looped brown noise, low-passed, slowly breathing */
  _ambient() {
    const { ctx } = this;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 150;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = ctx.createGain();
    lg.gain.value = 0.012;
    lfo.connect(lg);
    lg.connect(g.gain);
    lfo.start();
    src.connect(lp).connect(g).connect(this.master);
    src.start();
  }

  _blip(freq, dur, vol, type = 'triangle', when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, from, to) {
    if (!this.ctx) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur * 0.55);
    bp.frequency.exponentialRampToValueAtTime(from * 0.8, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
  }

  /* camera travels between sections */
  whoosh() { this._noise(0.9, 0.09, 240, 900); }

  /* arriving at a section — a soft two-note chime */
  chime() {
    this._blip(520, 0.4, 0.035, 'sine');
    this._blip(780, 0.55, 0.025, 'sine', 0.09);
  }

  /* console slider movement */
  tick() {
    const now = performance.now();
    if (now - this._lastTick < 60) return;
    this._lastTick = now;
    this._blip(1400 + Math.random() * 400, 0.018, 0.04);
  }

  /* entering / leaving the lighting room */
  swell() {
    this._blip(160, 1.4, 0.06, 'sine');
    this._blip(240, 1.4, 0.04, 'sine', 0.12);
    this._noise(1.1, 0.03, 150, 420);
  }

  /* shot card capture */
  shutter() {
    this._blip(2600, 0.015, 0.12, 'square');
    this._blip(300, 0.05, 0.16, 'square', 0.045);
    this._blip(140, 0.09, 0.1, 'sine', 0.05);
  }

  /* a small win */
  fanfare() {
    [440, 554, 659, 880].forEach((f, i) =>
      this._blip(f, 0.5, 0.05, 'triangle', i * 0.1));
  }
}
