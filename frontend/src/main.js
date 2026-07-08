/*
 * Orchestration, in the spec's build order (§9):
 * tier detection + perf harness → world + camera path → overlay/viewer →
 * lighting room (lazy, code-split) — every feature behind a tier flag.
 */

import './styles.css';
import * as THREE from 'three';
import { detectTier, probeFps, demote } from './tier.js';
import { createPerfMeter } from './perf.js';
import { World } from './world.js';
import { createOverlay } from './overlay.js';
import { SECTIONS, SITE } from './content.js';
import { Sound } from './audio.js';
import { createCursor } from './cursor.js';

/* ——— renderer (one canvas for everything) ——— */
const cfg = detectTier();

/* If WebGL can't start (old device, blocked GPU), fail with grace:
   the positioning line and contact links instead of a black screen. */
function webglFallback() {
  document.getElementById('boot')?.remove();
  const links = (SECTIONS.find((s) => s.links)?.links || [])
    .map((l) => `<a href="${l.href}" rel="noopener">${l.label}</a>`)
    .join('');
  const d = document.createElement('div');
  d.className = 'fallback';
  d.innerHTML = `
    <div class="kicker">The Observatory</div>
    <h1>${SITE.positioning.lead}</h1>
    <p class="sub">${SITE.positioning.sub}</p>
    <p class="note">The full site is a real-time 3D experience and your
    browser couldn't start WebGL. Here is the short version —</p>
    <div class="contact-links">${links}</div>`;
  document.body.appendChild(d);
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: cfg.antialias,
    powerPreference: 'high-performance',
  });
} catch (err) {
  webglFallback();
  throw err;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, cfg.dprCap));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
if (cfg.shadows) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
document.getElementById('app').appendChild(renderer.domElement);

/* ——— world + UI ——— */
const world = new World(renderer, cfg);
const perf = createPerfMeter(renderer, () => cfg.tier);
const sound = new Sound();
const cursor = createCursor();

let mode = 'world'; // 'world' | 'room'
let room = null;
let paused = false;
let moodCool = false;

const fade = document.getElementById('fade');

// audio contexts need a user gesture — arm on the first one
addEventListener('pointerdown', () => sound.ensure(), { once: true });
addEventListener('keydown', () => sound.ensure(), { once: true });

const overlay = createOverlay(SECTIONS, {
  onTravel: (i) => { world.travelTo(i); sound.whoosh(); },
  onEnterRoom: enterRoom,
  onViewerChange: (open) => { paused = open; },
  onSection: () => sound.chime(),
  onMood: () => {
    moodCool = !moodCool;
    world.setMood(moodCool);
    sound.chime();
  },
  onSoundToggle: () => {
    sound.ensure();
    sound.setMuted(!sound.muted);
    return sound.muted;
  },
  getMuted: () => sound.muted,
});

async function enterRoom() {
  fade.classList.add('on');
  await wait(460);
  if (!room) {
    // lazy-load per section (spec §6): the sandbox ships as its own chunk
    const { LightingRoom } = await import('./lighting/room.js');
    room = new LightingRoom(renderer, cfg);
    room.onExit = exitRoom;
    room.sound = sound;
    room.resize(innerWidth, innerHeight);
  }
  mode = 'room';
  world.active = false;
  document.getElementById('ui').style.display = 'none';
  room.enter();
  sound.swell();
  cursor?.setMode('room');
  fade.classList.remove('on');
}

async function exitRoom() {
  fade.classList.add('on');
  await wait(460);
  room.exit();
  mode = 'world';
  document.getElementById('ui').style.display = '';
  world.active = true;
  sound.swell();
  cursor?.setMode('world');
  fade.classList.remove('on');
}

/* ——— easter egg: the hidden frame ——— */
const eggToast = document.createElement('div');
eggToast.className = 'toast';
eggToast.textContent = 'FRAME 25 · YOU FOUND THE LIGHT BETWEEN FRAMES';
document.body.appendChild(eggToast);

function egg() {
  world.flare();
  sound.ensure();
  sound.fanfare();
  eggToast.classList.add('on');
  setTimeout(() => eggToast.classList.remove('on'), 4200);
}

// desktop: the Konami code
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiI = 0;
addEventListener('keydown', (e) => {
  konamiI = e.key === KONAMI[konamiI] ? konamiI + 1 : (e.key === KONAMI[0] ? 1 : 0);
  if (konamiI === KONAMI.length) { konamiI = 0; egg(); }
});

// touch: five quick taps on the hero kicker ("THE OBSERVATORY")
let kickerTaps = [];
document.querySelector('.section-panel.hero .kicker')?.addEventListener('click', () => {
  const now = performance.now();
  kickerTaps = kickerTaps.filter((t) => now - t < 2200);
  kickerTaps.push(now);
  if (kickerTaps.length >= 5) { kickerTaps = []; egg(); }
});

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mode === 'room') exitRoom();
});

/* ——— resize ——— */
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  world.resize(innerWidth, innerHeight);
  room?.resize(innerWidth, innerHeight);
});

/* ——— pause when hidden (spec §6) ——— */
document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
});
let hidden = false;

/* ——— render loop ——— */
const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  if (hidden || paused) { clock.getDelta(); return; }
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (mode === 'world') {
    world.update(dt, elapsed);
    world.render();
    overlay.update(world.u);
  } else {
    room.update(dt);
    room.render();
  }
  perf.update(dt);
}

/* ——— boot: countdown + real calibration ——— */
const boot = document.getElementById('boot');
const bootCount = document.getElementById('boot-count');
const bootLog = document.getElementById('boot-log');

function log(lines) { bootLog.textContent = lines.join('\n'); }

// ?fastboot skips the cinematic delays (dev / testing)
const FAST = new URLSearchParams(location.search).has('fastboot');

async function start() {
  const gpuShort = (cfg.gpu || 'unknown gpu').slice(0, 42);
  log([`gpu · ${gpuShort}`, `tier · ${cfg.tier}`]);
  bootCount.textContent = '3';

  // FPS probe during the loader (spec §6) — render the real world, hidden
  await wait(FAST ? 0 : 250);
  bootCount.textContent = '2';
  const fps = await probeFps(() => {
    world.update(1 / 60, elapsed);
    world.render();
  }, FAST ? 100 : 650);
  const note = demote(cfg, fps);
  if (note) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, cfg.dprCap));
    if (!cfg.bloom) world.composer = null;
    log([`gpu · ${gpuShort}`, `tier · ${cfg.tier}`, note]);
  } else {
    log([`gpu · ${gpuShort}`, `tier · ${cfg.tier}`, `probe · ${fps | 0}fps ok`]);
  }

  bootCount.textContent = '1';
  await wait(FAST ? 0 : 420);

  boot.classList.add('off');
  if (FAST) boot.style.display = 'none';
  world.active = true;
  frame();

  // deep links: ?room jumps into the sandbox (spec §4: linkable
  // mini-experience), ?at=N starts at section N (also handy for testing)
  const params = new URLSearchParams(location.search);
  if (params.has('room')) enterRoom();
  const at = parseInt(params.get('at'), 10);
  if (Number.isFinite(at)) {
    const u = Math.min(Math.max(at, 0), world.sectionCount - 1) /
      (world.sectionCount - 1);
    world.targetU = world.u = u;
  }

  // gyro needs a user gesture on iOS — hook the first touch
  if (cfg.gyro && matchMedia('(pointer: coarse)').matches) {
    const arm = () => {
      world.enableGyro();
      removeEventListener('touchend', arm);
    };
    addEventListener('touchend', arm);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

start();
