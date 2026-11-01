import express from "express";
import { config } from "./config.js";
import { askGemini, GeminiError } from "./gemini.js";
import { cors, dailyBudget, rateLimiter, secureHeaders } from "./security.js";
import { cleanHistory, historySecretIsEphemeral, sanitizeReply, sign } from "./history.js";

const app = express();
app.set("trust proxy", config.trustProxy);
app.disable("x-powered-by");
app.use(secureHeaders);
app.use(cors(config.allowedOrigins));
app.use(express.json({ limit: "24kb", strict: true }));

app.get("/health", (_req, res) => res.json({ ok: true }));

const perDay = rateLimiter({ windowMs: 24 * 60 * 60 * 1000, max: config.limits.chatPerDayPerIp, ipHeader: config.clientIpHeader });
const perMinute = rateLimiter({ windowMs: 60_000, max: config.limits.chatPerMinute, ipHeader: config.clientIpHeader });
const budget = dailyBudget(config.limits.chatPerDayGlobal);

// This server never sends email and never stores a conversation. A visitor who wants to reach the
// team does it from their own email account.
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
    const { reply } = await askGemini(messages);
    const safeReply = sanitizeReply(reply, config.teamEmail) || "Sorry, I could not put that into words. Could you rephrase?";
    res.json({ reply: safeReply, sig: sign(safeReply) });
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
