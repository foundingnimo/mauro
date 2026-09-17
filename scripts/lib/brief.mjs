import { readFileSync } from "node:fs";
import { checkRepository } from "./check.mjs";
import { PATHS } from "./constants.mjs";
import { repoPath } from "./fs.mjs";
import { impact, pathMatches } from "./query.mjs";
import { navigatorIdentity } from "./render.mjs";
import { listVoyages, voyagePathsOverlap } from "./voyages.mjs";

function overlaps(left, right) {
  try { return voyagePathsOverlap(left, right); } catch { return false; }
}

function capabilityUnits(state, capabilities) {
  const ids = new Set(capabilities.flatMap((capability) => capability.units || []));
  for (const unit of state.map.units || []) {
    const root = unit.root === "." ? "**" : `${unit.root}/**`;
    if (capabilities.some((capability) => (capability.primary_paths || []).some((path) => overlaps(path, root)))) ids.add(unit.id);
  }
  return ids;
}

export function buildBrief(root, objective) {
  const report = checkRepository(root);
  const state = report.state;
  const predicted = impact(root, objective);
  const capabilities = predicted.capabilities;
  const paths = [...new Set(capabilities.flatMap((capability) => capability.primary_paths || []))].sort();
  const responsibleIds = new Set(predicted.navigators);
  const reviewingIds = new Set(capabilities.flatMap((capability) => capability.review || []).map((review) => {
    if (state.manifest.navigators?.[review.navigator]) return review.navigator;
    const reviewedCapability = state.map.capabilities.find((candidate) => candidate.id === review.navigator || candidate.name === review.navigator);
    return reviewedCapability ? navigatorIdentity(reviewedCapability) : review.navigator;
  }).filter((id) => state.manifest.navigators?.[id]));
  const navigatorIds = [...new Set([...responsibleIds, ...reviewingIds])].sort();
  const unitIds = capabilityUnits(state, capabilities);
  const dependencies = (state.map.dependencies || [])
    .filter((edge) => unitIds.has(edge.from) || unitIds.has(edge.to));
  const knowledge = Object.entries(state.manifest.knowledge || {})
    .filter(([, record]) => paths.some((path) => (record.paths || []).some((recordPath) => overlaps(path, recordPath))))
    .map(([id, record]) => ({ id, source: record.source, status: record.status, paths: record.paths || [] }));
  const documents = Object.entries(state.manifest.documents || {})
    .filter(([, document]) => paths.some((path) => (document.watches || []).some((watch) => overlaps(path, watch))))
    .map(([id, document]) => ({
      id,
      path: document.path,
      status: document.status,
      criticality: document.criticality,
      findings: report.findings.filter((finding) => finding.path === document.path).map((finding) => finding.code)
    }));
  const activeVoyages = listVoyages(root, { openOnly: true }).filter((voyage) => voyage.status === "active");
  const conflicts = activeVoyages
    .filter((voyage) => paths.some((path) => voyage.leased_paths.some((lease) => overlaps(path, lease))))
    .map((voyage) => ({ id: voyage.id, objective: voyage.objective, leased_paths: voyage.leased_paths }));
  const verification = [...new Set(capabilities.flatMap((capability) => capability.verification || []))];
  const decisions = [];
  const canonicalFinding = report.findings.find((finding) => finding.code.startsWith("canonical-") && finding.level === "error");
  if (canonicalFinding) decisions.push(canonicalFinding.message);
  if (report.charter.state !== "complete") decisions.push(`The Charter is ${report.charter.state}; do not claim an approved intent constraint.`);
  if (capabilities.some((capability) => capability.approved !== true)) decisions.push("One or more predicted capability boundaries are preliminary and need verification.");
  if (documents.some((document) => document.findings.length || document.status === "suspect" || document.status === "stale")) decisions.push("Review the affected suspect or stale documents before relying on them.");
  if (conflicts.length) decisions.push("Resolve the active Voyage path overlap before implementation.");
  if (!capabilities.length) decisions.push("Lexical impact prediction found no capability. Ask the repository mapper or inspect the Map before implementation.");
  let charterText = null;
  try { charterText = readFileSync(repoPath(root, PATHS.charter), "utf8"); } catch {}
  const charterLimit = 12000;

  return {
    objective,
    publication: report.publication,
    git: report.canonical,
    bearing: {
      current: report.current,
      errors: report.errors,
      warnings: report.warnings,
      relevant_findings: report.findings.filter((finding) => !finding.path || paths.some((path) => pathMatches(path, finding.path)))
    },
    charter: {
      state: report.charter.state,
      path: PATHS.charter,
      text: charterText && charterText.length > charterLimit ? charterText.slice(0, charterLimit) : charterText,
      truncated: Boolean(charterText && charterText.length > charterLimit)
    },
    likely_paths: paths,
    capabilities: capabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      purpose: capability.purpose,
      confidence: capability.confidence,
      approved: capability.approved === true,
      primary_paths: capability.primary_paths,
      evidence: capability.evidence
    })),
    navigators: navigatorIds.map((id) => ({
      id,
      role: responsibleIds.has(id) && reviewingIds.has(id) ? "responsible-and-reviewing" : responsibleIds.has(id) ? "responsible" : "reviewing",
      ...state.manifest.navigators[id]
    })),
    knowledge,
    documents,
    dependencies,
    verification,
    active_voyage_conflicts: conflicts,
    required_human_decisions: decisions,
    note: "Impact selection is lexical. A Navigator must verify semantic scope before implementation."
  };
}

function lines(items, render, empty = "- None") {
  return items.length ? items.map((item) => `- ${render(item)}`) : [empty];
}

export function renderBrief(brief) {
  const output = [
    `Mauro brief: ${brief.objective}`,
    "",
    `Map publication: ${brief.publication.state} (${brief.publication.map}; Bearing ${brief.publication.bearing})`,
    `Bearing: ${brief.bearing.current ? "current" : "needs attention"} (${brief.bearing.errors} error(s), ${brief.bearing.warnings} warning(s))`,
    `Canonical branch: ${brief.git.ref || "unpinned"} (${brief.git.relationship})`,
    `Charter: ${brief.charter.state} (${brief.charter.path})`,
    "",
    "Likely paths:",
    ...lines(brief.likely_paths, (path) => path),
    "",
    "Navigators:",
    ...lines(brief.navigators, (navigator) => `${navigator.id}: ${navigator.role} (${navigator.source})`),
    "",
    "Knowledge:",
    ...lines(brief.knowledge, (record) => `${record.id}: ${record.status} (${record.source})`),
    "",
    "Documents:",
    ...lines(brief.documents, (document) => `${document.id}: ${document.status}${document.findings.length ? ` [${document.findings.join(", ")}]` : ""} (${document.path})`),
    "",
    "Verification:",
    ...lines(brief.verification, (command) => command),
    "",
    "Required decisions:",
    ...lines(brief.required_human_decisions, (decision) => decision),
    "",
    brief.note
  ];
  return `${output.join("\n")}\n`;
}
