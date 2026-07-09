/*
 * HTML layer: section panels that fade in at each stop, the nav rail
 * (tap-to-travel), progress line, and the in-place work viewer.
 * The render loop pauses while the viewer is open (spec §6).
 */

import { SITE } from './content.js';

export function createOverlay(sections, hooks) {
  const ui = document.getElementById('ui');

  /* ——— skip nav: the sections, reachable without the canvas ——— */
  const skip = document.createElement('nav');
  skip.className = 'skip-nav';
  skip.setAttribute('aria-label', 'Skip to section');
  sections.forEach((s, i) => {
    const b = document.createElement('button');
    b.textContent = `Go to ${s.label}`;
    b.addEventListener('click', () => hooks.onTravel(i));
    skip.appendChild(b);
  });
  const roomBtn = document.createElement('button');
  roomBtn.textContent = 'Open the Lighting Room';
  roomBtn.addEventListener('click', () => hooks.onEnterRoom());
  skip.appendChild(roomBtn);
  ui.appendChild(skip);

  /* ——— nav rail ——— */
  const rail = document.createElement('nav');
  rail.className = 'nav-rail';
  rail.setAttribute('aria-label', 'Sections');
  const dots = sections.map((s, i) => {
    const b = document.createElement('button');
    b.className = 'nav-dot';
    b.innerHTML = `<span class="lbl">${s.label}</span><span class="pip"></span>`;
    b.addEventListener('click', () => hooks.onTravel(i));
    rail.appendChild(b);
    return b;
  });
  ui.appendChild(rail);

  /* ——— progress line ——— */
  const line = document.createElement('div');
  line.className = 'progress-line';
  line.innerHTML = '<div class="fill"></div>';
  ui.appendChild(line);
  const fill = line.querySelector('.fill');

  /* ——— hint ——— */
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'scroll to travel';
  ui.appendChild(hint);

  /* ——— persistent "play" entry to the Lighting Room ——— */
  const play = document.createElement('button');
  play.className = 'play-cta';
  play.innerHTML = '<span class="dot"></span>PLAY · THE LIGHT GAME';
  play.addEventListener('click', () => hooks.onEnterRoom());
  ui.appendChild(play);

  /* ——— corner toggles: mood + sound ——— */
  const corner = document.createElement('div');
  corner.className = 'corner-toggles';
  const moodBtn = document.createElement('button');
  moodBtn.textContent = '◐ MOOD';
  moodBtn.title = 'warm / cool';
  moodBtn.addEventListener('click', () => hooks.onMood());
  const soundBtn = document.createElement('button');
  soundBtn.textContent = hooks.getMuted() ? 'SOUND ○' : 'SOUND ◉';
  soundBtn.addEventListener('click', () => {
    const muted = hooks.onSoundToggle();
    soundBtn.textContent = muted ? 'SOUND ○' : 'SOUND ◉';
  });
  corner.append(moodBtn, soundBtn);
  ui.appendChild(corner);

  /* ——— section panels ——— */
  const panels = sections.map((s) => {
    const p = document.createElement('section');
    p.className = 'section-panel' + (s.hero ? ' hero' : '');
    const inner = document.createElement('div');
    inner.className = 'panel-inner';

    if (s.hero) {
      inner.innerHTML = `
        <div class="kicker">${s.kicker}</div>
        <h1>${SITE.positioning.lead}</h1>
        <div class="body">${SITE.positioning.sub}</div>
        <div class="frame-line">${SITE.positioning.frame || ''}</div>`;
    } else {
      inner.innerHTML = `
        <div class="kicker">${s.kicker}</div>
        <h2>${s.title}</h2>
        <div class="body">${s.body || ''}</div>`;
    }

    if (s.works) {
      const grid = document.createElement('div');
      grid.className = 'work-grid';
      for (const w of s.works) {
        // work items with a `link` open the page in a new tab (essays,
        // external projects); everything else opens the in-place viewer
        const card = document.createElement(w.link ? 'a' : 'button');
        card.className = 'work-card' + (w.link ? ' external' : '');
        card.innerHTML = `<span class="t">${w.title}</span><span class="m">${w.meta}</span>`;
        if (w.link) {
          card.href = w.link;
          card.target = '_blank';
          card.rel = 'noopener';
        } else {
          card.addEventListener('click', () => openViewer(w));
        }
        grid.appendChild(card);
      }
      inner.appendChild(grid);
    }

    if (s.enterRoom) {
      const b = document.createElement('button');
      b.className = 'cta gold';
      b.textContent = 'ENTER THE ROOM →';
      b.addEventListener('click', () => hooks.onEnterRoom());
      inner.appendChild(b);
    }

    if (s.id === 'about') {
      // the portrait is relit live by the pointer — same discipline,
      // applied to a photograph. Drop portrait.jpg in frontend/public/.
      const wrap = document.createElement('div');
      wrap.className = 'portrait';
      wrap.innerHTML = `
        <img src="/portrait.jpg" alt="portrait" />
        <div class="p-light"></div>
        <span class="p-cap">relit live — move the light</span>`;
      wrap.querySelector('img').addEventListener('error', () => {
        wrap.classList.add('placeholder'); // no portrait.jpg yet — silhouette
      });
      inner.appendChild(wrap);
      p.addEventListener('pointermove', (e) => {
        const r = wrap.getBoundingClientRect();
        wrap.style.setProperty('--lx', `${((e.clientX - r.left) / r.width) * 100}%`);
        wrap.style.setProperty('--ly', `${((e.clientY - r.top) / r.height) * 100}%`);
      });
    }

    if (s.links) {
      const row = document.createElement('div');
      row.className = 'contact-links';
      for (const l of s.links) {
        const a = document.createElement('a');
        a.href = l.href;
        a.target = l.href.startsWith('mailto') ? '_self' : '_blank';
        a.rel = 'noopener';
        a.textContent = l.label;
        row.appendChild(a);
      }
      inner.appendChild(row);
    }

    p.appendChild(inner);
    ui.appendChild(p);
    return p;
  });

  /* ——— in-place viewer ——— */
  const viewer = document.createElement('div');
  viewer.className = 'viewer';
  viewer.innerHTML = `
    <button class="close">CLOSE ✕</button>
    <div class="stage"></div>
    <div class="meta"><span class="t"></span><span class="m"></span></div>`;
  ui.appendChild(viewer);
  const stage = viewer.querySelector('.stage');
  viewer.querySelector('.close').addEventListener('click', closeViewer);
  viewer.addEventListener('click', (e) => {
    if (e.target === viewer) closeViewer();
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewer.classList.contains('on')) closeViewer();
  });
  viewer.style.pointerEvents = 'none';

  function openViewer(work) {
    stage.innerHTML = buildStage(work);
    stage.classList.toggle('vertical', !!work.vertical); // reels: tall frame
    viewer.querySelector('.meta .t').textContent = work.title;
    viewer.querySelector('.meta .m').textContent = work.meta;
    viewer.classList.add('on');
    viewer.style.pointerEvents = 'all';
    hooks.onViewerChange(true); // pause the render loop
  }

  function closeViewer() {
    viewer.classList.remove('on');
    viewer.style.pointerEvents = 'none';
    stage.innerHTML = ''; // stops any playing media
    hooks.onViewerChange(false);
  }

  /* ——— per-frame sync ——— */
  let activeIdx = -1;
  let hinted = false;

  function update(u) {
    const f = u * (sections.length - 1);
    fill.style.width = `${u * 100}%`;

    const nearest = Math.round(f);
    const idx = Math.abs(f - nearest) < 0.32 ? nearest : -1;

    if (u > 0.02 && !hinted) { hinted = true; hint.classList.add('off'); }

    if (idx !== activeIdx) {
      const wasSettled = activeIdx !== -1;
      activeIdx = idx;
      panels.forEach((p, i) => p.classList.toggle('active', i === idx));
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      if (idx !== -1 && wasSettled) hooks.onSection?.(idx);
    }
  }

  return { update };
}

function buildStage(work) {
  const v = work.video;
  if (!v) {
    return `<div class="placeholder">
      <div class="t">${work.title}</div>
      <div class="m">coming soon</div>
    </div>`;
  }
  const yt = String(v).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})|^([\w-]{11})$/
  );
  if (yt) {
    const id = yt[1] || yt[2];
    return `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0"
      allow="autoplay; fullscreen; picture-in-picture" allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }
  const vm = String(v).match(/vimeo\.com\/(\d+)|^(\d{6,})$/);
  if (vm) {
    const id = vm[1] || vm[2];
    return `<iframe src="https://player.vimeo.com/video/${encodeURIComponent(id)}?autoplay=1"
      allow="autoplay; fullscreen; picture-in-picture" allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }
  // self-hosted file (.mp4/.webm) — poster shows a frame while it loads
  const poster = work.poster ? ` poster="${encodeURI(work.poster)}"` : '';
  return `<video src="${encodeURI(String(v))}"${poster} controls autoplay
    playsinline preload="metadata"></video>`;
}
