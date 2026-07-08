/*
 * Device-tier detection (spec §6). Runs before anything pretty.
 * Signals: GPU string, deviceMemory, hardwareConcurrency,
 * prefers-reduced-motion, save-data — then an FPS probe during boot
 * can demote the result. Override with ?tier=high|mid|low for testing.
 */

const PRESETS = {
  high: {
    tier: 'high',
    dprCap: 2,
    bloom: true,
    dof: true,
    shadows: true,
    shadowMapSize: 1024,
    particles: 650,
    instances: 240,
    gyro: true,
    antialias: true,
  },
  mid: {
    tier: 'mid',
    dprCap: 1.5,
    bloom: true,
    dof: false,
    shadows: true,
    shadowMapSize: 512,
    particles: 280,
    instances: 150,
    gyro: true,
    antialias: true,
  },
  low: {
    tier: 'low',
    dprCap: 1,
    bloom: false,
    dof: false,
    shadows: false,
    shadowMapSize: 0,
    particles: 90,
    instances: 90,
    gyro: false,
    antialias: false,
  },
};

function gpuString() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const str = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(str || '');
  } catch {
    return '';
  }
}

function scoreGpu(gpu) {
  const g = gpu.toLowerCase();
  // Strong desktop / flagship signals
  if (/(rtx|gtx 16|radeon rx|apple m\d|arc a)/.test(g)) return 2;
  const adreno = g.match(/adreno[^\d]*(\d{3})/);
  if (adreno) {
    const n = +adreno[1];
    return n >= 725 ? 2 : n >= 630 ? 1 : 0;
  }
  const mali = g.match(/mali-g(\d{2})/);
  if (mali) return +mali[1] >= 76 ? 1 : 0;
  if (/apple gpu|apple a1[5-9]/.test(g)) return 2; // recent iPhones
  if (/intel.*(uhd|hd graphics)/.test(g)) return 1;
  if (/swiftshader|llvmpipe|software/.test(g)) return 0;
  return 1; // unknown → assume mid
}

export function detectTier() {
  const params = new URLSearchParams(location.search);
  const forced = params.get('tier');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData === true;
  const gpu = gpuString();

  if (forced && PRESETS[forced]) {
    return { ...PRESETS[forced], reducedMotion, saveData, gpu, forced: true };
  }

  let score = scoreGpu(gpu); // 0 low · 1 mid · 2 high

  const mem = navigator.deviceMemory || 0; // 0 = unknown (Safari/Firefox)
  if (mem && mem <= 3) score = Math.min(score, 0);
  else if (mem && mem <= 4) score = Math.min(score, 1);

  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 4) score = Math.min(score, 1);

  const isTouch = matchMedia('(pointer: coarse)').matches;
  // Desktops with a discrete-ish GPU and no coarse pointer lean high
  if (!isTouch && score >= 1 && cores >= 8) score = 2;

  if (saveData) score = 0;

  const tier = score >= 2 ? 'high' : score >= 1 ? 'mid' : 'low';
  const cfg = { ...PRESETS[tier], reducedMotion, saveData, gpu, forced: false };
  if (reducedMotion) cfg.gyro = false;
  return cfg;
}

/*
 * FPS probe: measure real frame times while the boot overlay still covers
 * the screen, then demote runtime-adjustable knobs if the floor isn't held.
 * (Geometry counts are build-time; DPR/bloom/shadows are runtime — those
 * are what we pull back.)
 */
export function probeFps(renderFrame, durationMs = 700) {
  return new Promise((resolve) => {
    const times = [];
    let last = performance.now();
    const start = last;
    function tick(now) {
      renderFrame();
      times.push(now - last);
      last = now;
      if (now - start < durationMs) requestAnimationFrame(tick);
      else {
        times.sort((a, b) => a - b);
        const median = times[Math.floor(times.length / 2)] || 16.7;
        resolve(Math.min(120, 1000 / median));
      }
    }
    requestAnimationFrame(tick);
  });
}

/* Apply a demotion in place; returns a note for the boot log. */
export function demote(cfg, fps) {
  if (cfg.forced) return null;
  if (fps >= 45) return null;
  if (fps < 24 && cfg.tier !== 'low') {
    Object.assign(cfg, PRESETS.low, { tier: 'low' });
    return `probe ${fps | 0}fps → tier LOW`;
  }
  if (cfg.tier === 'high') {
    Object.assign(cfg, PRESETS.mid, { tier: 'mid' });
    return `probe ${fps | 0}fps → tier MID`;
  }
  cfg.dprCap = Math.max(1, cfg.dprCap - 0.5);
  cfg.bloom = false;
  return `probe ${fps | 0}fps → dpr ${cfg.dprCap}, bloom off`;
}
