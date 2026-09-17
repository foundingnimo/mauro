import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(packageRoot, "bin/mauro");
const fixture = join(packageRoot, "test/fixtures/monorepo");
let sandbox;

function rawRun(...args) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: sandbox,
    encoding: "utf8"
  });
}

function run(...args) {
  const effective = args[0] === "init" && !args.includes("--canonical-ref")
    ? ["init", "--canonical-ref", "canonical", ...args.slice(1)]
    : args;
  return rawRun(...effective);
}

function git(...args) {
  return spawnSync("git", args, { cwd: sandbox, encoding: "utf8" });
}

function readMap() {
  return JSON.parse(readFileSync(join(sandbox, ".mauro/map.json"), "utf8"));
}

function editConfig(change) {
  const path = join(sandbox, ".mauro/config.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  change(config);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "mauro-test-"));
  cpSync(fixture, sandbox, { recursive: true });
  assert.equal(git("init", "--quiet").status, 0);
  assert.equal(git("add", "-A").status, 0);
  assert.equal(git("-c", "user.name=Mauro Test", "-c", "user.email=mauro@test.local", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture").status, 0);
  assert.equal(git("branch", "canonical").status, 0);
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

test("Toolbox discovery works before repository initialization", () => {
  const listed = run("tool", "list", "--root", sandbox, "--json");
  assert.equal(listed.status, 0, listed.stderr);
  const tools = JSON.parse(listed.stdout);
  assert.deepEqual(tools.map((tool) => tool.name), [
    "repository-files",
    "dependency-graph",
    "documentation-index",
    "duplicate-analysis"
  ]);
  assert.ok(tools.every((tool) => tool.runtime === "node"));
  assert.ok(tools.every((tool) => tool.permissions.repository_read && !tool.permissions.repository_write && !tool.permissions.network));
  assert.deepEqual(tools.find((tool) => tool.name === "documentation-index").permissions.subprocesses, ["git"]);
  assert.ok(tools.filter((tool) => tool.name !== "documentation-index").every((tool) => tool.permissions.subprocesses.length === 0));

  const described = run("tool", "describe", "repository-files", "--root", sandbox, "--json");
  assert.equal(described.status, 0, described.stderr);
  assert.equal(JSON.parse(described.stdout).input_schema.properties.limit.maximum, 1000);

  assert.equal(run("tool", "list", "unexpected", "--root", sandbox).status, 1);
  assert.equal(run("tool", "run", "repository-files", "--root", sandbox).status, 1);
});

test("init requires the user-selected exact canonical branch", () => {
  const unpinned = rawRun("init", "--root", sandbox);
  assert.equal(unpinned.status, 1);
  assert.match(unpinned.stderr, /requires git\.canonical_ref to name one exact local or remote-tracking branch/);
  assert.match(unpinned.stderr, /Available branches:[^\n]*canonical/);
  assert.match(unpinned.stderr, /Ask the user/);
  assert.equal(existsSync(join(sandbox, ".mauro/map.json")), false);

  const tag = git("tag", "release-point");
  assert.equal(tag.status, 0, tag.stderr);
  const wrongKind = rawRun("init", "--canonical-ref", "release-point", "--root", sandbox);
  assert.equal(wrongKind.status, 1);
  assert.match(wrongKind.stderr, /is not a branch/);

  const initialized = rawRun("init", "--canonical-ref", "canonical", "--root", sandbox, "--json");
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(JSON.parse(initialized.stdout).canonical.ref, "canonical");
  assert.equal(JSON.parse(readFileSync(join(sandbox, ".mauro/config.json"), "utf8")).git.canonical_ref, "canonical");
});

test("init maps a monorepo and generates scoped Navigators", () => {
  const result = run("init", "--root", sandbox, "--json");
  assert.equal(result.status, 0, result.stderr);
  const initialized = JSON.parse(result.stdout);
  assert.ok(initialized.next.some((item) => item.includes("Restart agent sessions")));
  assert.equal(initialized.next.some((item) => item.includes("oversized agent instruction files")), false);
  const map = JSON.parse(readFileSync(join(sandbox, ".mauro/map.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(sandbox, ".mauro/manifest.json"), "utf8"));
  assert.equal(map.units.length, 3);
  assert.equal(map.dependencies.length, 1);
  assert.equal(map.files.find((file) => file.path.endsWith("index.test.ts")).role, "test");
  assert.equal(map.files.find((file) => file.path.endsWith("account.json")).role, "fixture");
  assert.equal(map.files.some((file) => file.path.includes("/dist/")), false);
  const generatedBoundary = map.perimeter_regions.find((region) => region.path === "apps/web/dist");
  assert.equal(generatedBoundary.classification, "generated");
  assert.deepEqual(generatedBoundary.reasons, ["generated-policy"]);
  assert.equal(Object.keys(manifest.navigators).length, 3);
  assert.equal(manifest.schema_version, 2);
  for (const navigator of Object.values(manifest.navigators)) {
    assert.match(navigator.generated_agent, /^\.claude\/agents\//);
    const agent = readFileSync(join(sandbox, navigator.generated_agent), "utf8");
    assert.match(agent, /Generated by Mauro/);
    assert.match(agent, /Use proactively to scope and review tasks/);
    assert.match(agent, /The parent session edits the repository\. You stay\nread-only\./);
    assert.match(agent, /tools: Read, Grep, Glob/);
    assert.match(navigator.generated_skill, /^\.agents\/skills\/.+\/SKILL\.md$/);
    const skill = readFileSync(join(sandbox, navigator.generated_skill), "utf8");
    assert.match(skill, /Generated by Mauro/);
    assert.match(skill, /host coding\nagent implements the change/);
    assert.doesNotMatch(skill, /Claude Code/);
  }
  assert.ok(readFileSync(join(sandbox, "docs/mauro/charter.md"), "utf8").includes("# Mauro Charter"));
});

test("ambiguous vendor and build directories are scanned by default", () => {
  mkdirSync(join(sandbox, "apps/web/src/vendor"), { recursive: true });
  mkdirSync(join(sandbox, "bin/build"), { recursive: true });
  writeFileSync(join(sandbox, "apps/web/src/vendor/portal.ts"), "export const portal = true;\n");
  writeFileSync(join(sandbox, "bin/build/release.sh"), "#!/bin/sh\nexit 0\n");

  const result = run("init", "--root", sandbox);
  assert.equal(result.status, 0, result.stderr);
  const map = readMap();
  assert.ok(map.files.some((file) => file.path === "apps/web/src/vendor/portal.ts"));
  assert.ok(map.files.some((file) => file.path === "bin/build/release.sh"));
  assert.equal(map.perimeter_regions.some((region) => ["apps/web/src/vendor", "bin/build"].includes(region.path)), false);
});

test("init warns about oversized agent instruction files before semantic surveys", () => {
  writeFileSync(join(sandbox, "AGENTS.md"), "A".repeat(150_001));

  const result = run("init", "--root", sandbox, "--json");
  assert.equal(result.status, 0, result.stderr);
  const initialized = JSON.parse(result.stdout);
  assert.deepEqual(initialized.instruction_file_warnings.map((warning) => warning.path), ["AGENTS.md"]);
  assert.equal(initialized.instruction_file_warnings[0].warning_threshold_bytes, 150_000);
  assert.ok(initialized.next.some((item) => item.includes("oversized agent instruction files")));

  const map = readMap();
  assert.equal(map.scan_summary.instruction_file_warnings, 1);
  assert.equal(map.instruction_file_warnings[0].size_bytes, 150_001);
  assert.match(readFileSync(join(sandbox, "docs/mauro/map.md"), "utf8"), /Instruction context warnings/);

  const check = run("check", "--root", sandbox, "--json");
  assert.equal(check.status, 0, check.stderr);
  assert.ok(JSON.parse(check.stdout).findings.some((finding) => finding.code === "instruction-file-oversized" && finding.path === "AGENTS.md"));
});

test("status separates Map publication from Bearing health", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  const draft = JSON.parse(run("status", "--root", sandbox, "--json").stdout);
  assert.deepEqual(draft.publication, { map: "draft", bearing: "healthy", state: "draft" });

  const mapPath = join(sandbox, ".mauro/map.json");
  const map = readMap();
  for (const capability of map.capabilities) capability.approved = true;
  writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);

  const manifestPath = join(sandbox, ".mauro/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.documents["doc-charter"].status = "stale";
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const status = JSON.parse(run("status", "--root", sandbox, "--json").stdout);
  assert.deepEqual(status.publication, { map: "published", bearing: "blocked", state: "published_with_findings" });
  const check = run("check", "--root", sandbox);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /Map publication: published_with_findings/);
  assert.match(check.stdout, /Bearing check: FAIL/);
});

test("Toolbox runs bounded repository analysis without generated scripts", () => {
  const duplicate = join(sandbox, "packages/auth/src/token-copy.ts");
  writeFileSync(duplicate, readFileSync(join(sandbox, "packages/auth/src/token.ts")));
  assert.equal(run("init", "--root", sandbox).status, 0);

  const filesResult = run("tool", "run", "repository-files", "--path", "apps/web/src", "--role", "source", "--limit", "1", "--root", sandbox, "--json");
  assert.equal(filesResult.status, 0, filesResult.stderr);
  const files = JSON.parse(filesResult.stdout);
  assert.equal(files.tool, "repository-files");
  assert.equal(files.result.returned, 1);
  assert.ok(files.result.files.every((file) => file.path.startsWith("apps/web/src/") && file.role === "source"));
  assert.equal(run("tool", "run", "repository-files", "--path=", "--root", sandbox).status, 1);

  const graphResult = run("tool", "run", "dependency-graph", "--unit", "web", "--root", sandbox, "--json");
  assert.equal(graphResult.status, 0, graphResult.stderr);
  const graph = JSON.parse(graphResult.stdout).result;
  assert.ok(graph.units.some((unit) => unit.name === "@fixture/web"));
  assert.ok(graph.units.some((unit) => unit.name === "@fixture/auth"));
  assert.equal(graph.dependencies.length, 1);

  const boundedGraphResult = run("tool", "run", "dependency-graph", "--unit", "web", "--limit", "1", "--root", sandbox, "--json");
  assert.equal(boundedGraphResult.status, 0, boundedGraphResult.stderr);
  const boundedGraph = JSON.parse(boundedGraphResult.stdout).result;
  assert.equal(boundedGraph.units[0].name, "@fixture/web");
  assert.equal(boundedGraph.truncated, true);

  const documentsResult = run("tool", "run", "documentation-index", "--status", "all", "--root", sandbox, "--json");
  assert.equal(documentsResult.status, 0, documentsResult.stderr);
  assert.ok(JSON.parse(documentsResult.stdout).result.documents.some((document) => document.id === "doc-map"));
  assert.equal(run("tool", "run", "documentation-index", "--status", "historical", "--root", sandbox, "--json").status, 0);

  const duplicatesResult = run("tool", "run", "duplicate-analysis", "--path", "packages/auth/**", "--root", sandbox, "--json");
  assert.equal(duplicatesResult.status, 0, duplicatesResult.stderr);
  assert.ok(JSON.parse(duplicatesResult.stdout).result.groups.some((group) => group.paths.includes("packages/auth/src/token-copy.ts")));
});

test("init records ignored boundaries without reading their contents", () => {
  assert.equal(git("init", "--quiet").status, 0);
  mkdirSync(join(sandbox, "build"));
  mkdirSync(join(sandbox, "docs/private"), { recursive: true });
  writeFileSync(join(sandbox, "build/output.js"), "throw new Error('must not be scanned');\n");
  writeFileSync(join(sandbox, "docs/private/architecture.md"), "# Private architecture\n");
  writeFileSync(join(sandbox, ".env"), "SECRET=do-not-index\n");
  writeFileSync(join(sandbox, ".gitignore"), "build/\ndocs/private/\nprivate-notes/\n.env\n");

  const result = run("init", "--root", sandbox, "--json");
  assert.equal(result.status, 0, result.stderr);
  const map = readMap();
  assert.equal(map.files.some((file) => file.path.startsWith("build/")), false);
  assert.equal(map.files.some((file) => file.path.startsWith("docs/private/")), false);
  assert.equal(map.perimeter_regions.some((region) => region.path === ".env"), false);
  assert.ok(map.scan_summary.hidden_ignored_regions >= 1);
  const build = map.perimeter_regions.find((region) => region.path === "build");
  assert.equal(build.classification, "unknown");
  assert.ok(build.reasons.includes("gitignored"));
  assert.equal(build.reasons.includes("generated-policy"), false);
  const docs = map.perimeter_regions.find((region) => region.path === "docs/private");
  assert.equal(docs.classification, "document");
  assert.equal(docs.review_required, true);
  assert.ok(map.unresolved.some((item) => item.kind === "ignored-region-needs-scan-decision" && item.path === "docs/private"));

  writeFileSync(join(sandbox, "build/output.js"), "changed generated output\n");
  writeFileSync(join(sandbox, "docs/private/architecture.md"), "# Changed private architecture\n");
  assert.match(run("check", "--root", sandbox).stdout, /Bearing check: PASS/);

  mkdirSync(join(sandbox, "private-notes"));
  writeFileSync(join(sandbox, "private-notes/new.md"), "# New ignored boundary\n");
  assert.match(run("check", "--root", sandbox).stdout, /Bearing check: REVIEW/);
});

test("an explicit ignored-doc include makes the document evidence", () => {
  assert.equal(git("init", "--quiet").status, 0);
  mkdirSync(join(sandbox, "docs/private"), { recursive: true });
  mkdirSync(join(sandbox, "scratch"));
  writeFileSync(join(sandbox, "docs/private/architecture.md"), "# Private architecture\n");
  writeFileSync(join(sandbox, "scratch/hidden.md"), "# Hidden\n");
  writeFileSync(join(sandbox, ".env"), "SECRET=do-not-index\n");
  writeFileSync(join(sandbox, ".gitignore"), "docs/private/\nscratch/\n.env\n");
  mkdirSync(join(sandbox, ".mauro"));
  cpSync(join(packageRoot, "templates/config.json"), join(sandbox, ".mauro/config.json"));
  editConfig((config) => {
    config.scan.gitignored.include.push("docs/private/**");
    config.scan.gitignored.include.push("scratch/**");
    config.scan.gitignored.include.push(".env");
    config.scan.gitignored.hide.push("scratch/**");
  });

  const result = run("init", "--root", sandbox);
  assert.equal(result.status, 0, result.stderr);
  const map = readMap();
  const document = map.files.find((file) => file.path === "docs/private/architecture.md");
  assert.equal(document.gitignored, true);
  assert.equal(map.files.some((file) => file.path === ".env"), false);
  assert.equal(map.files.some((file) => file.path === "scratch/hidden.md"), false);
  assert.equal(map.perimeter_regions.some((region) => region.path === "scratch"), false);
  assert.equal(map.scan_summary.gitignored_scanned_files, 1);
  assert.equal(map.perimeter_regions.some((region) => region.path === "docs/private"), false);

  writeFileSync(join(sandbox, "docs/private/architecture.md"), "# Changed private architecture\n");
  assert.match(run("check", "--root", sandbox).stdout, /Bearing check: REVIEW/);
});

test("changing gitignore makes repository knowledge suspect", () => {
  assert.equal(git("init", "--quiet").status, 0);
  writeFileSync(join(sandbox, ".gitignore"), "build/\n");
  assert.equal(run("init", "--root", sandbox).status, 0);
  writeFileSync(join(sandbox, ".gitignore"), "build/\nprivate-docs/\n");
  assert.match(run("check", "--root", sandbox).stdout, /Bearing check: REVIEW/);
});

test("existing configurations without gitignored policy keep record defaults", () => {
  assert.equal(git("init", "--quiet").status, 0);
  mkdirSync(join(sandbox, "docs/private"), { recursive: true });
  writeFileSync(join(sandbox, "docs/private/notes.md"), "# Notes\n");
  writeFileSync(join(sandbox, ".gitignore"), "docs/private/\n");
  mkdirSync(join(sandbox, ".mauro"));
  cpSync(join(packageRoot, "templates/config.json"), join(sandbox, ".mauro/config.json"));
  editConfig((config) => { delete config.scan.gitignored; });

  const result = run("init", "--root", sandbox);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readMap().files.some((file) => file.path === "docs/private/notes.md"), false);
  assert.equal(readMap().perimeter_regions.find((region) => region.path === "docs/private").review_required, true);
});

test("an explicit ignored-path exclusion resolves the scan decision", () => {
  assert.equal(git("init", "--quiet").status, 0);
  mkdirSync(join(sandbox, "docs/private"), { recursive: true });
  writeFileSync(join(sandbox, "docs/private/notes.md"), "# Notes\n");
  writeFileSync(join(sandbox, ".gitignore"), "docs/private/\n");
  mkdirSync(join(sandbox, ".mauro"));
  cpSync(join(packageRoot, "templates/config.json"), join(sandbox, ".mauro/config.json"));
  editConfig((config) => config.scan.gitignored.exclude.push("docs/private/**"));

  assert.equal(run("init", "--root", sandbox).status, 0);
  const map = readMap();
  const docs = map.perimeter_regions.find((region) => region.path === "docs/private");
  assert.equal(docs.review_required, false);
  assert.ok(docs.reasons.includes("gitignored-policy"));
  assert.equal(map.unresolved.some((item) => item.path === "docs/private"), false);
});

test("init honors a configuration file prepared before the first Expedition", () => {
  mkdirSync(join(sandbox, ".mauro"));
  cpSync(join(packageRoot, "templates/config.json"), join(sandbox, ".mauro/config.json"));
  editConfig((config) => config.scan.packages.exclude.names.push("@fixture/auth"));
  const result = run("init", "--root", sandbox);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readMap().units.find((unit) => unit.name === "@fixture/auth").scope, "stub");
});

test("excluded packages remain dependency stubs without Navigators or indexed internals", () => {
  symlinkSync("../../../packages/auth/src/token.ts", join(sandbox, "apps/web/src/auth-link.ts"));
  assert.equal(run("init", "--root", sandbox).status, 0);
  editConfig((config) => {
    config.scan.packages.exclude.names.push("@fixture/auth");
    config.scan.follow_symlinks = true;
  });
  const update = run("map", "update", "--root", sandbox);
  assert.equal(update.status, 0, update.stderr);

  const map = readMap();
  const auth = map.units.find((unit) => unit.name === "@fixture/auth");
  assert.equal(auth.scope, "stub");
  assert.equal(map.capabilities.some((item) => item.name === "@fixture/auth"), false);
  assert.equal(map.dependencies.length, 1);
  assert.deepEqual(map.files.filter((file) => file.path.startsWith("packages/auth/")).map((file) => file.path), ["packages/auth/package.json"]);
  assert.equal(map.files.some((file) => file.path.endsWith("auth-link.ts")), false);

  const manifest = JSON.parse(readFileSync(join(sandbox, ".mauro/manifest.json"), "utf8"));
  assert.equal(Object.keys(manifest.navigators).length, 2);
  assert.equal(existsSync(join(sandbox, ".claude/agents/mauro-packages-auth-navigator.md")), false);
  assert.equal(existsSync(join(sandbox, ".agents/skills/mauro-packages-auth-navigator/SKILL.md")), false);

  editConfig((config) => { config.scan.packages.excluded_behavior = "omit"; });
  assert.equal(run("map", "update", "--root", sandbox).status, 0);
  assert.equal(readMap().units.some((unit) => unit.name === "@fixture/auth"), false);
  assert.equal(readMap().dependencies.length, 0);
  const source = join(sandbox, "packages/auth/src/token.ts");
  writeFileSync(source, `${readFileSync(source, "utf8")}\n// omitted package change\n`);
  assert.match(run("check", "--root", sandbox).stdout, /Bearing check: PASS/);
});

test("package includes keep unmatched units as boundary stubs", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  editConfig((config) => config.scan.packages.include.paths.push("apps/**"));
  const update = run("map", "update", "--root", sandbox);
  assert.equal(update.status, 0, update.stderr);
  const map = readMap();
  assert.deepEqual(map.units.filter((unit) => unit.scope === "included").map((unit) => unit.root), ["apps/web"]);
  assert.deepEqual(map.units.filter((unit) => unit.scope === "stub").map((unit) => unit.root).sort(), [".", "packages/auth"]);
  assert.equal(map.capabilities.length, 1);

  editConfig((config) => { config.scan.packages.excluded_behavior = "omit"; });
  assert.equal(run("map", "update", "--root", sandbox).status, 0);
  assert.deepEqual(readMap().units.map((unit) => unit.root), ["apps/web"]);
  const source = join(sandbox, "apps/web/src/index.ts");
  writeFileSync(source, `${readFileSync(source, "utf8")}\n// included package change\n`);
  assert.match(run("check", "--root", sandbox).stdout, /Bearing check: REVIEW/);
});

test("excluded tests do not make knowledge stale", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  editConfig((config) => { config.scan.tests.mode = "exclude"; });
  assert.equal(run("map", "update", "--root", sandbox).status, 0);
  assert.equal(readMap().files.some((file) => file.role === "test"), false);

  const testPath = join(sandbox, "apps/web/src/index.test.ts");
  writeFileSync(testPath, `${readFileSync(testPath, "utf8")}\n// ignored test change\n`);
  const check = run("check", "--root", sandbox);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /Bearing check: PASS/);
});

test("a package override can restore tests as evidence", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  editConfig((config) => {
    config.scan.tests.mode = "exclude";
    config.scan.package_overrides.push({
      selector: { names: ["@fixture/web"], paths: [] },
      tests: "evidence"
    });
  });
  const update = run("map", "update", "--root", sandbox);
  assert.equal(update.status, 0, update.stderr);
  const testFile = readMap().files.find((file) => file.path.endsWith("index.test.ts"));
  assert.equal(testFile.scan_mode, "evidence");
});

