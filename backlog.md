# Mauro backlog

This backlog records product improvements that are not complete. The order is
intentional. Finish the safety and handoff foundations before adding broad
automation.

Status values:

- `Now`: active work or the next implementation slice.
- `Next`: high-value work after the current safety layer.
- `Later`: useful work that depends on earlier foundations.

## Now

### Multi-session ownership and locking

Goal: Let several Claude Code sessions use one repository without losing Mauro
state or performing overlapping work by accident.

- [x] Use one atomic local write lock for Mauro state mutations in a working
  tree.
- [x] Cover initialization, Map regeneration, document confirmation, Tool Gap
  mutation, and changed-path queue mutation.
- [x] Record the process, host, operation, and acquisition time in the transient
  lock so `mauro doctor` can explain contention.
- [x] Add a safe command to clear a lock after Mauro proves that its local owner
  process is gone.
- [x] Give each `/mauro run` a durable Voyage ID and an explicit path scope.
- [x] Add path-scoped Voyage leases and refuse two active Voyages that overlap.
- [ ] Permit concurrent readers while keeping multi-file state reads consistent.
- [ ] Detect a changed Git baseline before a Voyage writes curated context.
- [ ] Define behavior for separate local users, Git worktrees, and remote hosts.

### Compact ticket briefing

Goal: Give an implementation session all relevant context without making it run
a new repository survey.

- [ ] Add `/mauro brief "<ticket>"`.
- [ ] Return responsible and reviewing Navigators, likely paths, active
  knowledge, Charter constraints, dependencies, suspect documents, and exact
  verification.
- [ ] Provide concise text and stable JSON output.
- [ ] Keep Jira or another ticket provider outside the deterministic core.

## Next

### Navigator coverage checks

- [ ] Find maintained paths with no Navigator.
- [ ] Find excessive or contradictory Navigator overlap.
- [ ] Flag broad descriptions, weak evidence, and unapproved boundaries.
- [ ] Surface these findings through `mauro check` and `mauro next`.

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

## Later

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
