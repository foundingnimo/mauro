# Mauro

Mauro is an ambient repository-context sidecar for coding agents. It maps a
software repository, publishes capability specialists, detects stale context,
and gives each implementation session a compact brief. A person can query
Mauro, but does not need to operate it as a separate workflow.

Mauro is designed for monorepos whose code, documentation, and ownership
boundaries do not always match their directory structure. Its canonical state
is agent-neutral. Claude Code has the richest adapter today; Codex, Grok, and
other agents that discover `SKILL.md` files can use the same Map and
Navigators.

Mauro keeps six kinds of durable repository context:

- A **Charter** records intended boundaries and human decisions.
- A **Map** records observed repository structure and relationships.
- **Navigators** provide aspect-specific agent views.
- The **Logbook** provides short, path-scoped knowledge to coding agents.
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
- Canonical Git reference checks for reviews and trusted-state changes
- Separate Map-publication and Bearing-health status
- Preflight warnings for oversized agent instruction files
- Ambient reconciliation and compact task briefs
- Portable repository skills plus Claude Code agents, hooks, and path rules

Semantic capability mapping, context curation, and Refit proposals are
performed by the host coding agent through `mauro-context`. The separate
`mauro` skill handles explicit administration commands.

## Quickstart

1. Install Mauro:

   ```bash
   git clone https://github.com/foundingnimo/mauro.git
   cd mauro
   ./install.sh --host all
   ```

   `all` installs the Claude and shared-skill adapters. PowerShell users can
   run `./install.ps1 -TargetHost all`.

2. Restart the coding agent and open the repository. Ask it to do normal
   repository work. The Mauro skill initializes the repository on the first
   substantial task, reconciles changed evidence, builds a compact brief, and
   loads the relevant Navigators.

   For example:

   ```text
   Add account recovery. Check the repository architecture and existing rationale first.
   ```

   Mauro remains visible when it finds a conflict, stale document, preliminary
   boundary, or decision that needs approval. Routine refresh output stays out
   of the conversation.

3. On Claude Code, `/mauro init` is the explicit bootstrap command when you
   want to inspect the first Expedition yourself. Mauro lists the available
   local and remote-tracking branches and asks which exact branch represents
   accepted history. It does not infer the answer. The provider-neutral CLI
   then runs `mauro init --canonical-ref <selected-branch> --root <repo>`.
   Initialization inventories the safe
   repository perimeter, creates the Charter and durable knowledge structure,
   and publishes repository-specific Navigators under both `.claude/agents/`
   and `.agents/skills/`. Before semantic surveys start, Mauro reports
   oversized `AGENTS.md` and `CLAUDE.md` files that a host can truncate or
   reject. The warning does not block initialization.

4. Ask what Mauro knows at any time:

   ```text
   What Navigators did Mauro add?
   What parts of the repository are affected by this ticket?
   What would be a better structure for this code?
   ```

   The administrative equivalents are `/mauro next`, `/mauro brief
   "<objective>"`, `/mauro status`, and `/mauro help`.

5. For coordinated implementation, the agent creates a Voyage:

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

The agent normally runs `/mauro reconcile` and `/mauro check` for you. These
commands remain available for diagnostics and automation.

## Install

### Standalone installation

Standalone installation preserves the `/mauro` command:

```bash
./install.sh
```

The installer puts the provider-neutral runtime in `~/.mauro`. It publishes
two non-overlapping skills: `mauro-context` is the automatic repository
sidecar, and `mauro` is the explicit administration command. The default
`--host all` profile installs both skills in `~/.claude/skills/` and
`~/.agents/skills/`, preserves unrelated Claude settings, creates a settings
backup, and adds Claude lifecycle hooks.

Choose a narrower profile when needed:

```bash
./install.sh --host claude  # Claude skills and lifecycle hooks
./install.sh --host shared  # ~/.agents/skills only; no Claude settings
./install.sh --host all     # both adapters; the default
```

