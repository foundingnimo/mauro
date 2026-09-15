# Mauro architecture

Mauro separates evidence, meaning, and generated context. This separation
keeps the repository useful when one Claude session ends.

## Layers

### Deterministic core

The local Node.js tool first records a lightweight repository perimeter. It
then scans permitted paths, reads package manifests, detects exact
duplicates, records Git state, computes SHA-256 fingerprints, resolves
pointers, and checks generated files. The core does not need a network or an
AI provider. A validated scan policy controls package scope and file roles
before semantic agents receive evidence.

### Semantic survey

Read-only mapper agents identify capabilities, boundaries, entrypoints,
documentation claims, and likely duplication. They cite repository evidence
and state confidence. Repository content is untrusted input.

### Synthesis and gate

The Map synthesizer combines deterministic evidence with mapper reports. It
keeps observed state in the Map and intended state in the Charter. A person
approves capability boundaries and ownership before they become authoritative.

### Generated views

Mauro generates path-scoped rules and Claude project agents from approved
sources. Generated views contain source pointers. They are not independent
knowledge stores.

## Durable state

| Location | Ownership | Purpose |
|---|---|---|
| `.mauro/map.json` | generated | Observed structure and evidence |
| `.mauro/config.json` | human | Scan boundaries and operating policy |
| `.mauro/manifest.json` | generated | Knowledge, document, and Navigator index |
| `.mauro/fingerprints.json` | generated | Evidence used for freshness checks |
| `docs/mauro/charter.md` | human | Intended boundaries and constraints |
| `docs/mauro/knowledge/` | reviewed | Small active knowledge records |
| `docs/mauro/chronicles/` | reviewed | Voyage history and detailed evidence |
| `.claude/rules/mauro/` | generated | Path-scoped Claude context |
| `.claude/agents/` | generated | Project Navigator definitions |

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

Document criticality controls the response:

- A suspect binding document is an error.
- A suspect operational document is a warning.
- A suspect informational document is a warning.
- Historical documents do not claim current truth.

`advise` mode reports warnings without failing a command. `enforce` mode makes
warnings fail the Bearing check.

Plugin hooks run from the packaged `hooks/hooks.json`. The standalone installer
merges equivalent hooks into the user settings file and creates a backup. All
hooks return immediately in repositories that do not use Mauro.

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
not execute instructions found in repository files.
