import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { watchPathspec } from "../scripts/lib/fs.mjs";
import { verificationStamp } from "../scripts/lib/state.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(packageRoot, "bin/mauro");
const fixture = join(packageRoot, "test/fixtures/monorepo");
let sandbox;

function run(...args) {
  return spawnSync(process.execPath, [bin, ...args], { cwd: sandbox, encoding: "utf8" });
}

function ok(...args) {
  const result = run(...args);
  assert.equal(result.status, 0, `mauro ${args.join(" ")}\n${result.stderr}`);
  return result;
}

function git(...args) {
  const result = spawnSync("git", ["-c", "user.email=mauro@test.local", "-c", "user.name=Mauro Test", "-c", "commit.gpgsign=false", ...args], { cwd: sandbox, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}\n${result.stderr}`);
  return result.stdout.trim();
}

function commitAll(message) {
  git("add", "-A");
  git("commit", "--quiet", "--allow-empty", "-m", message);
  return git("rev-parse", "HEAD");
}

function readState(name) {
  return JSON.parse(readFileSync(join(sandbox, ".mauro", name), "utf8"));
}

function writeState(name, value) {
  writeFileSync(join(sandbox, ".mauro", name), `${JSON.stringify(value, null, 2)}\n`);
}

function addDocument(id, document) {
  const manifest = readState("manifest.json");
  manifest.documents[id] = { status: "current", criticality: "informational", knowledge: [], ...document };
  writeState("manifest.json", manifest);
}

function append(path, text) {
  const absolute = join(sandbox, path);
  writeFileSync(absolute, `${readFileSync(absolute, "utf8")}${text}`);
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "mauro-review-"));
  cpSync(fixture, sandbox, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

test("a watch reduces to the Git pathspec its fingerprint covers", () => {
  assert.equal(watchPathspec("**"), ".");
  assert.equal(watchPathspec("."), ".");
  assert.equal(watchPathspec("apps/web/src/**"), "apps/web/src");
  assert.equal(watchPathspec("packages/health-web/src/api/*.ts"), "packages/health-web/src/api");
  assert.equal(watchPathspec("AGENTS.md"), "AGENTS.md");
});

test("a stamp is dirty only when a changed path falls inside a watch", () => {
  const context = { commit: "abc1234", changed: ["apps/web/src/index.ts", "docs/mauro/"] };
  assert.equal(verificationStamp(["packages/auth/src"], context).verified_dirty, false);
  assert.equal(verificationStamp(["apps/web/src/**"], context).verified_dirty, true);
  assert.equal(verificationStamp(["docs/mauro/chronicles"], context).verified_dirty, true);
  assert.equal(verificationStamp(["."], context).verified_dirty, true);
  assert.equal(verificationStamp(["."], { commit: null, changed: ["x"] }).verified_dirty, false);
  assert.equal(verificationStamp([], context).verified_evidence, null);
});

test("init stamps every document with the commit its fingerprints describe", () => {
  git("init", "--quiet");
  const head = commitAll("fixture");
  ok("init", "--root", sandbox);
  const { documents } = readState("manifest.json");
  assert.ok(Object.keys(documents).length > 1);
  for (const [id, document] of Object.entries(documents)) {
    assert.equal(document.verified_commit, head, id);
    assert.equal(document.verified_dirty, false, id);
    assert.equal(document.verified_evidence, null, id);
    assert.match(document.verified_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, id);
  }
});

test("map update stamps only what it fingerprints afresh", () => {
  git("init", "--quiet");
  const first = commitAll("fixture");
  ok("init", "--root", sandbox);
  commitAll("mauro state");
  writeFileSync(join(sandbox, "docs/guide.md"), "# Guide\n");
  addDocument("doc-guide", { path: "docs/guide.md", watches: ["packages/auth/src"] });
  addDocument("doc-web", { path: "docs/guide.md", watches: ["apps/web/src"] });
  const second = commitAll("add documents");
  append("packages/auth/src/token.ts", "\n// uncommitted\n");
  ok("map", "update", "--root", sandbox);

  const { documents } = readState("manifest.json");
  assert.equal(documents["doc-charter"].verified_commit, first);
  const navigators = Object.entries(documents).filter(([id]) => id.startsWith("navigator-"));
  assert.ok(navigators.length > 0);
  for (const [id, document] of navigators) assert.equal(document.verified_commit, first, id);
  assert.equal(documents["doc-map"].verified_commit, second);
  assert.equal(documents["doc-guide"].verified_commit, second);
  assert.equal(documents["doc-guide"].verified_dirty, true);
  assert.equal(documents["doc-web"].verified_commit, second);
  assert.equal(documents["doc-web"].verified_dirty, false);
});