Use `--no-hooks` when you do not want user-level Claude hooks. PowerShell uses
`-TargetHost claude|shared|all` and `-NoHooks`.

Restart open coding-agent sessions. To verify the installation, run:

```text
/mauro help
/mauro init
```

Standalone Claude mode keeps the short `/mauro` command and receives automatic
session and change hooks. Other compatible agents discover `mauro-context` in
the shared skill directory and reconcile at task boundaries even when that
host has no Mauro-specific lifecycle hook.

Run `./install.sh` again to update. It detects the installation, shows the
installed and checkout versions, and asks before it replaces the neutral
runtime and the skills for the selected host profile. An update whose profile
includes Claude automatically migrates the old `~/.claude/mauro` runtime to
`~/.mauro`, preserves unrelated settings, and refreshes only Mauro-owned
hooks. Without a terminal, pass `--update` or `--yes`
(PowerShell: `./install.ps1 -Update` or `-Yes`). Restart open agent sessions
afterwards, because a running session can keep old skill text.

`mauro --version` prints the version, the commit and the checkout an
installation came from. `mauro doctor` prints the same stamp and checks the
runtime, selected skill adapters, Claude hooks, project lock, and any required
repository-state migration.

### Agent compatibility

| Host | Mauro adapter |
|---|---|
| Claude Code | `mauro-context`, explicit `/mauro`, lifecycle hooks, path rules, and `.claude/agents/` Navigators |
| Codex | `~/.agents/skills/mauro-context`, optional `$mauro` administration, and repository Navigators in `.agents/skills/` |
| Grok | Shared `mauro-context` `SKILL.md` discovery; it can also consume the Claude-compatible plugin surface |
| Other agents | Use the CLI and canonical `.mauro/` plus `docs/mauro/` state; add a thin skill adapter when the host supports local skills |

