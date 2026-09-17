# Changelog

## Unreleased

- Add a deterministic, role-specific Expedition survey-report validator that
  checks JSON, baseline, paths, glob syntax, confidence, Tool Gap fields,
  report size, and inventory coverage before synthesis.
- Isolate the four mapper reports and stop bundled survey agents and the
  synthesizer from nested delegation.
- Keep first-run document discovery on deterministic inventory and prevent old
  generated Navigator names from priming capability surveys.

## 0.2.1 (2026-09-17)

- Treat agent instruction files as first-class, human-owned Instruction
  Contracts with configurable discovery, provider and directory scope,
  inheritance, binding fingerprints, duplicate detection, and task-brief
  visibility.
- Make changed or missing Instruction Contracts block the Bearing check while
  keeping all edits behind human approval.
- Make reconciliation observe `HEAD`, the configured canonical ref, and its
  locally available commit so clean commits, branch switches, and fast-forwards
  trigger Map and Instruction Contract refreshes without fetching.

## 0.2.0 (2026-09-17)

- Reframe Mauro as an ambient repository-context sidecar that coding agents
  invoke during normal work instead of a command-first human workflow.
- Add automatic repository behavior through `mauro-context` and document its
  initialization, reconciliation, briefing, and approval boundaries.
- Generate provider-neutral Navigator skills under `.agents/skills/` while
  retaining Claude Code agents, path rules, and lifecycle hooks.
- Install the ambient and explicit Mauro skills into Claude and shared agent
  skill directories for Claude Code, Codex, Grok, and compatible hosts.
- Add `mauro brief` for bounded task context and `mauro reconcile` for
  content-signature-based Map refreshes.
- Reconcile automatically at Claude session start and stop without repeatedly
  rescanning the same dirty working tree.
- Move standalone installations to the provider-neutral `~/.mauro` runtime,
  add `claude`, `shared`, and `all` host profiles, and migrate the former
  `~/.claude/mauro` runtime on update.
- Add installation and adapter health details to `mauro doctor`.
- Add manifest schema 2 and automatic reconciliation migrations for portable
  Navigator views; refuse unknown future schemas.
- Require init to ask for and pin one exact local or remote-tracking branch in
  `git.canonical_ref`; reject implicit, symbolic, missing, and non-branch refs.
- Show canonical branch, commit, and ahead/behind state in status and doctor.
- Guard document review and confirmation and Voyage lifecycle changes against
  missing, detached, behind, or diverged canonical history; preserve canonical
  evidence in review packets and Voyage baselines.
- Scan ambiguous `vendor/` and `build/` paths by default instead of treating
  every directory with those names as generated output.
- Warn during init and Bearing checks when `AGENTS.md` or `CLAUDE.md` exceeds
  the conservative 150,000-byte host-context threshold.
- Report Map publication separately from Bearing health, including the
  `published_with_findings` state for an approved Map with unresolved findings.

## 0.1.3 (2026-09-16)

- Add the prioritized product roadmap in `backlog.md`.
- Serialize Mauro state mutations with an atomic, owner-labelled local lock.
- Protect Map regeneration, document confirmation, Tool Gap changes, and the
  hook changed-path queue from concurrent writers.
- Report active and stale lock ownership through `mauro doctor`.
- Add `mauro doctor --clear-stale-lock`, which refuses unless the local owner
  process is proven gone.
- Give every `/mauro run` a durable Voyage ID and lifecycle record under
  `.mauro/voyages/`.
- Add explicit Voyage activation, resume, finish, abandon, and status commands.
- Claim approved path scopes at activation and refuse overlap with another
  active Voyage.
- Report active Voyages to other Claude Code sessions at session start.

- Add a README Quickstart and document the full current autonomous workflow.
- Make generated Navigator descriptions specific enough for proactive Claude
  Code delegation from any session in the repository.
- State when another Claude Code session must restart to load generated or
  regenerated Navigators, and expose discovery commands at session start.
- Keep generated Navigators read-only while the parent session implements and
  verifies product changes.

## 0.1.2 (2026-09-15)

- Refuse a review or a Voyage plan while the branch is behind its upstream, and state how far behind; `--allow-behind` continues.

- Add a project-local Tool Gap Log for recurring operations that the Toolbox does not provide.
- Deduplicate gap reports by Voyage and reporter, and promote candidates after repeated evidence.
- Add Tool Gap list, show, record, dismiss, resolve, and redacted export commands.
- Surface recurring Toolbox candidates through `mauro status` and `mauro next`.
- Exclude local Claude investigations and Mauro project state from npm packages.

- Record the commit that each document fingerprint describes (`verified_commit`, `verified_at`, `verified_dirty`, `verified_evidence`).
- Add `mauro docs review`: one review packet per suspect document, with the diff, commits and untracked files since the verification commit.
- Add `mauro docs confirm <id> --evidence <file>`: record a review that found a document still holds.
- Add the `mauro-docs-reviewer` agent and the document review workflow; a binding document needs two independent verdicts.
- Point `mauro next` and the session-start message at the document review instead of an update.

## 0.1.1 (2026-09-15)

- Add a registered, read-only Node.js Toolbox with structured discovery and execution.
- Tell Mauro and its agents to prefer registered tools over generated helper scripts.

- Never mark a historical document suspect: the Bearing check ignores its watches.
- Define a status report: a dated, people-only snapshot recorded as historical.
- Suggest deleting or correcting a stale non-binding document; code wins for a document that only restates code.
- Tell the docs mapper to recommend deletion first for a document that only restates code.

- Add `mauro next` (alias `n`, synonym `suggest`): findings and suggested next steps with commands.
- Keep survey anomalies and unresolved items across `map update`.
- Keep semantic and human-approved capabilities across `map update`.
- Render entrypoints, invariants, review, verification and rules in Navigator briefs.
- Report the Charter state as template, partial or complete; refuse `pr` and `refit` on a template.
- Keep the leading space of the first `git status --porcelain` line.
- Read the version from `package.json`; `npm version` releases through `scripts/sync-version.mjs`.
- Warn on a Map version difference only across a major or minor release.
- Add `mauro --version` and an install stamp read by `doctor`.
- Let `install.sh` and `install.ps1` detect an installation and offer to update it.
- Add a safe perimeter census for generated, excluded, and Git-ignored regions.
- Add configurable ignored-path scanning, recording, and path hiding.
- Include admitted ignored evidence and `.gitignore` changes in freshness checks.

## 0.1.0

- Add the Mauro Claude Code skill and plugin package.
- Add Expedition, Voyage, Bearing, Logbook, Refit, and pull-request workflows.
- Add deterministic repository scans, fingerprints, queries, and checks.
- Add package boundary stubs and configurable file-role scan policies.
- Add document, language, file-size, and safe symlink scan controls.
- Add generated project Navigators and path-scoped Claude rules.
- Add standalone installers with settings backup and lifecycle hooks.
- Add ASD-STE100 writing guidance, schemas, fixtures, and automated tests.
- Use `/foundingnimo:mauro` as the packaged plugin command.
