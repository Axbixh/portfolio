/*
 * Observatory backend — small on purpose, hardened for production.
 * Shot-card gallery + share pages, Match-the-Shot leaderboard, contact,
 * and (in production) the built frontend.
 *
 * Security posture:
 *  - strict input validation on every write path (types, sizes, charsets)
 *  - PNG uploads verified by magic bytes, not just the data-URL prefix
 *  - per-endpoint AND global per-IP rate limits (in-memory; single node)
 *  - security headers on every response, CSP on documents
 *  - Host header never trusted for absolute URLs unless it validates;
 *    set PUBLIC_ORIGIN in production
 *  - bounded storage: shots/scores/messages all pruned
 *  - slow-loris timeouts on the HTTP server
 * TLS, WAF, and DDoS soak live in front of this (Cloudflare) — this
 * process assumes a reverse proxy terminates TLS (trust proxy = 1).
 */

import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const SHOTS_DIR = path.join(DATA_DIR, 'shots');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const SHOTS_FILE = path.join(DATA_DIR, 'shots.json');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');

const PORT = process.env.PORT || 3001;
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || null; // e.g. https://example.com
const MAX_SHOTS_LISTED = 100;
const MAX_SHOTS_STORED = 2000;
const MAX_PNG_BYTES = 4_500_000;

const app = express();
app.set('trust proxy', 1); // real client IPs behind a reverse proxy
app.disable('x-powered-by');

await fs.mkdir(SHOTS_DIR, { recursive: true });

/* ————————————————— rate limiting ————————————————— */

