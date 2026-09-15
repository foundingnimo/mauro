import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { watchPathspec } from "../scripts/lib/fs.mjs";
import { verificationStamp } from "../scripts/lib/state.mjs";
import { gitDiffSince } from "../scripts/lib/git.mjs";

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

function reviewJson(...args) {
  return JSON.parse(ok("docs", "review", ...args, "--json", "--root", sandbox).stdout);
}

// A repository whose doc-guide was fingerprinted at a known, clean commit.
function guidedRepository() {
  git("init", "--quiet");
  commitAll("fixture");
  ok("init", "--root", sandbox);
  writeFileSync(join(sandbox, "docs/guide.md"), "# Guide\n\nTokens come from packages/auth/src/token.ts.\n");
  addDocument("doc-guide", { path: "docs/guide.md", watches: ["packages/auth/src"] });
  const base = commitAll("add guide");
  ok("map", "update", "--root", sandbox);
  commitAll("mauro state");
  return base;
}

test("docs review lists no document while every watch matches its fingerprint", () => {
  guidedRepository();
  assert.deepEqual(reviewJson().documents, []);
});

test("a changed watch yields a diff packet from the verified commit", () => {
  const base = guidedRepository();
  append("packages/auth/src/token.ts", "\n// rotated\n");
  commitAll("Rotate the token format");
  const [packet, ...rest] = reviewJson("doc-guide").documents;
  assert.deepEqual(rest, []);
  assert.equal(packet.mode, "diff");
  assert.equal(packet.base.commit, base);
  assert.equal(packet.base.reachable, true);
  assert.deepEqual(packet.changed_watches, ["packages/auth/src"]);
  assert.match(packet.diff, /^\+\/\/ rotated$/m);
  assert.equal(packet.diff_truncated, false);
  assert.deepEqual(packet.commits.map((commit) => commit.subject), ["Rotate the token format"]);
  assert.deepEqual(packet.untracked, []);
});

test("uncommitted and untracked changes are part of the packet", () => {
  guidedRepository();
  append("packages/auth/src/token.ts", "\n// not committed\n");
  writeFileSync(join(sandbox, "packages/auth/src/refresh.ts"), "export const refresh = true;\n");
  const [packet] = reviewJson("doc-guide").documents;
  assert.equal(packet.mode, "diff");
  assert.match(packet.diff, /^\+\/\/ not committed$/m);
  assert.deepEqual(packet.commits, []);
  assert.deepEqual(packet.untracked, ["packages/auth/src/refresh.ts"]);
});

test("a missing or unreachable verification commit asks for a full review", () => {
  guidedRepository();
  append("packages/auth/src/token.ts", "\n// rotated\n");
  const manifest = readState("manifest.json");
  manifest.documents["doc-guide"].verified_commit = "0123456789abcdef0123456789abcdef01234567";
  writeState("manifest.json", manifest);
  let [packet] = reviewJson("doc-guide").documents;
  assert.equal(packet.mode, "full");
  assert.equal(packet.base.reachable, false);
  assert.match(packet.reason, /is not in the history of HEAD/);
  assert.equal(packet.diff, null);

  delete manifest.documents["doc-guide"].verified_commit;
  writeState("manifest.json", manifest);
  [packet] = reviewJson("doc-guide").documents;
  assert.equal(packet.mode, "full");
  assert.match(packet.reason, /No verification commit is recorded/);
});

test("without Git every packet is a full review", () => {
  ok("init", "--root", sandbox);
  writeFileSync(join(sandbox, "docs/guide.md"), "# Guide\n");
  addDocument("doc-guide", { path: "docs/guide.md", watches: ["packages/auth/src"] });
  ok("map", "update", "--root", sandbox);
  append("packages/auth/src/token.ts", "\n// rotated\n");
  const [packet] = reviewJson("doc-guide").documents;
  assert.equal(packet.base.commit, null);
  assert.equal(packet.mode, "full");
  assert.match(packet.reason, /No verification commit is recorded/);
});

