import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, relative } from "node:path";
import { MAURO_VERSION, MANIFEST_FILES, SCHEMA_VERSION } from "./constants.mjs";
import { fileName, fingerprintFile, repoPath, toPosix, walkFiles } from "./fs.mjs";
import { gitBaseline } from "./git.mjs";
import {
  documentAllowed,
  effectiveMode,
  isDocumentPath,
  languageAllowed,
  languageForPath,
  packageScope,
  roleForPath,
  scannerOptions,
  validateConfig,
  walkExcludes
} from "./policy.mjs";

function manifestKind(name) {
  if (name.endsWith(".csproj")) return "dotnet";
  return MANIFEST_FILES.get(name) || null;
}

function readPackage(root, path, maxFileSize) {
  if (fileName(path) !== "package.json") return {};
  try {
    const absolute = repoPath(root, path);
    if (statSync(absolute).size > maxFileSize) return { oversize: true };
    const value = JSON.parse(readFileSync(absolute, "utf8"));
    return {
      name: typeof value.name === "string" ? value.name : null,
      private: value.private === true,
      workspaces: value.workspaces || null,
      dependencies: {
        ...value.dependencies,
        ...value.devDependencies,
        ...value.peerDependencies,
        ...value.optionalDependencies
      }
    };
  } catch {
    return { parse_error: true };
  }
}

function slug(value) {
  const result = value.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return result || "root";
}

function groupedManifestUnits(root, paths, config) {
  const grouped = new Map();
  for (const manifest of paths.filter((path) => {
    if (roleForPath(path, config) !== "source" || !manifestKind(fileName(path))) return false;
    return toPosix(relative(root, realpathSync(repoPath(root, path)))) === path;
  })) {
    const unitRoot = dirname(manifest) === "." ? "." : dirname(manifest);
    const manifests = grouped.get(unitRoot) || [];
    manifests.push(manifest);
    grouped.set(unitRoot, manifests);
  }
  return [...grouped.entries()].map(([unitRoot, manifests]) => {
    manifests.sort((a, b) => (fileName(a) === "package.json" ? -1 : 0) - (fileName(b) === "package.json" ? -1 : 0) || a.localeCompare(b));
    const manifest = manifests[0];
    const packageManifest = manifests.find((path) => fileName(path) === "package.json");
    const packageDetails = packageManifest ? readPackage(root, packageManifest, config.scan.max_file_size) : {};
    const name = packageDetails.name || (unitRoot === "." ? "repository" : fileName(unitRoot));
    const kinds = [...new Set(manifests.map((path) => manifestKind(fileName(path))))];
    const kind = unitRoot === "." && packageDetails.workspaces
      ? "workspace"
      : kinds.length > 1 ? "polyglot" : kinds[0];
    const unit = {
      id: `unit-${slug(unitRoot === "." ? name : unitRoot)}`,
      name,
      root: unitRoot,
      kind,
      manifest,
      manifests
    };
    return { ...unit, scope: packageScope(unit, config), packageDetails };
  });
}

function fallbackUnits(paths, config) {
  const roots = [...new Set(paths
    .filter((path) => roleForPath(path, config) === "source")
    .map((path) => path.includes("/") ? path.split("/")[0] : "."))];
  return roots.slice(0, 20).map((root) => {
    const unit = {
      id: `unit-${slug(root)}`,
      name: root === "." ? "repository" : root,
      root,
      kind: "directory",
      manifest: null,
      manifests: []
    };
    return { ...unit, scope: packageScope(unit, config), packageDetails: {} };
  });
}

function ownerFor(path, units) {
  const nested = units
    .filter((unit) => unit.root !== "." && (path === unit.root || path.startsWith(`${unit.root}/`)))
    .sort((a, b) => b.root.length - a.root.length || a.root.localeCompare(b.root));
  return nested[0] || units.find((unit) => unit.root === ".") || null;
}

function publicUnit(unit) {
  const { packageDetails, ...visible } = unit;
  return visible;
}

