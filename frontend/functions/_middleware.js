/*
 * Runs in front of every Pages Function: security headers + a light
 * per-isolate rate limit on writes. Cloudflare's edge provides TLS,
 * DDoS soak, and (recommended: enable in dashboard) one free WAF
 * rate-limiting rule for the heavy lifting.
 */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  'frame-src https://www.youtube-nocookie.com https://player.vimeo.com',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

// per-isolate memory — resets on redeploy/idle, which is fine as a
// first fence; the real wall is Cloudflare's WAF
const buckets = new Map();

export async function onRequest({ request, next }) {
  if (request.method === 'POST') {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const now = Date.now();
    // opportunistic prune so the map can't grow without bound in a
    // long-lived isolate
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (!v.some((t) => now - t < 600_000)) buckets.delete(k);
      }
    }
    const hits = (buckets.get(ip) || []).filter((t) => now - t < 600_000);
    if (hits.length >= 40) {
      buckets.set(ip, hits);
      return new Response(JSON.stringify({ error: 'slow down' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '600' },
      });
    }
    hits.push(now);
    buckets.set(ip, hits);
  }

  const res = await next();
  const headers = new Headers(res.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('Content-Security-Policy', CSP);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
