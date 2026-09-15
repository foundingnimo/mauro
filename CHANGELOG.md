# Changelog

## Unreleased

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
