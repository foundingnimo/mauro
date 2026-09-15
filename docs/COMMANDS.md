# Mauro commands

Use `/mauro` after standalone installation. Use `/foundingnimo:mauro` when
the repository is loaded as a Claude Code plugin.

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
| `run` | `r` | Start or resume a Voyage. |
| `status` | `s` | Show Mauro state. |
| `where` | `w` | Find code and context for a concept. |

The higher-frequency command gets the first-letter alias. Infrequent commands
do not reserve letters. This rule leaves letters available for future frequent
commands.

## Infrequent commands

`charter`, `doctor`, `init`, `navigator`, `refit`, `tool`, `who`, and `why`
have no one-letter alias.

## Examples

```text
/mauro init
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
