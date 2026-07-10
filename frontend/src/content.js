/*
 * ————————————————————————————————————————————————
 * ALL SITE CONTENT LIVES HERE. Replace every [REPLACE] item.
 *
 * Work items:
 *   { title, meta, video, vertical?, poster? }
 *   video can be:
 *     - a YouTube URL or ID        → embedded player
 *     - a Vimeo URL or ID          → embedded player
 *     - a self-hosted .mp4/.webm   → native <video>. Either a local path
 *       ('/media/reel.mp4', file in public/media/, <25MB) or an R2/CDN
 *       URL ('https://media.you.com/film.mp4') for larger films.
 *     - null                       → elegant placeholder card
 *   vertical: true  → tall 9:16 frame (phone-shot reels)
 *   poster: '/media/x.jpg'  → still shown while a self-hosted file loads
 *
 * Self-hosting how-to: scripts/compress-video.md
 * ————————————————————————————————————————————————
 */

export const SITE = {
  name: 'Abhi',
  positioning: {
    // The one line the whole site proves (spec §1). <em> renders in amber italic.
    lead: 'Building things worth paying <em>attention</em> to.',
    sub: 'Through film, design and whatever the idea demands.',
    // the quiet framing line under the hero — the mental model for the range
    frame: "I don't collect projects. I collect obsessions.",
  },
};

export const SECTIONS = [
  {
    id: 'entry',
    label: 'Entry',
    kicker: 'The Observatory',
    hero: true,
  },
  {
    id: 'films',
    label: 'Films',
    kicker: 'Chapter 01',
    title: 'Films',
    body: 'Directed work. Stories built shot by shot, light by light.',
    works: [
      { title: 'Why do people love beaches so much', meta: 'Film · 2025', video: 'https://www.youtube.com/watch?v=4wTK1yPGZRg' },
      { title: 'How to shoot cinematic videos', meta: 'Film · 2025', video: 'https://www.youtube.com/watch?v=WVOD2_boKpo' },
      { title: 'What is love', meta: 'Film · 2026', video: 'https://www.youtube.com/watch?v=DqkRJJy2oVs' },
    ],
  },
  {
    id: 'reels',
    label: 'Reels',
    kicker: 'Chapter 02',
    title: 'Reels',
    body: 'Fast work. Cut for rhythm, shot for the small screen.',
    works: [
      { title: 'Speakeasy bar', meta: 'Reel · 2025', video: 'https://youtube.com/shorts/u80wd15wDSY', vertical: true },
      { title: 'Asura 1', meta: 'Reel · 2025', video: 'https://youtube.com/shorts/VN9tyY1lLIM', vertical: true },
      { title: 'Asura 2', meta: 'Reel · 2025', video: 'https://youtube.com/shorts/kBG6WaaBYbg', vertical: true },
    ],
  },
  {
    id: 'build',
    label: 'Bits & Builds',
    kicker: 'Chapter 03',
    title: 'Bits <em>&</em> Builds',
    body: 'Where ideas become real. Products, experiments and systems built to be useful — and beautiful.',
    works: [
      {
        title: 'This Site — The Observatory',
        meta: 'WebGL · Three.js · 2026',
        description: 'An expression more than a proof. A space to move through — built to feel like something, not to list what I can do.',
        // link: 'https://github.com/Axbixh/…'  // add the repo after it's pushed
      },
      // [REPLACE — no rush] give these a title, meta, description, and a
      // `link:` when ready; drop `comingSoon` once they're real.
      { title: 'In the works', meta: 'Project · 2026', comingSoon: true },
      { title: 'In the works', meta: 'Project · 2026', comingSoon: true },
    ],
  },
  {
    id: 'thoughts',
    label: 'Thoughts',
    kicker: 'Chapter 04',
    title: 'Thoughts',
    body: 'Thoughts collected while building.',
    works: [
      { title: 'i dont fit in', meta: 'Substack · 2026', link: 'https://substack.com/home/post/p-189231046' },
      { title: 'what am i trying', meta: 'Substack · 2025', link: 'https://substack.com/home/post/p-186204933' },
    ],
  },
  {
    id: 'lightroom',
    label: 'Lighting Room',
    kicker: 'The Centerpiece',
    title: 'The Lighting <em>Room</em>',
    body: 'A live cinematography sandbox. Move the key, shape the ratio, choose the lens — and read the light like a language.',
    enterRoom: true,
  },
  {
    id: 'about',
    label: 'About',
    kicker: 'The Operator',
    title: 'About',
    body: 'I learn by building. Films, products, spaces, brands — different mediums, same obsession: making things with care.',
  },
  {
    id: 'contact',
    label: 'Contact',
    kicker: 'Transmission',
    title: 'Get in <em>touch</em>',
    body: 'The observatory is always listening.',
    links: [
      { label: 'Email', href: 'mailto:axbixh@gmail.com' },
      { label: 'Instagram', href: 'https://www.instagram.com/oh.its.abhi/' },
      { label: 'YouTube', href: 'https://www.youtube.com/@ohitsabhi' },
      { label: 'GitHub', href: 'https://github.com/Axbixh' },
    ],
  },
];
