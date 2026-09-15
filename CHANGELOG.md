# Changelog

## Unreleased

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
