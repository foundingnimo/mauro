import { execFileSync } from "node:child_process";

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

/**
 * How far the checkout is from the branch it tracks. Returns null when the
 * question does not apply: no Git, a detached HEAD, or no upstream at all.
 */
export function upstreamDrift(root) {
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch || branch === "HEAD") return null;
  const upstream = git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
    || git(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (!upstream) return null;
  const counts = git(root, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
  if (!counts) return null;
  const [behind, ahead] = counts.split(/\s+/).map(Number);
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) return null;
  return { branch, upstream, behind, ahead };
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * A review or a plan describes the tree it runs against. A checkout behind its
 * upstream therefore produces a confident answer about code that has already
 * changed, which costs an agent run and sends a person to the wrong file. So
 * Mauro refuses, states the scale of the drift, and leaves the decision open.
 */
export function assertBranchCurrent(root, { action, allowBehind = false } = {}) {
  if (allowBehind) return null;
  const drift = upstreamDrift(root);
  if (!drift || drift.behind === 0) return drift;
  const position = `${drift.branch} is ${plural(drift.behind, "commit")} behind ${drift.upstream}`;
  const ahead = drift.ahead ? ` and ${plural(drift.ahead, "commit")} ahead of it` : "";
  throw new Error(`${position}${ahead}. A ${action} describes the tree it runs against, so a stale checkout gives a confident answer about code that has already changed. Rebase or merge first, or pass --allow-behind to continue anyway.`);
}
