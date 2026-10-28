// All settings come from environment variables. Secrets (GEMINI_API_KEY, HISTORY_SECRET) live only
// in the host's environment (the Render dashboard; locally, your shell). Never committed.

const list = (v, fallback) => (v ?? fallback).split(",").map((s) => s.trim()).filter(Boolean);
const num = (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== "" ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 8787),

  // How many reverse proxies sit in front of this app. Rate limits trust the address the last proxy
  // saw. On Render, check once after deploying: if every visitor shares one IP, raise this; if you can
  // spoof an IP with X-Forwarded-For, lower it.
  trustProxy: num(process.env.TRUST_PROXY, 1),

  geminiKey: process.env.GEMINI_API_KEY || "",
  // Tried in order. If one is overloaded or retired, the next takes over.
  models: list(process.env.GEMINI_MODELS, "gemini-3.5-flash,gemini-3.8-flash,gemini-3.5-flash-lite"),

  // Browsers on these origins may call the API.
  allowedOrigins: list(
    process.env.ALLOWED_ORIGINS,
    "https://qenbel.site,https://www.qenbel.site,http://127.0.0.1:4173,http://localhost:4173"
  ),

  // The only address the assistant may repeat in a reply.
  teamEmail: process.env.TEAM_EMAIL || "admin.qenbel@gmail.com",

  limits: {
    chatPerMinute: num(process.env.CHAT_PER_MINUTE, 12),
    chatPerDayPerIp: num(process.env.CHAT_PER_DAY_PER_IP, 60),
    chatPerDayGlobal: num(process.env.CHAT_PER_DAY_GLOBAL, 3000),
  },
};
