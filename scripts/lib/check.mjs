import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { MAURO_VERSION, PATHS, SCHEMA_VERSION } from "./constants.mjs";
import { exists, fingerprintPath, repoPath, walkFiles } from "./fs.mjs";
import { charterMessage, charterState } from "./charter.mjs";
import { createGitignoredPolicy, fingerprintExcludes, fingerprintOptions } from "./policy.mjs";
import { loadState } from "./state.mjs";
import { summarizeToolGaps } from "./tool-gaps.mjs";
import { summarizeVoyages } from "./voyages.mjs";

const TEXT_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".go", ".h", ".hpp", ".java", ".js",
  ".jsx", ".kt", ".mjs", ".php", ".py", ".rb", ".rs", ".sh", ".sql",
  ".swift", ".ts", ".tsx", ".vue"
]);

function finding(level, code, message, path = null) {
  return { level, code, message, path };
}

function driftLevel(criticality) {
  return criticality === "binding" ? "error" : "warning";
}

function validateRelativePath(root, path, findings, code) {
  try {
    repoPath(root, path);
    return true;
  } catch (error) {
    findings.push(finding("error", code, error.message, path));
    return false;
  }
}

// Which watched paths of each document no longer match their fingerprints.
// The Bearing check reports these, and `mauro docs review` builds its packets
// from the same answer, so the two can never disagree.
export function documentDrift(root, state) {
  const ignoredPolicy = createGitignoredPolicy(root, state.config);
  const options = fingerprintOptions(state.config, state.map, root, ignoredPolicy);
  const drift = {};
  for (const [id, document] of Object.entries(state.manifest.documents || {})) {
    const entry = { changed: [], unfingerprinted: [], invalid: [] };
    // A historical document records past state, such as a dated status report
    // for people. Changed evidence cannot make it wrong, so it is never suspect.
    const historical = document.status === "historical" || document.criticality === "historical";
    for (const watched of historical ? [] : document.watches || []) {
      try {
        repoPath(root, watched);
      } catch (error) {
        entry.invalid.push({ path: watched, message: error.message });
        continue;
      }
      const expected = state.fingerprints.documents?.[id]?.[watched];
      const actual = fingerprintPath(root, watched, fingerprintExcludes(state.config, state.map, watched, ignoredPolicy), options);
      if (!expected) entry.unfingerprinted.push(watched);
      else if (actual !== expected) entry.changed.push(watched);
    }
    drift[id] = entry;
  }
  return drift;
}

