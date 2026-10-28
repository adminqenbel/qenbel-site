# Deploying QenBel by hand

Do **Render first** (you need its address for the site), then **Vercel**.

## 1. Render: the assistant API

1. Sign in to Render with the account you want to own it, and connect GitHub to that Render account so it can see `adminqenbel/qenbel-site` (Account settings > GitHub).
2. **New > Blueprint**, pick the repo, branch `main`. Render reads `render.yaml`.
3. When asked for secrets, paste your **new** Gemini key as `GEMINI_API_KEY`. (Rotate the old one first: it was shared in a chat.) `HISTORY_SECRET` is generated for you.
4. Deploy. When it is live, open `https://<your-service>.onrender.com/health`. It should answer `{"ok":true}`.
5. Note the address. It is probably `https://qenbel-api.onrender.com` if that name was free; otherwise Render adds a suffix.

If you prefer not to use the Blueprint: New > Web Service, root directory `backend`, build `npm ci`, start `npm start`, health check path `/health`, and add the variables from `backend/.env.example`.

## 2. Point the site at the API

Only if your Render address is **not** `https://qenbel-api.onrender.com`:

1. In `config.js`, change the address in `QENBEL_API`.
2. In `vercel.json`, change `https://qenbel-api.onrender.com` inside `connect-src` to the same address.
3. Commit and push.

## 3. Vercel: the website

1. Sign in to Vercel with your other account and connect the GitHub account that owns (or can see) `adminqenbel/qenbel-site`.
2. **Add New > Project**, import the repo.
3. Framework preset **Other**. Leave the build command empty. Output directory: leave empty (the site is the repo root).
4. Deploy, then open the address Vercel gives you and check the page, then `/chat`.
5. **Settings > Domains**: add `qenbel.site` and `www.qenbel.site`, and add the DNS records Vercel shows.
6. The Render variable `ALLOWED_ORIGINS` must include the final site address. It is set to `https://qenbel.site,https://www.qenbel.site`. If you test on a `*.vercel.app` address first, add it there temporarily, or the chat will be blocked by the browser.

Vercel's free Hobby plan is for non-commercial use. A business site belongs on a paid plan, so check its terms before launching.

## 4. Keep the Render API awake (free plan)

Render's free plan sleeps after 15 minutes without traffic, and the first message after that takes about 30 to 60 seconds. Pick one:

- **GitHub Actions (already in the repo).** In the repo go to Settings > Secrets and variables > Actions > Variables and add `API_URL` with your Render address. The workflow in `.github/workflows/keep-alive.yml` then pings it every 10 minutes. GitHub runs schedules loosely and pauses them after 60 days with no repository activity, so check the Actions tab now and then.
- **Any computer that stays on.** `node scripts/keep-alive.mjs https://your-service.onrender.com --loop`. Or run it once from a scheduler every 10 minutes (Windows Task Scheduler or cron) without `--loop`.
- **A free monitoring site** such as UptimeRobot or cron-job.org, pointed at `<your address>/health` every 5 to 10 minutes. No code needed.
- **The reliable option:** change the Render plan from Free to Starter. It never sleeps, and then none of the above is needed.

Free instances have 750 hours a month. One service running all day and night uses about 744, so a second free service on the same account could run out.

## 5. After it is live

Run the live check (no Gemini calls, about 20 requests):

```
node scripts/check-api.mjs https://api.qenbel.site https://qenbel.site
```

It checks health, security headers, that only your site can call the API, the location finder, and that the rate limit cannot be dodged with a fake `X-Forwarded-For`. In Render, set `CLIENT_IP_HEADER=cf-connecting-ip` (it is in `backend/.env.render`); without it the rate limit does not work on Render.


Follow `SECURITY.md`: set `TRUST_PROXY` correctly, rotate the old Gemini key, and test the chat on your phone.
