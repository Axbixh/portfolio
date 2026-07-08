/*
 * Shot cards — KV-backed.
 *   shots:index → JSON array of {id, pattern, line, createdAt}
 *   shot:<id>   → the PNG bytes
 */

const MAX_STORED = 500;   // KV free tier: keep the footprint modest
const MAX_PNG_BYTES = 4_500_000;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const json = (data, status = 200) => Response.json(data, { status });

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');
const cleanText = (v, max) =>
  String(v ?? '').replace(CONTROL_CHARS, ' ').trim().slice(0, max);

export async function onRequestGet({ env }) {
  if (!env.OBS_KV) return json([]);
  const shots = (await env.OBS_KV.get('shots:index', 'json')) || [];
  return json(shots.slice(0, 100).map((s) => ({
    ...s,
    url: `/api/shot-cards/${s.id}.png`,
  })));
}

export async function onRequestPost({ request, env }) {
  if (!env.OBS_KV) return json({ error: 'storage not configured' }, 503);

  if (Number(request.headers.get('content-length') || 0) > 8_000_000) {
    return json({ error: 'payload too large' }, 413);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const { image, recipe } = body || {};
  if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,')) {
    return json({ error: 'image must be a PNG data URL' }, 400);
  }
  if (!recipe || typeof recipe.pattern !== 'string') {
    return json({ error: 'recipe.pattern is required' }, 400);
  }

  let bytes;
  try {
    const bin = atob(image.slice(image.indexOf(',') + 1));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return json({ error: 'bad base64' }, 400);
  }
  if (bytes.length > MAX_PNG_BYTES) return json({ error: 'image too large' }, 413);
  if (bytes.length < 8 || !PNG_MAGIC.every((b, i) => bytes[i] === b)) {
    return json({ error: 'not a PNG' }, 400);
  }

  const rand = crypto.getRandomValues(new Uint8Array(8));
  const id = [...rand].map((b) => b.toString(16).padStart(2, '0')).join('');

  await env.OBS_KV.put(`shot:${id}`, bytes.buffer);

  const shots = (await env.OBS_KV.get('shots:index', 'json')) || [];
  const entry = {
    id,
    pattern: cleanText(recipe.pattern, 60),
    line: cleanText(recipe.line, 300),
    createdAt: new Date().toISOString(),
  };
  shots.unshift(entry);
  for (const old of shots.slice(MAX_STORED)) {
    try { await env.OBS_KV.delete(`shot:${old.id}`); } catch {}
  }
  await env.OBS_KV.put('shots:index', JSON.stringify(shots.slice(0, MAX_STORED)));

  return json({ ...entry, url: `/api/shot-cards/${id}.png` }, 201);
}
