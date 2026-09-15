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
