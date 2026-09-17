# Mauro backlog

This backlog records product improvements that are not complete. The order is
intentional. Finish the safety and handoff foundations before adding broad
automation.

Status values:

- `Now`: active work or the next implementation slice.
- `Next`: high-value work after the current safety layer.
- `Later`: useful work that depends on earlier foundations.

## Now

### Consistent multi-session reads

Goal: Let several coding-agent sessions use one repository without losing Mauro
state or performing overlapping work by accident.

- [ ] Permit concurrent readers while keeping multi-file state reads consistent.
- [ ] Detect a changed Git baseline before a Voyage writes curated context.
- [ ] Define behavior for separate local users, Git worktrees, and remote hosts.

### Navigator coverage checks

- [ ] Find maintained paths with no Navigator.
- [ ] Find excessive or contradictory Navigator overlap.
- [ ] Flag broad descriptions, weak evidence, and unapproved boundaries.
- [ ] Surface these findings through `mauro check` and `mauro next`.

## Next

### Additional lifecycle adapters

- [ ] Add native lifecycle adapters for hosts that expose safe hook APIs.
- [ ] Keep task-boundary reconciliation as the portable fallback.
- [ ] Verify adapter behavior without changing canonical repository state.

### Learn from completed Voyages

- [ ] Compare predicted impact with the files that changed.
- [ ] Record missed paths, unnecessary Navigator selections, and missing checks.
- [ ] Propose Map improvements from repeated misses.
- [ ] Require approval before changing a capability boundary.

### Continuous integration mode

- [ ] Add a non-interactive `mauro check --ci` contract.
- [ ] Detect stale generated views, suspect binding documents, incomplete
  Navigator coverage, and Map drift.
- [ ] Produce concise annotations for pull-request systems.

### Session handoff packets

- [ ] Record the objective, Voyage ID, completed work, remaining work, changed
  paths, decisions, failed approaches, checks, and Navigators.
- [ ] Let another session resume without reading the original transcript.
- [ ] Keep raw transcripts and chain-of-thought out of durable state.

### Safer merge behavior

- [ ] Split frequently edited machine state where this reduces conflicts.
- [ ] Keep generated JSON deterministic and consistently ordered.
- [ ] Detect state generated from a different Git baseline.
- [ ] Regenerate derived files instead of asking a person to merge them.

### Evaluation fixtures

- [ ] Add awkward monorepos with duplicated code, misplaced documents, generated
  trees, ignored knowledge, and ambiguous ownership.
- [ ] Measure mapping accuracy, ticket-to-Navigator selection, stale-document
  detection, false positives, and context size.
- [ ] Turn each confirmed failure into a regression fixture.

### Expedition Tool Gap provenance

- [ ] Let an Expedition stage structured Tool Gap observations before a Voyage
  exists.
- [ ] Use the approved Expedition Chronicle as provenance.
- [ ] Preserve the existing cross-Voyage promotion threshold; one Expedition
  must not promote its own reported gaps.

## Later

### Background service evaluation

- [ ] Evaluate a long-running watcher after task-boundary reconciliation has
  production evidence; it must not rescan continuously or race other writers.
- [ ] Add an MCP adapter only when it offers capability beyond the shared skill
  and CLI, and test it against the supported protocol versions.

### Map quality metrics

- [ ] Report coverage, approved and preliminary capabilities, unowned paths,
  overlap, low-confidence relationships, and stale context.
- [ ] Show the metrics in `mauro status` without reducing architecture quality to
  one misleading score.

### Repository-specific verification catalog

- [ ] Let each Navigator declare the checks for its capability.
- [ ] Verify that each declared command still exists.
- [ ] Select the smallest sufficient check set from the actual change.
- [ ] Never claim that a check passed without observed output.

### Pull-request context

- [ ] Add responsible Navigators, Charter constraints, document state, and
  observed verification to the bounded pull-request block.
- [ ] Keep every external pull-request write behind explicit authorization.

## Completed

### Ambient and provider-neutral operation

- [x] Split automatic `mauro-context` behavior from explicit `mauro`
  administration.
- [x] Initialize, reconcile, and brief through the ambient skill at task
  boundaries.
- [x] Keep Claude Code hooks, path rules, and specialist project agents.
- [x] Publish shared skills and repository Navigators for Codex, Grok, and
  compatible hosts.
- [x] Move standalone runtime files to `~/.mauro`, add host profiles, and
  migrate the legacy Claude runtime.
- [x] Add adapter and repository-migration health to `mauro doctor`.

### Multi-session ownership foundation

- [x] Serialize complete state mutations with an owner-labelled local lock.
- [x] Cover initialization, Map regeneration, document confirmation, Tool Gap
  changes, and changed-path queue changes.
- [x] Add safe stale-lock recovery.
- [x] Give Voyages durable IDs, lifecycle records, path leases, and overlap
  refusal.
- [x] Ask for and pin one exact canonical Git branch during init, report its
  status, and guard document trust and Voyage lifecycle changes.

### Compact ticket briefing

- [x] Add `/mauro brief "<ticket>"` with responsible and reviewing Navigators,
  likely paths, active knowledge, Charter constraints, dependencies, suspect
  documents, and exact verification.
- [x] Provide concise text and stable JSON output.
- [x] Keep ticket-provider integration outside the deterministic core.

### First-run safeguards

- [x] Scan ambiguous `vendor/` and `build/` directories by default.
- [x] Warn before semantic surveys when an agent instruction file exceeds the
  conservative host-context threshold.
- [x] Report Map publication independently from Bearing health.

### Instruction Contract monitoring

- [x] Discover common agent instruction formats with configurable patterns.
- [x] Record provider, directory scope, parent, precedence, and human ownership.
- [x] Register direct binding fingerprints that ordinary scan filters cannot
  disable.
- [x] Surface applicable contracts in Maps, status, doctor, and task briefs.
- [x] Report excessive size and exact duplication without rewriting the files.
- [x] Make changed or missing contracts block the Bearing check.

### Commit-aware reconciliation triggers

- [x] Trigger a full refresh when `HEAD` changes on a clean working tree.
- [x] Record local canonical-ref and canonical-commit movement without fetching
  or inspecting another branch.
- [x] Refresh through SessionStart and Stop after commits, branch switches, and
  fast-forwards.
- [x] Discover new Instruction Contracts after the checkout receives canonical
  changes.
