# qenbel-site

Landing page and assistant for [qenbel.site](https://qenbel.site).

| Part | Where | Hosting |
|---|---|---|
| Landing page (static, no build) | `index.html`, `styles.css`, `main.js`, `preload.js` | Vercel |
| Assistant page (ChatGPT-style) | `chat.html`, `chat-page.css`, `chat-page.js`, `orb.js`, `config.js` | Vercel |
| Assistant API (Gemini + email) | `backend/` | Render (`render.yaml`) |
| Prices, offers, disclaimer | `backend/data/pricing.json`, explained in `PRICING.md` | with the API |

Contact is email only: admin.qenbel@gmail.com

## Run it locally

```
# 1) the API (Node 20.6+). Settings come from backend/.env, which is git-ignored.
cd backend
npm install
npm run local                                        # reads backend/.env (copy .env.example to .env and fill it in)
npm test                                             # security regression tests

# 2) the site, from the repo root
python -m http.server 4173                           # open http://127.0.0.1:4173
```

Add `?loader` to the landing page URL to replay the first-visit loading screen.

## Deploy

**API on Render**
1. New > Blueprint > select this repo (`render.yaml` is picked up).
2. Set one secret in the dashboard: `GEMINI_API_KEY`. `HISTORY_SECRET` is generated for you. Then follow the checklist in `SECURITY.md`. No email account is needed: visitors send the estimate from their own email (Gmail, their email app or Outlook).
3. Open `https://<your-service>.onrender.com/health`; it should answer `{"ok":true}`.

**Site on Vercel**
1. Import this repo. Framework preset: Other, no build command, output directory `.`.
2. Put the Render URL in `config.js` (`QENBEL_API`), push, and add `qenbel.site` under Project > Domains.
3. If your API address is not `qenbel-api.onrender.com` or `api.qenbel.site`, change `connect-src` in `vercel.json` to match.

Render's free plan sleeps when idle, so the first message after a quiet period can take about 30 seconds. The chat page shows a notice while it wakes.

## Secrets

`GEMINI_API_KEY` and `HISTORY_SECRET` live only in the host's environment. `.env` files are git-ignored.
