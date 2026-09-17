import { readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFEST_SCHEMA_VERSION, PATHS, SCHEMA_VERSION } from "./constants.mjs";
import { copyTextIfMissing, ensureDir, exists, fingerprintPath, readJson, repoPath, sha256Buffer, watchPathspec, writeJson, writeText } from "./fs.mjs";
import { gitChangedPaths, gitHead } from "./git.mjs";
import { scanRepository } from "./inventory.mjs";
import { createGitignoredPolicy, documentFingerprintPolicy, fingerprintExcludes, fingerprintOptions, validateConfig } from "./policy.mjs";
import { navigatorIdentity, renderAgentSkill, renderClaudeAgent, renderClaudeRule, renderMap, renderNavigatorBrief, slug } from "./render.mjs";
import { loadToolGapLog } from "./tool-gaps.mjs";
import { withProjectLock } from "./lock.mjs";
import { assertCanonicalPinned, canonicalRefStatus } from "./freshness.mjs";

export function isInitialized(root) {
  return exists(repoPath(root, PATHS.config)) && exists(repoPath(root, PATHS.map));
}

export function loadState(root) {
  if (!isInitialized(root)) throw new Error("Mauro is not initialized. Run `mauro init`.");
  return {
    config: validateConfig(readJson(repoPath(root, PATHS.config))),
    map: readJson(repoPath(root, PATHS.map)),
    manifest: readJson(repoPath(root, PATHS.manifest)),
    fingerprints: readJson(repoPath(root, PATHS.fingerprints)),
    tool_gaps: loadToolGapLog(root)
  };
}

export function repositoryMigrationStatus(root) {
  if (!isInitialized(root)) return { required: false, supported: true, initialized: false, manifest_from: null, manifest_to: MANIFEST_SCHEMA_VERSION, reasons: [] };
  let manifest;
  let map;
  try { manifest = readJson(repoPath(root, PATHS.manifest)); } catch {
    return { required: false, supported: false, initialized: true, manifest_from: null, manifest_to: MANIFEST_SCHEMA_VERSION, reasons: ["manifest-unreadable"] };
  }
  try { map = readJson(repoPath(root, PATHS.map)); } catch {
    return { required: false, supported: false, initialized: true, manifest_from: manifest.schema_version ?? null, manifest_to: MANIFEST_SCHEMA_VERSION, reasons: ["map-unreadable"] };
  }
  const from = manifest.schema_version;
  if (!Number.isInteger(from) || from < 1 || from > MANIFEST_SCHEMA_VERSION) {
    return {
      required: false,
      supported: false,
      initialized: true,
      manifest_from: from ?? null,
      manifest_to: MANIFEST_SCHEMA_VERSION,
      reasons: ["unsupported-manifest-schema"]
    };
  }
  const reasons = [];
  if (from < MANIFEST_SCHEMA_VERSION) reasons.push("manifest-schema");
  if (Object.values(manifest.navigators || {}).some((navigator) => !navigator.generated_skill)) reasons.push("portable-navigator-views");
  if (!Array.isArray(map.instruction_contracts)) reasons.push("instruction-contracts");
  return {
    required: reasons.length > 0,
    supported: true,
    initialized: true,
    manifest_from: from,
    manifest_to: MANIFEST_SCHEMA_VERSION,
    reasons
  };
}

function template(pluginRoot, name) {
  return join(pluginRoot, "templates", name);
}

function makeDocument(path, criticality, watches, knowledge = []) {
  return { path, status: "current", criticality, watches, knowledge };
}

function makeInstructionDocument(contract, previous = null) {
  return {
    ...(previous || {}),
    path: contract.path,
    status: previous?.status || "current",
    criticality: "binding",
    watches: [contract.path],
    knowledge: previous?.knowledge || [],
    kind: "instruction-contract",
    ownership: "human",
    instruction_kind: contract.kind,
    providers: contract.providers,
    scope: contract.scope,
    parent: contract.parent,
    precedence: contract.precedence
  };
}

