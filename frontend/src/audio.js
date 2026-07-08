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
    const BEAT = 60 / 58; // last-set ballad tempo
    this._BEAT = BEAT;

    // the room: a generated impulse response so the trio plays in a
    // small bar, not a void
    const rate = this.ctx.sampleRate;
    const irLen = Math.floor(rate * 1.9);
    const ir = this.ctx.createBuffer(2, irLen, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.8);
      }
    }
    const verb = this.ctx.createConvolver();
    verb.buffer = ir;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.35;
    this._jazzOut = this.ctx.createGain();
    this._jazzOut.connect(this._jazzFade);
    this._jazzOut.connect(verb);
    verb.connect(wet).connect(this._jazzFade);

    // eight smoky bars in D minor — tensions welcome, resolution optional
    this._prog = [
      { root: 38, third: 3, voicing: [53, 57, 60, 64] }, // Dm9
      { root: 43, third: 3, voicing: [53, 58, 62, 65] }, // Gm9
      { root: 38, third: 3, voicing: [53, 57, 60, 64] }, // Dm9
      { root: 33, third: 4, voicing: [49, 52, 55, 58] }, // A7b9
      { root: 46, third: 4, voicing: [50, 53, 57, 60] }, // Bbmaj9
      { root: 40, third: 3, voicing: [50, 55, 58, 62] }, // Em7b5
      { root: 33, third: 4, voicing: [49, 52, 55, 58] }, // A7b9
      { root: 38, third: 3, voicing: [53, 57, 62, 65] }, // Dm9, voiced higher
    ];

    const len = Math.floor(rate * 0.4);
    this._brushBuf = this.ctx.createBuffer(1, len, rate);
    const bd = this._brushBuf.getChannelData(0);
    for (let i = 0; i < len; i++) bd[i] = Math.random() * 2 - 1;

    let pos = 0; // song position in beats
    let next = this.ctx.currentTime + 0.3;
    const h = () => (Math.random() - 0.5) * 0.022; // loose hands
    const lay = 0.014; // the whole band sits just behind the beat

    this._jazzTimer = setInterval(() => {
      while (next < this.ctx.currentTime + 1.2) {
        const bar = Math.floor(pos / 4) % this._prog.length;
        const beat = pos % 4;
        const chord = this._prog[bar];
        const nextChord = this._prog[(bar + 1) % this._prog.length];
        const t = next + lay;

        // upright bass in a lazy two-feel; it only walks when the
        // phrase turns around
        if (bar % 4 === 3) {
          const w = [
            chord.root,
            chord.root + chord.third,
            chord.root + 7,
            nextChord.root + (Math.random() < 0.6 ? -1 : 2),
          ][beat];
          this._pluck(t + h(), midi(w), 0.048);
        } else if (beat === 0) {
          this._pluck(t + h(), midi(chord.root), 0.055);
        } else if (beat === 2) {
          const n = Math.random() < 0.3 ? chord.root + chord.third : chord.root + 7;
          this._pluck(t + h(), midi(n), 0.042);
        }

        // brushes: a slow circular sweep every beat, soft ride on 2 & 4
        this._sweep(t + h(), beat % 2 ? 0.006 : 0.0045);
        if (beat % 2 === 1 && Math.random() < 0.65) {
          this._ting(t + BEAT * 0.66 + h(), 0.0032);
        }

        // piano: one rolled chord a bar, placed like a comper —
        // on the one, pushed late, or sitting out entirely
        if (beat === 0) {
          const r = Math.random();
          if (r < 0.45) this._roll(t + h(), chord.voicing, 0.0085);
          else if (r < 0.7) this._roll(t + BEAT * 1.66 + h(), chord.voicing, 0.0065);
        }

        // …and every few bars, a small right-hand thought
        if (beat === 2 && bar % 2 === 1 && Math.random() < 0.35) {
          this._noodle(t + BEAT * 0.66);
        }

        // the room itself: a faint crackle now and then
        if (Math.random() < 0.3) {
          this._crackle(t + Math.random() * BEAT);
        }

        pos++;
        next += BEAT;
      }
    }, 240);
  }

  /* upright bass: dark, round, long release */
  _pluck(t, freq, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 210;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(lp).connect(g).connect(this._jazzOut);
    o.start(t);
    o.stop(t + 1.2);
  }

  /* brush sweep: the circular whisper on the snare head */
  _sweep(t, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._brushBuf;
    src.playbackRate.value = 0.65 + Math.random() * 0.15;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300 + Math.random() * 500;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.16);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(bp).connect(g).connect(this._jazzOut);
    src.start(t);
  }

  /* the ride, barely touched */
  _ting(t, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._brushBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(hp).connect(g).connect(this._jazzOut);
    src.start(t);
  }

  /* one piano note — a touch of hammer, a felt-damped body */
  _piano(t, m, vol, dur = 1.9) {
    const f = this._midi(m);
    for (const [mult, v] of [[1, 1], [2, 0.28], [1.002, 0.5]]) {
      const o = this.ctx.createOscillator();
      o.type = mult === 2 ? 'sine' : 'triangle';
      o.frequency.value = f * mult;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1500;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g).connect(this._jazzOut);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /* a chord rolled bottom-to-top, like a hand, not a machine */
  _roll(t, notes, vol) {
    notes.forEach((n, i) => {
      this._piano(t + i * (0.02 + Math.random() * 0.012), n, vol);
    });
  }

  /* a short right-hand phrase out of D minor pentatonic */
  _noodle(t) {
    const scale = [62, 65, 67, 69, 72, 74, 77];
    let idx = 2 + Math.floor(Math.random() * 3);
    const count = 3 + Math.floor(Math.random() * 3);
    let time = t;
    for (let i = 0; i < count; i++) {
      idx = Math.min(scale.length - 1, Math.max(0, idx + (Math.random() < 0.5 ? -1 : 1)));
      this._piano(time, scale[idx], 0.0065 * (1 - i * 0.12), 1.1);
      time += this._BEAT * (i % 2 ? 0.34 : 0.66); // swung eighths
    }
  }

  /* dust on the needle */
  _crackle(t) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._brushBuf;
    src.playbackRate.value = 2.5;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0022, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    src.connect(hp).connect(g).connect(this._jazzOut);
    src.start(t);
    src.stop(t + 0.02);
  }
}
