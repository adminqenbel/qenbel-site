// The portal link and the legal pages. Run: node --test scripts/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (f) => readFileSync(root + f, "utf8");
const PORTAL = "https://portal.qenbel.site";
const PAGES = ["index.html", "about.html", "privacy.html", "terms.html", "compliance.html", "api-docs.html"];

test("every page with the shared top bar and footer links to the portal in both", () => {
  for (const page of PAGES) {
    const html = read(page);
    const top = /<nav aria-label="Primary">([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
    const foot = /<footer class="site-foot">([\s\S]*?)<\/footer>/.exec(html)?.[1] ?? "";
    assert.ok(top.includes(`href="${PORTAL}"`), `${page}: top bar`);
    assert.ok(foot.includes(`href="${PORTAL}"`), `${page}: footer`);
  }
});

test("the portal is linked only at its own address, never indexed from here", () => {
  const sitemap = read("sitemap.xml");
  assert.ok(!sitemap.includes("portal.qenbel.site"), "the portal is private and noindex");
  for (const page of PAGES) {
    for (const m of read(page).matchAll(/href="(https?:\/\/portal[^"]*)"/g)) assert.equal(m[1], PORTAL, page);
  }
});

test("privacy policy: a section for the portal, in the contents, with the providers and the honest gaps", () => {
  const html = read("privacy.html");
  assert.match(html, /<li><a href="#portal">The client portal<\/a><\/li>/);
  const s = /<section id="portal">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? "";
  for (const word of ["Clerk", "Supabase", "Render", "Cloudflare Web Analytics", "does not receive or store a password|QenBel does not receive", "has not been finalised|section 8"]) {
    assert.match(s + html, new RegExp(word), word);
  }
  assert.match(html, /portal.*does have accounts|does have accounts/);
  // The numbering still holds: every "section N" pointer lands on a section that exists.
  const ids = [...html.matchAll(/<h2>(\d+)\. /g)].map((m) => Number(m[1]));
  assert.deepEqual(ids, ids.map((_, i) => i + 1), "sections numbered 1..n without gaps");
  assert.equal(ids.length, 16);
  assert.match(html, /address a grievance \(section 15\)/);
  assert.match(/<section id="grievance">\s*<h2>(\d+)\./.exec(html)[1], /^15$/);
});

test("terms: a section for the portal, numbered in order, with nothing agreed in it", () => {
  const html = read("terms.html");
  assert.match(html, /<li><a href="#portal">The client portal<\/a><\/li>/);
  const ids = [...html.matchAll(/<h2>(\d+)\. /g)].map((m) => Number(m[1]));
  assert.deepEqual(ids, ids.map((_, i) => i + 1));
  assert.equal(ids.length, 16);
  const s = /<section id="portal">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? "";
  assert.match(s, /Nothing is agreed in the portal/);
  assert.match(s, /href="\/privacy\.html#portal"/);
  assert.match(html, /portal\.qenbel\.site/);
});

test("the legal pages carry the new date, and nothing on the pages promises or prices", () => {
  for (const page of ["privacy.html", "terms.html"]) {
    const html = read(page);
    assert.match(html, /Last updated 5 November 2026/, page);
    assert.doesNotMatch(html, /[$₹€£]\s?\d|\bUSD\b|\bINR\b|per hour|\/month|guarantee[sd]?\b(?! it)/i, page);
  }
});

test("the home page no longer says there is no portal", () => {
  assert.doesNotMatch(read("index.html"), /No portal to learn/);
});
