// Rebuilds .well-known/agent-skills/index.json from the SKILL.md files, so the SHA-256 digest always
// matches the file. Run after editing any SKILL.md:   node scripts/build-discovery.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://qenbel.site";

const skills = [
  { name: "qenbel-contact", description: "Explains what QenBel does and how to start working with it or reach its team by email." },
];

const entries = skills.map((s) => {
  const rel = `.well-known/agent-skills/${s.name}/SKILL.md`;
  const bytes = readFileSync(root + rel);
  return { name: s.name, type: "skill-md", description: s.description, url: `${SITE}/${rel}`, digest: "sha256:" + createHash("sha256").update(bytes).digest("hex") };
});

const index = { $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json", skills: entries };
writeFileSync(root + ".well-known/agent-skills/index.json", JSON.stringify(index, null, 2) + "\n");
console.log(entries.map((e) => `${e.name} ${e.digest}`).join("\n"));
