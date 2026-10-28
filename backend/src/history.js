import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { buildQuote } from "./pricing.js";

// Conversation history comes from the browser, so the browser could invent things the assistant
// "said". Every assistant reply is signed here, and any assistant turn without a valid signature
// is thrown away. Visitors can only ever contribute user turns.

const FROM_ENV = Boolean(process.env.HISTORY_SECRET);
const secret = process.env.HISTORY_SECRET || randomBytes(32).toString("hex");
export const historySecretIsEphemeral = !FROM_ENV; // a restart then invalidates old signatures

export const sign = (text) => createHmac("sha256", secret).update(text).digest("base64url");

export function verify(text, sig) {
  if (typeof sig !== "string" || sig.length > 64) return false;
  const a = Buffer.from(sign(text));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

const MAX_CHARS = 12_000;

// The model never receives text the visitor could have forged as an assistant.
export function cleanHistory(input, keep) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const m of input.slice(-40)) {
    const content = String(m?.content ?? "").replace(/\u0000/g, "").trim().slice(0, 1500);
    if (!content) continue;
    if (m?.role === "assistant") {
      if (!verify(content, m.sig)) continue; // forged or stale: drop it
      let note = "";
      const card = m.quote ? buildQuote(m.quote) : null; // rebuilt from catalogue ids, never from client text
      if (card) note = `\n[Card shown: ${card.mode}${card.lines.length ? " - " + card.lines.map((l) => `${l.serviceName} (${l.tier})`).join("; ") : ""}]`;
      out.push({ role: "assistant", content: content + note });
    } else {
      out.push({ role: "user", content });
    }
  }
  let kept = out.slice(-keep);
  while (kept.reduce((n, m) => n + m.content.length, 0) > MAX_CHARS && kept.length > 1) kept = kept.slice(1);
  return kept;
}

// Replies are plain text for people. Strip anything that could carry a phishing link or a
// look-alike address if the model were ever talked into writing one.
export function sanitizeReply(text, teamEmail) {
  return String(text ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\[([^\]]{0,200})\]\([^)]{0,500}\)/g, "$1")
    .replace(/\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"')]+/gi, "[link removed]")
    .replace(/\b[a-z0-9.-]+\.[a-z]{2,}\/\S*/gi, "[link removed]")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, (m) => (m.toLowerCase() === String(teamEmail).toLowerCase() ? m : "[email removed]"))
    .trim()
    .slice(0, 1500);
}
