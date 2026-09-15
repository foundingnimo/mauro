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
    // stdin is a pipe here, so the installer cannot ask. It names both versions and refuses.
    const again = spawnSync("sh", [join(packageRoot, "install.sh"), "--no-hooks"], { encoding: "utf8", env, input: "" });
    assert.notEqual(again.status, 0);
    assert.match(again.stdout, /Mauro \S+ \(.+\) is installed in/);
    assert.match(again.stdout, /This checkout is \S+ \(.+\)/);
    assert.match(again.stdout, /--update/);
    const stamp = JSON.parse(readFileSync(join(sandbox, "mauro/.install.json"), "utf8"));
    assert.equal(stamp.version, JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version);
    assert.equal(stamp.source, packageRoot);
    assert.match(spawnSync(process.execPath, [join(sandbox, "mauro/bin/mauro"), "--version"], { encoding: "utf8" }).stdout, /^mauro \S+ \(.+, installed .+ from .+\)/);

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

    // --yes answers the prompt without a terminal.
    writeFileSync(marker, "// stale again\n");
    const yes = spawnSync("sh", [join(packageRoot, "install.sh"), "--yes"], { encoding: "utf8", env, input: "" });
    assert.equal(yes.status, 0, yes.stdout + yes.stderr);
    assert.match(yes.stdout, /Updated Mauro to/);
    assert.equal(readFileSync(marker, "utf8"), readFileSync(join(packageRoot, "scripts/lib/git.mjs"), "utf8"));
    assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), { model: "sonnet" });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("the version has one source and the release sync keeps the manifest and changelog in step", async () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(packageRoot, ".claude-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.version, pkg.version, "run node scripts/sync-version.mjs");
  const { MAURO_VERSION } = await import(join(packageRoot, "scripts/lib/constants.mjs"));
  assert.equal(MAURO_VERSION, pkg.version);
  assert.match(readFileSync(join(packageRoot, "CHANGELOG.md"), "utf8"), /^## Unreleased$/m);

  const { syncVersion } = await import(join(packageRoot, "scripts/sync-version.mjs"));
  const result = syncVersion({
    version: "0.2.0",
    manifest: JSON.stringify({ name: "x", version: "0.1.0" }),
    changelog: "# Changelog\n\n## Unreleased\n\n- A change.\n\n## 0.1.0\n\n- First.\n",
    date: "2026-09-15"
  });
  assert.equal(JSON.parse(result.manifest).version, "0.2.0");
  assert.equal(result.changelog, "# Changelog\n\n## Unreleased\n\n## 0.2.0 (2026-09-15)\n\n- A change.\n\n## 0.1.0\n\n- First.\n");
  // A release with nothing recorded is refused, and a re-run is a no-op.
  assert.throws(() => syncVersion({ version: "0.3.0", manifest: "{}", changelog: "# Changelog\n\n## Unreleased\n\n## 0.2.0\n" }), /is empty/);
  const again = syncVersion({ version: "0.2.0", manifest: result.manifest, changelog: result.changelog, date: "2026-09-16" });
  assert.equal(again.changelog, result.changelog);
});