const buckets = new Map();
function hit(key, max, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
function guard(name, max, windowMs) {
  return (req, res, next) => {
    if (!hit(`${name}:${req.ip}`, max, windowMs)) {
      res.set('Retry-After', '600');
      return res.status(429).json({ error: 'slow down' });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    const fresh = v.filter((t) => now - t < 3600_000);
    if (fresh.length) buckets.set(k, fresh);
    else buckets.delete(k);
  }
}, 600_000).unref();

// global traffic cap: generous for humans, a wall for scripts
app.use(guard('global', 600, 300_000));

/* ————————————————— security headers ————————————————— */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Vite emits a stylesheet link; Google Fonts serves css + woff2.
  // 'unsafe-inline' covers the share page's <style> block — acceptable
  // because script-src stays locked to 'self'.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  // canvas snapshots and data-URI favicon
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  // in-place viewer embeds
  'frame-src https://www.youtube-nocookie.com https://player.vimeo.com',
  // Draco/GLTF loaders spawn workers from blob URLs
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Content-Security-Policy', CSP);
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

/* ————————————————— body parsing (scoped) ————————————————— */

// small bodies everywhere; the 8MB allowance exists ONLY on the upload route
const smallJson = express.json({ limit: '16kb' });
const imageJson = express.json({ limit: '8mb' });

/* ————————————————— helpers ————————————————— */

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* printable text only — strips control chars that could poison JSON/logs */
function cleanText(v, max) {
  return String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

/* Never reflect a hostile Host header. Prefer PUBLIC_ORIGIN; otherwise
   accept the header only if it looks like an actual host. */
function requestOrigin(req) {
  if (PUBLIC_ORIGIN) return PUBLIC_ORIGIN;
  const host = req.get('host') || '';
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return null;
  const proto = req.get('x-forwarded-proto') === 'https' || req.secure
    ? 'https' : 'http';
  return `${proto}://${host}`;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* ————————————————— health ————————————————— */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

/* ————————————————— shot cards ————————————————— */

app.post('/api/shot-cards', guard('shots', 10, 3600_000), imageJson,
  async (req, res) => {
    const { image, recipe } = req.body || {};
    if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,')) {
      return res.status(400).json({ error: 'image must be a PNG data URL' });
    }
    if (!recipe || typeof recipe.pattern !== 'string') {
      return res.status(400).json({ error: 'recipe.pattern is required' });
    }

    let png;
    try {
      png = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');
    } catch {
      return res.status(400).json({ error: 'bad base64' });
    }
    if (png.length > MAX_PNG_BYTES) {
      return res.status(413).json({ error: 'image too large' });
    }
    // verify it actually IS a PNG, not a polyglot wearing the extension
    if (png.length < 8 || !png.subarray(0, 8).equals(PNG_MAGIC)) {
      return res.status(400).json({ error: 'not a PNG' });
    }

    const id = crypto.randomBytes(8).toString('hex');
    await fs.writeFile(path.join(SHOTS_DIR, `${id}.png`), png);

    const shots = await readJson(SHOTS_FILE, []);
    const entry = {
      id,
      pattern: cleanText(recipe.pattern, 60),
      line: cleanText(recipe.line, 300),
      createdAt: new Date().toISOString(),
    };
    shots.unshift(entry);

    // bounded storage: prune the oldest cards and their files
    const keep = shots.slice(0, MAX_SHOTS_STORED);
    for (const old of shots.slice(MAX_SHOTS_STORED)) {
      fs.unlink(path.join(SHOTS_DIR, `${old.id}.png`)).catch(() => {});
    }
    await fs.writeFile(SHOTS_FILE, JSON.stringify(keep, null, 2));

    res.status(201).json({ ...entry, url: `/api/shot-cards/${id}.png` });
  });

app.get('/api/shot-cards', async (_req, res) => {
  const shots = await readJson(SHOTS_FILE, []);
  res.json(shots.slice(0, MAX_SHOTS_LISTED).map((s) => ({
    ...s,
    url: `/api/shot-cards/${s.id}.png`,
  })));
});

app.get('/api/shot-cards/:file', (req, res) => {
  const file = req.params.file;
  if (!/^[a-f0-9]{16}\.png$/.test(file)) return res.status(404).end();
  const abs = path.join(SHOTS_DIR, file);
  if (!abs.startsWith(SHOTS_DIR)) return res.status(404).end(); // belt & braces
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  res.sendFile(abs, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

/* ————————————————— Match the Shot leaderboard ————————————————— */

app.post('/api/scores', guard('scores', 30, 3600_000), smallJson,
  async (req, res) => {
    const { name, score, challenge } = req.body || {};
    const s = Math.round(Number(score));
    if (!Number.isFinite(s) || s < 0 || s > 100) {
      return res.status(400).json({ error: 'score must be 0-100' });
    }
    const scores = await readJson(SCORES_FILE, []);
    scores.push({
      name: String(name || 'ANON').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'ANON',
      score: s,
      challenge: String(challenge || 'free').replace(/[^a-z0-9-]/gi, '').slice(0, 16) || 'free',
      at: new Date().toISOString(),
    });
    await fs.writeFile(SCORES_FILE, JSON.stringify(scores.slice(-20000), null, 2));
    res.status(201).json({ ok: true });
  });

app.get('/api/scores', async (req, res) => {
  const challenge = String(req.query.challenge || 'free')
    .replace(/[^a-z0-9-]/gi, '').slice(0, 16) || 'free';
  const scores = await readJson(SCORES_FILE, []);
  const top = scores
    .filter((r) => r.challenge === challenge)
    .sort((a, b) => b.score - a.score || a.at.localeCompare(b.at))
    .slice(0, 20);
  res.json(top);
});

/* ————————————————— shot share pages (OG unfurls) ————————————————— */

app.get('/shot/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!/^[a-f0-9]{16}$/.test(id)) return res.status(404).send('not found');
  const shots = await readJson(SHOTS_FILE, []);
  const shot = shots.find((s) => s.id === id);
  if (!shot) return res.status(404).send('not found');

  const origin = requestOrigin(req);
  if (!origin) return res.status(400).send('bad request');
  const img = esc(`${origin}/api/shot-cards/${id}.png`);
  const title = esc(`Shot Card — ${shot.pattern}`);
  const desc = esc(shot.line || 'Built in the Lighting Room.');
  res.set('Cache-Control', 'public, max-age=300');
  res.send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img}">
<style>
  body{margin:0;background:#0a0705;color:#efe7dc;font-family:Georgia,serif;
    display:flex;flex-direction:column;align-items:center;gap:24px;padding:40px 16px;}
  img{max-width:min(520px,92vw);border:1px solid rgba(224,169,110,.4);}
  a{color:#f5c542;font-family:monospace;letter-spacing:.15em;text-transform:uppercase;
    font-size:12px;text-decoration:none;border:1px solid rgba(245,197,66,.5);padding:12px 22px;}
</style></head><body>
<img src="${img}" alt="${title}">
<a href="/?room">⟶ Light your own shot</a>
</body></html>`);
});

/* ————————————————— contact ————————————————— */

app.post('/api/contact', guard('contact', 5, 3600_000), smallJson,
  async (req, res) => {
    const { name, email, message } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    const messages = await readJson(MESSAGES_FILE, []);
    messages.push({
      name: cleanText(name, 120),
      email: cleanText(email, 200),
      message: cleanText(message, 4000),
      at: new Date().toISOString(),
    });
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages.slice(-5000), null, 2));
    res.status(201).json({ ok: true });
  });

/* ————————————————— production: serve the built frontend ————————————————— */

app.use(express.static(FRONTEND_DIST, {
  setHeaders(res, file) {
    // Vite fingerprints /assets — safe to cache hard; html stays fresh
    if (file.includes(`${path.sep}assets${path.sep}`)) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));
app.get(/^\/(?!api\/).*/, (_req, res, next) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) next(); // no build yet — dev mode uses Vite instead
  });
});

/* ————————————————— errors: never leak internals ————————————————— */

app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload too large' });
  }
  if (err?.type?.startsWith?.('entity') || err?.status === 400) {
    return res.status(400).json({ error: 'bad request' });
  }
  console.error('[observatory]', err?.message || err);
  res.status(500).json({ error: 'internal error' });
});

const server = app.listen(PORT, () => {
  console.log(`[observatory] api on http://localhost:${PORT}`);
});

// slow-loris resistance: don't hold sockets open for laggard clients
server.headersTimeout = 20_000;
server.requestTimeout = 60_000;
server.keepAliveTimeout = 5_000;
