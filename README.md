# Mauro

Mauro maps software repositories and preserves verified context between
Claude Code sessions. It is designed for monorepos whose code, documentation,
and ownership boundaries do not always match their directory structure.

Mauro has four durable outputs:

- A **Charter** records intended boundaries and human decisions.
- A **Map** records observed repository structure and relationships.
- **Navigators** provide aspect-specific agent views.
- The **Logbook** provides short, path-scoped knowledge to Claude Code.

Mauro writes human-readable notes in ASD-STE100 Simplified Technical
English. Project identifiers and declared technical nouns are permitted.

## Status

Version 0.1 is a working minimum viable release:

- Repository initialization and inventory scan
- Charter creation and validation
- Map display and search
- Knowledge display, search, and structural validation
- Pointer and fingerprint Bearing checks
- Command help and stable aliases
- A registered read-only Node.js Toolbox for recurring repository analysis
- Document review: Mauro re-checks a document whose evidence changed
- Claude Code agents, hooks, and workflow instructions

Semantic capability mapping, context curation, and Refit proposals are
performed by Claude agents through the Mauro skill.

## Install

### Standalone installation

Standalone installation preserves the `/mauro` command:

```bash
./install.sh
```

The installer preserves existing Claude settings, creates a backup, and adds
Mauro lifecycle hooks. Use `./install.sh --no-hooks` when you do not want
user-level hooks. PowerShell users can run `./install.ps1` or
`./install.ps1 -NoHooks`.

Restart Claude Code. Run:

```text
/mauro help
/mauro init
```

Standalone mode keeps the short command name. Both normal installation modes
add automatic session and change hooks.

Run `./install.sh` again to update. It detects the installation, shows the
installed and checkout versions, and asks before it replaces
`~/.claude/mauro` and `~/.claude/skills/mauro`. It does not touch
`settings.json` or the hooks. Without a terminal, pass `--update` or `--yes`
(PowerShell: `./install.ps1 -Update` or `-Yes`). Restart Claude Code
afterwards, because the running session keeps the old skill text.

`mauro --version` prints the version, the commit and the checkout an
installation came from. `mauro doctor` prints the same stamp.

### Releasing

`package.json` is the only place the version is written. Release with npm:

```bash
npm version patch   # or minor, major
```

`preversion` runs the tests and the plugin validator. `version` runs
`scripts/sync-version.mjs`, which copies the version into
`.claude-plugin/plugin.json` and turns the `## Unreleased` section of
`CHANGELOG.md` into the release section. npm then commits and tags `v<version>`.
A release with an empty `## Unreleased` section is refused, so record changes
as you make them. A Bearing check warns about a Map built by another version
only across a major or minor release.

### Plugin development

Load this checkout directly:

```bash
claude --plugin-dir .
```

Plugin skills use a namespace:

```text
/foundingnimo:mauro help
```

Claude uses the plugin name as the command namespace. The plugin name is
`foundingnimo`, and the skill name is `mauro`.

## Main commands

| Command | Alias | Purpose |
|---|---:|---|
| `check` | `c` | Run a Bearing check |
| `docs` | `d` | Inspect documentation state |
| `help` | `h` | Show command help |
| `impact` | `i` | Predict affected repository areas |
| `knowledge` | `k` | Inspect or maintain knowledge |
| `map` | `m` | Inspect or update the repository Map |
| `next` | `n` | List findings and suggested next steps |
| `pr` | `p` | Generate bounded pull-request context |
| `run` | `r` | Start a development Voyage |
| `status` | `s` | Show Mauro state |
| `where` | `w` | Find code and docs for a concept |

Infrequent commands do not consume one-letter aliases: `charter`, `doctor`,
`init`, `navigator`, `refit`, `tool`, `who`, and `why`.

## Toolbox

Mauro installs deterministic tools for operations that agents would otherwise
reimplement as temporary scripts:

```text
mauro tool list --json
mauro tool describe dependency-graph --json
mauro tool run repository-files --path "apps/**" --role source --json
mauro tool run dependency-graph --unit payments --json
mauro tool run documentation-index --status suspect --json
mauro tool run duplicate-analysis --path "packages/**" --json
```

Each tool declares its runtime, permissions, input schema, and output schema.
The first Toolbox release is read-only and does not use the network. A tool can
start only the subprocesses that it declares; the documentation index declares
Git because its Bearing check inspects ignore rules. Results are bounded to
protect the Claude context window.

## Document review

