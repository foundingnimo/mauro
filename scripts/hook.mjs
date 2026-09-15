import { readFileSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { PATHS } from "./lib/constants.mjs";
import { findProjectRoot, readJson, repoPath, toPosix, writeJson } from "./lib/fs.mjs";
import { gitChangedPaths } from "./lib/git.mjs";
import { checkRepository } from "./lib/check.mjs";
import { isInitialized } from "./lib/state.mjs";

function readInput() {
  try {
    const text = readFileSync(0, "utf8").trim();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function savePaths(root, additions) {
  const statePath = repoPath(root, PATHS.changes);
  let current = { schema_version: 1, paths: [] };
  try { current = readJson(statePath); } catch {}
  const paths = [...new Set([...(current.paths || []), ...additions])].filter(Boolean).sort();
  writeJson(statePath, { schema_version: 1, updated_at: new Date().toISOString(), paths });
}

export function runHook(event, cwd = process.cwd()) {
  const root = findProjectRoot(cwd);
  if (!isInitialized(root)) return;
  if (event === "changed") {
    const input = readInput();
    const candidate = input.tool_input?.file_path || input.tool_input?.path || input.file_path;
    if (candidate) {
      const path = isAbsolute(candidate) ? toPosix(relative(root, candidate)) : toPosix(candidate);
      if (path && !path.startsWith("../")) savePaths(root, [path]);
    }
    return;
  }
  if (event === "stop") {
    savePaths(root, gitChangedPaths(root));
    return;
  }
  if (event === "session-start") {
    const report = checkRepository(root);
    const label = report.current ? "current" : "needs attention";
    const charter = report.charter.state === "complete" ? "" : ` The Charter is ${report.charter.state === "partial" ? "partial" : report.charter.state}; run /mauro charter ${report.charter.state === "partial" ? "update" : "create"}.`;
    const suspect = new Set(report.findings.filter((item) => item.code === "document-suspect").map((item) => item.path)).size;
    const review = suspect ? ` ${suspect} document${suspect === 1 ? " is" : "s are"} suspect; run /mauro docs review.` : "";
    process.stdout.write(`Mauro Bearing: ${label}. ${report.errors} error(s), ${report.warnings} warning(s).${charter}${review} Run /mauro check for details.\n`);
  }
}
