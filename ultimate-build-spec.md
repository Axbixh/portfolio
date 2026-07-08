# The Ultimate Build — Spatial 3D Portfolio + Real-time Lighting Game

An ambitious spec, engineered to survive contact with a real phone. Everything crazy is in
here — each idea tagged for **cost**, **tier**, and whether it's **Core / Stretch / Cut**.
Confidence tags: [Certain] hard, [Likely] strong inference, [Guessing] filling gaps.

---

## 0. Read this first — the reality check

**The three-way conflict [Certain].** Heavy real-time 3D ⟷ fast load ⟷ great on average
phones. You can hold any two at full strength. The third gets *managed by tiers*, not maxed.
Pretending otherwise is how you ship a slideshow on mid-range Android.

**The one technique that buys back most of the conflict [Certain]:** device-tier detection +
progressive enhancement. Flagships/desktops get the full show; mid/low phones get a lighter,
still-intentional build. Non-negotiable. Every serious WebGL site does this.

**What actually makes you "different" [Likely]:** not the 3D — that's a genre now. It's the
**real-time lighting game** (proof you understand light) plus **ruthless taste**. The 3D is the
stage; those are the act.

**Where the cost really is [Certain]:** the camera *moving through space* is cheap if the world
is light. The expensive part is real-time relighting of a good-looking subject and any real-time
shadows/post. Budget accordingly.

---

## 1. The bet (positioning)

Sharpen the "about" into one line the whole site proves. Proposal (yours to edit):

> *I direct, I shoot, I build. I make software that feels like cinema and films that think like
> systems.*

The site proves it by **being both at once**: a cinematic 3D space (the eye) that is also a
genuinely performant piece of engineering (the build), containing a tool that demonstrates craft
(the lighting game). Three claims, proven structurally, not stated.

---

## 2. Navigation = movement through space (not scroll)

**Concept.** A dark, volumetric "observatory" / mind-space. The camera travels between sections
along a curated **spline path** — a slow, weighted dolly/orbit — driven by scroll, drag, or
tap-to-travel. No page loads; sections are *places* you move to.

**Why it's feasible cheaply [Likely].** The *movement* is cheap; keep the *world* light: baked
lighting, low-poly, heavy fog to hide draw distance, instanced repeats, one hero light motif.
A moving camera through a static baked scene is one of the cheapest "wow" moves in WebGL.

**Input model.** Scroll still drives progress (most reliable on mobile), but the payoff is
spatial motion instead of a scrolling page. Add **gyro/tilt parallax** on mobile — the camera
drifts as you tilt the phone. [Likely] cheap and disproportionately impressive on a handheld.
Optional free-look drag at each node.

---

## 3. The world (sections as places)

- **Entry / boot** — a cinematic loader (film-leader countdown / aperture iris / system boot).
- **The work**, in rooms by *feeling* (Films / Reels / Bits & Build / Thoughts) — each a floating
  monolith or screen you approach; opens **in-place** (full-screen viewer, scene pauses).
- **The Lighting Room** — the centerpiece; you fly *into* it (§4).
- **About** — a personal node.
- **Contact** — a quiet exit; handles, secondary external links.

---

## 4. Centerpiece — the real-time Lighting Game

The thing you explicitly want: **control camera + lights in 3D; the output updates in real time.**

**Architecture (updated, honest).**
- Real-time IS doable *if scoped*. So: a real-time 3D sandbox, disciplined — **one mid/low-poly
  subject** (a bust), **up to 3 movable lights** (key / fill / back) with color + intensity, an
  **orbit camera**, **lens/FOV** control, **one cheap bloom**, a **contact shadow** (not full soft
  shadow maps), and **DOF gated to high tier only**. [Likely] holds ~30fps on mid-tier if
  disciplined; **must be measured**, not assumed.
- **Tier fallback = the reconciliation.** Low-tier phones drop to fewer lights / no DOF / lower
  render scale, or fall back to the **baked relighting** version (photoreal, cheap, curated
  camera) behind the *same UI*. You get free real-time control where the device can afford it, and
  it still runs everywhere.
- **Real-time vs relighting, stated plainly [Certain]:** real-time = free camera+lights, more
  "CG" look, heavier; relighting = photoreal, curated camera, nearly free. You chose real-time
  freedom — accept the slightly CG look on the live path, and keep relighting as the low-tier
  fallback. Do **both**; don't pick one.

**Output section.** A framed "on camera" viewport rendering the live result (same canvas, or a
picture-in-picture render target). Updates in real time as lights/camera/lens change.

**The teaching layer (what makes it craft, not a tech demo).**
- Three-point spine: key (movable), fill, back/rim (toggles + intensity).
- **Pattern naming** as the key moves: Rembrandt / butterfly (Paramount) / split / loop / broad /
  short. This is the "leads to cinematography setups."
- **Key:fill ratio** → low-key vs high-key mood. **Color/temperature** → warm/cool, gels.
- **Lens** wide↔long at matched framing → compression, facial perspective, depth/bokeh.
- **Camera angle** presets (eye / low / high) and what they connote.

