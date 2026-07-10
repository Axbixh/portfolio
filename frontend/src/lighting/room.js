/*
 * The Lighting Room (spec §4) — a disciplined real-time cinematography
 * sandbox. One subject, three lights, orbit camera, lens with matched
 * framing, pattern naming, key:fill ratio, Shot Card output.
 *
 * This module is lazy-loaded (code-split) the first time you enter.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  classifyPattern, broadOrShort, ratioLabel, tempLabel, kelvinToRGB, mmToFov,
} from './patterns.js';
import { makeShotCard, shareOrDownload } from './shotcard.js';
import { publishShotCard } from '../api.js';
import { SITE } from '../content.js';

const HEAD = new THREE.Vector3(0, 1.5, 0);
const GRID_Y = 5.6; // height of the overhead pipe grid
const FRAME_HALF_H = 1.5; // matched framing: bust + headroom, same at every focal length

export class LightingRoom {
  constructor(renderer, cfg) {
    this.renderer = renderer;
    this.cfg = cfg;

    this.state = {
      keyOn: true, keyAz: 42, keyEl: 32, keyInt: 1.2, keyK: 3200,
      fillOn: true, fillInt: 0.35, fillK: 5600,
      rimOn: true, rimInt: 0.8,
      mm: 35, dof: false,
    };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080503);
    this.scene.fog = new THREE.FogExp2(0x080503, 0.02);

    this.camera = new THREE.PerspectiveCamera(
      mmToFov(this.state.mm), innerWidth / innerHeight, 0.1, 60
    );

    this._buildStage();
    this._buildSubject();
    this._buildLights();
    this._buildControls();
    this._buildPost();
    this._buildHUD();

    this._sph = new THREE.Spherical();
    this._readout = { pattern: '', line: '' };
    this._phiTween = null;
    this._applyState();
  }

  /* ————— construction ————— */

  _buildStage() {
    // studio sweep: warm gray cyc + floor so light pools actually read
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1d1915, roughness: 0.95, metalness: 0,
    });
    // big enough that the 135mm matched-framing dolly stays inside it
    const cyc = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 14, 18, 64, 1, true), mat
    );
    cyc.material.side = THREE.BackSide;
    cyc.position.y = 6;
    cyc.receiveShadow = true;

    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;

    // overhead lighting grid the fixtures hang from
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x15120e, roughness: 0.5, metalness: 0.7,
    });
    const pipeGeo = new THREE.CylinderGeometry(0.035, 0.035, 15, 8);
    const grid = new THREE.Group();
    for (const z of [-4.5, -1.5, 1.5, 4.5]) {
      const p = new THREE.Mesh(pipeGeo, pipeMat);
      p.rotation.z = Math.PI / 2;
      p.position.set(0, GRID_Y, z);
      grid.add(p);
    }
    for (const x of [-3.5, 0, 3.5]) {
      const p = new THREE.Mesh(pipeGeo, pipeMat);
      p.rotation.x = Math.PI / 2;
      p.position.set(x, GRID_Y + 0.08, 0);
      grid.add(p);
    }
    this.scene.add(grid);

    // spike mark on the floor — where the talent stands
    const tapeMat = new THREE.MeshBasicMaterial({
      color: 0xcfc7ba, transparent: true, opacity: 0.55,
    });
    for (const [w, h, z, rot] of [[0.5, 0.05, 0.85, 0], [0.05, 0.3, 1.02, 0]]) {
      const tape = new THREE.Mesh(new THREE.PlaneGeometry(w, h), tapeMat);
      tape.rotation.x = -Math.PI / 2;
      tape.rotation.z = rot;
      tape.position.set(0, 0.014, z);
      this.scene.add(tape);
    }

    // contact shadow — a soft radial blob, honest and nearly free
    const blob = document.createElement('canvas');
    blob.width = blob.height = 128;
    const bx = blob.getContext('2d');
    const grad = bx.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.62)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    bx.fillStyle = grad;
    bx.fillRect(0, 0, 128, 128);
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 2.1),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(blob),
        transparent: true, depthWrite: false,
      })
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.012;

    this.scene.add(cyc, floor, contact);
  }

  _buildSubject() {
    // A stylized mannequin bust. If you drop a real model at
    // frontend/public/subject.glb later, load it here instead —
    // keep it ≤50k tris per the perf budget.
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9c8a76, roughness: 0.58, metalness: 0,
    });
    const g = new THREE.Group();

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 32), mat);
    head.scale.set(1, 1.2, 1.02);
    head.position.copy(HEAD);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 18), mat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.44, 0.42);

    const earGeo = new THREE.SphereGeometry(0.085, 16, 12);
    const earL = new THREE.Mesh(earGeo, mat);
    earL.position.set(-0.42, 1.48, 0);
    const earR = new THREE.Mesh(earGeo, mat);
    earR.position.set(0.42, 1.48, 0);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.4, 24), mat);
    neck.position.set(0, 1.1, 0);

    // rounded shoulders: a squashed, widened sphere
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 24), mat);
    chest.scale.set(1.12, 0.72, 0.6);
    chest.position.set(0, 0.76, 0);

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 0.55, 32), mat);
    plinth.position.set(0, 0.3, 0);

    g.add(head, nose, earL, earR, neck, chest, plinth);
    g.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    this.scene.add(g);
    this.subject = g;
    this._mannequinHead = [head, nose, earL, earR, neck, chest];
    this._loadScannedHead();
  }

  /* Swap the primitive head for the scanned one (Lee Perry-Smith,
     CC-licensed photogrammetry) if the assets are present. Draco ~400KB,
     loaded only inside the room; the mannequin stays as the fallback. */
  async _loadScannedHead() {
    try {
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/loaders/DRACOLoader.js'),
      ]);
      const draco = new DRACOLoader().setDecoderPath('/draco/');
      const loader = new GLTFLoader().setDRACOLoader(draco);

      const texLoader = new THREE.TextureLoader();
      const quiet = (p) => texLoader.loadAsync(p).catch(() => null);
      const [gltf, col, nrm] = await Promise.all([
        loader.loadAsync('/subject/head.glb'),
        quiet('/subject/col.jpg'),
        quiet('/subject/normal.jpg'),
      ]);

      let mesh = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      if (!mesh) return;

      if (col) col.colorSpace = THREE.SRGBColorSpace;
      mesh.material = new THREE.MeshStandardMaterial({
        map: col || null,
        normalMap: nrm || null,
        color: col ? 0xffffff : 0x9c8a76,
        roughness: 0.55,
        metalness: 0,
      });
      mesh.castShadow = mesh.receiveShadow = true;

      // the scan is a full bust (head, neck, clavicle) — normalize it and
      // seat it on the plinth in place of the whole primitive body
      const wrap = new THREE.Group();
      wrap.add(mesh);
      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const H = 1.55;
      const s = H / size.y;
      mesh.position.sub(center);
      wrap.scale.setScalar(s);
      wrap.position.set(0, 0.55 + H / 2, 0.02); // bottom rests on the plinth
      this.subject.add(wrap);

      for (const part of this._mannequinHead) {
        this.subject.remove(part);
        part.geometry.dispose();
      }
      draco.dispose();
    } catch {
      /* assets missing or blocked — the mannequin carries on */
    }
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x120d09, 1.4));

    // KEY — the movable, shadow-casting light
    this.key = new THREE.SpotLight(0xffffff, 4, 0, 0.82, 0.85, 0);
    this.key.target.position.copy(HEAD);
    if (this.cfg.shadows) {
      this.key.castShadow = true;
      this.key.shadow.mapSize.setScalar(this.cfg.shadowMapSize || 512);
      this.key.shadow.camera.near = 0.6;
      this.key.shadow.camera.far = 12;
      this.key.shadow.bias = -0.0002;
      this.key.shadow.normalBias = 0.015;
    }
    this.scene.add(this.key, this.key.target);

    // FILL — rides near the camera, opposite the key's side
    this.fill = new THREE.PointLight(0xffffff, 1, 0, 0);
    this.scene.add(this.fill);

    // RIM / BACK — behind the subject, opposite the key
    this.rim = new THREE.SpotLight(0xfff2e0, 3, 0, 0.85, 0.6, 0);
    this.rim.target.position.copy(HEAD);
    this.scene.add(this.rim, this.rim.target);

    // visible fixtures — softbox heads hung from the grid, one per light
    this.keyFix = this._makeFixture(0.56);
    this.fillFix = this._makeFixture(0.4);
    this.rimFix = this._makeFixture(0.3);
  }

  /* A softbox head: metal body + hood, glowing diffuser face, and a
     hanger rod up to the grid. The diffuser mirrors its light's color
     and power, so you can read the setup at a glance. */
  _makeFixture(size) {
    const metal = new THREE.MeshStandardMaterial({
      color: 0x17130f, roughness: 0.5, metalness: 0.65,
    });
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size * 0.5), metal
    );
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(size * 1.14, size * 1.14, size * 0.14), metal
    );
    hood.position.z = size * 0.26;
    const diffuser = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 0.86, size * 0.86),
      new THREE.MeshBasicMaterial({ toneMapped: false })
    );
    diffuser.position.z = size * 0.34;
    g.add(body, hood, diffuser);
    this.scene.add(g);

    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 1, 8),
      new THREE.MeshStandardMaterial({
        color: 0x121009, roughness: 0.6, metalness: 0.6,
      })
    );
    this.scene.add(rod);

    return { group: g, diffuser, rod };
  }

  /* Park a fixture at its light's position, aim it at the head, and
     hang it from the grid. Diffuser glow = the light's color × power. */
  _syncFixture(fix, light, on, power) {
    const p = light.position;
    fix.group.position.copy(p);
    fix.group.lookAt(HEAD);
    fix.rod.position.set(p.x, (p.y + GRID_Y) / 2, p.z);
    fix.rod.scale.y = Math.max(0.05, GRID_Y - p.y);
    if (on && power > 0.02) {
      fix.diffuser.material.color
        .copy(light.color)
        .multiplyScalar(0.25 + power * 1.3);
    } else {
      fix.diffuser.material.color.setRGB(0.05, 0.045, 0.04);
    }
  }

  _buildControls() {
    const c = new OrbitControls(this.camera, this.renderer.domElement);
    c.target.copy(HEAD).y = 1.18;
    c.enablePan = false;
    c.enableZoom = false; // dolly belongs to the lens (matched framing)
    c.enableDamping = true;
    c.dampingFactor = 0.07;
    c.minPolarAngle = 0.5;
    c.maxPolarAngle = 1.95;
    c.enabled = false;
    this.controls = c;

    // starting position: slight angle, 85mm distance
    const d = this._lensDistance();
    this.camera.position.set(Math.sin(0.35) * d, 1.5, Math.cos(0.35) * d);
    c.update();
  }

  _buildPost() {
    if (!this.cfg.bloom) { this.composer = null; return; }
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (this.cfg.dof) {
      this.bokeh = new BokehPass(this.scene, this.camera, {
        focus: 6.5, aperture: 0.0014, maxblur: 0.008,
      });
      this.bokeh.enabled = false;
      c.addPass(this.bokeh);
    }
    c.addPass(new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.7, 1.0
    ));
    c.addPass(new OutputPass());
    this.composer = c;
  }

  /* ————— HUD ————— */

  _buildHUD() {
    const hud = document.createElement('div');
    hud.id = 'room-hud';
    hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-title">
          <span class="k">The Lighting Room</span>
          <div class="pattern" id="lr-pattern">—</div>
          <span class="note" id="lr-note"></span>
        </div>
        <div class="hud-top-right">
          <button class="hud-exit" id="lr-exit">← EXIT</button>
        </div>
      </div>
      <div class="hud-map">
        <canvas id="lr-map" width="132" height="132"></canvas>
        <span class="map-label">plan</span>
      </div>
      <div class="hud-recipe" id="lr-recipe"></div>
      <div class="hud-console" id="lr-console"></div>`;
    document.body.appendChild(hud);
    this.hud = hud;

    hud.querySelector('#lr-exit').addEventListener('click', () => this.onExit?.());
    this.mapCtx = hud.querySelector('#lr-map').getContext('2d');

    const console_ = hud.querySelector('#lr-console');
    const s = this.state;

    const group = (label) => {
      const g = document.createElement('div');
      g.className = 'hud-group';
      g.innerHTML = `<div class="g-label">${label}</div>`;
      console_.appendChild(g);
      return g;
    };

    const slider = (g, label, min, max, step, get, set, fmt) => {
      const row = document.createElement('div');
      row.className = 'hud-row';
      row.innerHTML = `<span class="r-label">${label}</span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${get()}">
        <span class="r-val"></span>`;
      const input = row.querySelector('input');
      const val = row.querySelector('.r-val');
      const paint = () => { val.textContent = fmt(get()); };
      input.addEventListener('input', () => {
        set(parseFloat(input.value));
        paint();
        this._applyState();
        this.sound?.tick();
      });
      paint();
      g.appendChild(row);
      return { input, paint };
    };

    const toggle = (g, id, get, set) => {
      const row = document.createElement('div');
      row.className = 'hud-toggle-row';
      row.innerHTML = `<input type="checkbox" id="${id}" ${get() ? 'checked' : ''}>
        <label for="${id}">enabled</label>`;
      row.querySelector('input').addEventListener('change', (e) => {
        set(e.target.checked);
        this._applyState();
      });
      g.appendChild(row);
    };

    // KEY
    const gKey = group('Key');
    toggle(gKey, 'lr-key', () => s.keyOn, (v) => (s.keyOn = v));
    slider(gKey, 'orbit', -180, 180, 1, () => s.keyAz, (v) => (s.keyAz = v), (v) => `${v | 0}°`);
    slider(gKey, 'height', -40, 85, 1, () => s.keyEl, (v) => (s.keyEl = v), (v) => `${v | 0}°`);
    slider(gKey, 'power', 0, 2, 0.02, () => s.keyInt, (v) => (s.keyInt = v), (v) => v.toFixed(2));
    slider(gKey, 'temp', 2200, 9000, 50, () => s.keyK, (v) => (s.keyK = v), (v) => `${v | 0}K`);

    // FILL
    const gFill = group('Fill');
    toggle(gFill, 'lr-fill', () => s.fillOn, (v) => (s.fillOn = v));
    slider(gFill, 'power', 0, 1.5, 0.02, () => s.fillInt, (v) => (s.fillInt = v), (v) => v.toFixed(2));
    slider(gFill, 'temp', 2200, 9000, 50, () => s.fillK, (v) => (s.fillK = v), (v) => `${v | 0}K`);

    // RIM
    const gRim = group('Back / Rim');
    toggle(gRim, 'lr-rim', () => s.rimOn, (v) => (s.rimOn = v));
    slider(gRim, 'power', 0, 2, 0.02, () => s.rimInt, (v) => (s.rimInt = v), (v) => v.toFixed(2));

    // CAMERA
    const gCam = group('Camera');
    slider(gCam, 'lens', 24, 135, 1, () => s.mm, (v) => (s.mm = v), (v) => `${v | 0}mm`);
    const btns = document.createElement('div');
    btns.className = 'hud-btns';
    const angles = [
      ['LOW', 1.78], ['EYE', 1.52], ['HIGH', 1.12],
    ];
    for (const [label, phi] of angles) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => {
        btns.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        this._phiTween = { from: this._currentPhi(), to: phi, t0: performance.now() };
      });
      btns.appendChild(b);
    }
    gCam.appendChild(btns);

    if (this.cfg.dof) {
      const dofRow = document.createElement('div');
      dofRow.className = 'hud-toggle-row';
      dofRow.innerHTML = `<input type="checkbox" id="lr-dof"><label for="lr-dof">depth of field</label>`;
      dofRow.querySelector('input').addEventListener('change', (e) => {
        s.dof = e.target.checked;
        if (this.bokeh) this.bokeh.enabled = s.dof;
      });
      gCam.appendChild(dofRow);
    }

    // CAPTURE
    const cap = document.createElement('button');
    cap.className = 'hud-capture';
    cap.textContent = 'CAPTURE ▸ SHOT CARD';
    cap.addEventListener('click', () => this._captureShotCard());
    console_.appendChild(cap);

    // toast
    this.toast = document.createElement('div');
    this.toast.className = 'toast';
    document.body.appendChild(this.toast);

    // swipe affordance: on phones only KEY fits — say so until they scroll
    const more = document.createElement('div');
    more.className = 'hud-more';
    more.textContent = 'swipe';
    hud.appendChild(more);
    const syncScrollHint = () => {
      const scrollable = console_.scrollWidth > console_.clientWidth + 8;
      const atEnd =
        console_.scrollLeft + console_.clientWidth >= console_.scrollWidth - 6;
      console_.classList.toggle('faded', scrollable && !atEnd);
      more.classList.toggle('on', scrollable && console_.scrollLeft < 30);
      more.style.bottom = `${Math.max(console_.offsetHeight / 2 - 12, 40)}px`;
    };
    console_.addEventListener('scroll', syncScrollHint, { passive: true });
    addEventListener('resize', syncScrollHint);
    this._syncScrollHint = syncScrollHint;
  }

  /* ————— state → lights ————— */

  _applyState() {
    const s = this.state;
    const d2r = THREE.MathUtils.degToRad;

    // key on its sphere around the head (az 0 = in front of the face, +Z)
    const r = 2.4;
    const az = d2r(s.keyAz);
    const el = d2r(s.keyEl);
    this.key.position.set(
      Math.sin(az) * Math.cos(el) * r,
      HEAD.y + Math.sin(el) * r,
      Math.cos(az) * Math.cos(el) * r
    );
    this.key.visible = s.keyOn && s.keyInt > 0.02;
    this.key.intensity = s.keyInt * 3.6;
    this.key.color.setRGB(...kelvinToRGB(s.keyK));

    this.fill.visible = s.fillOn && s.fillInt > 0.02;
    this.fill.intensity = s.fillInt * 1.6;
    this.fill.color.setRGB(...kelvinToRGB(s.fillK));

    this.rim.visible = s.rimOn && s.rimInt > 0.02;
    this.rim.intensity = s.rimInt * 4.2;

    // lens → fov + matched-framing dolly
    this.camera.fov = mmToFov(s.mm);
    this.camera.updateProjectionMatrix();
  }

  _lensDistance() {
    const vfov = THREE.MathUtils.degToRad(mmToFov(this.state.mm));
    // clamp so the long-lens dolly never leaves the cyc
    return Math.min(FRAME_HALF_H / Math.tan(vfov / 2), 13);
  }

  _currentPhi() {
    this._sph.setFromVector3(
      this.camera.position.clone().sub(this.controls.target)
    );
    return this._sph.phi;
  }

  /* ————— per-frame ————— */

  update(dt) {
    const s = this.state;
    const c = this.controls;

    // camera-height preset tween
    if (this._phiTween) {
      const k = Math.min(1, (performance.now() - this._phiTween.t0) / 700);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const phi = THREE.MathUtils.lerp(this._phiTween.from, this._phiTween.to, e);
      this._sph.setFromVector3(this.camera.position.clone().sub(c.target));
      this._sph.phi = phi;
      this.camera.position.setFromSpherical(this._sph).add(c.target);
      if (k >= 1) this._phiTween = null;
    }

    // dolly locked to the lens
    const d = this._lensDistance();
    c.minDistance = c.maxDistance = d;
    c.update();

    // fill + rim positions follow the camera each frame
    const camAz = c.getAzimuthalAngle();
    const keyAz = THREE.MathUtils.degToRad(s.keyAz);
    const side = Math.sign(keyAz - camAz) || 1;

    const fillAz = camAz - side * 0.55;
    this.fill.position.set(
      Math.sin(fillAz) * 2.5, HEAD.y + 0.8, Math.cos(fillAz) * 2.5
    );

    const rimAz = camAz + Math.PI - side * 0.55;
    this.rim.position.set(
      Math.sin(rimAz) * 2.6, HEAD.y + 1.5, Math.cos(rimAz) * 2.6
    );

    // fixtures track their lights every frame
    this._syncFixture(this.keyFix, this.key, s.keyOn, s.keyInt);
    this._syncFixture(this.fillFix, this.fill, s.fillOn, s.fillInt);
    this._syncFixture(this.rimFix, this.rim, s.rimOn, s.rimInt);

    if (this.bokeh?.enabled) {
      this.bokeh.uniforms.focus.value = this.camera.position.distanceTo(HEAD);
    }

    this._updateReadout(camAz);
    this._drawMap(camAz);
  }

  /* Plan-view lighting diagram — how cinematographers actually draw a
     setup. Face points down the map (toward the default camera). */
  _drawMap(camAz) {
    const x = this.mapCtx;
    const s = this.state;
    const S = 132, C = S / 2, SCALE = 52 / 4.0;
    x.clearRect(0, 0, S, S);

    // stage
    x.strokeStyle = 'rgba(224,169,110,0.28)';
    x.lineWidth = 1;
    x.beginPath();
    x.arc(C, C, 56, 0, Math.PI * 2);
    x.stroke();

    const px = (az, r) => C + Math.sin(az) * Math.min(r, 3.9) * SCALE;
    const py = (az, r) => C + Math.cos(az) * Math.min(r, 3.9) * SCALE;

    // subject + facing tick
    x.fillStyle = '#efe7dc';
    x.beginPath();
    x.arc(C, C, 3.5, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(239,231,220,0.6)';
    x.beginPath();
    x.moveTo(C, C);
    x.lineTo(C, C + 9);
    x.stroke();

    // camera — a wedge at its azimuth and (clamped) dolly distance
    const camR = this.camera.position.distanceTo(this.controls.target);
    const cx = px(camAz, camR), cy = py(camAz, camR);
    x.save();
    x.translate(cx, cy);
    x.rotate(-camAz);
    x.fillStyle = '#e0a96e';
    x.beginPath();
    x.moveTo(0, -5);
    x.lineTo(4.5, 4);
    x.lineTo(-4.5, 4);
    x.closePath();
    x.fill();
    x.restore();

    // lights
    const d2r = THREE.MathUtils.degToRad;
    const side = Math.sign(d2r(s.keyAz) - camAz) || 1;
    const dots = [
      ['K', d2r(s.keyAz), 2.4, s.keyOn && s.keyInt > 0.02, '#f5c542'],
      ['F', camAz - side * 0.55, 2.5, s.fillOn && s.fillInt > 0.02, '#e0a96e'],
      ['R', camAz + Math.PI - side * 0.55, 2.6, s.rimOn && s.rimInt > 0.02, '#efe7dc'],
    ];
    x.font = '8px "IBM Plex Mono", monospace';
    for (const [ch, az, r, on, col] of dots) {
      const dx = px(az, r), dy = py(az, r);
      x.fillStyle = on ? col : 'rgba(120,105,90,0.45)';
      x.beginPath();
      x.arc(dx, dy, 4, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = on ? 'rgba(10,7,5,0.9)' : 'rgba(10,7,5,0.7)';
      x.fillText(ch, dx - 2.5, dy + 3);
    }
  }

  _updateReadout(camAz) {
    const s = this.state;
    const camAzDeg = THREE.MathUtils.radToDeg(camAz);

    const keyDead = !s.keyOn || s.keyInt <= 0.02;
    const pat = keyDead
      ? {
          name: 'No key',
          note: 'Everything starts with the key. Bring it back, or let the rim carry a silhouette.',
        }
      : classifyPattern(s.keyAz, s.keyEl);
    const side = keyDead ? null : broadOrShort(s.keyAz, camAzDeg);
    const ratio = ratioLabel(
      s.keyOn ? s.keyInt : 0,
      s.fillOn ? s.fillInt : 0
    );
    const phi = this._currentPhi();
    const angle = phi > 1.66 ? 'low angle' : phi < 1.32 ? 'high angle' : 'eye level';

    const patternText = side ? `${pat.name} · ${side}` : pat.name;
    const line =
      `${ratio.ratio} ${ratio.mood} · key ${s.keyK | 0}K ${tempLabel(s.keyK)}` +
      ` · ${s.mm | 0}mm · ${angle}`;

    if (patternText !== this._readout.pattern) {
      this.hud.querySelector('#lr-pattern').textContent = patternText;
      this.hud.querySelector('#lr-note').textContent = pat.note;
      this._readout.pattern = patternText;
    }
    if (line !== this._readout.line) {
      this.hud.querySelector('#lr-recipe').innerHTML =
        line.replaceAll(' · ', '<br>');
      this._readout.line = line;
    }
    // the full recipe (kept fresh every frame) — the Shot Card reads this
    const side2 = Math.sign(THREE.MathUtils.degToRad(s.keyAz) - camAz) || 1;
    this._recipe = {
      pattern: patternText,
      line,
      note: pat.note,
      lights: {
        key: { on: s.keyOn, az: Math.round(s.keyAz), el: Math.round(s.keyEl), power: s.keyInt, k: s.keyK },
        fill: { on: s.fillOn, power: s.fillInt, k: s.fillK, az: camAz - side2 * 0.55 },
        rim: { on: s.rimOn, power: s.rimInt, az: camAz + Math.PI - side2 * 0.55 },
        camAz,
        ratio: ratio.ratio,
        mm: s.mm,
        angle,
      },
    };
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  enter() {
    this.controls.enabled = true;
    this.hud.classList.add('on');
    this._syncScrollHint();
  }

  exit() {
    this.controls.enabled = false;
    this.hud.classList.remove('on');
  }

  /* ————— the Shot Card ————— */

  async _captureShotCard() {
    // render synchronously, then read the canvas in the same task
    this.render();
    const card = await makeShotCard({
      frameCanvas: this.renderer.domElement,
      recipe: this._recipe,
      siteName: SITE.name,
    });
    const name = `shot-card-${this._recipe.pattern.split(' ')[0].toLowerCase()}.png`;
    this.sound?.shutter();
    await shareOrDownload(card, name);
    publishShotCard(card, this._recipe).then((res) => {
      // backend gave it a home — put the share URL on the clipboard
      if (res?.id) {
        navigator.clipboard
          ?.writeText(`${location.origin}/shot/${res.id}`)
          .then(() => { this.toast.textContent = 'SAVED · SHARE LINK COPIED'; })
          .catch(() => {});
      }
    });
    this.toast.textContent = 'SHOT CARD SAVED';
    this.toast.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toast.classList.remove('on'), 2400);
  }
}
