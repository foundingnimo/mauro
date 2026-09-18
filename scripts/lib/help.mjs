import { ALIASES, PUBLIC_COMMANDS } from "./constants.mjs";

const DETAILS = {
  brief: "Build ranked, bounded implementation context for an objective without starting a Voyage.",
  charter: "Create, show, update, diff, or validate the human-owned Charter. `validate` reports template, partial, or complete.",
  check: "Run a read-only Bearing check for stale knowledge and generated context.",
  contribute: "Record, preview, dismiss, or mark an upstream Mauro improvement as submitted.",
  docs: "Show document state, run freshness checks, build review packets for suspect documents, or confirm a reviewed document.",
  doctor: "Validate the Mauro installation and project state, or safely clear a proven stale local lock.",
  help: "Show general help or help for one command.",
  impact: "Rank likely capabilities and Navigators for a proposed change.",
  init: "Pin the user-selected canonical branch, then run the first Expedition.",
  knowledge: "Show, search, propose, verify, update, or retire Logbook records.",
  map: "Show, find, update, or verify the observed repository Map.",
  navigator: "List, show, regenerate, or request a specialist review.",
  next: "List what Mauro found and suggest the next steps, each with its command.",
  pr: "Preview, check, or update bounded pull-request context.",
  reconcile: "Refresh derived repository context when observed files changed.",
  refit: "Propose a repository reorganization. This command does not move code.",
  run: "Create, activate, resume, finish, abandon, or inspect a development Voyage.",
  status: "Show Map publication, Bearing health, initialization, knowledge, and Voyage state.",
  tool: "List, describe, or run a trusted tool, and maintain the project Tool Gap Log.",
  where: "Find code, documents, and knowledge for a concept.",
  who: "Find the responsible Navigator for a path.",
  why: "Explain applicable rationale for a path, symbol, or knowledge ID."
};

const USAGE = {
  brief: "mauro brief <objective> [--json]",
  charter: "mauro charter <create|show|update|diff|validate>",
  check: "mauro check [--json]",
  contribute: "mauro contribute <record|list|show|preview|dismiss|submitted|doctor> [arguments] [--json]",
  docs: "mauro docs <status|check|review [id] [--allow-behind]|confirm <id> --evidence <file> [--allow-behind]> [--json]",
  doctor: "mauro doctor [--clear-stale-lock]",
  help: "mauro help [command]",
  impact: "mauro impact <proposed change>",
  init: "mauro init --canonical-ref <branch> [--root <repository>]",
  knowledge: "mauro knowledge <show|search|propose|verify|update|retire|history> [value]",
  map: "mauro map <show|find|update|verify> [value]",
  next: "mauro next [--json]",
  navigator: "mauro navigator <list|show|regenerate|review> [value]",
  pr: "mauro pr <preview|check|update|reviewers> [--base <ref>]",
  reconcile: "mauro reconcile [--force] [--dry-run] [--json]",
  refit: "mauro refit propose [scope]",
  run: "mauro run <objective> [--allow-behind] | status [id] | activate <id> [--path <path>]... [--allow-behind] | resume <id> [--allow-behind] | finish <id> [--allow-behind] | abandon <id> --reason <reason>",
  status: "mauro status [--json]",
  tool: "mauro tool <list|describe|run|gaps|gap> [action] [--json]",
  where: "mauro where <concept>",
  who: "mauro who <repository path>",
  why: "mauro why <path[:symbol]|K-0001>"
};

export function help(command = null) {
  if (command && DETAILS[command]) {
    return `Mauro ${command}\n\n${DETAILS[command]}\n\nUsage: ${USAGE[command]}\n`;
  }
  const aliases = Object.entries(ALIASES).map(([alias, name]) => `${alias}=${name}`).join(", ");
  const lines = [
    "Mauro maps a repository and maintains verified context for coding agents.",
    "",
    "Usage: mauro <command> [arguments] [--root <repository>]",
    "",
    "Commands:"
  ];
  for (const commandName of PUBLIC_COMMANDS) {
    lines.push(`  ${commandName.padEnd(11)} ${DETAILS[commandName]}`);
  }
  lines.push("", `Frequent aliases: ${aliases}`, "", "Use `mauro help <command>` for command help.");
  return `${lines.join("\n")}\n`;
}
