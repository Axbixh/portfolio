# Self-hosted media

Drop small video files here (reels, teasers, clips **under ~20 MB**).
They ship with the site and are served from `/media/<name>`.

Reference them in `src/content.js`:

```js
{ title: 'Reel — Motion', meta: 'Vertical · 2025',
  video: '/media/reel-motion.mp4', vertical: true,
  poster: '/media/reel-motion.jpg' }
```

- `vertical: true`  → tall 9:16 frame (use for phone-shot reels)
- `poster`          → a still shown while the video loads (optional)

## Cloudflare Pages has a 25 MB per-file limit

Anything bigger than that (most **films**) can't live here — it won't
deploy. Put large films on **Cloudflare R2** (free tier, no egress fees)
and paste the public URL:

```js
{ title: 'My Film', meta: 'Short film · 2025',
  video: 'https://media.yourdomain.com/my-film.mp4',
  poster: 'https://media.yourdomain.com/my-film.jpg' }
```

See `../../scripts/compress-video.md` for how to shrink and web-optimize
files first, and the R2 steps.