export function scanRepository(root, config = {}) {
  validateConfig(config);
  const candidatePaths = walkFiles(root, walkExcludes(config), scannerOptions(config));
  let allUnits = groupedManifestUnits(root, candidatePaths, config);
  if (allUnits.length === 0) allUnits = fallbackUnits(candidatePaths, config);
  const visibleUnits = allUnits.filter((unit) => unit.scope !== "omit");
  const maxFileSize = config.scan.max_file_size;
  const files = [];
  const roleCounts = { source: 0, test: 0, fixture: 0, generated: 0 };

  for (const path of candidatePaths) {
    const owner = ownerFor(path, allUnits);
    const absolute = repoPath(root, path);
    const physicalPath = toPosix(relative(root, realpathSync(absolute)));
    const viaSymlink = physicalPath !== path;
    const physicalOwner = viaSymlink ? ownerFor(physicalPath, allUnits) : owner;
    if (owner?.scope === "omit") continue;
    if (owner?.scope === "stub" && !owner.manifests.includes(path)) continue;
    if (physicalOwner?.scope === "omit") continue;
    if (physicalOwner?.scope === "stub" && !physicalOwner.manifests.includes(physicalPath)) continue;
    const role = roleForPath(path, config);
    const scanMode = effectiveMode(role, owner, config);
    if (scanMode === "exclude") continue;
    if (physicalOwner !== owner && effectiveMode(role, physicalOwner, config) === "exclude") continue;
    if (!documentAllowed(path, owner, config)) continue;
    if (physicalOwner !== owner && !documentAllowed(physicalPath, physicalOwner, config)) continue;
    const language = languageForPath(path);
    if (!languageAllowed(language, path, config)) continue;
    const size = statSync(absolute).size;
    const oversize = size > maxFileSize;
    files.push({
      path,
      size,
      language,
      role,
      scan_mode: scanMode,
      owner: owner?.id || null,
      physical_owner: physicalOwner?.id || null,
      digest: oversize ? null : fingerprintFile(absolute),
      oversize,
      via_symlink: viaSymlink
    });
    roleCounts[role] += 1;
  }

  const units = visibleUnits.map(publicUnit);
  const visibleIds = new Set(units.map((unit) => unit.id));
  const packageByName = new Map();
  for (const unit of visibleUnits) {
    if (unit.packageDetails.name) packageByName.set(unit.packageDetails.name, unit.id);
  }
  const dependencies = [];
  for (const unit of visibleUnits) {
    for (const dependency of Object.keys(unit.packageDetails.dependencies || {})) {
      const target = packageByName.get(dependency);
      if (target && visibleIds.has(target)) {
        dependencies.push({
          from: unit.id,
          to: target,
          kind: "package",
          evidence: [unit.manifest]
        });
      }
    }
  }

  const capabilities = visibleUnits.filter((unit) => unit.scope === "included").map((unit) => {
    const workspacePaths = unit.kind === "workspace"
      ? [unit.manifest, ...candidatePaths.filter((path) => !path.includes("/") && ["pnpm-workspace.yaml", "turbo.json", "nx.json", "lerna.json", "tsconfig.json"].includes(path))].filter(Boolean)
      : null;
    return {
      id: `cap-${unit.id.slice(5)}`,
      name: unit.name,
      purpose: unit.kind === "workspace" ? "Maintain workspace orchestration and repository-wide build configuration." : `Maintain the code in ${unit.root}.`,
      primary_paths: workspacePaths || [unit.root === "." ? "**" : `${unit.root}/**`],
      secondary_paths: [],
      confidence: unit.manifest ? 0.7 : 0.45,
      evidence: unit.manifest ? [unit.manifest] : [unit.root],
      provenance: "deterministic-draft",
      approved: false
    };
  });

  const hashGroups = new Map();
  for (const file of files) {
    if (!file.digest || file.size < 80 || file.language === "Markdown" || file.via_symlink) continue;
    if (file.role !== "source" && file.scan_mode !== "full") continue;
    const group = hashGroups.get(file.digest) || [];
    group.push(file.path);
    hashGroups.set(file.digest, group);
  }
  const duplicateGroups = [...hashGroups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([digest, group], index) => ({ id: `duplicate-${index + 1}`, digest, paths: group }));

  const documents = files
    .filter((file) => isDocumentPath(file.path))
    .map((file) => ({ path: file.path, digest: file.digest, role: file.role }));

  const anomalies = [];
  if (duplicateGroups.length) {
    anomalies.push({
      kind: "exact-duplicates",
      severity: "information",
      detail: `${duplicateGroups.length} exact duplicate group(s) need semantic review.`
    });
  }

  const omittedUnitRoots = allUnits.filter((unit) => unit.scope === "omit").map((unit) => unit.root);
  return {
    schema_version: SCHEMA_VERSION,
    mauro_version: MAURO_VERSION,
    generated_at: new Date().toISOString(),
    baseline: gitBaseline(root),
    scan_summary: {
      candidate_files: candidatePaths.length,
      included_files: files.length,
      omitted_files: candidatePaths.length - files.length,
      roles: roleCounts,
      included_units: visibleUnits.filter((unit) => unit.scope === "included").length,
      stub_units: visibleUnits.filter((unit) => unit.scope === "stub").length,
      omitted_units: omittedUnitRoots.length,
      omitted_unit_roots: omittedUnitRoots
    },
    files,
    units,
    capabilities,
    dependencies,
    documents,
    duplicate_groups: duplicateGroups,
    anomalies,
    unresolved: capabilities.filter((item) => item.confidence < 0.5).map((item) => ({
      kind: "low-confidence-capability",
      capability: item.id,
      evidence: item.evidence
    }))
  };
}