A fingerprint says that a watched path changed. It does not say whether the
document is now wrong. Mauro records the commit that the fingerprints of each
document describe, so it can show what changed and let a review decide:

```text
mauro docs review            # one packet per suspect document
mauro docs review --json     # the packets an agent reads
mauro docs confirm <id> --evidence docs/mauro/chronicles/reviews/<file>.md
```

A packet holds the diff since the verification commit, the commit subjects, and
the untracked files in the watched paths. Without a usable commit, the packet
asks for a full review of the document against the current code. The
`mauro-docs-reviewer` agent verifies each affected claim and returns `holds`,
`needs-change`, or `unsure`. The skill records every verdict in a Chronicle
file. `confirm` then refreshes the fingerprints and records HEAD. It refuses
without that Chronicle file. A binding document needs two independent `holds`
verdicts. A historical document, such as a dated status report, is never
reviewed.

## Project files

Mauro creates these files inside a target repository:

```text
docs/mauro/knowledge/       canonical durable knowledge
docs/mauro/chronicles/      approved Voyage summaries
docs/mauro/artifacts/       diagrams and supporting artifacts
docs/mauro/charter.md       human-owned architectural intent
docs/mauro/map.md           human-readable observed structure
.mauro/map.json             machine-readable observed structure
.mauro/config.json          repository scan and operating policy
.mauro/manifest.json        knowledge and documentation index
.mauro/fingerprints.json    freshness evidence
docs/mauro/chronicles/reviews/  document review verdicts and evidence
.claude/rules/mauro/        generated path-scoped knowledge
.claude/agents/                generated project Navigators
```

The changed-path queue in `.mauro/changed-paths.json` is machine state. A
team can commit it or ignore it according to its workflow.

## Configure an Expedition

Prepare `.mauro/config.json` before `mauro init` to configure the first scan.
When the file is absent, `init` creates the default configuration. You can edit
it before a later `mauro map update`. Mauro validates the file before it scans
the repository.

This excerpt shows the package and role fields in the generated file:

```json
{
  "scan": {
    "packages": {
      "include": { "names": [], "paths": [] },
      "exclude": { "names": ["@company/legacy-*"], "paths": [] },
      "excluded_behavior": "stub"
    },
    "tests": { "mode": "evidence", "patterns": ["**/*.test.*"] },
    "fixtures": { "mode": "evidence", "patterns": ["**/fixtures/**"] },
    "generated": { "mode": "exclude", "patterns": ["**/dist/**"] },
    "gitignored": {
      "default": "record",
      "include": ["docs/private/**"],
      "exclude": [],
      "hide": []
    }
  }
}
```

The complete file contains the required fields. Keep them when you edit the
configuration. Pattern arrays replace the defaults; they do not extend them.
Package selectors accept names and repository-relative path
patterns. An excluded package is a `stub` by default. Mauro keeps its name,
root, manifests, and dependency edges, but it does not create a Navigator or
index internal files. Set `excluded_behavior` to `omit` to remove it from the
Map.

File roles use these modes:

- `full`: Include the files in evidence and analysis.
- `evidence`: Let files support claims, but do not use them to define
  capabilities or duplication and Refit findings.
- `exclude`: Do not scan or fingerprint the files.

Mauro treats `.gitignore` as repository evidence, not as an absolute scan
boundary. The default `record` mode lists ignored regions in the perimeter
inventory without reading their contents. Use `include` for intentionally
ignored evidence such as local documentation. Use `exclude` to keep a region
record-only and mark that choice as intentional. Use `hide` when its path must
not appear in the Map. Safety
exclusions for secrets and Mauro internals always win. An ignored-file include
does not override generated, test, fixture, document, path, or language policy.
The same perimeter inventory records generated and policy-excluded boundaries
even when Git does not ignore them.

The scan also supports package-specific role overrides, document selection,
path exclusions, language filters, a maximum file size, and opt-in in-repository
symlinks. See [the specification](docs/SPEC.md) for precedence and safety rules.

## Safety

- An Expedition does not modify product code.
- Refit findings are proposals, not automatic moves.
- Raw transcripts and secrets are not durable knowledge.
- Generated rules and Navigators are projections. Their canonical sources
  remain under `docs/mauro/` and `.mauro/`.
- Writes to human-owned documents require a visible diff and approval.

See [the architecture](docs/ARCHITECTURE.md), [the command reference](docs/COMMANDS.md),
and [the specification](docs/SPEC.md).
