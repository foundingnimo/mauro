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
require review. Informational documents produce warnings.

## Changes outside Mauro

Hooks record changed paths. A Stop hook also scans Git status because shell
commands can bypass Edit and Write hooks. Session-start checks report suspect
records. CI can run the same deterministic Bearing check.

Never rewrite human-owned documentation silently. Generate a proposal and show
the diff.
