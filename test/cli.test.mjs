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

function run(...args) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: sandbox,
    encoding: "utf8"
  });
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
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

test("init maps a monorepo and generates scoped Navigators", () => {
  const result = run("init", "--root", sandbox, "--json");
  assert.equal(result.status, 0, result.stderr);
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
  for (const navigator of Object.values(manifest.navigators)) {
    assert.match(navigator.generated_agent, /^\.claude\/agents\//);
    assert.ok(readFileSync(join(sandbox, navigator.generated_agent), "utf8").includes("Generated"));
  }
  assert.ok(readFileSync(join(sandbox, "docs/mauro/charter.md"), "utf8").includes("# Mauro Charter"));
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
  assert.equal(build.classification, "generated");
  assert.ok(build.reasons.includes("gitignored"));
  assert.ok(build.reasons.includes("generated-policy"));
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
  assert.equal(git("init", "--quiet").status, 0);
  assert.equal(git("add", ".").status, 0);
  assert.equal(git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "baseline").status, 0);
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
  writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
  const update = run("map", "update", "--root", sandbox);
  assert.equal(update.status, 0, update.stderr);
  const after = JSON.parse(readFileSync(mapPath, "utf8"));
  // The approved boundary survives and the drafts for the units it covers do not
  // come back. The workspace draft that nothing covers is still there.
  assert.deepEqual(after.capabilities.map((item) => item.id).sort(), ["cap-fixture-root", "cap-identity"]);
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
