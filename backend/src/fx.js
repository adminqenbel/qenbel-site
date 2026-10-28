import { readFileSync } from "node:fs";

// Prices are set in USD. These helpers find the visitor's country and convert for display.
// Rates come from a free daily feed, cached for 12 hours. The team always confirms the final
// price (and currency) by email, so rates only need to be indicative.

const countries = JSON.parse(readFileSync(new URL("../data/countries.json", import.meta.url), "utf8"));
const TTL = 12 * 60 * 60 * 1000;

let cache = { at: 0, base: "USD", asOf: null, rates: { USD: 1 } };
let inflight = null;

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally { clearTimeout(timer); }
}

// Keep only well-formed codes and sane numbers. A rate that jumps more than 2x from the last known
// value in one refresh is ignored, so a bad or hijacked feed cannot make prices absurd.
export function sanitizeRates(next, prev = { USD: 1 }) {
  const out = { USD: 1 };
  for (const [code, value] of Object.entries(next || {})) {
    if (!/^[A-Z]{3}$/.test(code) || code === "USD") continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 1e7) continue;
    const before = prev[code];
    if (before && (n / before > 2 || n / before < 0.5)) { out[code] = before; continue; }
    out[code] = n;
  }
  return out;
}

async function refresh() {
  try {
    const d = await fetchJson("https://open.er-api.com/v6/latest/USD");
    if (d.result !== "success" || !d.rates) throw new Error("bad payload");
    return { rates: d.rates, asOf: String(d.time_last_update_utc || "").slice(5, 16) };
  } catch {
    const d = await fetchJson("https://api.frankfurter.dev/v1/latest?base=USD");
    return { rates: { USD: 1, ...d.rates }, asOf: d.date };
  }
}

export async function getRates() {
  if (Date.now() - cache.at < TTL) return cache;
  inflight ??= refresh()
    .then((r) => {
      const rates = sanitizeRates(r.rates, cache.rates);
      if (Object.keys(rates).length < 20) throw new Error("too few rates"); // a truncated feed is not trusted
      cache = { at: Date.now(), base: "USD", asOf: String(r.asOf || "").slice(0, 20), rates };
    })
    .catch(() => { /* keep serving the last good rates, or USD only */ })
    .finally(() => { inflight = null; });
  await inflight;
  return cache;
}

export const currencyForCountry = (cc) => countries[String(cc || "").toUpperCase()] || null;

// Network headers set by the hosting layer (Cloudflare in front of Render, Vercel, CloudFront).
export function countryFromRequest(req) {
  const h = req.headers;
  const raw = h["cf-ipcountry"] || h["x-vercel-ip-country"] || h["cloudfront-viewer-country"] || "";
  const cc = String(raw).toUpperCase();
  return /^[A-Z]{2}$/.test(cc) && cc !== "XX" && cc !== "T1" ? cc : null;
}

export async function convert(usd, code) {
  const { rates } = await getRates();
  const rate = rates[code];
  if (!rate || code === "USD") return { code: "USD", rate: 1, amount: usd };
  return { code, rate, amount: usd * rate };
}
