import { config } from "./config.js";
import { systemPrompt } from "./prompt.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Gemini wants alternating roles that start with the user.
function toContents(messages) {
  const out = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += "\n" + m.content;
    else out.push({ role, parts: [{ text: m.content }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export class GeminiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(model, body, signal) {
  const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": config.geminiKey },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new GeminiError(`Gemini ${model} returned ${res.status}`, res.status);
  return res.json();
}

export async function askGemini(messages) {
  if (!config.geminiKey) throw new GeminiError("GEMINI_API_KEY is not set", 500);

  const generationConfig = {
    temperature: 0.4,
    maxOutputTokens: 1500,
  };

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(config.teamEmail) }] },
    contents: toContents(messages),
    generationConfig,
  };

  let data;
  let lastError;
  const deadline = Date.now() + 40_000; // whatever the fallbacks do, one visitor never holds a request longer
  for (const model of config.models) {
    // Retry the same model once on a timeout, then move on to the next model.
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      const left = deadline - Date.now();
      if (left <= 1000) break;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.min(25_000, left));
      try {
        data = await call(model, body, ctrl.signal);
      } catch (e) {
        lastError = e;
        if (e.name !== "AbortError") break; // 4xx/5xx: go straight to the next model
      } finally {
        clearTimeout(timer);
      }
    }
    if (data) break;
  }
  if (!data) throw lastError || new GeminiError("No Gemini model answered", 503);

  const cand = data?.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new GeminiError("Empty reply from Gemini", 502);

  return { reply: text.slice(0, 2000) };
}
