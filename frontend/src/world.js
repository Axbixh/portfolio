/*
 * The world (spec §2–3): a dark volumetric observatory. The camera travels
 * a curated spline between sections, driven by scroll / drag / tap-to-travel,
 * with gyro or pointer parallax layered on top. The world stays light:
 * instanced geometry, heavy fog, emissive practicals, one traveling light.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const CAM_STOPS = [
  [0.0, 2.0, 26], [7.5, 1.2, 14], [11.0, 0.2, 0], [4.0, -0.8, -11],
  [-6.0, -1.8, -10], [-11.0, -2.8, 2], [-5.0, -3.8, 13], [3.0, -4.6, 22],
];
const ANCHORS = [
  [0.0, 1.6, 12], [12.0, 1.0, 5], [9.0, 0.0, -9], [-2.0, -1.0, -17],
  [-12.0, -2.0, -3], [-10.0, -3.0, 10], [1.0, -4.0, 19], [8.0, -5.0, 27],
];

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const damp = (a, b, lambda, dt) => THREE.MathUtils.damp(a, b, lambda, dt);

export class World {
  constructor(renderer, cfg) {
    this.renderer = renderer;
    this.cfg = cfg;
    this.sectionCount = CAM_STOPS.length;

    this.u = 0;          // eased progress 0..1
    this.targetU = 0;
    this.tween = null;
    this.active = false; // input enabled
    this.lastInputAt = 0;

    this.parallax = new THREE.Vector2();
    this.parallaxTarget = new THREE.Vector2();
    this.gyroOn = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0705);
    this.scene.fog = new THREE.FogExp2(0x0a0705, 0.055);

    this.camera = new THREE.PerspectiveCamera(
      55, innerWidth / innerHeight, 0.1, 80
    );

    this.camCurve = new THREE.CatmullRomCurve3(
      CAM_STOPS.map((p) => new THREE.Vector3(...p)), false, 'centripetal'
    );
    this.lookCurve = new THREE.CatmullRomCurve3(
      ANCHORS.map((p) => new THREE.Vector3(...p)), false, 'centripetal'
    );

    this._buildScene();
    this._buildPost();
    this._bindInput();

    // scratch vectors
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._off = new THREE.Vector3();
  }

  /* ————— scene ————— */

  _buildScene() {
    const { cfg, scene } = this;

    this.hemi = new THREE.HemisphereLight(0x2a1d12, 0x060302, 1.1);
    scene.add(this.hemi);

    // the traveling "lantern" — one cheap light that follows the camera
    this.lantern = new THREE.PointLight(0xe0a96e, 30, 34, 1.4);
    scene.add(this.lantern);

    // warm ↔ cool mood state (stretch feature, baked as color lerps)
    this.mood = 0;
    this._moodTarget = 0;
    this._flare = 0;

    // ——— section monoliths ———
    const slabGeo = new THREE.BoxGeometry(1.7, 3.8, 0.35);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x161009, roughness: 0.85, metalness: 0.15,
    });
    const edgeGeo = new THREE.PlaneGeometry(0.07, 3.8);
    const edgeMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    edgeMat.color.setRGB(1.6, 1.05, 0.45); // just past 1.0 — subtle bloom, not a lightsaber
    this.edgeMat = edgeMat;

    this.monoliths = [];
    for (let i = 1; i < ANCHORS.length; i++) {
      const a = new THREE.Vector3(...ANCHORS[i]);
      // shift each monolith to screen-right of the camera's gaze so the
      // section text (left-aligned) never fights the glow
      const camP = new THREE.Vector3(...CAM_STOPS[i]);
      const dir = a.clone().sub(camP).setY(0).normalize();
      a.addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 1.7);
      let m;
      if (i === 5) {
        // Lighting Room portal — a glowing ring, the one gold object
        m = new THREE.Group();
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.7, 0.05, 10, 64),
          new THREE.MeshBasicMaterial({ toneMapped: false })
        );
        ring.material.color.setRGB(3.2, 2.5, 0.8);
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(1.62, 48),
          new THREE.MeshBasicMaterial({
            color: 0x120b06, transparent: true, opacity: 0.88,
          })
        );
        m.add(ring, disc);
      } else {
        m = new THREE.Group();
        const slab = new THREE.Mesh(slabGeo, slabMat);
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position.set(-0.885, 0, 0.18);
        m.add(slab, edge);
        m.rotation.y = (i / ANCHORS.length) * Math.PI * 2;
      }
      m.position.copy(a);
      m.lookAt(new THREE.Vector3(...CAM_STOPS[i]));
      m.userData.baseY = a.y;
      m.userData.phase = i * 1.7;
      scene.add(m);
      this.monoliths.push(m);
    }

    // ——— instanced shards (the architecture of the void) ———
    const shardGeo = new THREE.DodecahedronGeometry(1, 0);
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0x141009, roughness: 0.95, metalness: 0.1, flatShading: true,
    });
    const shards = new THREE.InstancedMesh(shardGeo, shardMat, cfg.instances);
    const dummy = new THREE.Object3D();
    const rng = mulberry32(7);
    for (let i = 0; i < cfg.instances; i++) {
      const r = 16 + rng() * 30;
      const th = rng() * Math.PI * 2;
      dummy.position.set(
        Math.cos(th) * r,
        -14 + rng() * 26,
        Math.sin(th) * r * 0.9 + (rng() - 0.5) * 20
      );
      dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      const s = 0.35 + rng() * 2.3;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      shards.setMatrixAt(i, dummy.matrix);
    }
    shards.instanceMatrix.needsUpdate = true;
    scene.add(shards);
    this.shards = shards;

    // ——— practicals: warm floating lights (the "stars/suns") ———
    const pracGeo = new THREE.IcosahedronGeometry(0.055, 1);
    const pracMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    pracMat.color.setRGB(2.6, 1.55, 0.62);
    this.pracMat = pracMat;
    const pracCount = Math.floor(cfg.instances * 0.55);
    const pracs = new THREE.InstancedMesh(pracGeo, pracMat, pracCount);
    for (let i = 0; i < pracCount; i++) {
      const r = 6 + rng() * 26;
      const th = rng() * Math.PI * 2;
      dummy.position.set(
        Math.cos(th) * r,
        -12 + rng() * 22,
        Math.sin(th) * r * 0.9 + (rng() - 0.5) * 18
      );
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.6 + rng() * 1.6);
      dummy.updateMatrix();
      pracs.setMatrixAt(i, dummy.matrix);
    }
    pracs.instanceMatrix.needsUpdate = true;
    scene.add(pracs);
    this.pracs = pracs;

    // ——— dust ———
    if (cfg.particles > 0) {
      const n = cfg.particles;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (rng() - 0.5) * 56;
        pos[i * 3 + 1] = -14 + rng() * 24;
        pos[i * 3 + 2] = (rng() - 0.5) * 56;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({
        color: 0xe0a96e, size: 0.05, sizeAttenuation: true,
        transparent: true, opacity: 0.5, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.dust = new THREE.Points(g, m);
      this.scene.add(this.dust);
    }
  }

  _buildPost() {
    if (!this.cfg.bloom) { this.composer = null; return; }
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.85, 1.0
    );
    c.addPass(bloom);
    c.addPass(new OutputPass());
    this.composer = c;
  }

  /* ————— input ————— */

  _bindInput() {
    const bump = (d) => {
      if (!this.active) return;
      this.tween = null;
      this.targetU = THREE.MathUtils.clamp(this.targetU + d, 0, 1);
      this.lastInputAt = performance.now();
    };

    addEventListener('wheel', (e) => {
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      bump(dy * 0.00038);
    }, { passive: true });

    let touchY = null;
    addEventListener('touchstart', (e) => {
      // panels cover much of a phone screen — drags on text still travel;
      // only real controls swallow the gesture
      if (e.target.closest(
        'button, a, input, .work-card, .nav-rail, .viewer, #room-hud, #boot'
      )) return;
      touchY = e.touches[0].clientY;
    }, { passive: true });
    addEventListener('touchmove', (e) => {
      if (touchY == null) return;
      const y = e.touches[0].clientY;
      bump(((touchY - y) / innerHeight) * 0.55);
      touchY = y;
    }, { passive: true });
    addEventListener('touchend', () => { touchY = null; });

    addEventListener('keydown', (e) => {
      if (!this.active) return;
      const idx = Math.round(this.targetU * (this.sectionCount - 1));
      if (['ArrowDown', 'PageDown', ' '].includes(e.key)) {
        this.travelTo(Math.min(idx + 1, this.sectionCount - 1));
      } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
        this.travelTo(Math.max(idx - 1, 0));
      }
    });

    // pointer parallax (desktop)
    if (!matchMedia('(pointer: coarse)').matches) {
      addEventListener('pointermove', (e) => {
        this.parallaxTarget.set(
          (e.clientX / innerWidth - 0.5) * 2,
          (e.clientY / innerHeight - 0.5) * 2
        );
      });
    }
  }

  /* Gyro parallax — call after a user gesture (iOS needs the permission). */
  async enableGyro() {
    if (this.gyroOn || !this.cfg.gyro) return;
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return;
      }
      let baseBeta = null;
      addEventListener('deviceorientation', (e) => {
        if (e.gamma == null || e.beta == null) return;
        if (baseBeta === null) baseBeta = e.beta;
        this.parallaxTarget.set(
          THREE.MathUtils.clamp(e.gamma / 28, -1, 1),
          THREE.MathUtils.clamp((e.beta - baseBeta) / 28, -1, 1)
        );
      });
      this.gyroOn = true;
    } catch { /* not available — fine */ }
  }

  /* warm (0) ↔ cool (1) — the whole observatory re-lights */
  setMood(cool) {
    this._moodTarget = cool ? 1 : 0;
  }

  /* easter egg: every practical flares gold for a moment */
  flare() {
    this._flare = 1;
  }

  _applyMood() {
    const m = this.mood;
    const boost = 1 + this._flare * 1.6;
    const lerp = THREE.MathUtils.lerp;
    this.scene.fog.color.setRGB(
      lerp(0.039, 0.02, m), lerp(0.027, 0.031, m), lerp(0.02, 0.055, m)
    );
    this.scene.background.copy(this.scene.fog.color);
    this.hemi.color.setRGB(
      lerp(0.165, 0.07, m), lerp(0.114, 0.1, m), lerp(0.07, 0.19, m)
    );
    this.lantern.color.setRGB(
      lerp(0.878, 0.56, m), lerp(0.663, 0.69, m), lerp(0.431, 0.9, m)
    );
    this.lantern.intensity = 30 * boost;
    this.pracMat.color.setRGB(
      lerp(2.6, 0.95, m) * boost, lerp(1.55, 1.5, m) * boost, lerp(0.62, 2.7, m) * boost
    );
    this.edgeMat.color.setRGB(
      lerp(1.6, 0.5, m), lerp(1.05, 0.95, m), lerp(0.45, 1.8, m)
    );
  }

  travelTo(index) {
    const to = index / (this.sectionCount - 1);
    const dur = this.cfg.reducedMotion
      ? 350
      : 900 + Math.abs(to - this.u) * 2600;
    this.tween = { from: this.targetU, to, t0: performance.now(), dur };
    this.lastInputAt = performance.now();
  }

  /* ————— per-frame ————— */

  update(dt, t) {
    // travel tween
    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.t0) / this.tween.dur);
      this.targetU = THREE.MathUtils.lerp(
        this.tween.from, this.tween.to, easeInOutCubic(k)
      );
      if (k >= 1) this.tween = null;
    } else if (this.active && performance.now() - this.lastInputAt > 1200) {
      // gentle attraction to the nearest section stop
      const seg = 1 / (this.sectionCount - 1);
      const near = Math.round(this.targetU / seg) * seg;
      if (Math.abs(near - this.targetU) < seg * 0.3) {
        this.targetU = damp(this.targetU, near, 1.2, dt);
      }
    }

    this.u = damp(this.u, this.targetU, this.cfg.reducedMotion ? 12 : 2.6, dt);
    this.parallax.x = damp(this.parallax.x, this.parallaxTarget.x, 3.5, dt);
    this.parallax.y = damp(this.parallax.y, this.parallaxTarget.y, 3.5, dt);

    // camera along the path
    const u = THREE.MathUtils.clamp(this.u, 0, 1);
    this.camCurve.getPoint(u, this._pos);
    this.lookCurve.getPoint(u, this._look);
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);

    // parallax offset in camera space
    this._right.setFromMatrixColumn(this.camera.matrix, 0);
    this._up.setFromMatrixColumn(this.camera.matrix, 1);
    this._off.copy(this._right).multiplyScalar(this.parallax.x * 0.42)
      .addScaledVector(this._up, -this.parallax.y * 0.28);
    this.camera.position.add(this._off);
    this._look.addScaledVector(this._off, 0.4);
    this.camera.lookAt(this._look);

    // lantern floats just ahead of the camera
    const ahead = Math.min(1, u + 0.02);
    this.camCurve.getPoint(ahead, this.lantern.position);
    this.lantern.position.y += 1.2;

    // mood crossfade + flare decay
    if (Math.abs(this.mood - this._moodTarget) > 0.002 || this._flare > 0) {
      this.mood = damp(this.mood, this._moodTarget, 2.5, dt);
      this._flare = Math.max(0, this._flare - dt * 0.45);
      this._applyMood();
    }

    // slow, weighted motion in the world
    if (!this.cfg.reducedMotion) {
      for (const m of this.monoliths) {
        m.position.y = m.userData.baseY + Math.sin(t * 0.4 + m.userData.phase) * 0.12;
      }
      this.shards.rotation.y = t * 0.006;
      this.pracs.rotation.y = -t * 0.004;
      if (this.dust) this.dust.rotation.y = t * 0.008;
    }
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
}

/* deterministic PRNG so the world is identical every visit */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
