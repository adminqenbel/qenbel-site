# Security review and hardening

Reviewed stage by stage. Each finding was reproduced with a real request first, fixed, then replayed. The attacks are kept as tests: `cd backend && npm test`.

## The biggest change: the server no longer sends email

A message to the team is sent by the **visitor, from their own email account** (Open in Gmail, Email app, Outlook, or Copy details). QenBel's backend has no SMTP login, no mail library and no email route. That removes a whole class of abuse found in review (below) and means there is no mail password to protect or leak.

Trade-off: the email arrives from the visitor, so its content is unverified. The team replies by email.

## What an attacker can reach

| Surface | Reachable by | Can do |
|---|---|---|
| `POST /api/chat` | anyone | spend Gemini budget, try to steer the assistant |
| `GET /health` | anyone | learn that the API is up |
| Chat page and saved chats | the visitor, or anyone on their device | edit browser storage |
| Site hosting | anyone | frame it, inject script if a hole existed |

## Findings, fixes and proof

| # | Stage | Finding | Severity | Fix |
|---|---|---|---|---|
| 1 | Email | (Found, then removed.) The email check accepted `foo,victim@evil.test`, and the mail library would deliver to the second address, so the QenBel mailbox could send to any third party. Attacker-written text could also be placed in the confirmation email. | **High** | Fixed with strict validation first, then the server-side email path was removed entirely |
| 2 | Email | (Found, then removed.) One inbox could be mail-bombed (8 of 8 accepted). | Medium | Removed with the email path |
| 3 | API | Invalid requests spent the daily Gemini budget, so 3,000 junk calls disabled the assistant for the day | Medium | Budget is spent only when Gemini is really called |
| 4 | API | Behind `trust proxy`, a spoofed `X-Forwarded-For` bypassed per-IP limits | Medium (depends on hosting) | `TRUST_PROXY` is a setting; with the right value the limit held (12 passed, 8 blocked) |
| 5 | AI | A visitor could forge "assistant" turns in the history ("I agreed to 90% off") | Medium | Every reply is HMAC-signed; assistant turns without a valid signature are dropped. Card notes are rebuilt from catalogue ids |
| 6 | AI | (Found, then removed.) The model could be talked into a below-minimum price, and a model-chosen quantity multiplied a tier price (3 apps became 3 x Advanced, about INR 2 crore) | Medium | The assistant no longer prices anything: no estimates, quotes, quantities or totals exist in the code |
| 7 | AI | A manipulated reply could carry phishing links or look-alike addresses | Medium | Links and non-team addresses are stripped from replies |
| 8 | Data | (Removed with the currency feature.) A hijacked exchange-rate feed could have made prices absurd | Low | The exchange-rate and location endpoints no longer exist |
| 9 | API | Missing `nosniff`, `no-store`, CSP and HSTS headers; `/health` listed model names and config | Low | Added headers, `/health` returns only `{ok:true}` |
| 10 | AI | Gemini calls could hold a request up to about 150 seconds across fallbacks | Low | One 40 second deadline overall |
| 11 | Browser | CSP allowed any `*.onrender.com` host; no `object-src`, HSTS or COOP | Low | `connect-src` limited to the exact API hosts, plus `object-src 'none'`, HSTS, COOP, CORP |
| 12 | Browser | Saved chats are plain browser data; a tampered entry could break the page; shared computers keep the chats | Low | Shape-checked on load, bad messages skipped, "Delete all chats and saved email" button |

Checked and fine: no secrets in any file or in git history; `npm audit` reports 0 vulnerabilities (one dependency, Express); the Gemini key is sent only as a header from the server; no user-controlled URLs are fetched (no SSRF); all chat and card text is drawn with `textContent` (no `innerHTML`); the assistant is instructed never to give prices and the code holds no price data (a test checks the prompt); the model has no tools; email links are built with `encodeURIComponent` and the Gmail and Outlook links open in a new tab with `noopener`.

## Set these when you deploy

1. **Render:** `GEMINI_API_KEY` (you paste it) and `HISTORY_SECRET` (the blueprint generates it). Without a stable `HISTORY_SECRET`, restarts invalidate old signatures; chats keep working, the assistant just loses earlier replies as context.
2. **`CLIENT_IP_HEADER=cf-connecting-ip` on Render.** Checked on the live API: without it, 15 rapid calls were never limited (Render's proxies make the app see changing addresses), so the per-IP limit did nothing. With it, limits follow the real visitor address from Cloudflare. After setting it, repeat the test in `DEPLOY.md`.
3. **Vercel CSP:** `connect-src` in `vercel.json` names `qenbel-api.onrender.com` and `api.qenbel.site`. If your API address differs, change it there and in `config.js`.
4. **Rotate the Gemini key** that was pasted into the chat during development.

## Known limits (not fixed)

- **No bot challenge.** A distributed attacker can still use up the daily Gemini budget; the assistant then tells visitors to email instead. Adding Cloudflare Turnstile to the chat closes most of this.
- **Prompt injection cannot be eliminated**, only contained. The model can still be talked into odd wording, but it holds no price data and cannot reach any tool, and its text is sanitised.
- **Bundle offers can be gamed** by asking for services you do not intend to buy. The team reviews every request before confirming.
- The in-memory rate limits reset on restart and are per instance. Move them to Redis or Supabase if you run more than one instance.