export function checkRepository(root) {
  const state = loadState(root);
  const findings = [];
  const ignoredPolicy = createGitignoredPolicy(root, state.config);
  const fingerprintOpts = fingerprintOptions(state.config, state.map, root, ignoredPolicy);
  const fingerprintExclusionPatterns = (watched = ".") => fingerprintExcludes(state.config, state.map, watched, ignoredPolicy);
  if (state.map.schema_version !== SCHEMA_VERSION) {
    findings.push(finding("error", "map-schema", `Map schema ${state.map.schema_version} is not supported.`));
  }
  // A patch release changes no Map shape, so only a major or minor difference
  // asks for a Map update. The exact version still shows in `status`.
  const minor = (version) => String(version || "").split(".").slice(0, 2).join(".");
  if (minor(state.map.mauro_version) !== minor(MAURO_VERSION)) {
    findings.push(finding("warning", "map-version", `Map version ${state.map.mauro_version} differs from tool version ${MAURO_VERSION}. Run \`mauro map update\`.`));
  }
  if (state.manifest.schema_version !== SCHEMA_VERSION || state.fingerprints.schema_version !== SCHEMA_VERSION) {
    findings.push(finding("error", "state-schema", "A Mauro state file has an unsupported schema."));
  }
  for (const capability of state.map.capabilities || []) {
    if (capability.approved !== true) {
      findings.push(finding("information", "capability-preliminary", `${capability.id} needs human boundary review.`));
    }
  }

  const drift = documentDrift(root, state);
  for (const [id, document] of Object.entries(state.manifest.documents || {})) {
    if (!validateRelativePath(root, document.path, findings, "document-path")) continue;
    if (!exists(repoPath(root, document.path))) {
      findings.push(finding(driftLevel(document.criticality), "document-missing", `${id} is missing.`, document.path));
    }
    if (document.status === "suspect" || document.status === "stale") {
      findings.push(finding(driftLevel(document.criticality), `document-${document.status}`, `${id} is declared ${document.status}.`, document.path));
    }
    const entry = drift[id];
    for (const invalid of entry.invalid) findings.push(finding("error", "watch-path", invalid.message, invalid.path));
    for (const watched of entry.unfingerprinted) findings.push(finding("warning", "fingerprint-missing", `${id} has no fingerprint for ${watched}.`, document.path));
    for (const watched of entry.changed) findings.push(finding(driftLevel(document.criticality), "document-suspect", `${id} is suspect because ${watched} changed.`, document.path));
  }

  for (const [id, record] of Object.entries(state.manifest.knowledge || {})) {
    if (!validateRelativePath(root, record.source, findings, "knowledge-path")) continue;
    if (!exists(repoPath(root, record.source))) {
      findings.push(finding(record.status === "active" ? "error" : "warning", "knowledge-missing", `${id} has no source record.`, record.source));
    }
    if (record.status === "suspect" || record.status === "stale") {
      findings.push(finding("warning", `knowledge-${record.status}`, `${id} is declared ${record.status}.`, record.source));
    }
    for (const watched of record.paths || []) {
      if (!validateRelativePath(root, watched, findings, "knowledge-watch")) continue;
      const expected = state.fingerprints.records?.[id]?.[watched];
      const actual = fingerprintPath(root, watched, fingerprintExclusionPatterns(watched), fingerprintOpts);
      if (!expected || actual !== expected) {
        const level = record.status === "active" ? "warning" : "information";
        findings.push(finding(level, "knowledge-suspect", `${id} needs verification because ${watched} changed.`, record.source));
      }
    }
    if (record.status === "active" && !record.generated_rule) {
      findings.push(finding("error", "rule-unregistered", `${id} is active but has no generated Claude rule.`, record.source));
    } else if (record.generated_rule && !exists(repoPath(root, record.generated_rule))) {
      findings.push(finding("warning", "rule-missing", `${id} has no generated Claude rule.`, record.generated_rule));
    } else if (["stale", "superseded", "retired"].includes(record.status) && record.generated_rule) {
      findings.push(finding("warning", "rule-exposes-inactive-knowledge", `${id} is ${record.status}, but its generated rule is still registered.`, record.generated_rule));
    }
  }

  for (const [id, navigator] of Object.entries(state.manifest.navigators || {})) {
    for (const [kind, path] of [["source", navigator.source], ["agent", navigator.generated_agent], ["rule", navigator.generated_rule]]) {
      if (!validateRelativePath(root, path, findings, "navigator-path")) continue;
      if (!exists(repoPath(root, path))) {
        findings.push(finding("warning", "navigator-missing", `${id} has no ${kind} file.`, path));
      }
    }
  }

  const known = new Set(Object.entries(state.manifest.knowledge || {}).filter(([, record]) => record.status === "active").map(([id]) => id));
  for (const path of walkFiles(root, fingerprintExclusionPatterns(), fingerprintOpts)) {
    if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) continue;
    const absolute = repoPath(root, path);
    let text;
    try {
      if (statSync(absolute).size > 2 * 1024 * 1024) continue;
      text = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    for (const match of text.matchAll(/MAURO\[(K-\d{4,})\]/g)) {
      if (!known.has(match[1])) {
        findings.push(finding("warning", "marker-unresolved", `${match[1]} does not resolve to an active manifest record.`, path));
      }
    }
  }

  // The Charter is intent, not evidence, so its state never makes the Bearing
  // stale. It is reported as information so nobody mistakes a template for intent.
  const charter = charterState(root);
  const charterNote = charterMessage(charter);
  if (charterNote) findings.push(finding(charter.state === "missing" ? "error" : "information", `charter-${charter.state}`, charterNote, charter.path));
  const errors = findings.filter((item) => item.level === "error").length;
  const warnings = findings.filter((item) => item.level === "warning").length;
  const information = findings.filter((item) => item.level === "information").length;
  return { ok: errors === 0, current: errors === 0 && warnings === 0, errors, warnings, information, charter, findings, state };
}

export function statusSummary(root) {
  const report = checkRepository(root);
  const { state } = report;
  const knowledge = Object.values(state.manifest.knowledge || {});
  return {
    initialized: true,
    mode: state.config.mode,
    baseline: state.map.baseline,
    files: state.map.files.length,
    units: state.map.units.length,
    scan: state.map.scan_summary,
    capabilities: state.map.capabilities.length,
    approved_capabilities: state.map.capabilities.filter((item) => item.approved === true).length,
    preliminary_capabilities: state.map.capabilities.filter((item) => item.approved !== true).length,
    navigators: Object.keys(state.manifest.navigators || {}).length,
    knowledge: {
      total: knowledge.length,
      active: knowledge.filter((item) => item.status === "active").length,
      suspect: knowledge.filter((item) => item.status === "suspect").length,
      stale: knowledge.filter((item) => item.status === "stale").length
    },
    tool_gaps: summarizeToolGaps(state.tool_gaps),
    voyages: summarizeVoyages(root),
    charter: report.charter.state,
    bearing: { ok: report.ok, current: report.current, errors: report.errors, warnings: report.warnings }
  };
}
