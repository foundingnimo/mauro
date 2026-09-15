import { execFileSync } from "node:child_process";

function git(root, args, fallback = null) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return fallback;
  }
}

export function gitBaseline(root) {
  const commit = git(root, ["rev-parse", "HEAD"]);
  const changes = git(root, ["status", "--porcelain"], "");
  return { commit, dirty: Boolean(changes) };
}

export function gitChangedPaths(root, base = null) {
  const args = base
    ? ["diff", "--name-only", "--diff-filter=ACMRTUXB", `${base}...HEAD`]
    : ["status", "--porcelain"];
  const output = git(root, args, "");
  if (!output) return [];
  if (base) return [...new Set(output.split("\n").filter(Boolean))].sort();
  return [...new Set(output.split("\n").flatMap((line) => {
    const value = line.slice(3);
    return value.includes(" -> ") ? value.split(" -> ") : [value];
  }).filter(Boolean))].sort();
}

export function gitMergeBase(root, target = "HEAD") {
  const originHead = git(root, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  const candidates = [originHead, "origin/main", "main", "origin/master", "master"].filter(Boolean);
  for (const candidate of candidates) {
    const base = git(root, ["merge-base", target, candidate]);
    if (base) return base;
  }
  return null;
}

export function gitHead(root) {
  return git(root, ["rev-parse", "HEAD"]);
}

export function gitIgnoredRegions(root) {
  if (git(root, ["rev-parse", "--is-inside-work-tree"], "false") !== "true") return [];
  try {
    const output = execFileSync("git", [
      "-C", root, "ls-files", "--others", "--ignored", "--exclude-standard",
      "--directory", "-z"
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024
    });
    return output.split("\0").filter(Boolean).map((value) => ({
      path: value.endsWith("/") ? value.slice(0, -1) : value,
      kind: value.endsWith("/") ? "directory" : "file"
    }));
  } catch {
    throw new Error("Mauro could not enumerate Git-ignored paths safely. No repository content was scanned.");
  }
}
