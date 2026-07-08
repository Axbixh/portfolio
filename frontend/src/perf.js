/*
 * Perf harness (spec §9 step 1: "before any beauty").
 * Toggle with the P key, or triple-tap the top-left corner on touch.
 */

export function createPerfMeter(renderer, getTier) {
  const el = document.createElement('div');
  el.id = 'perf';
  document.body.appendChild(el);

  let frames = 0;
  let acc = 0;
  let fps = 0;
  let worst = 0;

  function update(dt) {
    frames++;
    acc += dt;
    worst = Math.max(worst, dt);
    if (acc >= 0.5) {
      fps = frames / acc;
      const i = renderer.info.render;
      el.textContent =
        `tier ${getTier().toUpperCase()}  dpr ${renderer.getPixelRatio().toFixed(2)}\n` +
        `fps ${fps.toFixed(0)}  worst ${(worst * 1000).toFixed(1)}ms\n` +
        `calls ${i.calls}  tris ${(i.triangles / 1000).toFixed(1)}k`;
      frames = 0;
      acc = 0;
      worst = 0;
    }
  }

  addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') el.classList.toggle('on');
  });

  // triple-tap top-left corner
  let taps = [];
  addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (!t || t.clientX > 90 || t.clientY > 90) return;
    const now = performance.now();
    taps = taps.filter((x) => now - x < 900);
    taps.push(now);
    if (taps.length >= 3) {
      el.classList.toggle('on');
      taps = [];
    }
  });

  return { update };
}