The shared surface is intentionally smaller than Claude's adapter. It provides
the same facts and safety boundaries, but host-specific automatic hooks and
delegation UI depend on the agent. See the official [Codex skill
documentation](https://learn.chatgpt.com/docs/build-skills), [Claude Code MCP
documentation](https://docs.anthropic.com/en/docs/claude-code/mcp), and [Grok
skills and plugin documentation](https://docs.x.ai/build/features/skills-plugins-marketplaces).

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
| `brief` | — | Build compact task context for an objective |
| `check` | `c` | Run a Bearing check |
| `docs` | `d` | Inspect documentation state |
| `help` | `h` | Show command help |
| `impact` | `i` | Predict affected repository areas |
| `knowledge` | `k` | Inspect or maintain knowledge |
| `map` | `m` | Inspect or update the repository Map |
| `next` | `n` | List findings and suggested next steps; `suggest` is a synonym |
| `pr` | `p` | Generate bounded pull-request context |
| `reconcile` | — | Refresh generated context only when evidence changed |
| `run` | `r` | Create or manage a development Voyage |
| `status` | `s` | Show Mauro state |
| `where` | `w` | Find code and docs for a concept |

Infrequent or agent-facing commands do not consume one-letter aliases:
`brief`, `charter`, `doctor`, `init`, `navigator`, `reconcile`, `refit`,
`tool`, `who`, and `why`.

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

`mauro docs review` compares the checkout with the configured canonical ref,
not with the feature branch's upstream. It refuses when the checkout is
behind, diverged, detached, or cannot resolve an explicitly configured ref.
`--allow-behind` continues deliberately without changing Git state. Document
confirmation and Voyage planning, activation, resumption, and completion use
the same guard.

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
.mauro/config.json          scan, canonical-ref, and operating policy
.mauro/manifest.json        knowledge and documentation index
.mauro/fingerprints.json    freshness evidence
.mauro/changed-paths.json   pending repository evidence changes
.mauro/reconciliation.json  last reconciled working-tree signature
.mauro/tool-gaps.json       recurring missing Toolbox operations
.mauro/voyages/             durable Voyage records and path leases
docs/mauro/chronicles/reviews/  document review verdicts and evidence
.claude/rules/mauro/        generated path-scoped knowledge
.claude/agents/                generated project Navigators
.agents/skills/                generated portable Navigator skills
```

The changed-path queue in `.mauro/changed-paths.json` is machine state. A
team can commit it or ignore it according to its workflow. Voyage records are
repository state. Commit them when other worktrees or clones must see the same
work ownership and history.

## Use Navigators from any agent session

Mauro writes each repository specialist twice from one canonical Navigator
brief: a Claude Code project agent in `.claude/agents/`, and a portable skill
in `.agents/skills/<navigator>/SKILL.md`. A second agent session in the same
repository can use the same specialists without running another mapping
process.

In Claude Code:

- Run `/agents` to see every available project Navigator.
- Run `/mauro who <path>` to find the Navigator responsible for a file.
- Run `/mauro impact "<ticket or change>"` to find all likely Navigators.
- Name a Navigator explicitly, or let Claude delegate automatically from the
  capability and path details in its description.

Generated Navigators are deliberately read-only. They scope a ticket before
implementation and review the changed files and any supplied diff afterwards.
The host coding-agent session implements the change and runs the required checks.
Canonical context remains in the Map, Charter, and Navigator briefs rather
than in one session's conversation.

Codex and other compatible hosts discover the generated `.agents/skills/`
views. Claude Code loads project-agent files at session start. Restart a
session that caches skills or agents when `mauro init`, `mauro map update`, or
`mauro navigator regenerate` changes the Navigator files. In Claude, run
`/agents` after the restart to verify that it loaded them.

Commit `.agents/skills/`, `.claude/agents/`, `.claude/rules/mauro/`, `docs/mauro/`, and the
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
`mauro run status` in any session to see current ownership. The planning
record also stores the canonical ref and commit used at creation.

This layer coordinates Mauro writers and active Voyage scopes for the same
local user and working tree. Separate local users, Git worktrees, and remote
hosts do not yet share the transient writer lock. They see Voyage leases only
when repository state is shared or synchronized; see [`backlog.md`](backlog.md).

## Configure an Expedition

Prepare `.mauro/config.json` before `mauro init` to configure the first scan.
When the file is absent, the host skill asks for the canonical branch and
`init --canonical-ref` creates the configuration. A prepared file must already
contain the selected branch, or the command must receive it explicitly. You
can edit scan policy before a later `mauro map update`. Mauro validates the
file before it scans the repository.

This excerpt shows the canonical-ref, package, and role fields in the generated
file:

```json
{
  "git": {
    "canonical_ref": "origin/main"
  },
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

`git.canonical_ref` is the exact local or remote-tracking branch selected by
the user as accepted repository history. `null`, a tag, a missing branch, and a
symbolic alias such as `origin/HEAD` are errors. Mauro does not fetch, switch
branches, merge, rebase, or guess a default branch. `mauro status` and
`mauro doctor` show the current branch, canonical commit, and ahead/behind
relationship. A behind, diverged, or detached checkout blocks document review
and confirmation and Voyage lifecycle changes unless `--allow-behind` is
explicit. An unpinned or invalid canonical branch cannot be overridden.

The complete file contains the required fields. Keep them when you edit the
configuration. Pattern arrays replace the defaults; they do not extend them.
Package selectors accept names and repository-relative path
patterns. An excluded package is a `stub` by default. Mauro keeps its name,
root, manifests, and dependency edges, but it does not create a Navigator or
index internal files. Set `excluded_behavior` to `omit` to remove it from the
Map.

Mauro does not classify `vendor/` or `build/` as generated by name alone.
These names frequently hold product capabilities, documentation, or
hand-written build tools. Add them to `scan.generated.patterns` only in a
repository where they are known generated output.

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