test("only full-mode tests participate in duplicate analysis", () => {
  const source = join(sandbox, "apps/web/src/index.test.ts");
  const copy = join(sandbox, "apps/web/src/copy.test.ts");
  writeFileSync(copy, readFileSync(source));
  assert.equal(run("init", "--root", sandbox).status, 0);
  assert.equal(readMap().duplicate_groups.some((group) => group.paths.includes("apps/web/src/index.test.ts")), false);

  editConfig((config) => { config.scan.tests.mode = "full"; });
  assert.equal(run("map", "update", "--root", sandbox).status, 0);
  assert.equal(readMap().duplicate_groups.some((group) => group.paths.includes("apps/web/src/index.test.ts") && group.paths.includes("apps/web/src/copy.test.ts")), true);
});

test("document, language, and file-size policies shape the Map", () => {
  const large = join(sandbox, "apps/web/src/large.ts");
  const ignoredDirectory = join(sandbox, "apps/web/src/ignored");
  const ignored = join(ignoredDirectory, "cache.ts");
  const notesDirectory = join(sandbox, "docs");
  const notes = join(notesDirectory, "notes.md");
  mkdirSync(ignoredDirectory, { recursive: true });
  mkdirSync(notesDirectory, { recursive: true });
  writeFileSync(large, `export const large = "${"x".repeat(2048)}";\n`);
  writeFileSync(ignored, "export const ignored = true;\n");
  writeFileSync(notes, "# Internal notes\n");
  assert.equal(run("init", "--root", sandbox).status, 0);
  editConfig((config) => {
    config.scan.documents.mode = "selected";
    config.scan.documents.include = ["README.md"];
    config.scan.languages.exclude = ["JSON"];
    config.scan.paths.exclude = ["apps/web/src/ignored/**"];
    config.scan.max_file_size = 1024;
  });
  assert.equal(run("map", "update", "--root", sandbox).status, 0);
  const map = readMap();
  assert.deepEqual(map.documents.map((item) => item.path), ["README.md"]);
  assert.equal(map.files.some((file) => file.path.endsWith("account.json")), false);
  const largeFile = map.files.find((file) => file.path.endsWith("large.ts"));
  assert.equal(largeFile.oversize, true);
  assert.equal(largeFile.digest, null);

  const fixture = join(sandbox, "apps/web/fixtures/account.json");
  writeFileSync(fixture, `${readFileSync(fixture, "utf8")}\n`);
  writeFileSync(ignored, `${readFileSync(ignored, "utf8")}\n// ignored\n`);
  writeFileSync(notes, `${readFileSync(notes, "utf8")}\nExcluded note.\n`);
  assert.match(run("check", "--root", sandbox).stdout, /Bearing check: PASS/);
});