function isMauroManagedPath(path) {
  const value = String(path || "").replace(/\/$/, "");
  return value === PATHS.state || value.startsWith(`${PATHS.state}/`)
    || value === PATHS.docs || value.startsWith(`${PATHS.docs}/`)
    || value === ".claude" || value.startsWith(".claude/")
    || value === ".agents" || value.startsWith(".agents/");
}

function relevantChangedPaths(paths) {
  return [...new Set((paths || [])
    .map((path) => String(path).replace(/\/$/, ""))
    .filter((path) => path && !path.startsWith("../") && !isMauroManagedPath(path)))]
    .sort();
}

function changedPathSignature(root, paths) {
  const evidence = relevantChangedPaths(paths).map((path) => {
    try {
      return [path, fingerprintPath(root, path, [], { maxFileSize: 2 * 1024 * 1024 })];
    } catch {
      return [path, "unreadable"];
    }
  });
  return sha256Buffer(Buffer.from(JSON.stringify(evidence)));
}

function reconciliationState(root, config, observedPaths = gitChangedPaths(root)) {
  const paths = relevantChangedPaths(observedPaths);
  const canonical = canonicalRefStatus(root, config);
  return {
    schema_version: SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
    observed_paths: paths,
    git_signature: changedPathSignature(root, paths),
    head_commit: canonical.head || null,
    canonical_ref: canonical.ref || null,
    canonical_commit: canonical.canonical_commit || null,
    canonical_relationship: canonical.relationship
  };
}

function reconciliationReasons(previous, current) {
  if (!previous || !("head_commit" in previous) || !("canonical_ref" in previous) || !("canonical_commit" in previous)) {
    return ["reconciliation-metadata"];
  }
  const reasons = [];
  if (previous.git_signature !== current.git_signature) reasons.push("working-tree");
  if (previous.head_commit !== current.head_commit) reasons.push("head-commit");
  if (previous.canonical_ref !== current.canonical_ref) reasons.push("canonical-ref");
  if (previous.canonical_commit !== current.canonical_commit) reasons.push("canonical-commit");
  return reasons;
}

function readReconciliation(root) {
  try { return readJson(repoPath(root, PATHS.reconciliation)); } catch { return null; }
}

export function repositoryReconciliationStatus(root, config, observedPaths = gitChangedPaths(root)) {
  const previous = readReconciliation(root);
  const current = reconciliationState(root, config, observedPaths);
  const reasons = reconciliationReasons(previous, current);
  return {
    required: reasons.length > 0,
    reasons,
    previous: previous ? {
      head_commit: previous.head_commit || null,
      canonical_ref: previous.canonical_ref || null,
      canonical_commit: previous.canonical_commit || null
    } : null,
    current: {
      head_commit: current.head_commit,
      canonical_ref: current.canonical_ref,
      canonical_commit: current.canonical_commit
    }
  };
}

function markReconciled(root, config, scanStarted = null) {
  const current = reconciliationState(root, config);
  const pendingReasons = scanStarted ? reconciliationReasons(scanStarted, current) : [];
  const changedDuringScan = pendingReasons.length > 0;
  writeJson(repoPath(root, PATHS.changes), {
    schema_version: SCHEMA_VERSION,
    paths: changedDuringScan ? current.observed_paths : []
  });
  // Keep the pre-scan observation when Git changes during the scan. The next
  // reconciliation must see a clean-commit or canonical-ref change even when
  // there are no dirty paths to put in the queue.
  writeJson(repoPath(root, PATHS.reconciliation), changedDuringScan ? scanStarted : current);
  return { complete: !changedDuringScan, pending_paths: changedDuringScan ? current.observed_paths : [], pending_reasons: pendingReasons };
}

export const VERIFICATION_FIELDS = Object.freeze(["verified_commit", "verified_at", "verified_dirty", "verified_evidence"]);

// Read once per operation: a map update stamps many documents from one HEAD.
export function verificationContext(root) {
  return { commit: gitHead(root), changed: gitChangedPaths(root) };
}

