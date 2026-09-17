#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_GENERATED_PATTERNS } from "./lib/constants.mjs";
import { validateConfig } from "./lib/policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"));
  } catch (error) {
    fail(`${path}: ${error.message}`);
    return null;
  }
}

const required = [
  ".npmignore",
  ".claude-plugin/plugin.json",
  "skills/mauro/SKILL.md",
  "skills/mauro/agents/openai.yaml",
  "skills/mauro-context/SKILL.md",
  "hooks/hooks.json",
  "bin/mauro",
  "scripts/lib/toolbox.mjs",
  "scripts/lib/tool-gaps.mjs",
  "scripts/lib/lock.mjs",
  "scripts/lib/voyages.mjs",
  "scripts/lib/brief.mjs",
  "scripts/lib/adapters.mjs",
  "scripts/install-standalone-hooks.mjs",
  "schemas/map.schema.json",
  "schemas/manifest.schema.json",
  "schemas/fingerprints.schema.json",
  "schemas/tool-gaps.schema.json",
  "schemas/voyage.schema.json",
  "schemas/survey-report.schema.json",
  "schemas/config.schema.json"
];
for (const path of required) if (!existsSync(join(root, path))) fail(`${path}: missing`);

const npmIgnore = existsSync(join(root, ".npmignore")) ? readFileSync(join(root, ".npmignore"), "utf8") : "";
for (const path of [".claude/", ".mauro/"]) {
  if (!npmIgnore.split(/\r?\n/).includes(path)) fail(`.npmignore: ${path} must not enter a public package.`);
}

const plugin = readJson(".claude-plugin/plugin.json");
if (plugin && plugin.name !== "foundingnimo") fail("Plugin namespace must be foundingnimo.");
if (plugin && !/^\d+\.\d+\.\d+$/.test(plugin.version || "")) fail("Plugin version must use semantic version form.");

const hooks = readJson("hooks/hooks.json");
for (const event of ["SessionStart", "PostToolUse", "Stop"]) {
  if (!Array.isArray(hooks?.hooks?.[event])) fail(`hooks/hooks.json: ${event} is missing.`);
}

for (const path of ["schemas/map.schema.json", "schemas/manifest.schema.json", "schemas/fingerprints.schema.json", "schemas/tool-gaps.schema.json", "schemas/voyage.schema.json", "schemas/survey-report.schema.json", "schemas/config.schema.json"]) {
  const schema = readJson(path);
  if (schema && schema.$schema !== "https://json-schema.org/draft/2020-12/schema") fail(`${path}: wrong JSON Schema version.`);
}

const defaultConfig = readJson("templates/config.json");
if (defaultConfig) {
  try {
    validateConfig(defaultConfig);
    for (const ambiguous of ["vendor/**", "**/vendor/**", "build/**", "**/build/**"]) {
      if (defaultConfig.scan.generated.patterns.includes(ambiguous) || DEFAULT_GENERATED_PATTERNS.includes(ambiguous)) {
        fail(`ambiguous generated pattern ${ambiguous} must be repository-specific.`);
      }
    }
  } catch (error) {
    fail(`templates/config.json: ${error.message}`);
  }
}
const defaultToolGaps = readJson("templates/tool-gaps.json");
if (!defaultToolGaps || defaultToolGaps.schema_version !== 1 || defaultToolGaps.next_id !== 1 || !Array.isArray(defaultToolGaps.gaps)) {
  fail("templates/tool-gaps.json: invalid default Tool Gap Log.");
}

function validateSkill(directory, { explicit }) {
  const skillPath = join(root, "skills", directory, "SKILL.md");
  if (!existsSync(skillPath)) return;
  const skill = readFileSync(skillPath, "utf8");
  const label = `skills/${directory}/SKILL.md`;
  if (!skill.startsWith("---\n")) fail(`${label}: YAML frontmatter is missing.`);
  if (!new RegExp(`\\nname: ${directory}\\n`).test(skill)) fail(`${label}: skill name must match its directory.`);
  if (!/\ndescription: .+/.test(skill)) fail(`${label}: description is missing.`);
  const invocationDisabled = /\ndisable-model-invocation:\s*true\s*$/m.test(skill);
  if (explicit && !invocationDisabled) fail(`${label}: explicit administration must disable model invocation.`);
  if (!explicit && invocationDisabled) fail(`${label}: ambient invocation must stay enabled.`);
  if (skill.split("\n").length > 100) fail(`${label}: keep the main skill under 100 lines.`);
  for (const match of skill.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
    const target = resolve(dirname(skillPath), match[1]);
    if (!existsSync(target)) fail(`${label}: broken reference ${match[1]}.`);
  }
}
validateSkill("mauro", { explicit: true });
validateSkill("mauro-context", { explicit: false });

const openAiMetadata = join(root, "skills/mauro/agents/openai.yaml");
if (existsSync(openAiMetadata)) {
  const metadata = readFileSync(openAiMetadata, "utf8");
  if (!/allow_implicit_invocation:\s*false/.test(metadata)) fail("skills/mauro/agents/openai.yaml: explicit skill must reject implicit invocation.");
  if (!/default_prompt:\s*["'].*\$mauro/.test(metadata)) fail("skills/mauro/agents/openai.yaml: default prompt must name $mauro.");
}

const agentsDir = join(root, "agents");
if (existsSync(agentsDir)) {
  for (const name of readdirSync(agentsDir).filter((item) => item.endsWith(".md"))) {
    const text = readFileSync(join(agentsDir, name), "utf8");
    if (!text.startsWith("---\n") || !/\nname: .+\n/.test(text) || !/\ndescription: .+\n/.test(text)) {
      fail(`agents/${name}: invalid frontmatter.`);
    }
  }
}

try {
  const output = execFileSync(process.execPath, [join(root, "bin/mauro"), "help"], { encoding: "utf8" });
  if (!output.includes("Frequent aliases:")) fail("CLI help does not list aliases.");
  const tools = JSON.parse(execFileSync(process.execPath, [join(root, "bin/mauro"), "tool", "list", "--json"], { encoding: "utf8" }));
  if (!tools.length || tools.some((tool) => tool.runtime !== "node" || tool.permissions.repository_write || tool.permissions.network)) {
    fail("Toolbox discovery must expose read-only Node.js tools.");
  }
} catch (error) {
  fail(`CLI or Toolbox validation failed: ${error.message}`);
}

if (failures.length) {
  process.stderr.write(`Mauro validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Mauro plugin validation passed.\n");
