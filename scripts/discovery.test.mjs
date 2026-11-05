// Run with: node --test scripts/discovery.test.mjs   (from the repo root)
// Checks the machine readable files that let agents discover QenBel, so they cannot drift or lie.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(root + p, "utf8");
const json = (p) => JSON.parse(read(p));
const vercel = json("vercel.json");
const headersFor = (source) => Object.fromEntries((vercel.headers.find((h) => h.source === source)?.headers ?? []).map((h) => [h.key, h.value]));

// A published URL on qenbel.site maps to a file in the repo.
const fileOf = (url) => {
  const path = new URL(url).pathname;
  return path === "/api-docs" ? "api-docs.html" : path.slice(1);
};

test("api catalog: RFC 9727 shape, every link points at something that exists", () => {
  const cat = json(".well-known/api-catalog");
  assert.ok(Array.isArray(cat.linkset) && cat.linkset.length >= 1);
  for (const e of cat.linkset) {
    assert.match(e.anchor, /^https:\/\//);
    for (const rel of ["service-desc", "service-doc"]) {
      assert.ok(Array.isArray(e[rel]) && e[rel].length, rel);
      const href = e[rel][0].href;
      if (new URL(href).hostname === "qenbel.site") assert.ok(existsSync(root + fileOf(href)), `${rel} -> ${href}`);
    }
    assert.ok(e.status?.[0]?.href.endsWith("/health"));
  }
});

test("api catalog is served as application/linkset+json", () => {
  assert.equal(headersFor("/.well-known/api-catalog")["Content-Type"], "application/linkset+json");
});

test("openapi: valid shape, describes the API the catalog points at, and the real error codes", () => {
  const api = json("openapi.json");
  assert.match(api.openapi, /^3\.1\./);
  assert.ok(api.info.title && api.info.version);
  const anchor = new URL(json(".well-known/api-catalog").linkset[0].anchor);
  assert.equal(api.servers[0].url, anchor.origin);
  assert.ok(api.paths[anchor.pathname].post, "POST /api/chat documented");
  assert.ok(api.paths["/health"].get, "GET /health documented");
  const codes = Object.keys(api.paths["/api/chat"].post.responses);
  for (const c of ["200", "400", "403", "413", "429", "502", "503"]) assert.ok(codes.includes(c), c);
  // every $ref resolves
  for (const ref of read("openapi.json").match(/#\/components\/[A-Za-z]+\/[A-Za-z]+/g) ?? []) {
    const [, , group, name] = ref.split("/");
    assert.ok(api.components[group]?.[name], ref);
  }
});

test("homepage Link header: registered relations, targets exist", () => {
  const link = headersFor("/").Link;
  assert.ok(link, "Link header on /");
  for (const rel of ["api-catalog", "service-desc", "service-doc", "describedby"]) assert.match(link, new RegExp(`rel="${rel}"`), rel);
  for (const m of link.matchAll(/<([^>]+)>/g)) {
    const path = m[1].replace(/^\//, "");
    const file = path === "api-docs" ? "api-docs.html" : path === "about" ? "about.html" : path;
    assert.ok(existsSync(root + file), m[1]);
  }
});

test("skills index: schema, valid names, and the digest matches the file byte for byte", () => {
  const idx = json(".well-known/agent-skills/index.json");
  assert.equal(idx.$schema, "https://schemas.agentskills.io/discovery/0.2.0/schema.json");
  assert.ok(idx.skills.length >= 1);
  for (const s of idx.skills) {
    assert.match(s.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.equal(s.type, "skill-md");
    assert.ok(s.description.length > 10);
    const file = fileOf(s.url);
    const bytes = readFileSync(root + file);
    assert.equal(s.digest, "sha256:" + createHash("sha256").update(bytes).digest("hex"), "run: node scripts/build-discovery.mjs");
    assert.match(bytes.toString("utf8"), new RegExp(`^---\\nname: ${s.name}\\n`), "SKILL.md front matter name");
    assert.ok(!bytes.includes(13), "SKILL.md must use LF line endings, or the digest will not match what is served");
  }
});

test("skill: gives no prices and no promises, and keeps secrets out", () => {
  const md = read(".well-known/agent-skills/qenbel-contact/SKILL.md");
  assert.doesNotMatch(md, /[$₹€£]\s?\d|\bUSD\b|\bINR\b|per hour|\/month/i);
  assert.match(md, /Never state or guess a price/);
  assert.match(md, /Do not include passwords/);
  assert.match(md, /Never send an email for the person/);
});

test("deploy: discovery files are not excluded by .vercelignore, internal files are", () => {
  const ignore = read(".vercelignore").split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  assert.ok(!ignore.includes("*.md"), "a blanket *.md would hide SKILL.md");
  for (const must of ["backend", "scripts", "automation", "docs"]) assert.ok(ignore.includes(must), must);
  for (const public_ of [".well-known", "openapi.json", "api-docs.html", "webmcp.js"]) assert.ok(!ignore.includes(public_), public_);
});

// ---- WebMCP -------------------------------------------------------------------------------------

function loadWebMcp() {
  const registered = [];
  const listeners = [];
  const sandbox = {
    navigator: { modelContext: { registerTool: (tool, opts) => registered.push({ tool, opts }) } },
    AbortController,
    encodeURIComponent,
  };
  sandbox.window = { navigator: sandbox.navigator, addEventListener: (type, fn) => listeners.push({ type, fn }) };
  vm.runInNewContext(read("webmcp.js"), sandbox);
  return { registered, listeners };
}

test("webmcp: registers the tools with name, description, inputSchema and execute, and a signal", () => {
  const { registered } = loadWebMcp();
  assert.deepEqual(registered.map((r) => r.tool.name).sort(), ["get_qenbel_overview", "list_qenbel_services", "prepare_enquiry_email"]);
  for (const { tool, opts } of registered) {
    assert.ok(tool.description.length > 20);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(typeof tool.execute, "function");
    assert.ok(opts?.signal, "AbortSignal passed so the tool can be unregistered");
  }
});

test("webmcp: does nothing where the browser has no WebMCP", () => {
  const sandbox = { navigator: {}, AbortController };
  sandbox.window = { navigator: sandbox.navigator, addEventListener() { throw new Error("must not run"); } };
  assert.doesNotThrow(() => vm.runInNewContext(read("webmcp.js"), sandbox));
});

test("webmcp: the enquiry tool only drafts, to the team address, and refuses secrets", async () => {
  const { registered } = loadWebMcp();
  const tool = registered.find((r) => r.tool.name === "prepare_enquiry_email").tool;
  const ok = (await tool.execute({ message: "We built an app with AI tools and want it reviewed.\u0000", subject: "Review\nrequest", name: "Asha" })).content[0].text;
  assert.match(ok, /Nothing has been sent/);
  assert.match(ok, /To: contact@qenbel\.site/);
  assert.match(ok, /mailto:contact@qenbel\.site\?subject=Review%20request/);
  assert.doesNotMatch(ok, /\u0000/);
  assert.match((await tool.execute({ message: "" })).content[0].text, /message is needed/i);
  for (const secret of ["password: hunter2hunter2", "api_key = sk_live_abcdefghijklmnopqrstu", "-----BEGIN RSA PRIVATE KEY-----", "AKIAABCDEFGHIJKLMNOP"]) {
    const out = (await tool.execute({ message: "Please review. " + secret })).content[0].text;
    assert.match(out, /secret/i, secret);
    assert.doesNotMatch(out, /mailto:/, secret);
  }
});

test("webmcp: read-only tools return text and no prices; no network code in the file", async () => {
  const { registered } = loadWebMcp();
  const overview = (await registered.find((r) => r.tool.name === "get_qenbel_overview").tool.execute()).content[0].text;
  const services = (await registered.find((r) => r.tool.name === "list_qenbel_services").tool.execute()).content[0].text;
  assert.match(overview, /email only/);
  assert.match(services, /Application Health Check/);
  assert.doesNotMatch(overview + services, /[$₹€£]\s?\d|\bUSD\b|\bINR\b|per hour|\/month/i);
  const src = read("webmcp.js");
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|eval\s*\(|innerHTML/);
});

test("webmcp is loaded by the homepage", () => {
  assert.match(read("index.html"), /<script src="\/webmcp\.js" defer><\/script>/);
});
