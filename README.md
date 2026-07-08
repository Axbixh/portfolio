# The Observatory — Spatial 3D Portfolio + Lighting Room

A dark, warm-futurist WebGL portfolio where navigation is movement through space,
plus a real-time cinematography sandbox (the Lighting Room) with pattern naming,
key:fill ratios, lens compression, and shareable Shot Cards.

Built to the spec in `ultimate-build-spec.md`: tier detection before beauty,
every effect behind a tier flag, ≥30fps floor as the goal on mid phones.

## Structure

```
frontend/   Vite + Three.js app (the site)
  src/
    main.js            orchestration + boot + render loop
    tier.js            device-tier detection + FPS probe (spec §6)
    world.js           the observatory: spline camera path, monoliths, practicals
    overlay.js         HTML layer: panels, nav rail, in-place work viewer
    content.js         ★ ALL site copy & work items — edit this file
    perf.js            perf harness (press P, or triple-tap top-left)
    lighting/
      room.js          the Lighting Room (lazy-loaded chunk)
      patterns.js      Rembrandt/loop/split/… classification, ratios, kelvin
      shotcard.js      Shot Card PNG composer + share/download
  functions/           Cloudflare Pages Functions (the API — deploys free)
    api/…              shot cards, scores, contact (KV-backed)
    shot/[id].js       share pages with OG tags
    _middleware.js     security headers + rate limiting
  wrangler.toml        Cloudflare Pages config
```

## Run

```bash
npm install          # once, at the repo root
npm run dev          # site on :5173 + Pages Functions on :8788 (local KV)
```

## Deploy (Cloudflare Pages — free)

```bash
npx wrangler login                          # once — opens browser
npx wrangler kv namespace create OBS_KV    # once — copy the id it prints
# paste the id into frontend/wrangler.toml (uncomment the kv block)
npm run deploy                              # build + publish
```

First deploy gives you `https://observatory-xxx.pages.dev`; add a custom
domain later in the Cloudflare dashboard (Pages → Custom domains) and set
`PUBLIC_ORIGIN` in wrangler.toml. Recommended: enable the free WAF
rate-limiting rule in the dashboard (Security → WAF).

## The game — Match the Shot

In the Lighting Room, **▶ MATCH THE SHOT** shows a target frame rendered from
a hidden recipe. Rebuild it; you're scored live on key position, ratio,
temperature, and lens. The daily challenge is date-seeded (everyone gets the
same brief); scores post to the leaderboard (`/api/scores`). Deep links:
`/?room` opens the room, `/?room&game` opens the daily challenge directly.

Shot Cards publish to the backend and get a share page (`/shot/<id>`) with
OG tags, so shared cards unfurl as images on socials. The share link is
copied to the clipboard on capture.

## Extras

- **Sound**: fully procedural WebAudio (no asset files) — room tone, travel
  whoosh, console ticks, capture shutter. Toggle bottom-left; persists.
- **Mood**: warm ↔ cool re-light of the whole observatory (bottom-left).
- **Subject**: scanned photogrammetry bust (Lee Perry-Smith) in
  `frontend/public/subject/`, Draco-compressed, lazy-loaded in the room only;
  the procedural mannequin is the automatic fallback.
- **About portrait**: drop `frontend/public/portrait.jpg` and it's relit live
  by the visitor's pointer.
- **Easter egg**: Konami code, or tap the hero kicker 5×.

## Testing tiers

- Force a tier: `http://localhost:5173/?tier=low` (or `mid` / `high`)
- Perf harness: press **P** (desktop) or triple-tap the top-left corner (touch)
- `?fastboot` skips boot delays; `?at=N` starts at section N
- Measure on a real cheap Android over the LAN: `npm run dev` exposes the host,
  open `http://<your-ip>:5173` on the phone. The laptop lies to you (spec §7).

## Content

Everything you'd edit lives in `frontend/src/content.js` — name, positioning
line, sections, work items (YouTube/Vimeo/mp4 links), contact links. Items
marked `[REPLACE]` are placeholders.

## Tier behavior (spec §6)

| | high | mid | low |
|---|---|---|---|
| DPR cap | 2 | 1.5 | 1 |
| Bloom | ✓ | ✓ | — |
| DOF (room) | toggle | — | — |
| Key shadow map | 1024 | 512 | contact-shadow only |
| Particles / instances | full | ~55% | minimal |
| Gyro parallax | ✓ | ✓ | — |

A live FPS probe during boot can demote the detected tier; `?tier=` overrides
everything for testing. `prefers-reduced-motion` collapses travel animations.

## Deferred (per spec: Stretch is earned)

Mood re-light of the whole space, particles-on-touch, physics playground,
portal shaders, 3D headline type, sound. Add one at a time; re-measure after each.
