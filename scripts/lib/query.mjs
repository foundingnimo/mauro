import { readFileSync } from "node:fs";
import { PATHS } from "./constants.mjs";
import { exists, matchesGlob, repoPath } from "./fs.mjs";
import { loadState, readKnowledgeFiles } from "./state.mjs";

function includes(value, query) {
  return String(value).toLowerCase().includes(query.toLowerCase());
}

export function pathMatches(pattern, path) {
  if (pattern === "**" || pattern === ".") return true;
  if (/[*?]/.test(pattern)) return matchesGlob(pattern, path);
  const prefix = pattern.replace(/\/\*\*$/, "");
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function matchingNavigators(state, path) {
  return Object.entries(state.manifest.navigators || {})
    .filter(([, navigator]) => [...navigator.primary_paths, ...(navigator.secondary_paths || [])].some((pattern) => pathMatches(pattern, path)))
    .map(([id]) => id);
}

export function findMap(root, query) {
  const { map } = loadState(root);
  return map.capabilities.filter((item) => [item.id, item.name, item.purpose, ...item.primary_paths, ...item.evidence].some((value) => includes(value, query)));
}

export function where(root, query) {
  const state = loadState(root);
  const capabilities = findMap(root, query);
  const knowledge = readKnowledgeFiles(root)
    .filter((item) => includes(item.text, query))
    .map((item) => item.path);
  const documents = Object.entries(state.manifest.documents || {})
    .filter(([id, item]) => includes(id, query) || includes(item.path, query))
    .map(([id, item]) => ({ id, path: item.path }));
  return { capabilities, knowledge, documents };
}

export function who(root, path) {
  const state = loadState(root);
  return matchingNavigators(state, path);
}

export function why(root, target) {
  const state = loadState(root);
  if (state.manifest.knowledge[target]) {
    const record = state.manifest.knowledge[target];
    return { id: target, record, text: exists(repoPath(root, record.source)) ? readFileSync(repoPath(root, record.source), "utf8") : null };
  }
  const applicable = Object.entries(state.manifest.knowledge || {})
    .filter(([, record]) => (record.paths || []).some((pattern) => pathMatches(pattern, target.split(":")[0])))
    .map(([id, record]) => ({ id, source: record.source, status: record.status }));
  return { target, navigators: matchingNavigators(state, target.split(":")[0]), knowledge: applicable };
}

export function impact(root, proposal) {
  const state = loadState(root);
  const tokens = proposal.toLowerCase().split(/[^a-z0-9_-]+/).filter((item) => item.length > 2);
  const capabilities = state.map.capabilities
    .map((item) => {
      const corpus = [item.id, item.name, item.purpose, ...item.primary_paths, ...item.evidence].join(" ").toLowerCase();
      const score = tokens.filter((token) => corpus.includes(token)).length;
      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const navigators = [...new Set(capabilities.flatMap((capability) => matchingNavigators(state, capability.primary_paths[0].replace(/\/\*\*$/, ""))))];
  return { proposal, capabilities, navigators, note: "This result is lexical. A Navigator must verify semantic impact." };
}

export function knowledge(root, action, argument = "") {
  const state = loadState(root);
  if (action === "show") return why(root, argument);
  if (action === "search") {
    return readKnowledgeFiles(root)
      .filter((item) => includes(item.text, argument))
      .map((item) => ({ path: item.path, ids: [...item.text.matchAll(/\bK-\d{4,}\b/g)].map((match) => match[0]) }));
  }
  return Object.entries(state.manifest.knowledge || {}).map(([id, record]) => ({ id, ...record }));
}
