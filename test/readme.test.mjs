import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ALIASES, PUBLIC_COMMANDS } from "../scripts/lib/constants.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(resolve(packageRoot, "README.md"), "utf8");

function section(startHeading, endHeading) {
  const start = readme.indexOf(startHeading);
  const end = readme.indexOf(endHeading);
  assert.notEqual(start, -1, `README is missing ${startHeading}`);
  assert.ok(end > start, `README is missing ${endHeading} after ${startHeading}`);
  return readme.slice(start, end);
}

test("README lists every public command and frequent alias", () => {
  const commandSection = section("## Main commands", "## Toolbox");
  for (const command of PUBLIC_COMMANDS) {
    assert.ok(commandSection.includes(`\`${command}\``), `README is missing public command: ${command}`);
  }
  for (const [alias, command] of Object.entries(ALIASES).filter(([alias]) => alias.length === 1)) {
    assert.ok(commandSection.includes(`| \`${command}\` | \`${alias}\` |`), `README is missing alias ${alias} for ${command}`);
  }
  assert.match(commandSection, /`suggest` is a synonym/);
});

test("README overview includes durable coordination state", () => {
  const overview = section("# Mauro", "## Quickstart");
  assert.doesNotMatch(overview, /Mauro has four durable outputs/);
  for (const text of ["Voyage records", "Tool Gap Log", "Atomic writer locking", "overlapping-path refusal", "Map-publication", "Instruction Contracts", "validation of isolated Expedition survey reports"]) {
    assert.ok(overview.includes(text), `README overview is missing: ${text}`);
  }
});

test("README documents the survey validation gate", () => {
  const toolbox = section("## Toolbox", "## Document review");
  for (const text of ["survey-report-validate", "structure", "capability", "documentation", "duplication", "Synthesis stops"]) {
    assert.ok(toolbox.includes(text), `README survey validation guidance is missing: ${text}`);
  }
});

test("README keeps the autonomous Quickstart and shared Navigator contract", () => {
  const quickstart = section("## Quickstart", "## Install");
  for (const command of ["/mauro init", "/mauro next", "/mauro brief", "/mauro run", "/mauro run activate", "/mauro run finish", "/mauro reconcile", "/mauro check", "/mauro help"]) {
    assert.ok(quickstart.includes(command), `Quickstart is missing ${command}`);
  }
  for (const text of ["asks which exact branch", "--canonical-ref <selected-branch>", "It does not infer the answer", "agent instruction files as human-owned Instruction Contracts"]) {
    assert.ok(quickstart.includes(text), `Quickstart is missing canonical-branch guidance: ${text}`);
  }

  const sharing = section("## Use Navigators from any agent session", "## Configure an Expedition");
  for (const text of [".agents/skills/", ".claude/agents/", ".claude/rules/mauro/", ".mauro/voyages/", "docs/mauro/", "/agents", "/mauro who <path>", "/mauro impact", "read-only", "Restart a", "mauro run status"]) {
    assert.ok(sharing.includes(text), `Navigator sharing guidance is missing: ${text}`);
  }
});

test("README presents Mauro as ambient and multi-agent", () => {
  const overview = section("# Mauro", "## Status");
  for (const text of ["ambient repository-context sidecar", "Claude Code", "Codex", "Grok", "SKILL.md"]) {
    assert.ok(overview.includes(text), `README overview is missing: ${text}`);
  }
  const install = section("## Install", "## Main commands");
  for (const text of ["~/.mauro", "~/.agents/skills/mauro-context", "mauro-context", "--host all", "### Agent compatibility", "| Codex |", "| Grok |", "richest adapter"]) {
    assert.ok(readme.includes(text), `README compatibility guidance is missing: ${text}`);
  }
});
