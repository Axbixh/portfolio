/*
 * Observatory backend — small on purpose.
 * Serves the shot-card gallery (the base of the share/leaderboard loop),
 * a contact endpoint, and — in production — the built frontend.
 *
 * Storage is flat JSON + PNG files under backend/data. Swap for a real DB
 * when the leaderboard becomes real; the API shape won't need to change.
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
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');

const PORT = process.env.PORT || 3001;
const MAX_SHOTS_LISTED = 100;

const app = express();
app.set('trust proxy', 1); // real client IPs behind a reverse proxy
app.use(express.json({ limit: '8mb' })); // shot-card PNGs arrive as data URLs

await fs.mkdir(SHOTS_DIR, { recursive: true });

/* ——— tiny in-memory rate limiter (per IP, per endpoint) ——— */
const buckets = new Map();
function guard(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      buckets.set(key, hits);
      return res.status(429).json({ error: 'slow down' });
    }
    hits.push(now);
    buckets.set(key, hits);
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

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/* ——— health ——— */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

/* ——— shot cards ——— */
app.post('/api/shot-cards', guard('shots', 10, 3600_000), async (req, res) => {
  const { image, recipe } = req.body || {};
  if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,')) {
    return res.status(400).json({ error: 'image must be a PNG data URL' });
  }
  if (image.length > 6_000_000) {
    return res.status(413).json({ error: 'image too large' });
  }
  if (!recipe || typeof recipe.pattern !== 'string') {
    return res.status(400).json({ error: 'recipe.pattern is required' });
  }

  const id = crypto.randomBytes(8).toString('hex');
  const png = Buffer.from(image.split(',')[1], 'base64');
  await fs.writeFile(path.join(SHOTS_DIR, `${id}.png`), png);

  const shots = await readJson(SHOTS_FILE, []);
  const entry = {
    id,
    pattern: recipe.pattern,
    line: String(recipe.line || '').slice(0, 300),
    createdAt: new Date().toISOString(),
  };
  shots.unshift(entry);
  await fs.writeFile(SHOTS_FILE, JSON.stringify(shots.slice(0, 5000), null, 2));

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
  res.sendFile(path.join(SHOTS_DIR, file), (err) => {
    if (err) res.status(404).end();
  });
});

/* ——— Match the Shot leaderboard ——— */
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');

app.post('/api/scores', guard('scores', 30, 3600_000), async (req, res) => {
  const { name, score, challenge } = req.body || {};
  const s = Math.round(Number(score));
  if (!Number.isFinite(s) || s < 0 || s > 100) {
    return res.status(400).json({ error: 'score must be 0-100' });
  }
  const scores = await readJson(SCORES_FILE, []);
  scores.push({
    name: String(name || 'ANON').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'ANON',
    score: s,
    challenge: String(challenge || 'free').slice(0, 16),
    at: new Date().toISOString(),
  });
  await fs.writeFile(SCORES_FILE, JSON.stringify(scores.slice(-20000), null, 2));
  res.status(201).json({ ok: true });
});

app.get('/api/scores', async (req, res) => {
  const challenge = String(req.query.challenge || 'free').slice(0, 16);
  const scores = await readJson(SCORES_FILE, []);
  const top = scores
    .filter((r) => r.challenge === challenge)
    .sort((a, b) => b.score - a.score || a.at.localeCompare(b.at))
    .slice(0, 20);
  res.json(top);
});

/* ——— shot share pages: OG tags so cards unfurl on socials ——— */
app.get('/shot/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!/^[a-f0-9]{16}$/.test(id)) return res.status(404).send('not found');
  const shots = await readJson(SHOTS_FILE, []);
  const shot = shots.find((s) => s.id === id);
  if (!shot) return res.status(404).send('not found');

  const base = `${req.protocol}://${req.get('host')}`;
  const img = `${base}/api/shot-cards/${id}.png`;
  const title = `Shot Card — ${esc(shot.pattern)}`;
  const desc = esc(shot.line || 'Built in the Lighting Room.');
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

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ——— contact ——— */
app.post('/api/contact', guard('contact', 5, 3600_000), async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }
  const messages = await readJson(MESSAGES_FILE, []);
  messages.push({
    name: String(name || '').slice(0, 120),
    email: String(email || '').slice(0, 200),
    message: message.slice(0, 4000),
    at: new Date().toISOString(),
  });
  await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  res.status(201).json({ ok: true });
});

/* ——— production: serve the built frontend ——— */
app.use(express.static(FRONTEND_DIST));
app.get(/^\/(?!api\/).*/, (_req, res, next) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) next(); // no build yet — dev mode uses Vite instead
  });
});

app.listen(PORT, () => {
  console.log(`[observatory] api on http://localhost:${PORT}`);
});
