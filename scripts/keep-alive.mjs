#!/usr/bin/env node
// Keeps the Render free instance from going to sleep by calling its /health URL.
// It costs nothing in Gemini calls: /health does not touch the AI.
//
//   node scripts/keep-alive.mjs https://your-service.onrender.com          one ping (use with cron / Task Scheduler)
//   node scripts/keep-alive.mjs https://your-service.onrender.com --loop   ping every 10 minutes until stopped
//   API_URL=https://your-service.onrender.com node scripts/keep-alive.mjs
//
// Render's free plan sleeps after 15 minutes without traffic, so keep the interval under that.

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) || process.env.API_URL || "").replace(/\/+$/, "");
const loop = args.includes("--loop");
const everyMinutes = Number(process.env.INTERVAL_MINUTES) || 10;

if (!base) {
  console.error("Missing URL. Example: node scripts/keep-alive.mjs https://your-service.onrender.com");
  process.exit(2);
}
if (!base.startsWith("https://")) console.warn("Warning: not an https URL. Use your Render address.");

const stamp = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A sleeping instance can take up to a minute to wake, so allow a long first attempt and retry.
async function ping() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(75_000), headers: { "user-agent": "qenbel-keep-alive" } });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        const ms = Date.now() - started;
        console.log(`${stamp()} ok in ${ms} ms${ms > 8000 ? " (it was asleep and has woken up)" : ""}`);
        return true;
      }
      console.warn(`${stamp()} attempt ${attempt}: HTTP ${res.status}`);
    } catch (e) {
      console.warn(`${stamp()} attempt ${attempt}: ${e.name === "TimeoutError" ? "timed out" : e.message}`);
    }
    if (attempt < 3) await sleep(attempt * 5000);
  }
  return false;
}

if (!loop) {
  process.exit((await ping()) ? 0 : 1);
}

console.log(`${stamp()} pinging ${base}/health every ${everyMinutes} minutes. Press Ctrl+C to stop.`);
for (;;) {
  await ping();
  await sleep(everyMinutes * 60_000);
}
