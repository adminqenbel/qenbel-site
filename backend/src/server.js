import express from "express";
import { config } from "./config.js";
import { askGemini, GeminiError } from "./gemini.js";
import { buildQuote, catalogue } from "./pricing.js";
import { cors, dailyBudget, rateLimiter, secureHeaders } from "./security.js";
import { countryFromRequest, currencyForCountry, getRates } from "./fx.js";
import { cleanHistory, historySecretIsEphemeral, sanitizeReply, sign } from "./history.js";

const app = express();
app.set("trust proxy", config.trustProxy);
app.disable("x-powered-by");
app.use(secureHeaders);
app.use(cors(config.allowedOrigins));
app.use(express.json({ limit: "24kb", strict: true }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Location finder: the visitor's country from network headers, else a hint from their browser locale.
app.get("/api/geo", async (req, res) => {
  let country = countryFromRequest(req);
  let source = "network";
  if (!country) {
    const hint = String(req.query.hint || "").toUpperCase();
    if (/^[A-Z]{2}$/.test(hint)) { country = hint; source = "browser"; }
  }
  const { rates } = await getRates();
  const wanted = currencyForCountry(country) || "USD";
  res.json({ country, currency: rates[wanted] ? wanted : "USD", source: country ? source : "default" });
});

// Exchange rates (USD base) for showing prices in the visitor's currency.
app.get("/api/rates", async (_req, res) => {
  const r = await getRates();
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ base: r.base, asOf: r.asOf, rates: r.rates });
});

// Public price list, if the site ever wants to show it without the assistant.
app.get("/api/pricing", (_req, res) => {
  const { _note, ...publicCatalogue } = catalogue;
  res.json(publicCatalogue);
});

const perDay = rateLimiter({ windowMs: 24 * 60 * 60 * 1000, max: config.limits.chatPerDayPerIp, ipHeader: config.clientIpHeader });
const perMinute = rateLimiter({ windowMs: 60_000, max: config.limits.chatPerMinute, ipHeader: config.clientIpHeader });
const budget = dailyBudget(config.limits.chatPerDayGlobal);

// The estimate is sent to the team by the visitor from their own email account (Gmail, their email
// app, Outlook), so this server never sends email and never stores a conversation.
app.post("/api/chat", perMinute, perDay, async (req, res) => {
  const messages = cleanHistory(req.body?.messages, 16);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "bad_request", message: "Send at least one message." });
  }
  // Only a request that will really call Gemini spends from the daily budget.
  if (!budget.take()) {
    return res.status(503).json({ error: "busy", message: "The assistant is busy today. Please email admin.qenbel@gmail.com instead." });
  }
  try {
    const { reply, quote } = await askGemini(messages);
    const safeReply = sanitizeReply(reply, config.teamEmail) || "Sorry, I could not put that into words. Could you rephrase?";
    res.json({ reply: safeReply, sig: sign(safeReply), quote: quote ? buildQuote(quote) : null });
  } catch (e) {
    console.error("chat failed:", e instanceof GeminiError ? `${e.message}` : e?.name);
    const busy = e instanceof GeminiError && (e.status === 429 || e.status >= 500);
    res.status(busy ? 503 : 502).json({
      error: "assistant_unavailable",
      message: "The assistant could not answer just now. You can email admin.qenbel@gmail.com instead.",
    });
  }
});

app.use((_req, res) => res.status(404).json({ error: "not_found" }));
app.use((err, _req, res, _next) => {
  const status = err.status === 413 ? 413 : 400;
  res.status(status).json({ error: status === 413 ? "too_large" : "bad_request" });
});

app.listen(config.port, () => {
  console.log(`QenBel API on :${config.port} | gemini=${config.geminiKey ? "set" : "MISSING"} models=${config.models.join(">")}`);
  if (historySecretIsEphemeral) console.warn("HISTORY_SECRET is not set: signatures reset on every restart. Set it in the host environment.");
});
