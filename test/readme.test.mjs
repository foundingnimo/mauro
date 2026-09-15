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

test("README keeps the autonomous Quickstart and shared Navigator contract", () => {
  const quickstart = section("## Quickstart", "## Install");
  for (const command of ["/mauro init", "/mauro next", "/mauro run", "/mauro check", "/mauro help"]) {
    assert.ok(quickstart.includes(command), `Quickstart is missing ${command}`);
  }

  const sharing = section("## Use Navigators from other Claude sessions", "## Configure an Expedition");
  for (const text of [".claude/agents/", ".claude/rules/mauro/", "docs/mauro/", "/agents", "/mauro who <path>", "/mauro impact", "read-only", "Restart a session"]) {
    assert.ok(sharing.includes(text), `Navigator sharing guidance is missing: ${text}`);
  }
});
