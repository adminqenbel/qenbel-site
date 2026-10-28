#!/usr/bin/env node
// Post-deploy check of the live API.   node scripts/check-api.mjs https://api.qenbel.site [https://qenbel.site]
// Makes about 20 cheap requests and no Gemini calls. Exit code 1 if anything fails.

const base = (process.argv[2] || process.env.API_URL || "").replace(/\/+$/, "");
const site = (process.argv[3] || "https://qenbel.site").replace(/\/+$/, "");
if (!base) { console.error("Usage: node scripts/check-api.mjs https://api.qenbel.site [https://qenbel.site]"); process.exit(2); }

let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); if (!ok) failed++; };
const get = (path, headers = {}) => fetch(base + path, { headers, signal: AbortSignal.timeout(75_000) });

const h = await get("/health");
check("health answers {ok:true}", h.ok && (await h.json()).ok === true);
check("security headers present", h.headers.get("x-content-type-options") === "nosniff" && !!h.headers.get("strict-transport-security") && !!h.headers.get("content-security-policy"));

const ok = await get("/api/rates", { origin: site });
check(`CORS allows ${site}`, ok.headers.get("access-control-allow-origin") === site);
const bad = await get("/api/rates", { origin: "https://evil.example" });
check("CORS refuses other sites", bad.status === 403);

const geo = await (await get("/api/geo?hint=IN", { origin: site })).json();
check("location finder works", typeof geo.currency === "string", `${geo.country || "none"} -> ${geo.currency} (${geo.source})`);

// The rate limit must follow the real visitor, so a fake X-Forwarded-For must not get around it.
await new Promise((r) => setTimeout(r, 1000));
const codes = [];
for (let i = 1; i <= 16; i++) {
  const r = await fetch(base + "/api/chat", {
    method: "POST",
    headers: { origin: site, "content-type": "application/json", "x-forwarded-for": `203.0.113.${i}` },
    body: JSON.stringify({ messages: [] }),
    signal: AbortSignal.timeout(30_000),
  });
  codes.push(r.status);
}
const limited = codes.filter((c) => c === 429).length;
check("rate limit holds against a fake X-Forwarded-For (12 per minute)", limited >= 3, `${codes.length - limited} allowed, ${limited} blocked`);

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
