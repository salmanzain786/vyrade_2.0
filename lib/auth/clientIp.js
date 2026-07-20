/**
 * Client IP resolution for rate limiting.
 *
 * `X-Forwarded-For` is client-supplied unless a proxy you control rewrites or
 * appends to it. If the app is directly exposed and we trust the header, an
 * attacker defeats every per-IP limit by sending a fresh value each request.
 * So XFF is NOT trusted by default — it is only used when you declare how many
 * proxies sit in front of the app via TRUST_PROXY.
 *
 *   TRUST_PROXY unset / 0 / false → ignore XFF (safe default, direct exposure)
 *   TRUST_PROXY=1                 → one trusted proxy (Nginx, ALB, Cloudflare…)
 *   TRUST_PROXY=2                 → two hops (e.g. Cloudflare → Nginx → app)
 *   TRUST_PROXY=true              → same as 1
 *
 * Platform headers that the edge sets itself (Cloudflare's CF-Connecting-IP,
 * Vercel's) are preferred and used regardless, because a client cannot forge
 * them — the edge overwrites whatever the client sent.
 */

export const UNKNOWN_IP = 'unknown';

/** How many trusted proxies sit in front of the app. 0 = don't trust XFF. */
export function trustProxyHops() {
  const raw = String(process.env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (!raw || raw === 'false' || raw === '0' || raw === 'no') return 0;
  if (raw === 'true' || raw === 'yes') return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

let warnedAboutUntrustedXff = false;

export function clientIp(request) {
  const get = (k) => request?.headers?.get?.(k) || null;
  const first = (v) => String(v).split(',')[0].trim();

  // 1) Edge-set headers. The platform overwrites these, so they can't be forged.
  const cf = get('cf-connecting-ip');                       // Cloudflare
  if (cf) return first(cf);
  const vercel = get('x-vercel-forwarded-for');             // Vercel
  if (vercel) return first(vercel);
  const trueClient = get('true-client-ip');                 // Akamai / CF Enterprise
  if (trueClient) return first(trueClient);
  if (request?.ip) return String(request.ip);               // populated by some hosts

  // 2) X-Forwarded-For — only with an explicitly declared trusted-proxy depth.
  const hops = trustProxyHops();
  const xff = get('x-forwarded-for');
  if (hops > 0) {
    if (xff) {
      const parts = String(xff).split(',').map((s) => s.trim()).filter(Boolean);
      // Each proxy APPENDS the peer it received from, so the trustworthy entry
      // is the Nth from the right. Anything further left may be client-supplied.
      const idx = Math.max(0, parts.length - hops);
      if (parts[idx]) return parts[idx];
    }
    const real = get('x-real-ip');
    if (real) return first(real);
  } else if (xff && !warnedAboutUntrustedXff) {
    // Seeing XFF with no TRUST_PROXY usually means a misconfigured deployment.
    warnedAboutUntrustedXff = true;
    console.warn(
      '[rate-limit] X-Forwarded-For present but TRUST_PROXY is not set — ignoring it ' +
      '(a client could otherwise spoof it to bypass per-IP limits). If this app runs ' +
      'behind a proxy, set TRUST_PROXY to the number of proxies in front of it.'
    );
  }

  return UNKNOWN_IP;
}
