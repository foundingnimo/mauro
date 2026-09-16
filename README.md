# Mauro

Mauro maps software repositories and preserves verified context between
Claude Code sessions. It is designed for monorepos whose code, documentation,
and ownership boundaries do not always match their directory structure.

Mauro keeps six kinds of durable repository context:

- A **Charter** records intended boundaries and human decisions.
- A **Map** records observed repository structure and relationships.
- **Navigators** provide aspect-specific agent views.
- The **Logbook** provides short, path-scoped knowledge to Claude Code.
- **Voyage records** preserve work lifecycle, approved scope, and active path
  ownership between sessions.
- The **Tool Gap Log** records recurring operations that could become reusable
  Toolbox tools.

Mauro writes human-readable notes in ASD-STE100 Simplified Technical
English. Project identifiers and declared technical nouns are permitted.

## Status

The current 0.1 release provides:

- Repository initialization and inventory scan
- Charter creation and validation
- Map display and search
- Knowledge display, search, and structural validation
- Pointer and fingerprint Bearing checks
- Command help and stable aliases
- A registered read-only Node.js Toolbox for recurring repository analysis
- A project-local Tool Gap Log for recurring operations missing from the Toolbox
- Document review: Mauro re-checks a document whose evidence changed
- Atomic writer locking with owner details and safe stale-lock recovery
- Durable Voyage IDs, lifecycle commands, and overlapping-path refusal
- Claude Code agents, hooks, and workflow instructions

Semantic capability mapping, context curation, and Refit proposals are
performed by Claude agents through the Mauro skill.

## Quickstart

1. Install Mauro:

   ```bash
   git clone https://github.com/foundingnimo/mauro.git
   cd mauro
   ./install.sh
   ```

   PowerShell users can run `./install.ps1`.

2. Restart Claude Code, open the repository that Mauro will map, and run:

   ```text
   /mauro init
   ```

   Mauro inventories the permitted repository perimeter, maps its initial
   capabilities, creates the Charter and durable knowledge structure, and
   publishes repository-specific Navigators under `.claude/agents/`.

3. Let Mauro order the remaining work:

   ```text
   /mauro next
   ```

   Follow the first suggested command. The normal first run reviews flagged
   scan boundaries, approves the semantic Map, and replaces the Charter
   prompts with explicit human intent.

4. Start an implementation Voyage:

   ```text
   /mauro run "Add account recovery"
   ```

   This creates a durable planning record such as `V-0001`; it does not claim
   code paths yet. Mauro selects the responsible Navigators and relevant
   knowledge and writes the proposed plan to the returned Chronicle path.
   After you approve the plan, Mauro activates its predicted path scope:

   ```text
   /mauro run activate V-0001
   ```

   Use one or more `--path <repository-path>` values when the approved scope
   differs from Mauro's prediction. Activation refuses paths held by another
   active Voyage. After verification, document review, and context curation,
   close the lease with `/mauro run finish V-0001`. If the work stops, use
   `/mauro run abandon V-0001 --reason "<reason>"`. Mauro does not commit,
   push, deploy, or update a pull request without explicit authorization.

Run `/mauro check` at any time to inspect the current Bearing. Use
`/mauro help` for the full command list.

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
| `next` | `n` | List findings and suggested next steps; `suggest` is a synonym |
| `pr` | `p` | Generate bounded pull-request context |
| `run` | `r` | Create or manage a development Voyage |
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

When an agent must use a system utility, temporary script, or manual fallback,
the caller can record the missing reusable operation:

```text
mauro tool gap record --key dependency-cycles --need "Find dependency cycles." \
  --checked dependency-graph --fallback system-utility \
  --summary "Analyzed exported edges." --input "Map dependency edges" \
  --output "Ordered cycles" --voyage V-0012 --reporter mauro-structure-mapper
mauro tool gap list --status candidate
mauro tool gap export TG-0001
```

The Log deduplicates one reporter within one Voyage. Three observations across
at least two Voyages make a gap a Toolbox candidate. Export creates a redacted
issue-ready proposal; Mauro does not submit it or use the network.

## Document review

