# Maintenance workflow

Mauro uses evidence changes to detect stale knowledge. A recent timestamp is
not proof of freshness.

## Bearing check

Run `mauro check --root <repo>`.

Check:

- Canonical knowledge structure
- Path scopes
- Source fingerprints
- Missing, stale, or superseded records
- Inline marker resolution
- Documentation dependencies
- Generated rule sources
- Generated Navigator sources
- Map schema version

The check is read-only.

Run `mauro map update` after a scan-policy change. The update rebaselines
generated Navigator views. It does not silently reapprove active human
knowledge under the new evidence scope.

## Recheck levels

### Local Map update

Use when normal source files change. Recheck affected capabilities, knowledge,
documents, Navigators, and duplicate groups.

### Structural Map update

Use when package manifests, workspace settings, schemas, exports, entrypoints,
build files, or deployment files change. Rebuild affected graph regions.

### New Expedition

Use when a major application changes, more than 20 percent of maintained paths
move, capability ownership becomes unreliable, or the Map schema changes.

## Document states

- `current`: Evidence matches verified fingerprints.
- `suspect`: Linked evidence changed; truth is unknown.
- `stale`: Current evidence contradicts the document.
- `superseded`: A newer document replaces it.
- `historical`: The document records past state.

Binding documents block completion when suspect or stale. Operational documents
require review. Informational documents produce warnings. Historical documents
are never suspect. The Bearing check ignores their watches.

## Stale documents: code wins

A stale document that only restates code is deleted. Propose deletion first.
Propose a correction only when the document holds a decision, a rule, or
intended state, such as `AGENTS.md` or the Charter. After a deletion, repoint
every reference to the deleted file at the code. Retire its manifest record.

## Status reports

A status report is a dated snapshot of the system for people. It is not
maintained.

- Put the date in the file name. A new report is a new file.
- Mark it with `kind: status-report`, `audience: people`, and `as_of`.
- Add a banner that tells agents not to read it for guidance.
- Record it with `status` and `criticality` set to `historical` and no watches.
- A status report can carry counts, because every count is true of its date.
- Never update an earlier report. Never cite a report in a rule or Navigator.

## Changes outside Mauro

Hooks record changed paths. A Stop hook also scans Git status because shell
commands can bypass Edit and Write hooks. Session-start checks report suspect
records. CI can run the same deterministic Bearing check.

Never rewrite human-owned documentation silently. Generate a proposal and show
the diff.
