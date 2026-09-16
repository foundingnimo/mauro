import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALIASES, MAURO_VERSION, PATHS, PUBLIC_COMMANDS } from "./lib/constants.mjs";
import { assertSafeRoot, exists, findProjectRoot, readJson, repoPath } from "./lib/fs.mjs";
import { gitChangedPaths, gitHead, gitMergeBase } from "./lib/git.mjs";
import { help } from "./lib/help.mjs";
import { checkRepository, statusSummary } from "./lib/check.mjs";
import { impact, knowledge, matchingNavigators, where, who, why } from "./lib/query.mjs";
import { renderPrContext } from "./lib/render.mjs";
import { nextSteps, renderNext } from "./lib/next.mjs";
import { confirmDocument, renderReview, reviewPackets } from "./lib/review.mjs";
import { assertBranchCurrent } from "./lib/freshness.mjs";
import { initialize, isInitialized, loadState, pluginRootFrom, updateMap } from "./lib/state.mjs";
import { runHook } from "./hook.mjs";
import { charterState, REQUIRED_CHARTER_HEADINGS, requireCharter } from "./lib/charter.mjs";
import { describeTool, listTools, runTool } from "./lib/toolbox.mjs";
import { dismissToolGap, exportToolGap, listToolGaps, recordToolGap, resolveToolGap, showToolGap } from "./lib/tool-gaps.mjs";
import { clearStaleProjectLock, projectLockStatus } from "./lib/lock.mjs";
import { abandonVoyage, activateVoyage, createVoyage, finishVoyage, getVoyage, listVoyages, resumeVoyage, summarizeVoyages } from "./lib/voyages.mjs";

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  args.splice(index, value && !value.startsWith("--") ? 2 : 1);
  return value || true;
}

function requiredOption(args, name) {
  const value = option(args, name);
  if (!value || value === true) throw new Error(`${name} requires a value.`);
  return value;
}

function repeatedOption(args, name) {
  const values = [];
  while (args.includes(name)) {
    const value = option(args, name);
    if (!value || value === true) throw new Error(`${name} requires a value.`);
    values.push(value);
  }
  return values;
}

function rejectArguments(args, usage) {
  if (args.length) throw new Error(`Usage: ${usage}`);
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
  output(`Bearing check: ${result}\nErrors: ${report.errors}\nWarnings: ${report.warnings}${report.information ? `\nInformation: ${report.information}` : ""}`);
  for (const item of report.findings) {
    output(`${item.level.toUpperCase()} ${item.code}: ${item.message}${item.path ? ` [${item.path}]` : ""}`);
  }
}