test("invalid scan configuration fails with a focused error", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  editConfig((config) => { config.scan.tests.mode = "sometimes"; });
  const result = run("map", "update", "--root", sandbox);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid Mauro config: scan\.tests\.mode/);
});

test("an unsafe canonical ref fails with a focused error", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  editConfig((config) => { config.git = { canonical_ref: "HEAD~1" }; });
  const result = run("status", "--root", sandbox);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid Mauro config: git\.canonical_ref is not a safe Git ref name/);
});

test("an existing repository complains until its canonical branch is pinned", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  editConfig((config) => { config.git.canonical_ref = null; });
  const status = run("status", "--root", sandbox);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /relationship: unpinned/);
  const check = run("check", "--root", sandbox);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /canonical-branch-unpinned/);
  for (const args of [
    ["run", "Update the guide", "--root", sandbox],
    ["run", "Update the guide", "--allow-behind", "--root", sandbox]
  ]) {
    const refused = run(...args);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /requires git\.canonical_ref/);
  }
});

test("symlinks are opt-in and remain visibly marked", () => {
  const link = join(sandbox, "apps/web/src/auth-link.ts");
  symlinkSync("../../../packages/auth/src/token.ts", link);
  assert.equal(run("init", "--root", sandbox).status, 0);
  assert.equal(readMap().files.some((file) => file.path.endsWith("auth-link.ts")), false);

  editConfig((config) => { config.scan.follow_symlinks = true; });
  const update = run("map", "update", "--root", sandbox);
  assert.equal(update.status, 0, update.stderr);
  assert.equal(readMap().files.find((file) => file.path.endsWith("auth-link.ts")).via_symlink, true);
});

