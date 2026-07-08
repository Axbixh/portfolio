/*
 * ————————————————————————————————————————————————
 * ALL SITE CONTENT LIVES HERE. Replace every [REPLACE] item.
 *
 * Work items:
 *   { title, meta, video }
 *   video can be:
 *     - a YouTube URL or ID        → embedded player
 *     - a Vimeo URL or ID          → embedded player
 *     - a direct .mp4/.webm URL    → native <video>
 *     - null                       → elegant placeholder card
 * ————————————————————————————————————————————————
 */

export const SITE = {
  name: 'KOUSHIK', // [REPLACE] your name / mark
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
      { title: 'Untitled Short', meta: 'Short film · 2025', video: null }, // [REPLACE]
      { title: 'Second Film', meta: 'Short film · 2024', video: null },    // [REPLACE]
      { title: 'Third Film', meta: 'Documentary · 2024', video: null },    // [REPLACE]
    ],
  },
  {
    id: 'reels',
    label: 'Reels',
    kicker: 'Chapter 02',
    title: 'Reels',
    body: 'Fast work. Cut for rhythm, shot for the small screen.',
    works: [
      { title: 'Reel — Motion', meta: 'Vertical · 2025', video: null },  // [REPLACE]
      { title: 'Reel — Light', meta: 'Vertical · 2025', video: null },   // [REPLACE]
      { title: 'Reel — Craft', meta: 'Vertical · 2024', video: null },   // [REPLACE]
    ],
  },
  {
    id: 'build',
    label: 'Bits & Build',
    kicker: 'Chapter 03',
    title: 'Bits <em>&</em> Build',
    body: 'Where ideas become real. Products, experiments and systems built to be useful — and beautiful.',
    works: [
      { title: 'This Site', meta: 'WebGL · Three.js · 2026', video: null },
      { title: 'Project Two', meta: 'Tooling · 2025', video: null },  // [REPLACE]
      { title: 'Project Three', meta: 'App · 2025', video: null },    // [REPLACE]
    ],
  },
  {
    id: 'thoughts',
    label: 'Thoughts',
    kicker: 'Chapter 04',
    title: 'Thoughts',
    body: 'Thoughts collected while building.',
    works: [
      { title: 'On Warm Futurism', meta: 'Essay · 2026', video: null },     // [REPLACE]
      { title: 'The Phone Is the Venue', meta: 'Essay · 2025', video: null }, // [REPLACE]
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
      { label: 'Email', href: 'mailto:geekspacetech02@gmail.com' },        // [REPLACE if needed]
      { label: 'Instagram', href: 'https://instagram.com/' },              // [REPLACE]
      { label: 'YouTube', href: 'https://youtube.com/' },                  // [REPLACE]
      { label: 'GitHub', href: 'https://github.com/' },                    // [REPLACE]
    ],
  },
];
