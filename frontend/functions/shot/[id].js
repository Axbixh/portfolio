/*
 * Shot share pages — OG tags so cards unfurl on socials.
 * On Pages, request.url's origin is set by Cloudflare (not a client
 * header), so it's safe to build absolute image URLs from it;
 * PUBLIC_ORIGIN still overrides for custom-domain canonicalization.
 */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export async function onRequestGet({ request, params, env }) {
  const id = String(params.id || '');
  if (!/^[a-f0-9]{16}$/.test(id) || !env.OBS_KV) {
    return new Response('not found', { status: 404 });
  }
  const shots = (await env.OBS_KV.get('shots:index', 'json')) || [];
  const shot = shots.find((s) => s.id === id);
  if (!shot) return new Response('not found', { status: 404 });

  const origin = env.PUBLIC_ORIGIN || new URL(request.url).origin;
  const img = esc(`${origin}/api/shot-cards/${id}.png`);
  const title = esc(`Shot Card — ${shot.pattern}`);
  const desc = esc(shot.line || 'Built in the Lighting Room.');

  return new Response(`<!doctype html>
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
</body></html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