// The commit a document's fingerprints describe. A fingerprint says only that a
// watched path changed; a review diffs from this commit to see what changed.
// `verified_dirty` warns that the diff can include edits that were already
// there when the fingerprint was taken.
export function verificationStamp(watches = [], context) {
  const specs = watches.map(watchPathspec);
  const touches = (path) => {
    const changed = path.replace(/\/$/, "");
    return specs.some((spec) => spec === "." || changed === spec || changed.startsWith(`${spec}/`) || spec.startsWith(`${changed}/`));
  };
  return {
    verified_commit: context.commit || null,
    verified_at: new Date().toISOString(),
    verified_dirty: Boolean(context.commit) && context.changed.some(touches),
    verified_evidence: null
  };
}

function carryVerification(target, previous) {
  for (const field of VERIFICATION_FIELDS) {
    if (previous && previous[field] !== undefined) target[field] = previous[field];
  }
}

function removeGeneratedView(root, path, prefix, requiredNamePrefix = "") {
  if (!path || !path.startsWith(`${prefix}/`) || !path.endsWith(".md")) return;
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (requiredNamePrefix && !name.startsWith(requiredNamePrefix)) return;
  const absolute = repoPath(root, path);
  if (!exists(absolute)) return;
  const text = readFileSync(absolute, "utf8");
  if (!text.includes("Generated by Mauro")) return;
  unlinkSync(absolute);
}

function removeGeneratedSkill(root, path) {
  removeGeneratedView(root, path, PATHS.agentSkills);
  if (!path?.startsWith(`${PATHS.agentSkills}/`) || !path.endsWith("/SKILL.md")) return;
  try { rmdirSync(dirname(repoPath(root, path))); } catch {}
}

function rebuildViews(root, map, previousManifest = null) {
  const preservedDocuments = Object.fromEntries(
    Object.entries(previousManifest?.documents || {}).filter(([id, document]) => {
      if (id === "doc-map" || id === "doc-charter" || id.startsWith("navigator-")) return false;
      if (document.kind !== "instruction-contract") return true;
      // Keep a deleted contract visible until a person resolves it. If the
      // file still exists but the configured patterns no longer select it,
      // the explicit policy change retires the generated registration.
      try { return !exists(repoPath(root, document.path)); } catch { return true; }
    })
  );
  const manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    knowledge: previousManifest?.knowledge || {},
    documents: preservedDocuments,
    navigators: {}
  };
  const watchRoots = [...new Set([".", ...map.units.flatMap((unit) => unit.scope === "stub" ? (unit.manifests || [unit.manifest]).filter(Boolean) : [unit.root])])];
  manifest.documents["doc-map"] = makeDocument(PATHS.mapDocument, "informational", watchRoots);
  manifest.documents["doc-charter"] = previousManifest?.documents?.["doc-charter"] || makeDocument(PATHS.charter, "binding", []);
  for (const contract of map.instruction_contracts || []) {
    manifest.documents[contract.id] = makeInstructionDocument(contract, previousManifest?.documents?.[contract.id]);
  }

  writeText(repoPath(root, PATHS.mapDocument), renderMap(map));
  for (const capability of map.capabilities) {
    const identity = navigatorIdentity(capability);
    const capabilitySlug = slug(capability.id.replace(/^cap-/, ""));
    const source = `${PATHS.navigators}/${capabilitySlug}.md`;
    const agent = `${PATHS.agents}/${identity}.md`;
    const rule = `${PATHS.rules}/${capabilitySlug}.md`;
    const agentSkill = `${PATHS.agentSkills}/${identity}/SKILL.md`;
    writeText(repoPath(root, source), renderNavigatorBrief(capability));
    writeText(repoPath(root, agent), renderClaudeAgent(capability, source));
    writeText(repoPath(root, rule), renderClaudeRule(capability, source));
    writeText(repoPath(root, agentSkill), renderAgentSkill(capability, source));
    manifest.navigators[identity] = {
      source,
      generated_agent: agent,
      generated_rule: rule,
      generated_skill: agentSkill,
      primary_paths: capability.primary_paths,
      secondary_paths: capability.secondary_paths,
      approved: capability.approved === true
    };
    manifest.documents[`navigator-${capabilitySlug}`] = makeDocument(
      source,
      "operational",
      capability.primary_paths.map((path) => path === "**" ? "." : path.replace(/\/\*\*$/, ""))
    );
  }
  for (const [identity, previous] of Object.entries(previousManifest?.navigators || {})) {
    if (manifest.navigators[identity]) continue;
    removeGeneratedView(root, previous.source, PATHS.navigators);
    removeGeneratedView(root, previous.generated_agent, PATHS.agents, "mauro-");
    removeGeneratedView(root, previous.generated_rule, PATHS.rules);
    removeGeneratedSkill(root, previous.generated_skill);
  }
  return manifest;
}