test("a Bearing check detects changed evidence without changing state", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  const clean = run("c", "--root", sandbox);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /Bearing check: PASS/);

  const source = join(sandbox, "packages/auth/src/token.ts");
  writeFileSync(source, `${readFileSync(source, "utf8")}\n// changed\n`);
  const changed = run("check", "--root", sandbox);
  assert.equal(changed.status, 0, changed.stderr);
  assert.match(changed.stdout, /Bearing check: REVIEW/);
  assert.match(changed.stdout, /document-suspect/);
});

test("a historical document is never made suspect by changed evidence", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  mkdirSync(join(sandbox, "docs/status-reports"), { recursive: true });
  writeFileSync(join(sandbox, "docs/status-reports/2026-01-01-overview.md"), "# Status report as of 1 January 2026\n");
  writeFileSync(join(sandbox, "docs/guide.md"), "# Guide\n");
  const manifestPath = join(sandbox, ".mauro/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const watches = ["packages/auth/src/token.ts"];
  manifest.documents["doc-status-report"] = { path: "docs/status-reports/2026-01-01-overview.md", status: "historical", criticality: "historical", watches, knowledge: [] };
  // Live control: a maintained document watching the same file must still go suspect.
  manifest.documents["doc-guide"] = { path: "docs/guide.md", status: "current", criticality: "informational", watches, knowledge: [] };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const update = run("map", "update", "--root", sandbox);
  assert.equal(update.status, 0, update.stderr);

  const source = join(sandbox, "packages/auth/src/token.ts");
  writeFileSync(source, `${readFileSync(source, "utf8")}\n// changed\n`);
  const checked = run("check", "--root", sandbox);
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /doc-guide is suspect because packages\/auth\/src\/token\.ts changed/);
  assert.doesNotMatch(checked.stdout, /doc-status-report/);
});

