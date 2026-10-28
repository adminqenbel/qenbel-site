# QenBel pricing and the assistant

> **All prices in `backend/data/pricing.json` are draft placeholders.** Replace them with your real rates before going live. Currency defaults to USD (`currency` and `symbol` in the same file).

## How a price is produced

1. The visitor describes their project to the assistant (Gemini).
2. Gemini **chooses** services and a tier (Starter, Standard, Advanced, or Custom with an hours estimate) from what the visitor said. It can only pick services that exist in `pricing.json`.
3. The **server** turns that choice into money. Gemini never writes a price, discount or total. Unknown services or tiers are dropped, hours are clamped to each service's range, and discounts are capped.
4. The visitor sees an estimate card. Under it, **Open in Gmail**, **Email app**, **Outlook** and **Copy details** open the visitor's own email with a message to `admin.qenbel@gmail.com` already written: the services, tiers, USD amounts, offers, assumptions, the currency they were shown, and what they told the assistant. Nothing is sent until they press Send in their email. QenBel's servers never send or store the email.
5. The team replies by email with the confirmed price. Nothing is agreed in the chat. Because the email comes from the visitor, treat its figures as a request to price, not as a verified quote.

## Card types

Any question about price, cost, rates, packages or discounts gets a card, never text alone. Questions that are not about price (what a service involves, how it works) get a normal text answer.

| Card | When | What it shows | Sendable to the team |
|---|---|---|---|
| **Estimate** | The visitor describes their own project or needs | Best-fit tier per service from their specification, assumptions, offers applied, one-time and monthly totals | Yes, by email buttons |
| **Price list** | A general question such as "how much for MCP servers?" or "what are your prices?" | All three tiers of one service side by side, or starting prices for several services. List prices, no offers, no totals | No email buttons. It has a button that turns it into an estimate |
| **Offers** | "Any discounts?" | Every current offer from `pricing.json` | No email buttons. Same button |

## Services and tiers

12 services, each with Starter, Standard and Advanced tiers plus a Custom option (hours x `customRatePerHour`).
Billing is one-time except **Manage your software**, which is monthly.

| Service | Billing | Starter | Standard | Advanced |
|---|---|---|---|---|
| Manage your software | monthly | $900 | $2,400 | $5,500 |
| MCP servers | one-time | $2,500 | $6,500 | $14,000 |
| Modernize your current software | one-time | $4,000 | $12,000 | $30,000 |
| Legacy to modern | one-time | $8,000 | $25,000 | $70,000 |
| AI bots inside your software, built secure | one-time | $3,000 | $9,000 | $22,000 |
| Large refactors and system redesign with AI tools | one-time | $6,000 | $20,000 | $55,000 |
| Front-end design, small to large | one-time | $1,500 | $6,000 | $18,000 |
| Security audit and hardening | one-time | $2,000 | $6,000 | $15,000 |
| Cloud migration and DevOps | one-time | $3,500 | $9,000 | $22,000 |
| API and system integrations | one-time | $2,000 | $6,000 | $15,000 |
| Automated testing and quality | one-time | $2,500 | $7,000 | $16,000 |
| Data pipelines and dashboards | one-time | $2,500 | $7,500 | $18,000 |

## Offers (applied automatically when eligible)

| Offer | Rule |
|---|---|
| Bundle, 3 or more services | 10% off one-time work |
| Bundle, 5 or more services | 15% off one-time work (replaces the 10%) |
| Annual care | 10% off the monthly plan with a 12 month or longer commitment |

Total discount is capped at `maxTotalDiscountPercent` (15%).

## The disclaimer

Shown on the chat page at all times and on every estimate card:

> This is an AI-generated, indicative estimate based on what you told us. It is not an offer, quote or contract. The QenBel team reviews every request and sets the final price and timeline, which can be higher or lower. Nothing is confirmed until the team confirms it by email.

Edit it once in `pricing.json` (`disclaimer`); the page notice text is in `chat.html`.

## Editing prices

Change `backend/data/pricing.json` and redeploy the backend. The assistant, the maths and the emails all read that one file. To add a service, copy an existing block, give it a unique `id`, and add a matching card in `index.html` if you want it on the landing page.

## What is stored, and where

- **Browser only:** conversations and estimate cards, in `localStorage` (`qenbel:chats:v2`). The visitor can delete a chat from the sidebar.
- **Server:** nothing. The API is stateless and does not log message text.
- **Team inbox:** only what the visitor chooses to send from their own email account.
- **Later (not built):** saving chats server-side. Supabase is a good fit: a `conversations` and `messages` table, and a `quote_requests` table. Add it when you want history across devices or an admin view.

## Safety limits already in the API

Origin allow-list (CORS), per-IP rate limits, a daily cap on Gemini calls for the whole service, message size limits, signed chat history, link stripping on replies, and an automatic fallback across several Gemini models. The server never sends email. See `SECURITY.md`.
