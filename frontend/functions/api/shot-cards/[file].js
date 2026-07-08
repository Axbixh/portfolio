export async function onRequestGet({ params, env }) {
  const file = String(params.file || '');
  if (!/^[a-f0-9]{16}\.png$/.test(file) || !env.OBS_KV) {
    return new Response('not found', { status: 404 });
  }
  const png = await env.OBS_KV.get(`shot:${file.slice(0, 16)}`, 'arrayBuffer');
  if (!png) return new Response('not found', { status: 404 });
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