test("enforce mode fails when a record needs review", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  const configPath = join(sandbox, ".mauro/config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.mode = "enforce";
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const source = join(sandbox, "apps/web/src/index.ts");
  writeFileSync(source, `${readFileSync(source, "utf8")}\n// changed\n`);
  const result = run("check", "--root", sandbox);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Bearing check: REVIEW/);
});

test("queries resolve aliases and path ownership", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  const status = run("s", "--root", sandbox, "--json");
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).navigators, 3);
  const owner = run("who", "packages/auth/src/token.ts", "--root", sandbox, "--json");
  assert.equal(owner.status, 0, owner.stderr);
  assert.match(owner.stdout, /auth-navigator/);
});

test("Bearing check reports an unresolved inline pointer", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  const source = join(sandbox, "packages/auth/src/token.ts");
  writeFileSync(source, `${readFileSync(source, "utf8")}\n// MAURO[K-9999]: Keep this operation atomic.\n`);
  const result = run("check", "--root", sandbox);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /marker-unresolved/);
});

test("Map update preserves semantic capability decisions", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  const mapPath = join(sandbox, ".mauro/map.json");
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  const auth = map.capabilities.find((item) => item.id.includes("packages-auth"));
  auth.purpose = "Keep token lifecycle rules in one package.";
  auth.provenance = "human-approved";
  auth.approved = true;
  writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
  const manifestPath = join(sandbox, ".mauro/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.documents["doc-design"] = {
    path: "README.md",
    status: "current",
    criticality: "informational",
    watches: ["README.md"],
    knowledge: []
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const source = join(sandbox, "packages/auth/src/token.ts");
  writeFileSync(source, `${readFileSync(source, "utf8")}\n// changed\n`);
  const updated = run("map", "update", "--root", sandbox);
  assert.equal(updated.status, 0, updated.stderr);
  const next = JSON.parse(readFileSync(mapPath, "utf8"));
  const preserved = next.capabilities.find((item) => item.id === auth.id);
  assert.equal(preserved.purpose, "Keep token lifecycle rules in one package.");
  assert.equal(preserved.approved, true);
  const nextManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(nextManifest.documents["doc-design"].path, "README.md");

  const check = run("check", "--root", sandbox);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /Bearing check: REVIEW/);
});

