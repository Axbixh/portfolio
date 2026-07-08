/*
 * Match the Shot — the game inside the Lighting Room.
 * A target frame is rendered from a hidden recipe (same engine, one frame);
 * the player rebuilds it and is scored live on key position, ratio,
 * temperature, and lens. Daily challenge is seeded by the date so everyone
 * in the world gets the same brief; scores go to the leaderboard.
 */

const RATIOS = [1, 2, 4, 8];
const KELVINS = [2700, 3200, 4500, 5600, 7500];
const LENSES = [24, 35, 50, 85, 135];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MatchGame {
  constructor(room) {
    this.room = room;
    this.active = false;
    this.locked = false;
    this._buildUI();
  }

  /* ————— challenge generation ————— */

  dailyKey() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  _generate(seedStr) {
    let h = 0;
    for (const c of seedStr) h = (h * 31 + c.charCodeAt(0)) | 0;
    const rng = mulberry32(h);
    const side = rng() > 0.5 ? 1 : -1;
    return {
      key: seedStr,
      keyAz: side * (18 + Math.floor(rng() * 100)),   // loop → kicker range
      keyEl: 8 + Math.floor(rng() * 55),
      ratio: RATIOS[Math.floor(rng() * RATIOS.length)],
      keyK: KELVINS[Math.floor(rng() * KELVINS.length)],
      mm: LENSES[Math.floor(rng() * LENSES.length)],
    };
  }

  start(daily = true) {
    this.target = this._generate(
      daily ? this.dailyKey() : `r${Math.floor(Math.random() * 1e9)}`
    );
    this.daily = daily;
    this.active = true;
    this.locked = false;
    this.startedAt = performance.now();
    this._renderTarget();
    this.panel.classList.add('on');
    this.result.classList.remove('on');
    this.panel.querySelector('.g-lock').style.display = '';
    this.room.sound?.chime();
  }

  stop() {
    this.active = false;
    this.panel.classList.remove('on');
    this.result.classList.remove('on');
  }

  /* Render the target recipe through the real engine for one frame,
     capture it as the brief, then restore the player's setup. */
  _renderTarget() {
    const room = this.room;
    const t = this.target;
    const saved = { ...room.state };
    const savedPos = room.camera.position.clone();

    Object.assign(room.state, {
      keyOn: true, keyAz: t.keyAz, keyEl: t.keyEl, keyInt: 1.2, keyK: t.keyK,
      fillOn: true, fillInt: Math.min(1.2 / t.ratio, 1.5), fillK: 5600,
      rimOn: true, rimInt: 0.8, mm: t.mm,
    });
    room._applyState();
    // canonical viewpoint for the brief
    const d = room._lensDistance();
    room.camera.position.set(
      Math.sin(0.35) * d, room.controls.target.y + d * 0.06,
      Math.cos(0.35) * d
    );
    room.camera.lookAt(room.controls.target);
    room.update(1 / 60);
    room.render();

    const src = room.renderer.domElement;
    const c = document.createElement('canvas');
    const scale = 300 / src.height;
    c.width = Math.round(src.width * scale);
    c.height = 300;
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    this.targetImg.src = c.toDataURL('image/jpeg', 0.85);

    Object.assign(room.state, saved);
    room._applyState();
    room.camera.position.copy(savedPos);
  }

  /* ————— scoring ————— */

  score() {
    const s = this.room.state;
    const t = this.target;

    const dAz = Math.abs(s.keyAz - t.keyAz);
    const dEl = Math.abs(s.keyEl - t.keyEl);
    const key = clamp01(1 - Math.hypot(dAz, dEl * 1.3) / 85);

    const curRatio = (s.keyOn ? s.keyInt : 0) / Math.max(s.fillOn ? s.fillInt : 0, 0.02);
    const ratio = clamp01(1 - Math.abs(Math.log2(curRatio / t.ratio)) / 2);

    const temp = clamp01(1 - Math.abs(s.keyK - t.keyK) / 2600);
    const lens = clamp01(1 - Math.abs(Math.log2(s.mm / t.mm)) / 1.4);

    const total = key * 0.4 + ratio * 0.25 + temp * 0.2 + lens * 0.15;
    return { key, ratio, temp, lens, total: Math.round(total * 100) };
  }

  /* called from the room's frame loop */
  update() {
    if (!this.active || this.locked) return;
    const sc = this.score();
    if (sc.total !== this._shown) {
      this._shown = sc.total;
      this.pct.textContent = `${sc.total}%`;
      this.pct.style.color = sc.total >= 90 ? 'var(--gold)' : '';
    }
    this.bars.key.style.width = `${sc.key * 100}%`;
    this.bars.ratio.style.width = `${sc.ratio * 100}%`;
    this.bars.temp.style.width = `${sc.temp * 100}%`;
    this.bars.lens.style.width = `${sc.lens * 100}%`;
  }

  async lock() {
    if (!this.active || this.locked) return;
    this.locked = true;
    const sc = this.score();
    const secs = Math.round((performance.now() - this.startedAt) / 1000);
    const grade =
      sc.total >= 97 ? 'A+ · gaffer' :
      sc.total >= 90 ? 'A · best boy' :
      sc.total >= 80 ? 'B · sharp eye' :
      sc.total >= 65 ? 'C · keep looking' : 'study the light';

    this.result.querySelector('.r-score').textContent = `${sc.total}%`;
    this.result.querySelector('.r-grade').textContent = grade;
    this.result.querySelector('.r-time').textContent =
      `${secs}s · ${this.daily ? 'daily challenge' : 'free play'}`;
    this.result.classList.add('on');
    this.panel.querySelector('.g-lock').style.display = 'none';
    if (sc.total >= 90) this.room.sound?.fanfare();
    else this.room.sound?.chime();
    this._finalScore = sc.total;
    this._loadBoard();
  }

  async _submit() {
    const name = (this.nameInput.value || 'ANON')
      .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'ANON';
    this.submitBtn.disabled = true;
    this.submitBtn.textContent = 'SAVED';
    try {
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, score: this._finalScore,
          challenge: this.daily ? this.dailyKey() : 'free',
        }),
      });
    } catch { /* static deploy — board is optional */ }
    this._loadBoard();
  }

  async _loadBoard() {
    try {
      const key = this.daily ? this.dailyKey() : 'free';
      const res = await fetch(`/api/scores?challenge=${key}`);
      if (!res.ok) throw 0;
      const rows = await res.json();
      // textContent only — leaderboard data is user-generated
      this.board.textContent = '';
      const list = rows.slice(0, 8);
      if (!list.length) list.push({ name: 'no scores yet', score: '—' });
      list.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'b-row';
        const l = document.createElement('span');
        l.textContent = rows.length ? `${i + 1}. ${String(r.name).slice(0, 3)}` : String(r.name);
        const v = document.createElement('span');
        v.textContent = rows.length ? `${Math.round(Number(r.score)) || 0}%` : '—';
        row.append(l, v);
        this.board.appendChild(row);
      });
    } catch {
      this.board.innerHTML = '';
    }
  }

  /* ————— UI ————— */

  _buildUI() {
    const p = document.createElement('div');
    p.className = 'game-panel';
    p.innerHTML = `
      <div class="g-head">
        <span class="g-title">MATCH THE SHOT</span>
        <button class="g-quit" title="quit">✕</button>
      </div>
      <img class="g-target" alt="target frame" />
      <div class="g-score-row">
        <span class="g-pct">0%</span>
        <div class="g-bars">
          ${['key', 'ratio', 'temp', 'lens'].map((k) =>
            `<div class="g-bar"><span class="g-bar-l">${k}</span><div class="g-track"><div class="g-fill" data-k="${k}"></div></div></div>`
          ).join('')}
        </div>
      </div>
      <button class="g-lock">LOCK IT IN</button>
      <div class="g-result">
        <div class="r-score">0%</div>
        <div class="r-grade"></div>
        <div class="r-time"></div>
        <div class="r-submit">
          <input maxlength="3" placeholder="AAA" aria-label="initials" />
          <button class="r-save">SAVE SCORE</button>
        </div>
        <div class="g-board"></div>
        <div class="r-actions">
          <button class="r-again">RANDOM</button>
          <button class="r-daily">DAILY</button>
          <button class="r-sandbox">SANDBOX</button>
        </div>
      </div>`;
    document.body.appendChild(p);
    this.panel = p;
    this.targetImg = p.querySelector('.g-target');
    this.pct = p.querySelector('.g-pct');
    this.result = p.querySelector('.g-result');
    this.board = p.querySelector('.g-board');
    this.nameInput = p.querySelector('.r-submit input');
    this.submitBtn = p.querySelector('.r-save');
    this.bars = {};
    p.querySelectorAll('.g-fill').forEach((el) => {
      this.bars[el.dataset.k] = el;
    });

    p.querySelector('.g-quit').addEventListener('click', () => this.stop());
    p.querySelector('.g-lock').addEventListener('click', () => this.lock());
    this.submitBtn.addEventListener('click', () => this._submit());
    p.querySelector('.r-again').addEventListener('click', () => {
      this._resetSubmit(); this.start(false);
    });
    p.querySelector('.r-daily').addEventListener('click', () => {
      this._resetSubmit(); this.start(true);
    });
    p.querySelector('.r-sandbox').addEventListener('click', () => this.stop());
  }

  _resetSubmit() {
    this.submitBtn.disabled = false;
    this.submitBtn.textContent = 'SAVE SCORE';
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