export function buildFingerprints(root, manifest, config, map) {
  const ignoredPolicy = createGitignoredPolicy(root, config);
  const options = fingerprintOptions(config, map, root, ignoredPolicy);
  const fingerprints = {
    schema_version: SCHEMA_VERSION,
    config_digest: sha256Buffer(Buffer.from(JSON.stringify(config))),
    records: {},
    documents: {}
  };
  for (const [id, record] of Object.entries(manifest.knowledge)) {
    fingerprints.records[id] = {};
    for (const path of record.paths || []) {
      fingerprints.records[id][path] = fingerprintPath(root, path, fingerprintExcludes(config, map, path, ignoredPolicy), options);
    }
  }
  for (const [id, document] of Object.entries(manifest.documents)) {
    fingerprints.documents[id] = {};
    for (const path of document.watches || []) {
      const policy = documentFingerprintPolicy(document, path, config, map, root, ignoredPolicy);
      fingerprints.documents[id][path] = fingerprintPath(root, path, policy.excludes, policy.options);
    }
  }
  return fingerprints;
}

function initializeUnlocked(root, pluginRoot, { canonicalRef = null } = {}) {
  if (isInitialized(root)) {
    throw new Error("Mauro is already initialized. Use `mauro map update`.");
  }
  const context = verificationContext(root);
  const configPath = repoPath(root, PATHS.config);
  const configExists = exists(configPath);
  const sourceConfig = configExists ? readJson(configPath) : readJson(template(pluginRoot, "config.json"));
  const config = validateConfig(canonicalRef === null
    ? sourceConfig
    : { ...sourceConfig, git: { ...sourceConfig.git, canonical_ref: canonicalRef } });
  const canonical = assertCanonicalPinned(root, { config, action: "initialization" });
  const scanStarted = reconciliationState(root, config);
  const map = scanRepository(root, config);
  for (const path of [PATHS.state, PATHS.voyages, PATHS.docs, PATHS.knowledge, PATHS.navigators, PATHS.chronicles, PATHS.artifacts, PATHS.rules, PATHS.agents, PATHS.agentSkills]) {
    ensureDir(repoPath(root, path));
  }
  if (!configExists || canonicalRef !== null) writeJson(repoPath(root, PATHS.config), config);
  copyTextIfMissing(template(pluginRoot, "charter.md"), repoPath(root, PATHS.charter));
  copyTextIfMissing(template(pluginRoot, "tool-gaps.json"), repoPath(root, PATHS.toolGaps));
  writeJson(repoPath(root, PATHS.map), map);
  const manifest = rebuildViews(root, map);
  for (const document of Object.values(manifest.documents)) Object.assign(document, verificationStamp(document.watches, context));
  writeJson(repoPath(root, PATHS.manifest), manifest);
  const fingerprints = buildFingerprints(root, manifest, config, map);
  writeJson(repoPath(root, PATHS.fingerprints), fingerprints);
  const reconciliation = markReconciled(root, config, scanStarted);
  return { map, manifest, fingerprints, reconciliation, canonical };
}

