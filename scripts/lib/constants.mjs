import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// package.json is the one place the version is written. `npm version` bumps it
// and scripts/sync-version.mjs copies it into the plugin manifest.
export const MAURO_VERSION = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf8")).version;
export const SCHEMA_VERSION = 1;
export const MAX_PERIMETER_REGIONS = 500;

export const PATHS = Object.freeze({
  state: ".mauro",
  config: ".mauro/config.json",
  map: ".mauro/map.json",
  manifest: ".mauro/manifest.json",
  fingerprints: ".mauro/fingerprints.json",
  changes: ".mauro/changed-paths.json",
  docs: "docs/mauro",
  mapDocument: "docs/mauro/map.md",
  charter: "docs/mauro/charter.md",
  knowledge: "docs/mauro/knowledge",
  navigators: "docs/mauro/navigators",
  chronicles: "docs/mauro/chronicles",
  artifacts: "docs/mauro/artifacts",
  rules: ".claude/rules/mauro",
  agents: ".claude/agents"
});

export const HARD_EXCLUDES = Object.freeze([
  ".git/**",
  ".mauro/**",
  ".claude/**",
  "docs/mauro/**",
  "node_modules/**",
  ".venv/**",
  "venv/**",
  "__pycache__/**",
  ".env",
  ".env.*",
  ".envrc",
  ".npmrc",
  ".pypirc",
  "credentials.json",
  "secrets.json",
  "*.log",
  "*.pem",
  "*.key",
  "id_rsa*"
]);

export const DEFAULT_GENERATED_PATTERNS = Object.freeze([
  "vendor/**",
  "**/vendor/**",
  "dist/**",
  "**/dist/**",
  "build/**",
  "**/build/**",
  "coverage/**",
  "**/coverage/**",
  ".next/**",
  "**/.next/**",
  ".cache/**",
  "**/.cache/**",
  "*.min.js",
  "*.map"
]);

export const DEFAULT_TEST_PATTERNS = Object.freeze([
  "test/**",
  "tests/**",
  "**/test/**",
  "**/tests/**",
  "**/__tests__/**",
  "**/*.test.*",
  "**/*.spec.*"
]);

export const DEFAULT_FIXTURE_PATTERNS = Object.freeze([
  "fixtures/**",
  "**/fixtures/**",
  "**/__fixtures__/**",
  "**/testdata/**",
  "**/__snapshots__/**"
]);

export const MANIFEST_FILES = new Map([
  ["package.json", "node"],
  ["pyproject.toml", "python"],
  ["Cargo.toml", "rust"],
  ["go.mod", "go"],
  ["pom.xml", "java"],
  ["build.gradle", "java"],
  ["build.gradle.kts", "kotlin"],
  ["Gemfile", "ruby"],
  ["composer.json", "php"],
  ["Package.swift", "swift"],
  ["*.csproj", "dotnet"]
]);

export const STRUCTURAL_NAMES = new Set([
  "package.json", "pnpm-workspace.yaml", "yarn.lock", "pnpm-lock.yaml",
  "package-lock.json", "turbo.json", "nx.json", "lerna.json", "tsconfig.json",
  "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle",
  "build.gradle.kts", "docker-compose.yml", "docker-compose.yaml", "Dockerfile"
]);

export const ALIASES = Object.freeze({
  c: "check",
  d: "docs",
  h: "help",
  i: "impact",
  k: "knowledge",
  m: "map",
  n: "next",
  p: "pr",
  r: "run",
  s: "status",
  w: "where",
  suggest: "next"
});

export const PUBLIC_COMMANDS = Object.freeze([
  "charter", "check", "docs", "doctor", "help", "impact", "init",
  "knowledge", "map", "navigator", "next", "pr", "refit", "run", "status",
  "where", "who", "why"
]);
