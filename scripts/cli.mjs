import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALIASES, PATHS, PUBLIC_COMMANDS } from "./lib/constants.mjs";
import { assertSafeRoot, exists, findProjectRoot, readJson, repoPath } from "./lib/fs.mjs";
import { gitChangedPaths, gitHead, gitMergeBase } from "./lib/git.mjs";
import { help } from "./lib/help.mjs";
import { checkRepository, statusSummary } from "./lib/check.mjs";
import { impact, knowledge, matchingNavigators, where, who, why } from "./lib/query.mjs";
import { renderPrContext } from "./lib/render.mjs";
import { initialize, isInitialized, loadState, pluginRootFrom, updateMap } from "./lib/state.mjs";
import { runHook } from "./hook.mjs";

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  args.splice(index, value && !value.startsWith("--") ? 2 : 1);
  return value || true;
}

function output(value, json = false) {
  if (typeof value === "string") process.stdout.write(value.endsWith("\n") ? value : `${value}\n`);
  else if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else process.stdout.write(`${format(value)}\n`);
}

function format(value, indent = "") {
  if (value === null || value === undefined) return `${indent}None`;
  if (Array.isArray(value)) {
    if (!value.length) return `${indent}None`;
    return value.map((item) => typeof item === "object" ? `${indent}-\n${format(item, `${indent}  `)}` : `${indent}- ${item}`).join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value).map(([key, item]) => {
      if (item && typeof item === "object") return `${indent}${key}:\n${format(item, `${indent}  `)}`;
      return `${indent}${key}: ${item}`;
    }).join("\n");
  }
  return `${indent}${value}`;
}

function printCheck(report, json) {
  if (json) return output({ ok: report.ok, current: report.current, errors: report.errors, warnings: report.warnings, findings: report.findings }, true);
  const result = report.ok ? (report.current ? "PASS" : "REVIEW") : "FAIL";
  output(`Bearing check: ${result}\nErrors: ${report.errors}\nWarnings: ${report.warnings}`);
  for (const item of report.findings) {
    output(`${item.level.toUpperCase()} ${item.code}: ${item.message}${item.path ? ` [${item.path}]` : ""}`);
  }
}

