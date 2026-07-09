/*
 * Match the Shot leaderboard — one KV key per challenge:
 *   scores:<challenge> → JSON array of {name, score, at}, best first
 */

const json = (data, status = 200) => Response.json(data, { status });

/* The game only ever uses an 8-digit date (daily) or 'free'. Anything
   else is rejected to 'free' so the KV key namespace can't be inflated
   by attacker-chosen challenge strings. */
const challengeKey = (v) => {
  const s = String(v || 'free');
  return /^\d{8}$/.test(s) ? s : 'free';
};

const MAX_BODY = 4_096;

export async function onRequestGet({ request, env }) {
  if (!env.OBS_KV) return json([]);
  const challenge = challengeKey(new URL(request.url).searchParams.get('challenge'));
  const rows = (await env.OBS_KV.get(`scores:${challenge}`, 'json')) || [];
  return json(rows.slice(0, 20));
}

export async function onRequestPost({ request, env }) {
  if (!env.OBS_KV) return json({ error: 'storage not configured' }, 503);
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) {
    return json({ error: 'payload too large' }, 413);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const { name, score, challenge } = body || {};
  // require a real number — reject arrays/null/objects that Number()
  // would silently coerce ([100]→100, null→0)
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return json({ error: 'score must be a number 0-100' }, 400);
  }
  const s = Math.round(score);
  if (s < 0 || s > 100) {
    return json({ error: 'score must be 0-100' }, 400);
  }
  const key = `scores:${challengeKey(challenge)}`;
  const rows = (await env.OBS_KV.get(key, 'json')) || [];
  rows.push({
    name: String(name || 'ANON').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'ANON',
    score: s,
    at: new Date().toISOString(),
  });
  rows.sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
  await env.OBS_KV.put(key, JSON.stringify(rows.slice(0, 200)));
  return json({ ok: true }, 201);
}
