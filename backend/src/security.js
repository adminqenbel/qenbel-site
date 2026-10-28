import { isIP } from "node:net";

// Small in-memory protections. Fine for one Render instance; use Redis or Supabase if you scale out.

// Which address counts as "the visitor". Behind Cloudflare (Render) the app only ever sees proxy
// addresses, so Cloudflare's own CF-Connecting-IP header carries the real one, and clients cannot
// overwrite it. Only set CLIENT_IP_HEADER when the host really overwrites that header.
export function clientKey(req, header) {
  if (header) {
    const raw = String(req.headers[header] ?? "").split(",")[0].trim();
    if (isIP(raw)) return raw;
  }
  return req.ip;
}

// Express middleware: at most `max` requests per `windowMs` for each client address.
export function rateLimiter({ windowMs, max, ipHeader = "" }) {
  const take = keyedLimit({ windowMs, max });
  return (req, res, next) => {
    if (take(clientKey(req, ipHeader))) return next();
    res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
    res.status(429).json({ error: "rate_limited", message: "Too many requests. Please wait a moment." });
  };
}

// take(key) is true while `key` is under its limit. Used inside handlers, e.g. per email address.
export function keyedLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, v] of hits) { const keep = v.filter((t) => t > cutoff); keep.length ? hits.set(k, keep) : hits.delete(k); }
  }, Math.max(Math.min(windowMs, 600_000), 60_000)).unref();

  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => t > now - windowMs);
    if (recent.length >= max) { hits.set(key, recent); return false; }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

// A hard ceiling on Gemini calls per day for the whole service. Call take() only when a real
// Gemini request is about to be made, so junk or invalid requests cannot use it up.
export function dailyBudget(max) {
  let day = new Date().toDateString();
  let used = 0;
  return {
    take() {
      const today = new Date().toDateString();
      if (today !== day) { day = today; used = 0; }
      if (used >= max) return false;
      used++;
      return true;
    },
  };
}

export function cors(allowed) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    const ok = origin && allowed.includes(origin);
    if (ok) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") return res.sendStatus(ok ? 204 : 403);
    if (origin && !ok && req.path.startsWith("/api")) return res.status(403).json({ error: "origin_not_allowed" });
    next();
  };
}

// This API only returns JSON, so it can refuse to be rendered, framed or sniffed.
export function secureHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}
