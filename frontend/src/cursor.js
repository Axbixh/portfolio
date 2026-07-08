/*
 * Custom cursor (desktop only): a small aperture ring that trails the
 * pointer, grows over interactive elements, and becomes a viewfinder
 * crosshair inside the Lighting Room.
 */

export function createCursor() {
  if (matchMedia('(pointer: coarse)').matches) return null;

  const el = document.createElement('div');
  el.id = 'cursor';
  el.innerHTML = '<div class="c-ring"></div><div class="c-dot"></div>';
  document.body.appendChild(el);
  document.documentElement.classList.add('has-cursor');

  let x = innerWidth / 2, y = innerHeight / 2;
  let tx = x, ty = y;

  addEventListener('pointermove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
    el.style.opacity = '1';
  });
  document.documentElement.addEventListener('mouseleave', () => {
    el.style.opacity = '0';
  });
  addEventListener('pointerover', (e) => {
    el.classList.toggle(
      'hover',
      !!e.target.closest('button, a, input, .work-card, .nav-dot')
    );
  });

  (function loop() {
    x += (tx - x) * 0.24;
    y += (ty - y) * 0.24;
    el.style.transform = `translate(${x}px, ${y}px)`;
    requestAnimationFrame(loop);
  })();

  return {
    setMode(mode) {
      el.classList.toggle('room', mode === 'room');
    },
  };
}