export function initialize(root, pluginRoot, options = {}) {
  return withProjectLock(root, "initialize repository", () => initializeUnlocked(root, pluginRoot, options));
}

function isSemanticCapability(capability) {
  return capability.approved === true || capability.provenance === "semantic" || capability.provenance === "human-approved";
}

function pathCoversRoot(pattern, root) {
  const prefix = pattern === "**" ? "." : pattern.replace(/\/\*\*$/, "");
  if (prefix === "." || root === ".") return prefix === root;
  return prefix === root || prefix.startsWith(`${root}/`) || root.startsWith(`${prefix}/`);
}

function capabilityCoversUnit(capability, unit) {
  if ((capability.units || []).includes(unit.id)) return true;
  return (capability.primary_paths || []).some((pattern) => pathCoversRoot(pattern, unit.root));
}

// A scan produces one deterministic draft per unit. A semantic or human-approved
// capability can span several units and carries an id the scan never produces.
// Keep every semantic capability. Keep a deterministic draft only for a unit that
// no semantic capability covers, so a unit that is new to the tree still surfaces
// for review while an approved boundary never reverts to per-package drafts.
export function mergeCapabilities(previousCapabilities, scannedCapabilities, units) {
  const previousById = new Map(previousCapabilities.map((item) => [item.id, item]));
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const semantic = previousCapabilities.filter(isSemanticCapability);
  const merged = [];
  for (const capability of scannedCapabilities) {
    const previous = previousById.get(capability.id);
    if (previous && isSemanticCapability(previous)) {
      merged.push({ ...capability, ...previous, id: capability.id });
      continue;
    }
    const unit = unitsById.get(`unit-${capability.id.slice(4)}`);
    if (unit && semantic.some((item) => capabilityCoversUnit(item, unit))) continue;
    merged.push(capability);
  }
  const mergedIds = new Set(merged.map((item) => item.id));
  for (const capability of semantic) {
    if (!mergedIds.has(capability.id)) merged.push(capability);
  }
  return merged;
}

function updateMapUnlocked(root) {
  const migration = repositoryMigrationStatus(root);
  if (!migration.supported) {
    throw new Error(`Repository context cannot be migrated automatically: ${migration.reasons.join(", ")}.`);
  }
  const current = loadState(root);
  const scanStarted = reconciliationState(root, current.config);
  const context = verificationContext(root);
  const scanned = scanRepository(root, current.config);
  const oldUnits = new Set(current.map.units.map((unit) => unit.id));
  const newUnits = new Set(scanned.units.map((unit) => unit.id));
  const addedUnits = scanned.units.filter((unit) => !oldUnits.has(unit.id));
  const removedUnits = current.map.units.filter((unit) => !newUnits.has(unit.id));
  const capabilities = mergeCapabilities(current.map.capabilities, scanned.capabilities, scanned.units);
  // A survey or synthesizer gives its findings an id. The scan never does, so
  // an id marks a finding that a rescan cannot rebuild and must not drop.
  const semanticFindings = (items) => (items || []).filter((item) => typeof item.id === "string" && item.id);
  const map = {
    ...scanned,
    capabilities,
    anomalies: [...scanned.anomalies, ...semanticFindings(current.map.anomalies)],
    unresolved: [
      ...scanned.unresolved,
      ...semanticFindings(current.map.unresolved),
      ...addedUnits.map((unit) => ({ kind: "new-unit-needs-semantic-review", unit: unit.id, evidence: [unit.manifest || unit.root] })),
      ...removedUnits.map((unit) => ({ kind: "removed-unit-needs-semantic-review", unit: unit.id, evidence: [unit.manifest || unit.root] }))
    ]
  };
  writeJson(repoPath(root, PATHS.map), map);
  const manifest = rebuildViews(root, map, current.manifest);
  const fresh = buildFingerprints(root, manifest, current.config, map);
  const policyChanged = current.fingerprints.config_digest !== fresh.config_digest;
  // A document keeps its fingerprint, and the commit that fingerprint describes,
  // until something re-verifies it. Only a new, regenerated or re-scoped view is
  // fingerprinted afresh, so only that view gets a new stamp.
  const refingerprinted = (id) => id === "doc-map" || !current.fingerprints.documents[id] || (policyChanged && id.startsWith("navigator-"));
  for (const [id, document] of Object.entries(manifest.documents)) {
    if (refingerprinted(id)) Object.assign(document, verificationStamp(document.watches, context));
    else carryVerification(document, current.manifest.documents?.[id]);
  }
  writeJson(repoPath(root, PATHS.manifest), manifest);
  const fingerprints = {
    schema_version: SCHEMA_VERSION,
    config_digest: fresh.config_digest,
    records: current.fingerprints.records,
    documents: Object.fromEntries(Object.keys(manifest.documents).map((id) => [
      id,
      refingerprinted(id) ? fresh.documents[id] : current.fingerprints.documents[id]
    ]))
  };
  writeJson(repoPath(root, PATHS.fingerprints), fingerprints);
  const reconciliation = markReconciled(root, current.config, scanStarted);
  return { map, manifest, fingerprints, reconciliation };
}