test("Map update never deletes a product file named by untrusted state", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  const manifestPath = join(sandbox, ".mauro/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.navigators.untrusted = {
    source: "apps/web/src/index.ts",
    generated_agent: "packages/auth/src/token.ts",
    generated_rule: "README.md",
    primary_paths: [],
    secondary_paths: [],
    approved: false
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const product = join(sandbox, "apps/web/src/index.ts");
  const before = readFileSync(product, "utf8");
  const update = run("map", "update", "--root", sandbox);
  assert.equal(update.status, 0, update.stderr);
  assert.equal(readFileSync(product, "utf8"), before);
});

test("a modified tracked file keeps its full path in the changed-path list", async () => {
  writeFileSync(join(sandbox, "package.json"), `${readFileSync(join(sandbox, "package.json"), "utf8")}\n`);
  const { gitChangedPaths } = await import(join(packageRoot, "scripts/lib/git.mjs"));
  // `git status --porcelain` starts a modified line with a space. A trim of the
  // whole output removed that space and the parser sliced the first letter off.
  assert.deepEqual(gitChangedPaths(sandbox), ["package.json"]);
});

test("map update keeps a human-approved capability that spans several units", () => {
  assert.equal(git("init", "--quiet").status, 0);
  assert.equal(run("init", "--root", sandbox).status, 0);
  const mapPath = join(sandbox, ".mauro/map.json");
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  const drafts = map.capabilities.map((item) => item.id).sort();
  assert.deepEqual(drafts, ["cap-apps-web", "cap-fixture-root", "cap-packages-auth"]);
  map.capabilities = [
    {
      id: "cap-identity",
      name: "Identity",
      purpose: "Own sign-in for the web app and the auth package.",
      primary_paths: ["apps/web/**", "packages/auth/**"],
      secondary_paths: [],
      units: ["unit-apps-web", "unit-packages-auth"],
      entrypoints: ["packages/auth/src/index.ts"],
      invariants: [{ statement: "A session token is never logged.", evidence: ["packages/auth/src/index.ts"], confidence: 0.8 }],
      review: [{ navigator: "cap-fixture-root", reason: "the workspace build wires the package." }],
      verification: ["npm test --workspace packages/auth"],
      rules: ["Keep the token format in one module."],
      confidence: 0.9,
      evidence: ["packages/auth/package.json"],
      provenance: "human-approved",
      approved: true
    },
    map.capabilities.find((item) => item.id === "cap-fixture-root")
  ];
  map.anomalies.push({ id: "anomaly-auth-copy", kind: "misplaced-shared-code", severity: "minor", detail: "apps/web copies a helper from packages/auth.", paths: ["apps/web/src/auth.ts"], evidence: ["packages/auth/src/index.ts"], confidence: 0.8 });
  map.unresolved.push({ id: "unresolved-scope-1", kind: "unassigned-scope", paths: ["docs/**"], detail: "No capability owns docs/." });
  writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
  const update = run("map", "update", "--root", sandbox);
  assert.equal(update.status, 0, update.stderr);
  const after = JSON.parse(readFileSync(mapPath, "utf8"));
  // The approved boundary survives and the drafts for the units it covers do not
  // come back. The workspace draft that nothing covers is still there.
  assert.deepEqual(after.capabilities.map((item) => item.id).sort(), ["cap-fixture-root", "cap-identity"]);
  // Findings with an id came from a survey. A rescan keeps them beside its own.
  assert.ok(after.anomalies.some((item) => item.id === "anomaly-auth-copy"));
  assert.ok(after.unresolved.some((item) => item.id === "unresolved-scope-1"));
  const identity = after.capabilities.find((item) => item.id === "cap-identity");
  assert.equal(identity.approved, true);
  assert.equal(identity.provenance, "human-approved");
  assert.ok(existsSync(join(sandbox, "docs/mauro/navigators/identity.md")));
  assert.ok(!existsSync(join(sandbox, "docs/mauro/navigators/packages-auth.md")));
  // The regenerated brief keeps every semantic field the Map carries.
  const brief = readFileSync(join(sandbox, "docs/mauro/navigators/identity.md"), "utf8");
  for (const expected of [
    "- Provenance: human-approved",
    "## Entrypoints",
    "- `packages/auth/src/index.ts`",
    "## Invariants to protect",
    "1. A session token is never logged.",
    "## Required review",
    "- cap-fixture-root, because the workspace build wires the package.",
    "## Verification",
    "npm test --workspace packages/auth",
    "- Keep the token format in one module."
  ]) assert.ok(brief.includes(expected), `missing: ${expected}`);
  const regenerate = run("navigator", "regenerate", "all", "--root", sandbox);
  assert.equal(regenerate.status, 0, regenerate.stderr);
  assert.match(regenerate.stdout, /generated: 2/);
  assert.match(regenerate.stdout, /Restart agent sessions/);
  const agent = readFileSync(join(sandbox, ".claude/agents/mauro-identity-navigator.md"), "utf8");
  assert.match(agent, /Repository specialist for Identity/);
  assert.match(agent, /apps\/web\/\*\*, packages\/auth\/\*\*/);
  assert.match(agent, /review the changed files and any diff that the parent session supplies/);
  const skill = readFileSync(join(sandbox, ".agents/skills/mauro-identity-navigator/SKILL.md"), "utf8");
  assert.match(skill, /Identity Navigator/);
  const taskBrief = JSON.parse(run("brief", "change identity login", "--root", sandbox, "--json").stdout);
  assert.ok(taskBrief.navigators.some((navigator) => navigator.id === "mauro-identity-navigator" && navigator.role === "responsible"));
  assert.ok(taskBrief.navigators.some((navigator) => navigator.id === "mauro-fixture-root-navigator" && navigator.role === "reviewing"));
});

