import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
  return spawnSync(process.execPath, [bin, ...args], { cwd: sandbox, encoding: "utf8" });
}

function ok(...args) {
  const result = run(...args);
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function readLog() {
  return JSON.parse(readFileSync(join(sandbox, ".mauro/tool-gaps.json"), "utf8"));
}

function record(voyage, reporter, checked = "dependency-graph", overrides = {}) {
  const values = {
    key: "dependency-cycle-detection",
    need: "Find cycles between mapped repository units.",
    fallback: "system-utility",
    summary: "Analyzed the exported dependency edges.",
    input: "Map dependency edges",
    output: "Ordered dependency cycles",
    ...overrides
  };
  return run(
    "tool", "gap", "record",
    "--key", values.key,
    "--need", values.need,
    "--checked", checked,
    "--fallback", values.fallback,
    "--summary", values.summary,
    "--input", values.input,
    "--output", values.output,
    "--voyage", voyage,
    "--reporter", reporter,
    "--root", sandbox,
    "--json"
  );
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "mauro-tool-gaps-"));
  cpSync(fixture, sandbox, { recursive: true });
  ok("init", "--root", sandbox);
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

test("init creates an empty Tool Gap Log", () => {
  assert.equal(existsSync(join(sandbox, ".mauro/tool-gaps.json")), true);
  assert.deepEqual(readLog(), { schema_version: 1, next_id: 1, gaps: [] });
  assert.deepEqual(JSON.parse(ok("tool", "gaps", "--root", sandbox, "--json").stdout), []);
});

test("recurring reports become a candidate without retry inflation", () => {
  let result = record("V-0012", "mauro-structure-mapper");
  assert.equal(result.status, 0, result.stderr);
  let payload = JSON.parse(result.stdout);
  assert.equal(payload.outcome, "created");
  assert.equal(payload.gap.id, "TG-0001");
  assert.equal(payload.gap.status, "observed");

  result = record("V-0012", "mauro-structure-mapper");
  assert.equal(result.status, 0, result.stderr);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.recorded, false);
  assert.equal(payload.outcome, "duplicate");
  assert.equal(payload.gap.occurrences, 1);

  assert.equal(record("V-0012", "mauro-capability-mapper").status, 0);
  result = record("V-0017", "mauro-structure-mapper");
  assert.equal(result.status, 0, result.stderr);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.outcome, "promoted");
  assert.equal(payload.gap.status, "candidate");
  assert.equal(payload.gap.occurrences, 3);
  assert.deepEqual(payload.gap.voyages, ["V-0012", "V-0017"]);

  const candidates = JSON.parse(ok("tool", "gap", "list", "--status", "candidate", "--root", sandbox, "--json").stdout);
  assert.deepEqual(candidates.map((gap) => gap.id), ["TG-0001"]);
  const status = JSON.parse(ok("status", "--root", sandbox, "--json").stdout);
  assert.equal(status.tool_gaps.candidates, 1);
  const next = ok("next", "--root", sandbox).stdout;
  assert.match(next, /\[tool candidate\] TG-0001/);
  assert.match(next, /mauro tool gap list --status candidate/);
});

test("a Tool Gap exports, resolves, reopens, and dismisses safely", () => {
  assert.equal(record("V-0012", "mauro-structure-mapper").status, 0);
  assert.equal(record("V-0012", "mauro-capability-mapper").status, 0);
  assert.equal(record("V-0017", "mauro-structure-mapper").status, 0);

  const exported = JSON.parse(ok("tool", "gap", "export", "TG-0001", "--root", sandbox, "--json").stdout);
  assert.match(exported.body, /# Toolbox candidate: dependency-cycle-detection/);
  assert.match(exported.body, /Occurrences: 3/);
  assert.equal(exported.body.includes(sandbox), false);

  let resolved = JSON.parse(ok("tool", "gap", "resolve", "TG-0001", "--tool", "dependency-graph", "--version", "1.0.0", "--root", sandbox, "--json").stdout);
  assert.equal(resolved.status, "resolved");
  assert.deepEqual(resolved.resolved_by.tool, "dependency-graph");

  let result = record("V-0020", "mauro-duplication-mapper", "none");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Check that tool before recording the gap again/);

  result = record("V-0020", "mauro-duplication-mapper", "dependency-graph");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, "reopened");
  assert.equal(JSON.parse(result.stdout).gap.status, "candidate");

  const dismissed = JSON.parse(ok("tool", "gap", "dismiss", "TG-0001", "--reason", "This operation is repository-specific.", "--root", sandbox, "--json").stdout);
  assert.equal(dismissed.status, "dismissed");
  const before = dismissed.occurrences;
  result = record("V-0021", "mauro-structure-mapper");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, "dismissed");
  assert.equal(readLog().gaps[0].occurrences, before);
  assert.equal(run("tool", "gap", "export", "TG-0001", "--root", sandbox).status, 1);
});

test("Tool Gap recording rejects unsafe or invalid reports", () => {
  let result = record("V-0012", "mauro-structure-mapper", "unknown-tool");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown registered tool/);

  result = record("V-0012", "mauro-structure-mapper", "none", { need: "Inspect /Users/example/private.txt." });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not contain an absolute path/);

  result = record("V-0012", "mauro-structure-mapper", "none", { fallback: "downloaded-script" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--fallback must be one of/);

  assert.equal(record("V-0012", "mauro-structure-mapper", "none").status, 0);
  result = record("V-0017", "mauro-capability-mapper", "none", { summary: "Used ~/private-helper.js." });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not contain an absolute path/);
  assert.equal(readLog().gaps[0].occurrences, 1);
});

test("an existing Mauro project creates a missing Log on first record", () => {
  rmSync(join(sandbox, ".mauro/tool-gaps.json"));
  assert.deepEqual(JSON.parse(ok("tool", "gaps", "--root", sandbox, "--json").stdout), []);
  const result = record("V-0001", "mauro");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(sandbox, ".mauro/tool-gaps.json")), true);
  assert.equal(readLog().gaps[0].id, "TG-0001");
});

test("specialist agents report structured gaps without writing the Log", () => {
  const agents = readdirSync(join(packageRoot, "agents")).filter((name) => name.endsWith(".md"));
  assert.equal(agents.length, 9);
  for (const name of agents) {
    const text = readFileSync(join(packageRoot, "agents", name), "utf8");
    assert.match(text, /`tool_gap` object/);
    assert.match(text, /Do not write\s+(?:`\.mauro\/tool-gaps\.json`|the Log)/i);
  }
});
