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
      this._startJazz();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /* duck the band when focus matters (e.g. inside the Lighting Room) */
  setScene(scene) {
    if (!this.jazzBus) return;
    this.jazzBus.gain.linearRampToValueAtTime(
      scene === 'room' ? 0.45 : 1,
      this.ctx.currentTime + 1.2
    );
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

  /* ————————————————————————————————————————————————
     The house band: slow generative jazz, all synthesized.
     Walking bass + brushed ride + soft EP comping over a
     ii–V–I–vi loop in C at 72bpm. If frontend/public/music.mp3
     exists (a licensed track), it plays instead.
     ———————————————————————————————————————————————— */

  _startJazz() {
    this.jazzBus = this.ctx.createGain();
    this.jazzBus.gain.value = 1;
    this._jazzFade = this.ctx.createGain();
    this._jazzFade.gain.value = 0;
    this._jazzFade.connect(this.jazzBus).connect(this.master);
    // slow fade-in so the band walks in, not bursts in
    this._jazzFade.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 5);

    const el = new Audio('/music.mp3');
    el.loop = true;
    el.crossOrigin = 'anonymous';
    let settled = false;
    el.addEventListener('canplaythrough', () => {
      if (settled) return;
      settled = true;
      const src = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain();
      g.gain.value = 0.22;
      src.connect(g).connect(this._jazzFade);
      el.play().catch(() => this._generativeJazz());
    }, { once: true });
    el.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      this._generativeJazz();
    }, { once: true });
    // some servers answer bad paths with HTML that never errors — don't wait
    setTimeout(() => {
      if (!settled) { settled = true; this._generativeJazz(); }
    }, 2500);
  }

  _generativeJazz() {
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    this._midi = midi;
    const BEAT = 60 / 72; // slow
    // Dm7 → G7 → Cmaj7 → Am7, one bar each
    this._prog = [
      { root: 38, third: 3, voicing: [50, 53, 57, 60] },
      { root: 43, third: 4, voicing: [50, 53, 55, 59] },
      { root: 36, third: 4, voicing: [48, 52, 55, 59] },
      { root: 33, third: 3, voicing: [48, 52, 55, 57] },
    ];

    // short noise buffer shared by the brushes
    const len = Math.floor(this.ctx.sampleRate * 0.15);
    this._brushBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._brushBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    let pos = 0; // song position in beats
    let next = this.ctx.currentTime + 0.3;
    const h = () => (Math.random() - 0.5) * 0.014; // human hands

    this._jazzTimer = setInterval(() => {
      while (next < this.ctx.currentTime + 0.9) {
        const bar = Math.floor(pos / 4) % this._prog.length;
        const beat = pos % 4;
        const chord = this._prog[bar];
        const nextChord = this._prog[(bar + 1) % this._prog.length];
        const t = next;

        // walking bass: root · third · fifth · approach
        const walk = [
          chord.root,
          chord.root + (Math.random() < 0.25 ? 2 : chord.third),
          chord.root + 7,
          nextChord.root + (Math.random() < 0.5 ? -1 : 1),
        ][beat];
        this._pluck(t + h(), midi(walk), 0.05 + Math.random() * 0.015);

        // brushed ride: quarter + swung eighth on 2 and 4
        if (!(beat === 0 && Math.random() < 0.25)) {
          this._brush(t + h(), beat % 2 ? 0.010 : 0.007);
        }
        if (beat % 2 === 1) this._brush(t + BEAT * 0.66 + h(), 0.005);

        // EP comping: downbeat of bars 1 & 3, sometimes a pushed offbeat
        if (beat === 0 && bar % 2 === 0) {
          this._epChord(t + h(), chord.voicing);
        } else if (beat === 2 && Math.random() < 0.3) {
          this._epChord(t + BEAT * 0.66 + h(), chord.voicing, 0.007);
        }

        pos++;
        next += BEAT;
      }
    }, 220);
  }

  _pluck(t, freq, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(lp).connect(g).connect(this._jazzFade);
    o.start(t);
    o.stop(t + 0.6);
  }

  _brush(t, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._brushBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(hp).connect(g).connect(this._jazzFade);
    src.start(t);
  }

  _epChord(t, notes, vol = 0.01) {
    for (const n of notes) {
      for (const det of [0, 1.003]) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = this._midi(n) * (det || 1);
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1100;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.28);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        o.connect(lp).connect(g).connect(this._jazzFade);
        o.start(t);
        o.stop(t + 2.3);
      }
    }
  }
}
