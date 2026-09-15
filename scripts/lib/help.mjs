import { ALIASES, PUBLIC_COMMANDS } from "./constants.mjs";

const DETAILS = {
  charter: "Create, show, update, diff, or validate the human-owned Charter. `validate` reports template, partial, or complete.",
  check: "Run a read-only Bearing check for stale knowledge and generated context.",
  docs: "Show document state, run freshness checks, or build review packets for suspect documents.",
  doctor: "Validate the Mauro installation and project state.",
  help: "Show general help or help for one command.",
  impact: "Find likely capabilities and Navigators for a proposed change.",
  init: "Run the first Expedition. Create the Map, Charter, and Navigators.",
  knowledge: "Show, search, propose, verify, update, or retire Logbook records.",
  map: "Show, find, update, or verify the observed repository Map.",
  navigator: "List, show, regenerate, or request a specialist review.",
  next: "List what Mauro found and suggest the next steps, each with its command.",
  pr: "Preview, check, or update bounded pull-request context.",
  refit: "Propose a repository reorganization. This command does not move code.",
  run: "Start or resume a development Voyage.",
  status: "Show initialization, Map, knowledge, and Bearing state.",
  tool: "List, describe, or run a trusted read-only tool installed with Mauro.",
  where: "Find code, documents, and knowledge for a concept.",
  who: "Find the responsible Navigator for a path.",
  why: "Explain applicable rationale for a path, symbol, or knowledge ID."
};

const USAGE = {
  charter: "mauro charter <create|show|update|diff|validate>",
  check: "mauro check [--json]",
  docs: "mauro docs <status|check|review [id]> [--json]",
  doctor: "mauro doctor",
  help: "mauro help [command]",
  impact: "mauro impact <proposed change>",
  init: "mauro init [--root <repository>]",
  knowledge: "mauro knowledge <show|search|propose|verify|update|retire|history> [value]",
  map: "mauro map <show|find|update|verify> [value]",
  next: "mauro next [--json]",
  navigator: "mauro navigator <list|show|regenerate|review> [value]",
  pr: "mauro pr <preview|check|update|reviewers> [--base <ref>]",
  refit: "mauro refit propose [scope]",
  run: "mauro run <objective>|status|resume",
  status: "mauro status [--json]",
  tool: "mauro tool <list|describe|run> [name] [--option <value>] [--json]",
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
    "Mauro maps a repository and maintains verified context for Claude Code.",
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