test("a declared suspect document is reviewed in full, and a historical one never", () => {
  guidedRepository();
  addDocument("doc-report", { path: "docs/guide.md", status: "historical", criticality: "historical", watches: ["packages/auth/src"] });
  const manifest = readState("manifest.json");
  manifest.documents["doc-guide"].status = "suspect";
  writeState("manifest.json", manifest);

  assert.deepEqual(reviewJson().documents.map((packet) => packet.id), ["doc-guide"]);
  const [packet] = reviewJson("doc-guide").documents;
  assert.equal(packet.mode, "full");
  assert.match(packet.reason, /declared suspect/);

  append("packages/auth/src/token.ts", "\n// rotated\n");
  const ids = reviewJson().documents.map((item) => item.id);
  assert.equal(ids.includes("doc-report"), false);
  assert.equal(ids.includes("doc-guide"), true);
});

test("docs review refuses an unknown document", () => {
  guidedRepository();
  const result = run("docs", "review", "doc-nope", "--root", sandbox);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown document: doc-nope/);
});

test("a large diff is cut at the byte limit and says so", () => {
  const base = guidedRepository();
  append("packages/auth/src/token.ts", `\n// ${"x".repeat(1000)}\n`);
  const diff = gitDiffSince(sandbox, base, ["packages/auth/src"], 64);
  assert.equal(diff.truncated, true);
  assert.ok(Buffer.byteLength(diff.text) <= 64);
});

test("the human rendering names each document and how it will be reviewed", () => {
  guidedRepository();
  append("packages/auth/src/token.ts", "\n// rotated\n");
  commitAll("Rotate the token format");
  const text = ok("docs", "review", "doc-guide", "--root", sandbox).stdout;
  assert.match(text, /^Documents to review: 1 \(HEAD [0-9a-f]{7}\)$/m);
  assert.match(text, /^- doc-guide \[informational\] docs\/guide\.md: diff since [0-9a-f]{7}, 1 changed watch, 1 commit$/m);
});

function chronicle(name = "2026-09-16-doc-guide.md") {
  const path = `docs/mauro/chronicles/reviews/${name}`;
  mkdirSync(join(sandbox, "docs/mauro/chronicles/reviews"), { recursive: true });
  writeFileSync(join(sandbox, path), "# Review of doc-guide\n\nVerdict: holds.\n");
  return path;
}

test("docs confirm refuses without evidence of a review", () => {
  guidedRepository();
  for (const [args, message] of [
    [[], /requires --evidence/],
    [["--evidence", "README.md"], /must be a file under docs\/mauro\/chronicles\//],
    [["--evidence", "docs/mauro/chronicles/../../../README.md"], /must be a file under docs\/mauro\/chronicles\//],
    [["--evidence", "docs/mauro/chronicles/reviews/missing.md"], /evidence file does not exist/]
  ]) {
    const result = run("docs", "confirm", "doc-guide", ...args, "--root", sandbox);
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, message);
  }
});

test("docs confirm refuses an unknown or historical document", () => {
  guidedRepository();
  const evidence = chronicle();
  addDocument("doc-report", { path: "docs/guide.md", status: "historical", criticality: "historical", watches: [] });
  let result = run("docs", "confirm", "doc-nope", "--evidence", evidence, "--root", sandbox);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown document: doc-nope/);
  result = run("docs", "confirm", "doc-report", "--evidence", evidence, "--root", sandbox);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is historical/);
});

test("a confirmed document is current again from its new commit", () => {
  guidedRepository();
  append("packages/auth/src/token.ts", "\n// rotated\n");
  const head = commitAll("Rotate the token format");
  const manifest = readState("manifest.json");
  manifest.documents["doc-guide"].status = "suspect";
  writeState("manifest.json", manifest);
  // Live control: before the confirmation the Bearing check flags the document.
  assert.match(ok("check", "--root", sandbox).stdout, /doc-guide is suspect because packages\/auth\/src changed/);

  const evidence = chronicle();
  const confirmed = JSON.parse(ok("docs", "confirm", "doc-guide", "--evidence", evidence, "--json", "--root", sandbox).stdout);
  assert.equal(confirmed.status, "current");
  assert.equal(confirmed.verified_commit, head);
  assert.equal(confirmed.verified_evidence, evidence);

  assert.doesNotMatch(ok("check", "--root", sandbox).stdout, /doc-guide/);
  assert.deepEqual(reviewJson("doc-guide").documents, []);
  const document = readState("manifest.json").documents["doc-guide"];
  assert.equal(document.verified_commit, head);
  assert.equal(document.verified_evidence, evidence);
});