test("brief returns compact task context without creating a Voyage", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  const result = run("brief", "change auth token handling", "--root", sandbox, "--json");
  assert.equal(result.status, 0, result.stderr);
  const brief = JSON.parse(result.stdout);
  assert.equal(brief.objective, "change auth token handling");
  assert.equal(brief.git.ref, "canonical");
  assert.ok(brief.capabilities.some((capability) => capability.name.includes("auth")));
  assert.ok(brief.navigators.some((navigator) => navigator.generated_skill?.startsWith(".agents/skills/")));
  assert.equal(brief.charter.path, "docs/mauro/charter.md");
  assert.match(brief.note, /lexical/i);
  assert.equal(existsSync(join(sandbox, ".mauro/voyages/V-0001.json")), false);
});

test("reconcile refreshes changed evidence once and clears the queue", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  const target = join(sandbox, "packages/auth/src/token.ts");
  const before = readMap().files.find((file) => file.path === "packages/auth/src/token.ts").digest;
  writeFileSync(target, "export const token = 'changed';\n");
  const queued = spawnSync(process.execPath, [bin, "hook", "changed", "--root", sandbox], {
    cwd: sandbox,
    encoding: "utf8",
    input: JSON.stringify({ tool_input: { file_path: target } })
  });
  assert.equal(queued.status, 0, queued.stderr);

  const first = run("reconcile", "--root", sandbox, "--json");
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).updated, true);
  const after = readMap().files.find((file) => file.path === "packages/auth/src/token.ts").digest;
  assert.notEqual(after, before);
  assert.deepEqual(JSON.parse(readFileSync(join(sandbox, ".mauro/changed-paths.json"), "utf8")).paths, []);

  const second = run("reconcile", "--root", sandbox, "--json");
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).updated, false);

  writeFileSync(target, "export const token = 'changed again';\n");
  const queuedAgain = spawnSync(process.execPath, [bin, "hook", "changed", "--root", sandbox], {
    cwd: sandbox,
    encoding: "utf8",
    input: JSON.stringify({ tool_input: { file_path: target } })
  });
  assert.equal(queuedAgain.status, 0, queuedAgain.stderr);
  const sessionStart = run("hook", "session-start", "--root", sandbox);
  assert.equal(sessionStart.status, 0, sessionStart.stderr);
  assert.match(sessionStart.stdout, /Repository context refreshed from 1 changed path\./);
  const afterSessionStart = readMap().files.find((file) => file.path === "packages/auth/src/token.ts").digest;
  assert.notEqual(afterSessionStart, after);
});

test("reconcile migrates legacy repository context even when evidence is unchanged", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  const manifestPath = join(sandbox, ".mauro/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.schema_version = 1;
  for (const navigator of Object.values(manifest.navigators)) delete navigator.generated_skill;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const before = run("check", "--root", sandbox);
  assert.equal(before.status, 0, before.stderr);
  assert.match(before.stdout, /migration-required/);
  const diagnosis = JSON.parse(run("doctor", "--root", sandbox, "--json").stdout);
  assert.equal(diagnosis.migration.required, true);
  assert.equal(diagnosis.migration.supported, true);

  const migrated = run("reconcile", "--root", sandbox, "--json");
  assert.equal(migrated.status, 0, migrated.stderr);
  const result = JSON.parse(migrated.stdout);
  assert.equal(result.updated, true);
  assert.equal(result.migration.completed, true);
  const upgraded = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(upgraded.schema_version, 2);
  for (const navigator of Object.values(upgraded.navigators)) {
    assert.ok(navigator.generated_skill);
    assert.equal(existsSync(join(sandbox, navigator.generated_skill)), true);
  }
  assert.equal(JSON.parse(run("reconcile", "--root", sandbox, "--json").stdout).updated, false);
});

test("reconcile refuses a future manifest schema", () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  const manifestPath = join(sandbox, ".mauro/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.schema_version = 999;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const check = run("check", "--root", sandbox);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /migration-unsupported/);
  const result = run("reconcile", "--root", sandbox);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot be migrated automatically/);
  const update = run("map", "update", "--root", sandbox);
  assert.equal(update.status, 1);
  assert.match(update.stderr, /cannot be migrated automatically/);
  assert.equal(JSON.parse(readFileSync(manifestPath, "utf8")).schema_version, 999);
});

test("the Stop hook catches shell changes without rescanning the same dirty tree", async () => {
  assert.equal(run("init", "--root", sandbox).status, 0);
  assert.equal(git("init", "--quiet").status, 0);
  assert.equal(git("add", ".").status, 0);
  assert.equal(git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "baseline").status, 0);
  const target = join(sandbox, "apps/web/src/index.ts");
  writeFileSync(target, `${readFileSync(target, "utf8")}\n// shell edit\n`);

  const first = run("hook", "stop", "--root", sandbox);
  assert.equal(first.status, 0, first.stderr);
  const refreshed = readMap();
  assert.equal(refreshed.files.find((file) => file.path === "apps/web/src/index.ts").digest, (await import(join(packageRoot, "scripts/lib/fs.mjs"))).fingerprintFile(target));

  const second = run("hook", "stop", "--root", sandbox);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readMap().generated_at, refreshed.generated_at);
});

function fillCharter(sandbox, sections = null) {
  const path = join(sandbox, "docs/mauro/charter.md");
  let text = readFileSync(path, "utf8");
  const prompts = {
    "Product purpose": "A fixture monorepo for Mauro tests.",
    "Intended capability boundaries": "Identity stays in packages/auth.",
    "Ownership": "One team owns everything.",
    "Required architecture rules": "Apps import packages. Packages never import apps.",
    "Allowed exceptions": "None.",
    "Security and compliance": "No secrets in the tree.",
    "Build and deployment constraints": "Node 20 or later.",
    "Refit priorities": "None approved.",
    "Excluded paths": "build/"
  };
  for (const [name, body] of Object.entries(prompts)) {
    if (sections && !sections.includes(name)) continue;
    text = text.replace(new RegExp(`(## ${name}\\n\\n)[^\\n]+`), `$1${body}`);
  }
  writeFileSync(path, text);
}

