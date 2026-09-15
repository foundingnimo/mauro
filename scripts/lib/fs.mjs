import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { HARD_EXCLUDES } from "./constants.mjs";

export function exists(path) {
  return existsSync(path);
}

export function findProjectRoot(start = process.cwd()) {
  let cursor = realpathSync(start);
  while (true) {
    if (existsSync(join(cursor, ".git"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return realpathSync(start);
    cursor = parent;
  }
}

export function assertSafeRoot(root) {
  const resolved = realpathSync(root);
  if (resolved === sep || resolved.length < 4) {
    throw new Error(`Unsafe repository root: ${resolved}`);
  }
  return resolved;
}

export function toPosix(path) {
  return path.split(sep).join("/");
}

export function repoPath(root, path) {
  if (isAbsolute(path)) throw new Error(`Expected a repository-relative path: ${path}`);
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`Path leaves the repository: ${path}`);
  }
  return target;
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(path, value) {
  ensureDir(dirname(path));
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, value, "utf8");
  renameSync(temporary, path);
}

export function copyTextIfMissing(source, destination) {
  if (existsSync(destination)) return false;
  writeText(destination, readFileSync(source, "utf8"));
  return true;
}

function globRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0001")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0001/g, "(?:.*/)?")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}(?:/.*)?$`);
}

export function matchesGlob(pattern, path) {
  return globRegex(toPosix(pattern)).test(toPosix(path));
}

export function isExcluded(path, extra = []) {
  const normalized = toPosix(path).replace(/^\.\//, "");
  return [...HARD_EXCLUDES, ...extra].some((pattern) => {
    const clean = toPosix(pattern).replace(/^\.\//, "");
    if (clean.endsWith("/**")) {
      const prefix = clean.slice(0, -3).replace(/\/$/, "");
      return normalized === prefix || normalized.startsWith(`${prefix}/`);
    }
    if (!clean.includes("/")) {
      return globRegex(clean).test(fileName(normalized));
    }
    return globRegex(clean).test(normalized);
  });
}

export function walkFiles(root, extraExcludes = [], options = {}) {
  const found = [];
  const active = new Set();
  const prefix = toPosix(options.pathPrefix || "").replace(/^\.\/?|\/$/g, "");
  const excluded = (path) => isExcluded(path, extraExcludes)
    || Boolean(prefix && isExcluded(`${prefix}/${toPosix(path)}`, extraExcludes));
  const accepted = (path, absolute) => !options.acceptFile
    || options.acceptFile(prefix ? `${prefix}/${toPosix(path)}` : toPosix(path), absolute);
  function visit(directory) {
    const realDirectory = realpathSync(directory);
    if (active.has(realDirectory)) return;
    active.add(realDirectory);
    try {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const absolute = join(directory, entry.name);
        const rel = toPosix(relative(root, absolute));
        if (excluded(rel)) continue;
        if (entry.isSymbolicLink()) {
          if (!options.followSymlinks) continue;
          let target;
          try {
            target = realpathSync(absolute);
          } catch {
            continue;
          }
          const targetRel = relative(root, target);
          if (targetRel === ".." || targetRel.startsWith(`..${sep}`) || excluded(toPosix(targetRel))) continue;
          const targetStat = statSync(absolute);
          if (targetStat.isDirectory()) visit(absolute);
          else if (targetStat.isFile() && accepted(rel, absolute)) found.push(rel);
          continue;
        }
        if (entry.isDirectory()) visit(absolute);
        else if (entry.isFile() && accepted(rel, absolute)) found.push(rel);
      }
    } finally {
      active.delete(realDirectory);
    }
  }
  visit(root);
  return found;
}

export function sha256Buffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

export function fingerprintFile(path) {
  return sha256Buffer(readFileSync(path));
}

export function fingerprintPath(root, rel, excludes = [], options = {}) {
  if (rel === "**") rel = ".";
  else {
    if (rel.endsWith("/**")) rel = rel.slice(0, -3).replace(/\/$/, "");
    if (/[*?]/.test(rel)) {
      rel = rel.slice(0, rel.search(/[*?]/)).replace(/\/$/, "") || ".";
    }
  }
  if (isExcluded(rel, excludes)) return "excluded";
  const absolute = repoPath(root, rel);
  if (!existsSync(absolute)) return "missing";
  const stat = lstatSync(absolute);
  if (stat.isFile()) {
    if (options.acceptFile && !options.acceptFile(rel, absolute)) return "excluded";
    if (options.maxFileSize && stat.size > options.maxFileSize) {
      return sha256Buffer(Buffer.from(`oversize\0${stat.size}\0${stat.mtimeMs}`));
    }
    return fingerprintFile(absolute);
  }
  if (!stat.isDirectory()) return "unsupported";
  const hash = createHash("sha256");
  const pathPrefix = rel === "." ? "" : rel;
  for (const file of walkFiles(absolute, excludes, { ...options, pathPrefix })) {
    const fileStat = statSync(join(absolute, file));
    hash.update(file);
    hash.update("\0");
    if (options.maxFileSize && fileStat.size > options.maxFileSize) {
      hash.update(`oversize\0${fileStat.size}\0${fileStat.mtimeMs}`);
    } else {
      hash.update(readFileSync(join(absolute, file)));
    }
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export function relativeFrom(root, absolute) {
  return toPosix(relative(root, absolute));
}

export function fileName(path) {
  return basename(path);
}