A fingerprint says that a watched path changed. It does not say whether the
document is now wrong. Mauro records the commit that the fingerprints of each
document describe, so it can show what changed and let a review decide:

```text
mauro docs review            # one packet per suspect document
mauro docs review --json     # the packets an agent reads
mauro docs confirm <id> --evidence docs/mauro/chronicles/reviews/<file>.md
```

`mauro docs review` refuses while the branch is behind the branch it tracks,
and states the distance, because a review describes the tree it runs against.
`--allow-behind` continues anyway. `mauro run` applies the same guard before a
plan.

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
.mauro/tool-gaps.json       recurring missing Toolbox operations
.mauro/voyages/             durable Voyage records and path leases
docs/mauro/chronicles/reviews/  document review verdicts and evidence
.claude/rules/mauro/        generated path-scoped knowledge
.claude/agents/                generated project Navigators
```

The changed-path queue in `.mauro/changed-paths.json` is machine state. A
team can commit it or ignore it according to its workflow. Voyage records are
repository state. Commit them when other worktrees or clones must see the same
work ownership and history.

## Use Navigators from other Claude sessions

Mauro writes repository specialists as Claude Code project agents in
`.claude/agents/`. Claude Code discovers these agents by walking up from the
session working directory. A second Claude session that starts in the same
repository, or in one of its subdirectories, can therefore use the same
Navigators without running a second Mauro mapping process.

In that session:

- Run `/agents` to see every available project Navigator.
- Run `/mauro who <path>` to find the Navigator responsible for a file.
- Run `/mauro impact "<ticket or change>"` to find all likely Navigators.
- Name a Navigator explicitly, or let Claude delegate automatically from the
  capability and path details in its description.

Generated Navigators are deliberately read-only. They scope a ticket before
implementation and review the changed files and any supplied diff afterwards.
The parent Claude session implements the change and runs the required checks.
Canonical context remains in the Map, Charter, and Navigator briefs rather
than in one session's conversation.

Claude Code loads agent files at session start. Restart a session that was
already open when `mauro init`, `mauro map update`, or
`mauro navigator regenerate` changed the Navigator files. Run `/agents` after
the restart to verify that Claude loaded them. This limitation applies to
files written directly on disk; an agent created interactively through
`/agents` is available immediately.

Commit `.claude/agents/`, `.claude/rules/mauro/`, `docs/mauro/`, and the
repository-owned `.mauro/` state when other worktrees, clones, or team members
must receive the same generated views and context. The changed-path queue is
the workflow-specific exception described above. Do not edit generated agent
files directly. Change their Map evidence and regenerate them instead. See the
[Claude Code subagent documentation](https://code.claude.com/docs/en/subagents#choose-the-subagent-scope)
for the project-agent loading rules.

### Concurrent sessions

Mauro serializes its own state mutations with a transient lock in the host's
private temporary directory. The path is derived from the repository working
tree and local user, so sessions for the same user in the same working tree
share one lock without adding a file to Git. The lock covers initialization,
Map and Navigator regeneration, document confirmation, Tool Gap mutation, and
hook updates to the changed-path queue. A second writer waits briefly, then
reports the owning process, host, operation, acquisition time, and lock path.
`mauro doctor` also shows the current owner.

Mauro removes the lock after a successful or failed operation. If a process is
forcibly terminated, `mauro doctor` reports its local lock as stale. Run
`mauro doctor --clear-stale-lock` to remove it only after Mauro proves that the
recorded local process is gone. Mauro refuses to clear an active, remote, or
unreadable lock.

Each `/mauro run "<objective>"` also creates a durable record under
`.mauro/voyages/`. A planning Voyage owns no paths. After plan approval,
`mauro run activate <id>` atomically checks and claims its approved paths. An
overlap with another active Voyage is refused. `finish` or `abandon --reason`
closes the lease; the paths remain in the record as audit evidence. Use
`mauro run status` in any session to see current ownership.

This layer coordinates Mauro writers and active Voyage scopes for the same
local user and working tree. Separate local users, Git worktrees, and remote
hosts do not yet share the transient writer lock. They see Voyage leases only
when repository state is shared or synchronized; see [`backlog.md`](backlog.md).

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
