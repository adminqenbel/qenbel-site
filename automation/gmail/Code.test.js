// Run with: node --test automation/gmail   (from the repo root)
// Tests the pure helpers in Code.gs. The Google-only parts (Gmail, triggers) cannot run outside Apps Script.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(fileURLToPath(new URL("./Code.gs", import.meta.url)), "utf8");
const g = {};
vm.runInNewContext(src, g);
const C = g.CONFIG;

test("config ships in dry run mode", () => {
  assert.equal(C.DRY_RUN, true);
});

test("addresses: found in names, brackets and lists, lower-cased", () => {
  assert.deepEqual([...g.parseAddresses('"Asha" <Asha@Acme.IN>, other@x.com')], ["asha@acme.in", "other@x.com"]);
  assert.equal(g.firstAddress("Name <a@b.co>"), "a@b.co");
  assert.equal(g.firstAddress("no address here"), "");
});

test("aliases: only our own addresses at our own domain count", () => {
  assert.deepEqual([...g.findAliases("Support <support@qenbel.site>", "", C)], ["support"]);
  assert.deepEqual([...g.findAliases("contact@qenbel.site, info@qenbel.site", "", C)], ["contact", "info"]);
  assert.deepEqual([...g.findAliases("", "admin@qenbel.site", C)], ["admin"]);
  assert.deepEqual([...g.findAliases("support@qenbel.site.evil.test, support@other.site", "", C)], []);
});

test("classify: kind comes from the subject only, urgent from the tag", () => {
  assert.deepEqual({ ...g.classify("Security report") }, { kind: "security", urgent: false });
  assert.deepEqual({ ...g.classify("[Urgent] Privacy request: delete my data") }, { kind: "privacy", urgent: true });
  assert.deepEqual({ ...g.classify("[Urgent] Support: delivered work: Login fails") }, { kind: "general", urgent: true });
  assert.equal(g.classify("Hello").kind, "general");
  assert.equal(g.classify("Found a vulnerability in your site").kind, "security");
});

test("skip: automatic, list, own and header-marked mail never gets a reply", () => {
  const none = {};
  assert.equal(g.skipReason("asha@acme.in", none, C), "");
  assert.notEqual(g.skipReason("no-reply@bank.com", none, C), "");
  assert.notEqual(g.skipReason("mailer-daemon@googlemail.com", none, C), "");
  assert.notEqual(g.skipReason("contact@qenbel.site", none, C), "");
  assert.notEqual(g.skipReason("anyone@qenbel.site", none, C), "");
  assert.notEqual(g.skipReason("asha@acme.in", { autoSubmitted: "auto-replied" }, C), "");
  assert.equal(g.skipReason("asha@acme.in", { autoSubmitted: "no" }, C), "");
  assert.notEqual(g.skipReason("asha@acme.in", { precedence: "bulk" }, C), "");
  assert.notEqual(g.skipReason("asha@acme.in", { listId: "<news.acme.in>" }, C), "");
  assert.notEqual(g.skipReason("", none, C), "");
});

test("limits: one acknowledgement per sender per window, a daily cap, and the window resets", () => {
  const cfg = { ...C, MAX_ACKS_PER_DAY: 2, ACK_PER_SENDER_HOURS: 24 };
  const st = { day: "", count: 0, senders: {} };
  const t0 = Date.UTC(2026, 10, 4, 10, 0, 0);
  assert.equal(g.takeAck(st, "a@x.com", t0, cfg), true);
  assert.equal(g.takeAck(st, "a@x.com", t0 + 60_000, cfg), false);   // same sender again
  assert.equal(g.takeAck(st, "b@x.com", t0 + 60_000, cfg), true);
  assert.equal(g.takeAck(st, "c@x.com", t0 + 120_000, cfg), false);  // daily cap of 2 reached
  const next = t0 + 25 * 3600 * 1000;                                 // a day later
  assert.equal(g.takeAck(st, "a@x.com", next, cfg), true);
});

test("reference: QB, date, four unambiguous characters", () => {
  const ref = g.makeRef(Date.UTC(2026, 10, 4), () => 0.5);
  assert.match(ref, /^QB-20261104-[A-HJ-NP-Z2-9]{4}$/);
});

test("acknowledgements: carry the reference, plain text, no prices, no delivery promises", () => {
  for (const kind of ["general", "security", "privacy"]) {
    const body = g.buildAck(kind, "QB-20261104-ABCD");
    assert.ok(body.includes("QB-20261104-ABCD"), kind);
    assert.ok(body.includes("automatic message"), kind);
    assert.doesNotMatch(body, /[$₹€£]\s?\d|\bUSD\b|\bINR\b|per hour|guarantee|within \d+ (hour|minute)|24\/7|SLA/i, kind);
    assert.doesNotMatch(body, /<[a-z]/i, kind);
  }
  assert.match(g.buildAck("privacy", "R"), /within 7 days/);          // the same promise the Privacy Policy makes
  assert.match(g.buildAck("general", "R"), /Nothing is agreed until/);
  assert.match(g.buildAck("security", "R"), /do not share the details/);
});

test("search: only mail sent to our own addresses is looked at, never the rest of the inbox", () => {
  const q = g.buildSearch(C);
  assert.ok(q.startsWith("in:inbox is:unread"));
  assert.ok(q.includes("-label:qenbel-processed"));
  for (const n of ["support", "contact", "info", "admin"]) {
    assert.ok(q.includes(`to:${n}@qenbel.site`), n);
    assert.ok(q.includes(`cc:${n}@qenbel.site`), n);
  }
  assert.match(q, /\(to:[^)]+\)$/);   // the address filter is one parenthesised group at the end
});