function requireValue(args, label) {
  const value = args.join(" ").trim();
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function charterCommand(root, action, args, json) {
  const path = repoPath(root, PATHS.charter);
  const charter = charterState(root);
  if (action === "show") return output(readFileSync(path, "utf8"));
  if (action === "validate") {
    // A Charter with every heading and no intent is not valid. The headings are
    // the template's, so validity means the prompts were replaced.
    const valid = charter.missing_headings.length === 0 && charter.state === "complete";
    output({ valid, state: charter.state, missing_headings: charter.missing_headings, template_sections: charter.template_sections, required_headings: REQUIRED_CHARTER_HEADINGS }, json);
    if (!valid) process.exitCode = 1;
    return;
  }
  if ((action === "create" || !action) && charter.state === "complete") {
    return output("The Charter is complete. Use `mauro charter update \"<change>\"` so the diff shows what changes. Do not overwrite human intent.");
  }
  if (action === "update" && charter.state === "template") {
    return output("The Charter still holds the template prompts. Use `mauro charter create` to draft it from the Map and the repository guides.");
  }
  const hint = charter.state === "partial" ? ` Sections still holding template prompts: ${charter.template_sections.join(", ")}.` : "";
  output(`Charter ${action || "create"} needs a Claude proposal. Show the draft and diff. Apply it only after user approval.${hint}`);
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
    return output({ outcome: "Map updated", files: result.map.files.length, units: result.map.units.length, stubs: result.map.scan_summary.stub_units, omitted_units: result.map.scan_summary.omitted_units, perimeter_regions: result.map.scan_summary.perimeter_regions, review_required_regions: result.map.scan_summary.review_required_regions, capabilities: result.map.capabilities.length, note: "Mauro preserved semantic capability decisions. A Map synthesizer must review new or removed units and flagged perimeter regions. Restart other open Claude Code sessions to load changed Navigator definitions." }, json);
  }
  if (action === "verify") {
    const report = checkRepository(root);
    printCheck(report, json);
    if (!report.ok) process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown map action: ${action}`);
}

function docsCommand(root, action, args, json) {
  if (action === "review") {
    assertBranchCurrent(root, { action: "review", allowBehind: Boolean(option(args, "--allow-behind")) });
    const result = reviewPackets(root, { id: args.join(" ").trim() || null });
    return output(json ? result : renderReview(result), json);
  }
  if (action === "confirm") {
    const evidence = option(args, "--evidence");
    const id = requireValue(args, "A document id");
    return output(confirmDocument(root, id, evidence === true ? null : evidence), json);
  }
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
    return output({ outcome: "Navigator views regenerated", requested: name, generated: Object.keys(result.manifest.navigators).length, note: "Mauro preserved semantic capability decisions. Restart other open Claude Code sessions to load the regenerated Navigator definitions." }, json);
  }
  output(`Navigator ${action} needs semantic review. Use the Map as evidence and regenerate only the affected view.`);
}

function toolCommand(root, action, args, json) {
  if (!action) return output(listTools(), json);
  if (action === "list") {
    if (args.length) throw new Error("Usage: mauro tool list");
    return output(listTools(), json);
  }
  if (action === "describe") {
    const name = args.shift();
    if (!name || args.length) throw new Error("Usage: mauro tool describe <name>");
    return output(describeTool(name), json);
  }
  if (action === "run") {
    const name = args.shift();
    if (!name) throw new Error("Usage: mauro tool run <name> [--option <value>]");
    return output(runTool(root, name, args), json);
  }
  if (action === "gaps") return toolGapCommand(root, "list", args, json);
  if (action === "gap") return toolGapCommand(root, args.shift() || "list", args, json);
  throw new Error(`Unknown tool action: ${action}`);
}

function toolGapCommand(root, action, args, json) {
  if (action === "list") {
    const status = option(args, "--status");
    if (status === true) throw new Error("--status requires a value.");
    rejectArguments(args, "mauro tool gap list [--status <status>]");
    return output(listToolGaps(root, status || "all"), json);
  }
  if (action === "show") {
    const id = args.shift();
    if (!id) throw new Error("Usage: mauro tool gap show <id>");
    rejectArguments(args, "mauro tool gap show <id>");
    return output(showToolGap(root, id), json);
  }
  if (action === "record") {
    const input = {
      key: requiredOption(args, "--key"),
      need: requiredOption(args, "--need"),
      existing_tools_checked: requiredOption(args, "--checked").split(",").map((item) => item.trim()).filter((item) => item && item !== "none"),
      fallback_kind: requiredOption(args, "--fallback"),
      fallback_summary: requiredOption(args, "--summary"),
      input_shape: requiredOption(args, "--input"),
      output_shape: requiredOption(args, "--output"),
      voyage: requiredOption(args, "--voyage"),
      reporter: option(args, "--reporter") || "mauro"
    };
    if (input.reporter === true) throw new Error("--reporter requires a value.");
    rejectArguments(args, "mauro tool gap record --key <key> --need <need> --checked <tools|none> --fallback <kind> --summary <summary> --input <shape> --output <shape> --voyage <id> [--reporter <name>]");
    return output(recordToolGap(root, input, listTools().map((tool) => tool.name)), json);
  }
  if (action === "dismiss") {
    const id = args.shift();
    if (!id) throw new Error("Usage: mauro tool gap dismiss <id> --reason <reason>");
    const reason = requiredOption(args, "--reason");
    rejectArguments(args, "mauro tool gap dismiss <id> --reason <reason>");
    return output(dismissToolGap(root, id, reason), json);
  }
  if (action === "resolve") {
    const id = args.shift();
    if (!id) throw new Error("Usage: mauro tool gap resolve <id> --tool <name> [--version <version>]");
    const name = requiredOption(args, "--tool");
    const requestedVersion = option(args, "--version");
    if (requestedVersion === true) throw new Error("--version requires a value.");
    rejectArguments(args, "mauro tool gap resolve <id> --tool <name> [--version <version>]");
    const descriptor = describeTool(name);
    if (requestedVersion && requestedVersion !== descriptor.version) {
      throw new Error(`${name} is installed at version ${descriptor.version}, not ${requestedVersion}.`);
    }
    return output(resolveToolGap(root, id, descriptor.name, descriptor.version), json);
  }
  if (action === "export") {
    const id = args.shift();
    if (!id) throw new Error("Usage: mauro tool gap export <id>");
    rejectArguments(args, "mauro tool gap export <id>");
    const result = exportToolGap(root, id);
    return output(json ? result : result.body, json);
  }
  throw new Error(`Unknown tool gap action: ${action}`);
}

function prCommand(root, action, args) {
  requireCharter(root, "Pull-request context");
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

// install.sh writes .install.json beside the runtime so a person can tell which
// checkout and commit an installation came from without diffing directories.
function installStamp(pluginRoot) {
  const path = resolve(pluginRoot, ".install.json");
  if (!exists(path)) return null;
  try { return readJson(path); } catch { return null; }
}

function doctor(root, pluginRoot, json, args = []) {
  const clearLock = option(args, "--clear-stale-lock");
  if (clearLock !== null && clearLock !== true) throw new Error("--clear-stale-lock does not take a value.");
  rejectArguments(args, "mauro doctor [--clear-stale-lock]");
  const lockCleanup = clearLock ? clearStaleProjectLock(root) : null;
  const files = [".claude-plugin/plugin.json", "skills/mauro/SKILL.md", "hooks/hooks.json", "bin/mauro", "scripts/lib/toolbox.mjs", "scripts/lib/tool-gaps.mjs", "scripts/lib/lock.mjs", "scripts/lib/voyages.mjs", "schemas/voyage.schema.json"];
  const installation = files.map((path) => ({ path, present: exists(resolve(pluginRoot, path)) }));
  const result = { version: MAURO_VERSION, install: installStamp(pluginRoot), tool: installation, project_initialized: isInitialized(root), lock_cleanup: lockCleanup, project_lock: projectLockStatus(root) };
  if (result.project_initialized) {
    const summary = statusSummary(root);
    result.charter = summary.charter;
    result.bearing = summary.bearing;
  }
  output(result, json);
  if (installation.some((item) => !item.present)) process.exitCode = 1;
}

function requireVoyageId(args, usage) {
  const id = args.shift();
  if (!id) throw new Error(`Usage: ${usage}`);
  return id;
}

function runCommand(root, action, args, json) {
  if (!action || action === "status") {
    const id = args.shift();
    rejectArguments(args, "mauro run status [voyage-id]");
    return output(id ? getVoyage(root, id) : { summary: summarizeVoyages(root), voyages: listVoyages(root) }, json);
  }
  if (action === "activate") {
    const id = requireVoyageId(args, "mauro run activate <voyage-id> [--path <path>]...");
    const paths = repeatedOption(args, "--path");
    rejectArguments(args, "mauro run activate <voyage-id> [--path <path>]...");
    return output({ outcome: "Voyage activated", voyage: activateVoyage(root, id, paths), note: "The approved path lease is active. Finish or abandon the Voyage to release it." }, json);
  }
  if (action === "resume") {
    const id = requireVoyageId(args, "mauro run resume <voyage-id>");
    rejectArguments(args, "mauro run resume <voyage-id>");
    return output({ outcome: "Voyage resumed", voyage: resumeVoyage(root, id) }, json);
  }
  if (action === "finish") {
    const id = requireVoyageId(args, "mauro run finish <voyage-id>");
    rejectArguments(args, "mauro run finish <voyage-id>");
    return output({ outcome: "Voyage completed and path lease released", voyage: finishVoyage(root, id) }, json);
  }
  if (action === "abandon") {
    const id = requireVoyageId(args, "mauro run abandon <voyage-id> --reason <reason>");
    const reason = requiredOption(args, "--reason");
    rejectArguments(args, "mauro run abandon <voyage-id> --reason <reason>");
    return output({ outcome: "Voyage abandoned and path lease released", voyage: abandonVoyage(root, id, reason) }, json);
  }

  const allowBehind = option(args, "--allow-behind");
  if (allowBehind !== null && allowBehind !== true) throw new Error("--allow-behind does not take a value.");
  const objective = [action, ...args].join(" ").trim();
  assertBranchCurrent(root, { action: "plan", allowBehind: Boolean(allowBehind) });
  const voyage = createVoyage(root, objective, { allowBehind: Boolean(allowBehind) });
  const report = checkRepository(root);
  return output({
    outcome: "Voyage created for planning",
    voyage,
    bearing: report.current ? "current" : "needs attention",
    charter: report.charter.state,
    required: report.charter.state === "complete"
      ? "Load the responsible Navigators and active knowledge before implementation."
      : "Load the responsible Navigators and active knowledge before implementation. The Charter is not complete, so state in the plan that no Charter constraint was checked.",
    next: [
      `Write the approved plan to ${voyage.plan_path}.`,
      voyage.proposed_paths.length
        ? `After plan approval, run \`mauro run activate ${voyage.id}\` or pass explicit --path values.`
        : `After plan approval, run \`mauro run activate ${voyage.id} --path <approved-path>\`.`
    ]
  }, json);
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = [...argv];
  const json = Boolean(option(args, "--json"));
  const rootOption = option(args, "--root");
  if (rootOption === true) throw new Error("--root requires a repository path.");
  let command = args.shift();
  if (command === "--help" || command === "-h") command = "help";
  if (command === "--version" || command === "-v" || command === "version") {
    const stamp = installStamp(pluginRootFrom(import.meta.url));
    return output(stamp ? `mauro ${MAURO_VERSION} (${stamp.commit || "no commit"}, installed ${stamp.installed_at || "unknown"} from ${stamp.source || "unknown"})` : `mauro ${MAURO_VERSION}`);
  }
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
  if (command === "doctor") return doctor(root, pluginRoot, json, args);
  if (command === "tool") return toolCommand(root, args.shift(), args, json);
  if (command === "init") {
    const result = initialize(root, pluginRoot);
    return output({ outcome: "Expedition scaffold created", root, files: result.map.files.length, units: result.map.units.length, stubs: result.map.scan_summary.stub_units, omitted_units: result.map.scan_summary.omitted_units, perimeter_regions: result.map.scan_summary.perimeter_regions, review_required_regions: result.map.scan_summary.review_required_regions, capabilities: result.map.capabilities.length, next: [
      "Review flagged perimeter regions.",
      "Run the Mauro mapper agents and approve the Map at the Map gate.",
      "Run `mauro charter create`. The Charter holds the template prompts until then.",
      "Run `mauro check`.",
      "Restart other open Claude Code sessions to load the generated project Navigators."
    ] }, json);
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
  if (command === "next") {
    const result = nextSteps(root);
    return output(json ? result : renderNext(result), json);
  }
  if (command === "map") return mapCommand(root, action, args, json);
  if (command === "docs") return docsCommand(root, action || "status", args, json);
  if (command === "charter") return charterCommand(root, action, args, json);
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
  if (command === "run") return runCommand(root, action, args, json);
  if (command === "refit") {
    requireCharter(root, "A Refit");
    return output("A Refit is a proposal. Compare the Map with the Charter. Show moves, dependency effects, migration steps, and rollback steps. Do not move code without approval.");
  }
}