test("a template Charter is reported and refused where intent is compared", () => {
  assert.equal(git("init", "--quiet").status, 0);
  const init = run("init", "--root", sandbox);
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /mauro charter create/);

  const validate = run("charter", "validate", "--root", sandbox);
  assert.equal(validate.status, 1);
  assert.match(validate.stdout, /valid: false/);
  assert.match(validate.stdout, /state: template/);

  const check = run("check", "--root", sandbox);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /Bearing check: PASS/);
  assert.match(check.stdout, /INFORMATION charter-template: .*template prompts/);
  assert.match(run("status", "--root", sandbox).stdout, /charter: template/);
  assert.match(run("doctor", "--root", sandbox).stdout, /charter: template/);

  const pr = run("pr", "preview", "--root", sandbox);
  assert.notEqual(pr.status, 0);
  assert.match(pr.stderr, /Charter is a template/);
  const refit = run("refit", "propose", "--root", sandbox);
  assert.notEqual(refit.status, 0);
  assert.match(refit.stderr, /Charter is a template/);
  assert.match(run("run", "fix login", "--root", sandbox).stdout, /charter: template/);
  assert.match(run("charter", "update", "x", "--root", sandbox).stdout, /mauro charter create/);

  const hook = spawnSync(process.execPath, [bin, "hook", "session-start", "--root", sandbox], { cwd: sandbox, encoding: "utf8" });
  assert.match(hook.stdout, /The Charter is template; run \/mauro charter create/);
});

test("a filled Charter validates and unlocks the intent-comparing commands", () => {
  assert.equal(git("init", "--quiet").status, 0);
  assert.equal(run("init", "--root", sandbox).status, 0);

  fillCharter(sandbox, ["Product purpose"]);
  const partial = run("charter", "validate", "--root", sandbox);
  assert.equal(partial.status, 1);
  assert.match(partial.stdout, /state: partial/);
  assert.match(partial.stdout, /Required architecture rules/);
  assert.match(run("check", "--root", sandbox).stdout, /INFORMATION charter-partial: .*Intended capability boundaries/);
  assert.match(run("charter", "create", "--root", sandbox).stdout, /Sections still holding template prompts/);

  fillCharter(sandbox);
  const complete = run("charter", "validate", "--root", sandbox);
  assert.equal(complete.status, 0, complete.stdout);
  assert.match(complete.stdout, /valid: true/);
  assert.match(complete.stdout, /state: complete/);
  const check = run("check", "--root", sandbox);
  assert.match(check.stdout, /Bearing check: PASS/);
  assert.doesNotMatch(check.stdout, /charter-/);
  assert.match(run("status", "--root", sandbox).stdout, /charter: complete/);
  assert.equal(run("pr", "preview", "--root", sandbox).status, 0);
  assert.equal(run("refit", "propose", "--root", sandbox).status, 0);
  assert.match(run("charter", "create", "--root", sandbox).stdout, /Charter is complete/);
  const hook = spawnSync(process.execPath, [bin, "hook", "session-start", "--root", sandbox], { cwd: sandbox, encoding: "utf8" });
  assert.doesNotMatch(hook.stdout, /Charter/);
});

test("next lists findings and suggests commands in priority order", () => {
  assert.equal(git("init", "--quiet").status, 0);
  assert.equal(run("init", "--root", sandbox).status, 0);
  const first = run("next", "--root", sandbox);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Charter: template/);
  assert.match(first.stdout, /1\. \[now\] Write the Charter\.\n   mauro charter create/);
  assert.match(first.stdout, /\[now\] Review 3 preliminary capability boundaries/);
  assert.match(first.stdout, /Run the first Voyage/);
  assert.equal(run("suggest", "--root", sandbox).stdout, first.stdout);
  assert.equal(run("n", "--root", sandbox).stdout, first.stdout);

  fillCharter(sandbox);
  const mapPath = join(sandbox, ".mauro/map.json");
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  map.capabilities = map.capabilities.map((item) => ({ ...item, approved: true, provenance: "human-approved" }));
  map.anomalies.push({ id: "anomaly-stale-readme", kind: "stale-document", severity: "major", detail: "README.md names a deleted package.", paths: ["README.md"], evidence: ["packages"], confidence: 0.9 });
  map.anomalies.push({ id: "anomaly-copy", kind: "misplaced-shared-code", severity: "minor", detail: "apps/web copies a helper.", paths: ["apps/web/src/auth.ts"], evidence: [], confidence: 0.8 });
  writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
  const manifestPath = join(sandbox, ".mauro/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.documents["doc-readme"] = { path: "README.md", status: "stale", criticality: "binding", watches: ["packages"] };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const second = run("next", "--root", sandbox);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Bearing: FAIL/);
  assert.match(second.stdout, /- \[major\] anomaly-stale-readme: README\.md names a deleted package\./);
  assert.match(second.stdout, /- \[stale, binding\] README\.md/);
  assert.doesNotMatch(second.stdout, /Write the Charter/);
  assert.match(second.stdout, /1\. \[now\] doc-readme is declared stale\.\n   mauro run "Update README\.md"/);
  assert.match(second.stdout, /\[later\] Propose a Refit for 1 structural finding \(misplaced-shared-code\)\.\n   mauro refit propose/);

  manifest.documents["doc-notes"] = { path: "docs/notes.md", status: "stale", criticality: "informational", watches: [] };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const third = run("next", "--root", sandbox);
  assert.match(third.stdout, /\[soon\] Delete or correct 1 stale or suspect non-binding document: docs\/notes\.md\.\n   mauro run "Delete or correct stale documents"/);
  const asJson = JSON.parse(run("next", "--json", "--root", sandbox).stdout);
  assert.equal(asJson.suggestions[0].priority, "now");
  assert.equal(asJson.findings.anomalies[0].id, "anomaly-stale-readme");
});
