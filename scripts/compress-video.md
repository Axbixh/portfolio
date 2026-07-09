# Web-optimizing video for self-hosting

A raw export from your editor is far too big for the web. Compress it
first, and — critically — add `+faststart` so the video starts playing
before it finishes downloading (without this flag a phone stares at a
black frame until the whole file arrives).

## One-time: install ffmpeg

Windows: `winget install Gyan.FFmpeg`  (then reopen the terminal)
Mac: `brew install ffmpeg`

## Compress a landscape film (1080p, streaming-ready)

```bash
ffmpeg -i input.mov \
  -vf "scale=-2:1080" \
  -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  my-film.mp4
```

- `crf 23` — quality knob. Lower = better/bigger (18 ≈ visually lossless,
  28 ≈ small). 23 is a good web default.
- Expect roughly **8–15 MB per minute** at 1080p/crf 23. A 3-minute film
  ≈ 30–45 MB → too big for `public/`, use R2 (below).

## Compress a vertical reel (1080-wide, phone footage)

```bash
ffmpeg -i input.mov \
  -vf "scale=1080:-2" \
  -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  reel-motion.mp4
```

## Grab a poster frame (the still shown while it loads)

```bash
ffmpeg -i my-film.mp4 -ss 00:00:03 -vframes 1 -q:v 3 my-film.jpg
```

## Where the file goes

- **Under ~20 MB** (most reels): drop it in `frontend/public/media/`,
  reference as `/media/name.mp4`. Ships with the site.
- **Bigger** (most films): Cloudflare R2 — see below.

## Cloudflare R2 (free, for large films)

R2 is object storage in the same Cloudflare account you deploy to.
Free tier: 10 GB storage, and **no egress fees** (this is the part that
makes it free to serve — S3 charges for every byte downloaded, R2 doesn't).

```bash
npx wrangler r2 bucket create observatory-media
npx wrangler r2 object put observatory-media/my-film.mp4 --file my-film.mp4 --remote
```

Then in the Cloudflare dashboard: R2 → your bucket → Settings → connect a
custom domain (e.g. `media.yourdomain.com`) or enable the public r2.dev
URL. Paste that URL into `src/content.js` as the `video` value.
```js
video: 'https://media.yourdomain.com/my-film.mp4'
```
