# Scan configuration

Read `.mauro/config.json` before an Expedition, Map update, or semantic survey.
Stop when the deterministic tool reports invalid configuration.

## Package scope

Package selectors contain `names` and repository-relative `paths`. Exclude
selectors win over include selectors. An empty include selector includes every
package.

- `included`: Inspect the package and propose a Navigator.
- `stub`: Use only its name, root, manifests, and dependency edges.
- `omit`: Do not use the package or its edges.

Do not open a stub or omitted package to gain more context.

## Perimeter and Git-ignored paths

The inventory contains `perimeter_regions`. These are known boundaries, not
content evidence. Do not enumerate or open a region whose treatment is
`record` or `partial`.

Git-ignored content is `record` by default. Configure `scan.gitignored` with:

- `default`: `record` or `scan`.
- `include`: Permit selected ignored paths to enter the content scan.
- `exclude`: Keep selected ignored paths record-only and mark the decision as intentional.
- `hide`: Do not disclose selected paths in the Map.

Precedence is `hide`, `include`, `exclude`, then `default`. Hard safety
exclusions always win. An `include` only crosses the Git-ignored boundary. The
package, role, document, path, language, size, and symlink rules still apply.
Ask for a human decision when an ignored documentation or design region has
`review_required: true`.
The addition or removal of a perimeter region makes the Map suspect. A content
change inside an existing record-only region does not.

## File roles

Tests, fixtures, and generated files have one of these modes:

- `full`: Use the files in evidence and semantic analysis.
- `evidence`: Use the files only to verify or contradict a claim.
- `exclude`: Do not inspect the files.

An evidence file cannot define a capability. It cannot create a duplication or
Refit finding. A package override takes precedence over the global role mode.

Document, path, and language filters apply after role selection. Structural
manifests remain available through a language filter. Do not read an oversize
file when its Map entry has `oversize: true`.

Symlink following is disabled by default. When it is enabled, use only the
in-repository paths emitted by the deterministic inventory. Do not follow a
link outside the repository or through an excluded target.