export function updateMap(root) {
  return withProjectLock(root, "update Map and generated views", () => updateMapUnlocked(root));
}

export function reconcile(root, { observedPaths = gitChangedPaths(root), force = false } = {}) {
  return withProjectLock(root, "reconcile repository context", () => {
    const migration = repositoryMigrationStatus(root);
    if (!migration.supported) {
      throw new Error(`Repository context cannot be migrated automatically: ${migration.reasons.join(", ")}.`);
    }
    const queuePath = repoPath(root, PATHS.changes);
    let queued = [];
    try { queued = readJson(queuePath).paths || []; } catch {}
    const state = loadState(root);
    const observed = relevantChangedPaths(observedPaths);
    const previous = readReconciliation(root);
    const current = reconciliationState(root, state.config, observed);
    const triggers = reconciliationReasons(previous, current);
    const newlyObserved = triggers.includes("working-tree") ? observed : [];
    const paths = relevantChangedPaths([...queued, ...newlyObserved]);
    const contentTriggers = triggers.filter((reason) => ["reconciliation-metadata", "working-tree", "head-commit"].includes(reason));
    const canonicalTriggers = triggers.filter((reason) => reason === "canonical-ref" || reason === "canonical-commit");
    if (!force && !migration.required && paths.length === 0 && contentTriggers.length === 0) {
      if (canonicalTriggers.length) writeJson(repoPath(root, PATHS.reconciliation), current);
      const checkoutUpdateRequired = ["behind", "diverged"].includes(current.canonical_relationship);
      return {
        updated: false,
        paths: [],
        triggers,
        canonical_changed: canonicalTriggers.length > 0,
        checkout_update_required: checkoutUpdateRequired,
        migration,
        reason: canonicalTriggers.length
          ? checkoutUpdateRequired
            ? "The locally available canonical branch changed. Update this checkout before Mauro rebuilds trusted repository context."
            : "The locally available canonical branch changed, but this checkout's content did not. Mauro recorded the new canonical commit."
          : "Repository evidence has not changed since the last reconciliation."
      };
    }
    const result = updateMapUnlocked(root);
    const reportedPaths = force || (paths.length === 0 && contentTriggers.length > 0) ? ["**"] : paths;
    return {
      updated: true,
      paths: reportedPaths,
      triggers,
      files: result.map.files.length,
      units: result.map.units.length,
      capabilities: result.map.capabilities.length,
      complete: result.reconciliation.complete,
      pending_paths: result.reconciliation.pending_paths,
      pending_reasons: result.reconciliation.pending_reasons,
      migration: { ...migration, completed: migration.required }
    };
  });
}

export function readKnowledgeFiles(root) {
  const directory = repoPath(root, PATHS.knowledge);
  if (!exists(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({ path: `${PATHS.knowledge}/${name}`, text: readFileSync(join(directory, name), "utf8") }));
}

export function pluginRootFrom(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}