function requireValue(args, label) {
  const value = args.join(" ").trim();
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function charterCommand(root, action, args) {
  const path = repoPath(root, PATHS.charter);
  if (action === "show") return output(readFileSync(path, "utf8"));
  if (action === "validate") {
    const text = readFileSync(path, "utf8");
    const required = ["# Mauro Charter", "## Product purpose", "## Intended capability boundaries", "## Required architecture rules"];
    const missing = required.filter((heading) => !text.includes(heading));
    output({ valid: missing.length === 0, missing });
    if (missing.length) process.exitCode = 1;
    return;
  }
  output(`Charter ${action || "create"} needs a Claude proposal. Show the draft and diff. Apply it only after user approval.`);
}

function mapCommand(root, action, args, json) {
  if (!action || action === "show") {
    return output(readJson(repoPath(root, PATHS.map)), json);
  }
  if (action === "find") {
    const query = requireValue(args, "A capability query");
    return output(where(root, query).capabilities, json);
  }
  if (action === "update") {
    const result = updateMap(root);
    return output({ outcome: "Map updated", files: result.map.files.length, units: result.map.units.length, stubs: result.map.scan_summary.stub_units, omitted_units: result.map.scan_summary.omitted_units, capabilities: result.map.capabilities.length, note: "Mauro preserved semantic capability decisions. A Map synthesizer must review new or removed units." }, json);
  }
  if (action === "verify") {
    const report = checkRepository(root);
    printCheck(report, json);
    if (!report.ok) process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown map action: ${action}`);
}

function docsCommand(root, action, json) {
  const report = checkRepository(root);
  if (action === "check") {
    printCheck(report, json);
    if (!report.ok) process.exitCode = 1;
    return;
  }
  const documents = Object.entries(report.state.manifest.documents || {}).map(([id, document]) => ({
    id,
    path: document.path,
    declared_status: document.status,
    findings: report.findings.filter((item) => item.path === document.path).map((item) => item.code)
  }));
  output(documents, json);
}

function navigatorCommand(root, action, args, json) {
  const state = loadState(root);
  if (!action || action === "list") return output(state.manifest.navigators, json);
  if (action === "show") {
    const name = requireValue(args, "A Navigator name");
    const navigator = state.manifest.navigators[name];
    if (!navigator) throw new Error(`Unknown Navigator: ${name}`);
    return output({ name, ...navigator }, json);
  }
  if (action === "regenerate") {
    const name = args.join(" ").trim() || "all";
    if (name !== "all" && !state.manifest.navigators[name]) throw new Error(`Unknown Navigator: ${name}`);
    const result = updateMap(root);
    return output({ outcome: "Navigator views regenerated", requested: name, generated: Object.keys(result.manifest.navigators).length, note: "Mauro preserved semantic capability decisions." }, json);
  }
  output(`Navigator ${action} needs semantic review. Use the Map as evidence and regenerate only the affected view.`);
}

function prCommand(root, action, args) {
  const baseOption = option(args, "--base");
  const base = baseOption && baseOption !== true ? baseOption : gitMergeBase(root);
  const paths = [...new Set([...gitChangedPaths(root, base), ...gitChangedPaths(root)])].sort();
  const state = loadState(root);
  const navigators = paths.flatMap((path) => matchingNavigators(state, path));
  const report = checkRepository(root);
  if (action === "reviewers") return output([...new Set(navigators)].sort());
  const block = renderPrContext({ base, head: gitHead(root), paths, navigators, status: report.current ? "current" : "needs attention" });
  output(block);
  if (action === "update") output("The local tool does not write to the pull request. Claude must show the final block and use an authorized GitHub operation.");
  if (action === "check" && !report.ok) process.exitCode = 1;
}

function doctor(root, pluginRoot, json) {
  const files = [".claude-plugin/plugin.json", "skills/mauro/SKILL.md", "hooks/hooks.json", "bin/mauro"];
  const installation = files.map((path) => ({ path, present: exists(resolve(pluginRoot, path)) }));
  const result = { tool: installation, project_initialized: isInitialized(root) };
  if (result.project_initialized) result.bearing = statusSummary(root).bearing;
  output(result, json);
  if (installation.some((item) => !item.present)) process.exitCode = 1;
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = [...argv];
  const json = Boolean(option(args, "--json"));
  const rootOption = option(args, "--root");
  if (rootOption === true) throw new Error("--root requires a repository path.");
  let command = args.shift();
  if (command === "--help" || command === "-h") command = "help";
  command = ALIASES[command] || command || "help";
  if (args.includes("--help")) return output(help(command));
  if (command === "help") return output(help(ALIASES[args[0]] || args[0]));
  if (!PUBLIC_COMMANDS.includes(command) && command !== "hook") {
    process.exitCode = 1;
    return output(`Unknown command: ${command}\n\n${help()}`);
  }
  if (command === "hook") return runHook(args[0], rootOption && rootOption !== true ? resolve(rootOption) : process.cwd());

  const root = assertSafeRoot(rootOption && rootOption !== true ? resolve(rootOption) : findProjectRoot());
  const pluginRoot = pluginRootFrom(import.meta.url);
  if (command === "init" && root === pluginRoot && !rootOption) {
    throw new Error("Refusing to initialize the Mauro source repository implicitly. Pass --root explicitly to confirm this target.");
  }
  if (command === "doctor") return doctor(root, pluginRoot, json);
  if (command === "init") {
    const result = initialize(root, pluginRoot);
    return output({ outcome: "Expedition scaffold created", root, files: result.map.files.length, units: result.map.units.length, stubs: result.map.scan_summary.stub_units, omitted_units: result.map.scan_summary.omitted_units, capabilities: result.map.capabilities.length, next: "Run the Mauro mapper agents, then review the Map and Charter." }, json);
  }
  if (!isInitialized(root)) throw new Error("Mauro is not initialized. Run `mauro init`.");

  const action = args.shift();
  if (command === "status") return output(statusSummary(root), json);
  if (command === "check") {
    const report = checkRepository(root);
    printCheck(report, json);
    if (!report.ok || (report.warnings && report.state.config.mode === "enforce")) process.exitCode = 1;
    return;
  }
  if (command === "map") return mapCommand(root, action, args, json);
  if (command === "docs") return docsCommand(root, action || "status", json);
  if (command === "charter") return charterCommand(root, action, args);
  if (command === "navigator") return navigatorCommand(root, action, args, json);
  if (command === "where") return output(where(root, requireValue([action, ...args].filter(Boolean), "A concept")), json);
  if (command === "who") return output(who(root, requireValue([action, ...args].filter(Boolean), "A repository path")), json);
  if (command === "why") return output(why(root, requireValue([action, ...args].filter(Boolean), "A target")), json);
  if (command === "impact") return output(impact(root, requireValue([action, ...args].filter(Boolean), "A proposed change")), json);
  if (command === "knowledge") {
    const result = knowledge(root, action || "list", args.join(" "));
    output(result, json);
    if (["propose", "verify", "update", "retire"].includes(action)) output("This operation needs a Claude proposal and context verification. The deterministic tool made no change.");
    return;
  }
  if (command === "pr") return prCommand(root, action || "preview", args);
  if (command === "run") {
    const report = checkRepository(root);
    return output({ voyage: [action, ...args].filter(Boolean).join(" ") || "status", bearing: report.current ? "current" : "needs attention", required: "Load the responsible Navigators and active knowledge before implementation." }, json);
  }
  if (command === "refit") return output("A Refit is a proposal. Compare the Map with the Charter. Show moves, dependency effects, migration steps, and rollback steps. Do not move code without approval.");
}
