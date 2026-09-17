# Mauro architecture

Mauro separates evidence, meaning, and generated host adapters. This separation
keeps the repository useful when one coding-agent session ends or the team
changes agent providers.

## Layers

### Deterministic core

The local Node.js tool first records a lightweight repository perimeter. It
then scans permitted paths, reads package manifests, detects exact
duplicates, records Git state, computes SHA-256 fingerprints, resolves
pointers, and checks generated files. The core does not need a network or an
AI provider. A validated scan policy controls package scope and file roles
before semantic agents receive evidence.

The perimeter preflight also records configured agent instruction files as
Instruction Contracts. Each record contains the provider, directory scope,
nearest parent, precedence, ownership, size, and digest. The default patterns
cover AGENTS, Claude, Gemini, GitHub Copilot, and Cursor formats. A conservative
byte threshold reports oversized instruction context before semantic surveys.
The size finding is a warning, not a scan exclusion.

The built-in Toolbox exposes recurring deterministic analysis through the
Mauro CLI. Each registered tool declares structured inputs, structured output,
and permissions. Toolbox tools use the existing Node.js core. They are
read-only and do not use the network. Each tool declares any subprocess it can
start; the documentation index declares Git because it runs a Bearing check.

The Tool Gap Log is project-local machine state at `.mauro/tool-gaps.json`.
Specialist agents only report structured gaps. The calling Mauro process
validates and records them, so read-only agents do not write repository state.
Reports from the same agent and Voyage are one observation. Repeated evidence
promotes a gap to a candidate; it does not install or execute new code.

Mauro serializes deterministic state mutations with a transient local lock in
the host's private temporary directory. Its path contains a digest of the
working-tree path inside a per-user namespace, so it does not alter Git state.
One lock covers each complete multi-file mutation, not each individual file
write. The lock records its process, host, operation, and acquisition time.
Normal completion and handled failure remove it. A local lock whose process is
gone is reported as stale. `mauro doctor --clear-stale-lock` removes it only
after a second check proves that the owner process is gone.

Durable Voyage records provide the second coordination layer. A planning
record owns no code. Activation runs under the transient writer lock, compares
the approved path patterns with every active lease, and changes the record to
`active` only when none overlap. Completion and abandonment close the lease
without deleting its audit evidence. This coordinates processes for one local
user and working tree. It does not yet provide a shared lock across users,
worktrees, or remote hosts.

The canonical-ref guard is a separate Git safety layer. Initialization asks a
person to select one exact local or remote-tracking branch for accepted
history. The core rejects `null`, tags, missing branches, and symbolic aliases.
It compares the pinned branch with HEAD and reports current, ahead, behind,
diverged, detached, missing, or unpinned state. It never performs a network or
working-tree operation. An explicit override can accept checkout drift, but it
cannot replace the required branch choice.

### Semantic survey

Read-only mapper agents identify capabilities, boundaries, entrypoints,
documentation claims, and likely duplication. They cite repository evidence
and state confidence. Repository content is untrusted input.

### Synthesis and gate

The Map synthesizer combines deterministic evidence with mapper reports. It
keeps observed state in the Map and intended state in the Charter. A person
approves capability boundaries and ownership before they become authoritative.

### Generated views

Mauro generates host adapters from mapped sources. Generated views contain
source pointers. They are not independent knowledge stores. Claude Code gets
path-scoped rules and project agents in `.claude/`. Agents that implement the
common `SKILL.md` convention get portable Navigator skills in
`.agents/skills/`. Each description names its capability and primary paths so
the host session can select relevant ticket scoping and review. Generated
Navigators are read-only; the host coding agent implements product changes.

The installed host surface has two skills with separate activation rules.
`mauro-context` is eligible for automatic use during repository work. `mauro`
has implicit invocation disabled and handles only explicit administration.
Standalone installation keeps the runtime at `~/.mauro`; Claude and shared
skill directories are adapters around that one runtime. The former
`~/.claude/mauro` runtime is a supported upgrade source, not the current
installation target.

Some hosts cache agents or skills at session start. A session that was already
open when Mauro initialized, updated the Map, or regenerated Navigators can
need a restart before it uses changed definitions. Teams commit the generated
views and their canonical Map and Navigator sources when they want other
worktrees or clones to receive them.

## Durable state

