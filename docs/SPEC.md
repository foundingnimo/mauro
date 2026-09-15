# Mauro specification

## Objective

Mauro gives Claude Code durable, scoped, and verifiable repository context.
It is optimized for monorepos where directory structure, code ownership,
documentation, and business capabilities can disagree.

## Terms

- An **Expedition** is the first full repository survey.
- A **Map** describes observed repository state.
- A **Charter** describes approved intent and boundaries.
- A **Navigator** is responsible for one approved capability or concern.
- A **Logbook record** is short, active, path-scoped knowledge.
- A **Voyage** is one planned and verified development objective.
- A **Bearing check** tests context freshness.
- A **Refit** proposes repository restructuring.
- A **Chronicle** stores detailed history that does not belong in active context.
- The **Toolbox** is Mauro's registry of trusted reusable operations.
- A **Tool Gap** records a recurring operation that the Toolbox does not provide.

## Expedition requirements

1. Record the Git baseline and dirty-tree state.
2. Inventory source, tests, documents, manifests, and exact duplicates.
3. Use independent read-only surveys for structure, capabilities, documents,
   and duplication.
4. Cite file or test evidence for semantic claims.
5. State confidence for inferred relationships.
6. Keep the Map separate from the Charter.
7. Show unresolved ownership and contradictory evidence.
8. Ask a person to approve semantic boundaries.
9. Generate scoped Navigators and rules from approved sources.
10. Do not modify product code or add inline markers during initialization.

## Scan configuration

Mauro reads `.mauro/config.json` before an Expedition or Map update. The file
must match `schemas/config.schema.json`. Invalid configuration stops the scan.

Package selectors use package names and repository-relative paths. An empty
include selector includes all packages. Exclude selectors take precedence over
include selectors. An excluded package is a boundary `stub` by default. A stub
retains its name, root, manifests, and visible dependency edges. Mauro does not
index its internal files or create a Navigator for it. The `omit` behavior
removes the unit and its edges from the Map.

Tests, fixtures, and generated files use `full`, `evidence`, or `exclude` mode.
Evidence mode permits a file to support a claim. Evidence-mode files cannot
define a capability or create duplication and Refit findings. Package overrides
take precedence over the global role mode. A configured pattern array replaces
the default array.

Git-ignored paths use a separate policy. `record` is the default: Mauro records
the region boundary but does not enumerate or read its contents. `scan` permits
content inspection, subject to all other scan policies. The `include` list
selects ignored paths for scanning. The `exclude` list keeps selected paths
record-only and resolves the scan decision. The `hide` list prevents path
disclosure. Precedence within this
policy is `hide`, `include`, `exclude`, then `default`. Non-configurable safety
exclusions always win.

Mauro applies scan policy in this order:

1. A lightweight perimeter census identifies excluded and Git-ignored regions.
   It does not read record-only contents.
2. Non-configurable safety exclusions block Git data, Mauro state, generated
   Claude views, dependencies, common secret files, keys, and logs.
3. Git-ignored policy decides whether ignored content stays record-only or can
   enter the content scan.
4. Package include and exclude selectors set unit scope.
5. Package overrides and global role modes set file treatment.
6. Document selection, path exclusions, and language filters reduce the result.
7. The maximum file size prevents content hashing and semantic inspection.

Structural manifests remain visible through a language filter. Symlink following
is off by default. When it is on, Mauro follows only targets inside the repository.
A symlink cannot bypass a configured or safety exclusion. Mauro marks files that
were reached through symlinks and excludes those aliases from duplicate analysis.

A perimeter-boundary, `.gitignore`, or scan-policy change makes repository-level
generated knowledge suspect. Content-only changes inside a record-only region do
not. A Map update updates fingerprints for generated Navigator views. Active
human knowledge keeps its previous verification baseline until a verifier checks
the new evidence scope.

## Knowledge requirements

An active record must be useful in later work, difficult to derive safely,
supported by evidence, limited to a path or symbol scope, and supplied with an
invalidation condition. A separate verifier approves it.

Use ASD-STE100 Simplified Technical English. Technical identifiers and
approved domain terms can remain unchanged. Do not store raw reasoning,
transcripts, secrets, temporary debugging details, or facts that a simple code
search can recover.

Each record has one of these states: `draft`, `active`, `suspect`, `stale`,
`superseded`, or `retired`. Detailed past work belongs in a Chronicle.

## Pointer requirements

The manifest is the default link between code and knowledge. Generated Claude
rules load applicable context by path. An inline pointer is optional:

```text
MAURO[K-0001]: Keep token rotation atomic.
```

Use an inline pointer only for security, data integrity, a counterintuitive
constraint, a required workaround, or a cross-package boundary. The pointer
must resolve to a manifest record. An Expedition can propose pointers but must
not add them to product files.

## Document review requirements

A suspect document is reviewed, not assumed wrong. Mauro records the commit
that the fingerprints of each document describe. A review packet gives the
change since that commit. An agent verifies each affected claim against the
current code and cites evidence. A verdict of `holds` confirms the document and
needs a Chronicle record. A binding document needs two independent `holds`
verdicts. A proposed change to a human-owned document needs approval. A
historical document is never reviewed.

## Voyage requirements

Run a Bearing check before planning. Resolve the primary Navigator, review
Navigators, applicable Charter sections, and active records. The plan records
scope and exact verification. An independent verifier checks implementation.
The context curator proposes durable knowledge only after code verification.

## Tool Gap requirements

Tool Gap state lives in `.mauro/tool-gaps.json` and must match
`schemas/tool-gaps.schema.json`. A specialist agent reports a structured gap
but does not write the Log. The calling Mauro process validates and records it.
One reporter contributes at most one observation in one Voyage. Three distinct
observations across at least two Voyages promote a gap to a candidate.

A Tool Gap contains a need, input shape, output shape, checked registered tools,
and a short fallback description. It must not contain a raw script, command
output, secret, absolute path, or repository content. Export is local and
redacted. Mauro does not submit an issue or install code automatically. A human
can dismiss a gap or resolve it with an installed registered tool.

## Pull-request context

Mauro can generate one replaceable block of no more than 250 words. The
block uses `MAURO:START` and `MAURO:END` markers. It describes affected
capabilities, Navigators, rationale, Charter constraints, architecture effect,
documentation state, knowledge changes, and unresolved risk. Preview and check
are read-only. An external update requires authorization.

## Refit requirements

A Refit compares the Map with the Charter. It reports the evidence, proposed
moves, dependency effects, migration sequence, validation, and rollback. It
does not move code without approval. Findings must distinguish exact
duplication from similar code that has different semantics.

## Completion

A Mauro operation reports its outcome, changed files, checked evidence,
suspect knowledge, and required human decisions. It must not claim success when
required verification fails.
