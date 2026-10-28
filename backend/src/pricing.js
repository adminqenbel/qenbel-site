import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

export const catalogue = JSON.parse(readFileSync(new URL("../data/pricing.json", import.meta.url), "utf8"));
const byId = new Map(catalogue.services.map((s) => [s.id, s]));

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const int = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

export const money = (n) => `${catalogue.symbol}${Math.round(n).toLocaleString("en-US")}`;

/**
 * Turns the assistant's proposed items into a priced quote. Every number comes from
 * data/pricing.json, so the model can choose services and tiers but can never invent a price,
 * a discount or a total. Unknown services and tiers are dropped.
 */
export function buildQuote(input) {
  // Offers card: lists the current offers straight from the catalogue; no services or totals.
  if (input?.mode === "offers") {
    return {
      id: "QB-OFFERS", mode: "offers", currency: catalogue.currency, symbol: catalogue.symbol,
      title: "Current offers", lines: [], assumptions: [], validityDays: catalogue.validityDays,
      offers: catalogue.offers.map((o) => ({ id: o.id, name: o.name, description: o.description, percent: o.percent })),
      totals: {}, disclaimer: catalogue.disclaimer,
      input: { title: "Current offers", mode: "offers", items: [] },
    };
  }
  const mode = input?.mode === "list" ? "list" : "estimate";
  const raw = Array.isArray(input?.items) ? input.items : [];
  const seen = new Set();
  const lines = [];

  for (const it of raw.slice(0, 20)) {
    const svc = byId.get(String(it?.serviceId));
    const tier = String(it?.tier);
    const key = mode === "list" ? `${svc?.id}:${tier}` : svc?.id;
    if (!svc || seen.has(key)) continue;
    const commitMonths = svc.billing === "monthly" ? clamp(int(it?.commitMonths, 0), 0, 36) : 0;
    let line;

    if (tier === "custom") {
      const hours = clamp(int(it?.customHours, svc.custom.minHours), svc.custom.minHours, svc.custom.maxHours);
      line = {
        tier, tierLabel: `Custom, about ${hours} hours`, quantity: 1, hours,
        // Floor: persuading the assistant to pick the minimum hours must not beat the Starter price.
        unitPrice: Math.max(hours * catalogue.customRatePerHour, svc.tiers.starter.price),
        includes: ["Scope shaped around your specification", `Estimated at about ${hours} hours`],
        timeline: "Agreed with the team",
      };
    } else if (svc.tiers[tier]) {
      const quantity = clamp(int(it?.quantity, 1), 1, 10);
      line = {
        tier, tierLabel: catalogue.tiers[tier], quantity,
        unitPrice: svc.tiers[tier].price,
        includes: svc.tiers[tier].includes,
        timeline: svc.tiers[tier].timeline,
      };
    } else continue;

    seen.add(key);
    lines.push({
      serviceId: svc.id, serviceName: svc.name, billing: svc.billing, commitMonths,
      ...line, amount: line.unitPrice * line.quantity,
    });
  }
  if (!lines.length) return null;
  if (mode === "list") lines.splice(12);

  const oneTime = lines.filter((l) => l.billing === "one-time");
  const monthly = lines.filter((l) => l.billing === "monthly");
  const oneGross = sum(oneTime.map((l) => l.amount));
  const monGross = sum(monthly.map((l) => l.amount));
  const cap = catalogue.maxTotalDiscountPercent / 100;

  const offers = [];
  let oneDisc = 0;
  let monDisc = 0;

  const distinct = new Set(lines.map((l) => l.serviceId)).size;
  const bundle = mode === "list" ? null : catalogue.offers
    .filter((o) => o.appliesTo === "one-time" && distinct >= o.minDistinctServices)
    .sort((a, b) => b.percent - a.percent)[0];
  if (bundle && oneGross > 0) {
    oneDisc = Math.round((oneGross * bundle.percent) / 100);
    offers.push({ id: bundle.id, name: bundle.name, description: bundle.description, percent: bundle.percent, saves: oneDisc, per: "one-time" });
  }

  const care = mode === "list" ? null : catalogue.offers.find((o) => o.appliesTo === "monthly");
  const careBase = care ? sum(monthly.filter((l) => l.commitMonths >= care.minCommitMonths).map((l) => l.amount)) : 0;
  if (care && careBase > 0) {
    monDisc = Math.round((careBase * care.percent) / 100);
    offers.push({ id: care.id, name: care.name, description: care.description, percent: care.percent, saves: monDisc, per: "month" });
  }

  oneDisc = Math.min(oneDisc, Math.round(oneGross * cap));
  monDisc = Math.min(monDisc, Math.round(monGross * cap));

  const title = String(input?.title || "Your estimate").replace(/[\r\n]+/g, " ").slice(0, 80);
  return {
    id: "QB-" + randomBytes(3).toString("hex").toUpperCase(),
    mode,
    currency: catalogue.currency,
    symbol: catalogue.symbol,
    title,
    lines,
    offers,
    totals: {
      oneTimeGross: oneGross, oneTimeDiscount: oneDisc, oneTimeTotal: oneGross - oneDisc,
      monthlyGross: monGross, monthlyDiscount: monDisc, monthlyTotal: monGross - monDisc,
    },
    assumptions: Array.isArray(input?.assumptions)
      ? input.assumptions.map((a) => String(a).slice(0, 200)).slice(0, 6)
      : [],
    validityDays: catalogue.validityDays,
    disclaimer: catalogue.disclaimer,
    // What the browser sends back on "Send to the team"; the server prices it again from scratch.
    input: {
      title,
      mode,
      items: lines.map((l) => ({
        serviceId: l.serviceId, tier: l.tier, quantity: l.quantity,
        ...(l.tier === "custom" ? { customHours: l.hours } : {}),
        ...(l.commitMonths ? { commitMonths: l.commitMonths } : {}),
      })),
    },
  };
}
