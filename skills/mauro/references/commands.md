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
| `run` | `r` | Create or manage a development Voyage and path lease. |
| `status` | `s` | Show initialization, Map, knowledge, Voyage, and freshness state. |
| `where` | `w` | Find code, tests, documents, and knowledge for a concept. |

## Infrequent commands

| Command | Behavior |
|---|---|
| `brief` | Build bounded task context without creating a Voyage. |
| `charter` | Create, show, update, diff, or validate human intent. |
| `doctor` | Validate installation, hooks, schemas, and scanners. |
| `init` | Ask for and pin the canonical branch, then run the first Expedition. |
| `navigator` | List, show, regenerate, or request specialist review. |
| `reconcile` | Refresh derived context when checkout evidence or `HEAD` changed; record local canonical movement. |
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
/mauro tool run survey-report-validate --role capability --file ".mauro/drafts/<id>/surveys/capability.json" --json
/mauro tool gaps
/mauro tool gap list --status candidate
/mauro tool gap show TG-0001
/mauro tool gap export TG-0001
```

`list` and `describe` work before initialization. `run` requires an initialized
repository. Toolbox operations are read-only, bounded, and implemented in the
Mauro Node.js runtime.

`survey-report-validate` is required between each first-run mapper and Map
synthesis. An invalid, stale, incomplete, oversized, overwritten, or
role-mismatched report exits with failure. See `survey-reports.md` for the
stable contract.

Tool Gap commands maintain `.mauro/tool-gaps.json`. `record` deduplicates one
reporter within one Voyage. A gap becomes a candidate after three observations
across at least two Voyages. `export` is read-only and redacted. `dismiss` and
`resolve` record a human decision. See `toolbox.md` for the complete recording
contract.

## Navigator

```text
/mauro navigator list
/mauro navigator show <name>
/mauro navigator regenerate <name>
/mauro navigator review <change>
```

Generated Navigators are views of the approved Map. They are not independent
knowledge stores. Claude Code sessions discover them from `.claude/agents/`.
Compatible agents discover the portable views from `.agents/skills/`. In
Claude, run `/agents` to list them. In any host, use `who`, `impact`, or `brief`
to select the relevant Navigator. Restart a session that caches definitions
when Mauro generated or changed the files.

## Pull request

```text
/mauro pr preview
/mauro pr update
/mauro pr check
/mauro pr reviewers
```

`preview` and `check` are read-only. `update` requires authorization for the
external write.

## Docs

```text
/mauro docs status
/mauro docs check
/mauro docs review [id]
/mauro docs confirm <id> --evidence <file>
```

`status`, `check`, and `review` are read-only. `review` builds one review
packet for each suspect document. `confirm` records a review verdict of
`holds`. It refreshes the fingerprints of the document and records HEAD as the
verification commit. It refuses without an evidence file under
`docs/mauro/chronicles/`. See `maintenance.md`, section "Document review".

`status` and `check` report Map publication separately from Bearing health.
`published_with_findings` means semantic capability boundaries are approved,
but the Bearing is blocked or needs review. Do not collapse these states into
one success or failure label.

## Other

```text
/mauro init
mauro init --canonical-ref <selected-branch>
/mauro next
/mauro suggest
/mauro status
/mauro check
/mauro brief "<objective>"
/mauro reconcile [--force]
/mauro refit propose
/mauro doctor
/mauro run "<objective>"
/mauro run status [V-0001]
/mauro run activate V-0001 [--path <approved-path>]...
/mauro run resume V-0001
/mauro run finish V-0001
/mauro run abandon V-0001 --reason "<reason>"
/mauro doctor --clear-stale-lock
```

Starting a Voyage creates a durable `planning` record under `.mauro/voyages/`.
It owns no paths until the user approves the plan and Mauro runs `activate`.
Activation atomically refuses overlap with any active Voyage. Only `finish` or
`abandon` closes the lease; abandonment requires a reason. `resume` records a
handoff without changing the lease.
