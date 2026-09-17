# Mauro commands

Mauro normally runs through an ambient agent skill. Use these commands for
diagnostics, automation, or explicit control. Claude Code exposes `/mauro`
after standalone installation and `/foundingnimo:mauro` when the repository is
loaded as a plugin. Other hosts can call the `mauro` CLI.

## Frequent commands

| Command | Alias | Purpose |
|---|---:|---|
| `check` | `c` | Run a read-only Bearing check. |
| `docs` | `d` | Inspect document state. |
| `help` | `h` | Show command help. |
| `impact` | `i` | Find likely change impact. |
| `knowledge` | `k` | Inspect or maintain Logbook records. |
| `map` | `m` | Inspect or update the Map. |
| `next` | `n` | List findings and suggest next steps. |
| `pr` | `p` | Create bounded pull-request context. |
| `run` | `r` | Create or manage a Voyage and its path lease. |
| `status` | `s` | Show Mauro state, including open Voyages. |
| `where` | `w` | Find code and context for a concept. |

The higher-frequency command gets the first-letter alias. Infrequent commands
do not reserve letters. This rule leaves letters available for future frequent
commands.

## Infrequent commands

`brief`, `charter`, `doctor`, `init`, `navigator`, `reconcile`, `refit`, `tool`,
`who`, and `why` have no one-letter alias.

## Examples

```text
/mauro init
/mauro brief "change token rotation" --json
/mauro reconcile --json
/mauro c
/mauro docs review
/mauro m find authentication
/mauro w "token rotation"
/mauro who packages/auth/src/token.ts
/mauro why K-0004
/mauro i "change the refresh-token format"
/mauro k search "atomic rotation"
/mauro p preview
/mauro charter update "The API package must not import the web app."
/mauro refit propose
/mauro tool list
/mauro tool run dependency-graph --unit payments --json
/mauro tool gap list --status candidate
/mauro r "change token rotation"
/mauro r activate V-0001
/mauro r status
/mauro h knowledge
```

Use exact names or listed aliases. Mauro does not infer partial commands.
Add `--root <path>` to target a repository explicitly. Add `--json` to
deterministic query, status, and check commands when another tool consumes the
result.

Mutation commands that need semantic judgment create a proposal. The skill
shows the proposed diff before it changes a human-owned document. Pull-request
updates, commits, pushes, deployments, and product-code moves require explicit
authorization.

## Ambient operations

```text
mauro reconcile [--force] [--json]
mauro brief "<objective>" [--json]
```

`reconcile` compares queued changes and the current Git path-and-content
signature with the previous reconciliation. It regenerates derived context
only when evidence changed. `--force` performs the refresh even without a
detected change. `brief` is read-only. It returns the likely paths,
responsible and reviewing Navigators, Charter, applicable knowledge,
dependencies, document state, active Voyage conflicts, and verification.
Neither command edits product code or starts a Voyage.

## Voyages and concurrent sessions

```text
/mauro run "<objective>"
/mauro run status [V-0001]
/mauro run activate V-0001 [--path <approved-path>]... [--allow-behind]
/mauro run resume V-0001 [--allow-behind]
/mauro run finish V-0001 [--allow-behind]
/mauro run abandon V-0001 --reason "<reason>"
/mauro doctor --clear-stale-lock
```

Before the first Expedition, `/mauro init` lists the available local and
remote-tracking branches and asks the user which exact branch represents
accepted history. The underlying command is:

```text
mauro init --canonical-ref <selected-branch>
```

Mauro does not infer this choice from the current branch, `origin/HEAD`,
`main`, or `master`.

The deterministic init result lists oversized `AGENTS.md` and `CLAUDE.md`
files before mapper agents run. This warning does not block initialization.
`status`, `check`, and `doctor` report Map publication separately from Bearing
health. An approved Map with unresolved errors or warnings is
`published_with_findings`; its Bearing can still be blocked.

Starting a Voyage creates a durable `planning` record in `.mauro/voyages/`
and returns its Chronicle plan path, predicted paths, and Navigators. It does
not reserve code paths. After the user approves the plan, `activate` claims the
predicted paths or the explicit `--path` values. Mauro refuses overlap with an
active Voyage. Planning Voyages may overlap.

`resume` retrieves an open Voyage for another session without changing its
lease. Only `finish` and `abandon` close a lease. Closed records retain their
paths as history. `abandon` always requires a reason.

The repository stores the selected branch in `git.canonical_ref` in
`.mauro/config.json`. `status` and `doctor` report the relationship. Document
review and confirmation and Voyage planning, activation, resumption, and
completion stop on an unpinned or invalid branch. That configuration failure
cannot be overridden. `--allow-behind` can explicitly accept a detached,
behind, or diverged checkout. Mauro never fetches or changes the checkout.

`doctor --clear-stale-lock` removes a transient writer lock only when Mauro can
prove that its recorded process is local and no longer exists. It refuses an
active, remote, or unreadable lock.

`doctor` also reports the runtime location, selected host profiles, both skill
adapters, Claude-hook currency, and repository migration status. A missing
adapter that the install stamp selected makes the command fail.

## Toolbox

`tool list` and `tool describe <name>` expose the installed operations and
their runtime, permissions, input schema, and output schema. Discovery works
before Mauro initializes a repository. `tool run <name>` requires an
initialized repository. The installed operations are read-only, network-free,
and bounded; inspect each operation's declared subprocesses before execution.

### Tool Gap Log

```text
/mauro tool gaps
/mauro tool gap list [--status observed|candidate|dismissed|resolved]
/mauro tool gap show TG-0001
/mauro tool gap record --key <slug> --need <need> --checked <tools|none> \
  --fallback <system-utility|temporary-script|manual> --summary <summary> \
  --input <shape> --output <shape> --voyage <id> [--reporter <name>]
/mauro tool gap export TG-0001
/mauro tool gap dismiss TG-0001 --reason <reason>
/mauro tool gap resolve TG-0001 --tool <registered-tool> [--version <version>]
```

The Log is `.mauro/tool-gaps.json`. One reporter can add one observation per
Voyage. Three observations across at least two Voyages promote a gap from
`observed` to `candidate`. Export prints a redacted proposal and does not use
the network. Resolve accepts only a registered installed tool. A report can
reopen a resolved gap only after it checks that tool and still needs a fallback.
