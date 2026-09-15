import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installer = join(packageRoot, "scripts/install-standalone-hooks.mjs");

test("standalone hook installation preserves settings and is idempotent", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "mauro-hooks-"));
  try {
    const settingsPath = join(sandbox, "settings.json");
    writeFileSync(settingsPath, `${JSON.stringify({
      model: "sonnet",
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "existing-command" }] }]
      }
    }, null, 2)}\n`);

    for (let run = 0; run < 2; run += 1) {
      const result = spawnSync(process.execPath, [installer, sandbox], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    }

    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(settings.model, "sonnet");
    assert.ok(settings.hooks.Stop.some((group) => group.hooks.some((hook) => hook.command === "existing-command")));
    for (const event of ["SessionStart", "PostToolUse", "Stop"]) {
      const commands = settings.hooks[event].flatMap((group) => group.hooks.map((hook) => hook.command));
      assert.equal(commands.filter((command) => command.includes("mauro/bin/mauro")).length, 1);
    }
    assert.ok(readdirSync(sandbox).some((name) => name.startsWith("settings.json.mauro-backup-")));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("install.sh --update replaces the runtime and skill and leaves settings alone", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "mauro-install-"));
  try {
    const env = { ...process.env, CLAUDE_CONFIG_DIR: sandbox };
    const first = spawnSync("sh", [join(packageRoot, "install.sh"), "--no-hooks"], { encoding: "utf8", env });
    assert.equal(first.status, 0, first.stderr);
    const again = spawnSync("sh", [join(packageRoot, "install.sh"), "--no-hooks"], { encoding: "utf8", env });
    assert.notEqual(again.status, 0);
    assert.match(again.stdout, /--update/);

    const settingsPath = join(sandbox, "settings.json");
    writeFileSync(settingsPath, `${JSON.stringify({ model: "sonnet" })}\n`);
    const marker = join(sandbox, "mauro/scripts/lib/git.mjs");
    writeFileSync(marker, "// stale installed copy\n");

    const update = spawnSync("sh", [join(packageRoot, "install.sh"), "--update"], { encoding: "utf8", env });
    assert.equal(update.status, 0, update.stderr);
    assert.equal(readFileSync(marker, "utf8"), readFileSync(join(packageRoot, "scripts/lib/git.mjs"), "utf8"));
    assert.equal(
      readFileSync(join(sandbox, "skills/mauro/SKILL.md"), "utf8"),
      readFileSync(join(packageRoot, "skills/mauro/SKILL.md"), "utf8")
    );
    // --update never runs the hook installer, so settings.json is untouched.
    assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), { model: "sonnet" });

    const bogus = spawnSync("sh", [join(packageRoot, "install.sh"), "--upgrade"], { encoding: "utf8", env });
    assert.notEqual(bogus.status, 0);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
