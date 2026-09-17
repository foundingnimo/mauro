# Ambient operation

Mauro is a sidecar for the host coding agent. Do not make the user translate a
normal repository request into Mauro commands.

## Start of repository work

1. Find the repository root.
2. Resolve the Mauro executable. Prefer `mauro` on `PATH`, then a runtime that
   the host plugin supplies, `~/.mauro/bin/mauro`, or
   `~/.claude/mauro/bin/mauro`.
3. If `.mauro/config.json` and `.mauro/map.json` do not exist, list the local
   and remote-tracking branches without fetching. Ask the user which exact
   branch represents accepted history. Do not infer the answer from the
   current branch, `origin/HEAD`, `main`, or `master`. Then run
   `mauro init --canonical-ref <selected-branch>` before substantial work.
   Initialization creates context files; it must not modify product code.
   If Mauro is already initialized but reports `canonical-branch-unpinned`,
   ask the same question and update `.mauro/config.json` after approval.
   Before semantic surveys, report any `instruction_file_warnings` from init.
   Explain that the host can truncate or reject the named instruction files.
   Do not block initialization and do not rewrite those human-owned files.
4. Run `mauro reconcile --json`. This refreshes derived context only when
   repository evidence changed.
5. Run `mauro brief "<objective>" --json`.
6. Read the returned Navigator sources or use the matching generated
   repository skills. Read the Charter and applicable active knowledge.

Do not show routine command output unless it changes the answer, finds stale
context, or needs a human decision.

## During and after work

- Treat a brief as a bounded starting point. A Navigator must verify semantic
  scope against code.
- Follow active Voyage path leases. Do not start overlapping implementation.
- Run the exact checks named by the relevant Navigator when they still exist.
- At the end of a material change, run `mauro reconcile --json` again. Report
  suspect documents, boundary conflicts, and required decisions.

## Autonomy boundary

Mauro can update machine state, the generated Map, generated Navigator views,
and freshness findings without asking the user. It can propose changes to the
Charter, curated knowledge, capability boundaries, repository structure, and
pull-request text. It must not apply those proposals without approval. It must
not move product code, commit, push, deploy, or write to an external service
without explicit authorization.

## Host adapters

- `mauro-context` is the automatic skill. `mauro` is reserved for explicit
  administration.
- Claude Code uses those skills, lifecycle hooks, path rules, and generated
  project agents in `.claude/agents/`.
- Agents that implement the common `SKILL.md` convention can discover
  `mauro-context`, explicit `mauro`, and generated Navigators through shared
  skill directories.
- The canonical state does not depend on either adapter. It remains in
  `.mauro/` and `docs/mauro/`.
