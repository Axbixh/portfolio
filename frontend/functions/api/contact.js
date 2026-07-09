/*
 * Contact drop-box. Read messages later with:
 *   npx wrangler kv key get messages --namespace-id=<id> --remote
 */

const json = (data, status = 200) => Response.json(data, { status });

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');
const cleanText = (v, max) =>
  String(v ?? '').replace(CONTROL_CHARS, ' ').trim().slice(0, max);

const MAX_BODY = 12_288;

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
  const { name, email, message } = body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return json({ error: 'message is required' }, 400);
  }
  const messages = (await env.OBS_KV.get('messages', 'json')) || [];
  messages.push({
    name: cleanText(name, 120),
    email: cleanText(email, 200),
    message: cleanText(message, 4000),
    at: new Date().toISOString(),
  });
  await env.OBS_KV.put('messages', JSON.stringify(messages.slice(-2000)));
  return json({ ok: true }, 201);
}