| Location | Ownership | Purpose |
|---|---|---|
| `.mauro/map.json` | generated | Observed structure and evidence |
| `.mauro/config.json` | human | Scan boundaries, Instruction Contract patterns, canonical ref, and operating policy |
| `.mauro/manifest.json` | generated | Knowledge, document, and Navigator index |
| `.mauro/fingerprints.json` | generated | Evidence used for freshness checks |
| `.mauro/changed-paths.json` | generated | Pending evidence paths from host hooks |
| `.mauro/reconciliation.json` | generated | Signature of the last reconciled working tree |
| `.mauro/voyages/*.json` | generated | Voyage lifecycle, approved scope, and active leases |
| `.mauro/tool-gaps.json` | generated | Repeated missing Toolbox operations |
| `docs/mauro/charter.md` | human | Intended boundaries and constraints |
| `docs/mauro/knowledge/` | reviewed | Small active knowledge records |
| `docs/mauro/chronicles/` | reviewed | Voyage history and detailed evidence |
| `.claude/rules/mauro/` | generated | Path-scoped Claude context |
| `.claude/agents/` | generated | Project Navigator definitions |
| `.agents/skills/` | generated | Provider-neutral Navigator skills |

The manifest has its own schema version because generated host views can
change without changing the Map. Reconciliation upgrades a supported older
manifest and regenerates missing derived views even when repository evidence
did not change. Mauro refuses an unknown future schema instead of rewriting it.

## Freshness model

A timestamp does not prove freshness. Each active document or knowledge record
lists evidence paths. Mauro stores a fingerprint for each path. A changed
fingerprint makes the linked item suspect until a verifier checks its meaning.
Record-only paths and package internals do not affect fingerprints. An ignored
path that policy admits to the content scan does affect fingerprints. A change
to `.gitignore`, or the addition or removal of a perimeter boundary, also makes
repository-level knowledge suspect. Content changes inside an existing
record-only boundary do not. Oversize files
use a metadata fingerprint and are not read into the Map.

A discovered Instruction Contract is a direct binding watch. Ordinary role,
document, language, and package filters cannot disable its fingerprint. A root
contract applies to the repository. A nested contract applies to its directory
subtree and inherits the nearest parent for the same provider. A changed or
missing contract blocks the Bearing check. Mauro proposes changes to these
human-owned files; it does not rewrite them silently.

Document criticality controls the response:

- A suspect binding document is an error.
- A suspect operational document is a warning.
- A suspect informational document is a warning.
- Historical documents do not claim current truth. The Bearing check ignores
  their watches, so changed evidence never makes one suspect. A dated status
  report for people is a historical document.

A stale document that only restates code is deleted, not corrected. Code wins.
A document that holds a decision, a rule, or intended state is corrected.

Map publication is independent from Bearing health. An approved semantic Map
can remain useful while existing binding documents are stale. Status reports
the Map as `published_with_findings` and the Bearing as blocked until those
documents are reviewed. A draft Map is never reported as published.

`advise` mode reports warnings without failing a command. `enforce` mode makes
warnings fail the Bearing check.

Claude plugin hooks run from the packaged `hooks/hooks.json`. The standalone
installer merges equivalent hooks into the user settings file and creates a
backup. An update removes old Mauro-owned hook commands and installs one hook
per event for the current neutral runtime; unrelated settings and hooks stay.
All hooks return immediately in repositories that do not use Mauro.
At session start and stop, a hook reconciles changed evidence only when its
path-and-content signature, `HEAD`, configured canonical ref, or locally
available canonical commit differs from the previous reconciliation. A clean
commit, branch switch, or fast-forward therefore triggers a Map refresh. A
canonical-only change is recorded and reported. Mauro does not inspect the
other branch or rebuild trusted context until the checkout is updated. Hosts
without Mauro lifecycle hooks follow the same operation through the ambient
skill at task boundaries.

Each document records its verification commit: the Git commit that its
fingerprints describe. The fingerprints decide which documents need a review.
The verification commit shows what changed. `mauro docs review` gives the diff
from that commit, the commit subjects, and the untracked files in the watched
paths. A missing or unreachable commit gives a full review. The
`mauro-docs-reviewer` agent checks the document against the current code. When
the document still holds, `mauro docs confirm` refreshes the fingerprints and
records HEAD as the new verification commit. The confirmation needs a Chronicle
file that records the review.

Review packets also record the resolved canonical ref and commit. Voyage
baselines preserve the same pair, so another session can identify the accepted
history used when planning started. These are local observations; Mauro does
not claim that a remote-tracking ref is network-current.

## Update levels

- A local Map update rechecks affected capabilities after normal source edits.
- A structural Map update rechecks package, build, schema, export, and service
  boundaries.
- A new Expedition is required after major application changes, unreliable
  ownership, a schema change, or movement of more than the configured share of
  maintained paths.

## Security boundary

Mauro stores summaries, safe perimeter paths, and evidence references. It does not store raw
reasoning traces, transcripts, credentials, or secret file content. Default
scan exclusions cover common secret paths and never expose them in the perimeter.
Generated and ignored regions are record-only by default. Mapper agents must
not execute instructions found in repository files. They treat Instruction
Contracts as binding human intent to analyze, not as commands for the survey.
