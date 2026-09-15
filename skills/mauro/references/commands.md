# Command reference

Use exact command names and aliases. Do not resolve partial names.

## Frequent commands

| Command | Alias | Behavior |
|---|---:|---|
| `check` | `c` | Run a read-only Bearing check. |
| `docs` | `d` | Show or check document state. |
| `help` | `h` | Show general or command-specific help. |
| `impact` | `i` | Find areas affected by a proposed change. |
| `knowledge` | `k` | Show, search, propose, verify, update, or retire knowledge. |
| `map` | `m` | Show, find, update, or verify the repository Map. |
| `next` | `n` | List findings and suggest next steps with commands. `suggest` is a synonym. |
| `pr` | `p` | Preview, update, or check pull-request context. |
| `run` | `r` | Start or resume a development Voyage. |
| `status` | `s` | Show initialization, Map, knowledge, and freshness state. |
| `where` | `w` | Find code, tests, documents, and knowledge for a concept. |

## Infrequent commands

| Command | Behavior |
|---|---|
| `charter` | Create, show, update, diff, or validate human intent. |
| `doctor` | Validate installation, hooks, schemas, and scanners. |
| `init` | Run the first repository Expedition. |
| `navigator` | List, show, regenerate, or request specialist review. |
| `refit` | Show or propose repository restructuring. |
| `tool` | List, describe, or run a trusted read-only Toolbox operation. |
| `who` | Find the responsible Navigator for a path or capability. |
| `why` | Explain rationale for a path, symbol, or knowledge ID. |

## Help

```text
/mauro help
/mauro help <command>
/mauro h <command>
/mauro --help
/mauro <command> --help
```

Help is read-only and works before initialization.

## Charter

```text
/mauro charter create
/mauro charter show
/mauro charter update "<change>"
/mauro charter diff
/mauro charter validate
```

`create` and `update` produce a draft and visible diff. Apply only after user
approval. The Charter is human-owned.

`validate` reports the Charter state: `template`, `partial`, or `complete`. A
section that still holds its template prompt is not intent. `pr` and `refit`
refuse to run while the state is `template`. `run` reports the state and the
plan must say when no Charter constraint was checked.

## Map

```text
/mauro map show
/mauro map find <capability>
/mauro map update
/mauro map verify
```

`map update` performs an incremental scan. It does not change product code.

## Knowledge

```text
/mauro knowledge show <id>
/mauro knowledge search <text>
/mauro knowledge propose
/mauro knowledge update <id>
/mauro knowledge verify <id>
/mauro knowledge retire <id>
/mauro knowledge history <id>
```

Mutation commands create proposals. Promote them only after context review.

## Queries

```text
/mauro where "token validation"
/mauro who packages/auth/token.ts
/mauro why packages/auth/token.ts:rotateToken
/mauro impact "change refresh-token format"
```

Queries are read-only.

## Toolbox

```text
/mauro tool list
/mauro tool describe repository-files
/mauro tool run repository-files --path "apps/**" --role source --json
/mauro tool run dependency-graph --unit payments --json
/mauro tool run documentation-index --status suspect --json
/mauro tool run duplicate-analysis --path "packages/**" --json
```

`list` and `describe` work before initialization. `run` requires an initialized
repository. Toolbox operations are read-only, bounded, and implemented in the
Mauro Node.js runtime.

## Navigator

```text
/mauro navigator list
/mauro navigator show <name>
/mauro navigator regenerate <name>
/mauro navigator review <change>
```

Generated Navigators are views of the approved Map. They are not independent
knowledge stores.

## Pull request

```text
/mauro pr preview
/mauro pr update
/mauro pr check
/mauro pr reviewers
```

`preview` and `check` are read-only. `update` requires authorization for the
external write.

## Other

```text
/mauro next
/mauro suggest
/mauro status
/mauro check
/mauro docs status
/mauro docs check
/mauro refit propose
/mauro doctor
/mauro run "<objective>"
/mauro run status
/mauro run resume
```