**Output artifact — the Shot Card.** Capture the frame + the recipe (*"Low-key. Rembrandt key,
4:1, 85mm, slight low angle"*). Shareable → the share/leaderboard loop; teaches while it travels;
doubles as portfolio proof. Could be its own linkable mini-experience.

**HUD.** A quiet, low-contrast pro **console** — the rendered image is always the hero. A game
HUD that fights the image is the fastest way to make it look like a toy. [Certain] this is the
detail most likely to get lost once sliders pile up.

---

## 5. The "crazy things" menu — costed and tiered

`[Core]` ships in v1 · `[Stretch]` earned after the perf floor holds · `[Cut]` = bake or fake it.

| Feature | Verdict | Cost | Tier |
|---|---|---|---|
| Camera-through-space navigation | Core | mid | all (scaled) |
| Gyro / tilt parallax on mobile | Core | cheap | all — **do this, high wow/low cost** |
| Cinematic boot / loader | Core | cheap | all |
| In-place work viewer (video plays, render pauses) | Core | cheap | all |
| Real-time lighting sandbox | Core | high | high/mid (low = relight fallback) |
| Shareable Shot Card | Core | cheap | all |
| Warm↔cool mood re-light of the whole space | Stretch | cheap–mid | all (baked variants) |
| Touch-reactive embers / particles in space | Stretch | cheap if capped | high/mid |
| Physics playground (throw your work as objects) | Stretch | mid (Rapier) | high only |
| Portal / wormhole section transitions (shader) | Stretch | mid | high/mid |
| 3D WebGL headline type (troika) | Stretch | mid | high/mid — watch perf |
| Ambient / interactive sound + mute | Stretch | cheap | all |
| Hidden easter-egg scene | Stretch | cheap | all |
| Faked god-rays / light shafts (textured planes) | Stretch | cheap | all |
| **Real** volumetrics, real-time mirrors, real GI, soft shadows everywhere | **Cut** | very high | — bake/fake |

[Certain] that bottom row is the classic mobile killer. If you want those looks, **bake them
offline** or **fake them** with cheap tricks.

---

## 6. Device-tier architecture (the enabler)

**Detect on load:** GPU string (`WEBGL_debug_renderer_info`), `deviceMemory`,
`hardwareConcurrency`, a quick **FPS probe** during the loader, `prefers-reduced-motion`,
`save-data`.

- **High** (desktop / flagship): full post (bloom + DOF), soft shadows, gyro, particles, physics,
  DPR cap 2.
- **Mid** (most phones): one shadow-casting light *or* contact shadow, bloom only, DPR cap 1.5,
  fewer particles, real-time lighting game with reduced lights, **no DOF**.
- **Low** (cheap / old): no post, no real-time shadows, reduced motion, DPR 1; lighting game
  **falls back to baked relighting**. Never a spinner-of-death — always something intentional.
- **Everyone:** Draco/meshopt geometry, **KTX2** textures, **lazy-load per section**, code-split,
  **pause the render loop** when a video plays or the tab is hidden.

---

## 7. Performance budget (targets — verify, don't trust)

- 60fps high / **≥30fps floor** mid-low. [target]
- Time-to-interactive **< ~2.5s** on a mid Android over 4G. [Guessing — must measure]
- Lean **critical** initial payload; defer everything non-hero; each section's assets lazy-load.
  [Likely necessary]
- Hero subject ≤ ~30–50k tris; environment low-poly + instanced; draw calls low (merge/instance).
  Textures KTX2, ≤2K. [Likely]
- **One shadow-casting light max** on mid. No stacked transparency/overdraw. [Certain these matter]
- **Measure on a real ~$250 Android**, not a throttled laptop. [Certain] The laptop lies to you.

---

## 8. Art direction — warm-futuristic (a decision you must own)

**Tension named [Likely]:** "futuristic" and your established warm-cinematic taste pull apart.
Generic futuristic = cool neon sci-fi — a cliché that will make you look *less* different.

**Proposal — warm futurism:** a dark volumetric observatory; warm practical lights as the
"stars/suns"; candlelight amber accent; cream type; a precise, restrained HUD; weighted motion.
Keep the palette (`#0a0705` / `#e0a96e` / `#efe7dc` / `#f5c542`). Stays *yours*, dodges the
template.

**Decide before designing:** warm-cinematic-futurism (recommended) vs cool-sci-fi (more common,
less you). Own it.

Type: light display serif + tracked mono/sans HUD labels. Motion: slow, intentional, cinematic
easing — never jumpy.

---

## 9. Realistic build (stack + order)

**Stack [standard, buildable]:** Next.js + React Three Fiber + drei +
`@react-three/postprocessing` (tier-gated) + zustand (state) + GSAP/spline (camera) + optional
Rapier (physics) + Draco/meshopt + KTX2. Video on a CDN (Mux / Cloudflare Stream, HLS).

**Build order (the discipline that keeps it shippable) [Certain]:**
1. **Tier-detection + a perf harness first.** Before any beauty.
2. The spatial camera + **one** section — prove ≥30fps on a real cheap phone.
3. In-place work viewer.
4. The lighting sandbox as an **isolated route** — prove perf, then embed.
5. Layer stretch features **one at a time, re-measuring** after each.
6. Content, copy, Shot Card, polish.

**Rule:** every feature ships behind a tier flag and is added only after the perf floor is
re-verified. Features are *earned*, not assumed.

---

## 10. What we are NOT doing (discipline)

- Not maxing every effect on every device.
- Not real GI / real-time mirrors / soft shadows everywhere on mobile — bake or fake.
- Not open-ended feature creep — the cut list is real; Stretch is earned.
- Not letting "crazy" beat "loads fast on the phone in someone's hand at a conference."

---

## 11. Open decisions (you own these)

1. **Warm-futurism vs cool-sci-fi.** (Recommend warm — it's what makes you *you*.)
2. **Lighting game:** real-time-with-tiers *and* relighting-as-fallback. (Recommend: do both, one
   UI. Don't ship real-time with no floor.)
3. **Which Stretch features make v1** vs later.
4. **The positioning line** (§1).

---

## 12. The uncomfortable summary

The 3D is not the achievement. A performant spatial site that runs beautifully on a cheap phone
*and* contains a real cinematography tool — that's the achievement, and it's rare precisely
because most people chase the effects and lose the phone. Build the floor first, earn the ceiling.
