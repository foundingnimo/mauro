# Voyage workflow

A Voyage performs one approved development objective. It preserves useful
knowledge from the work.

## Before planning

1. Run a Bearing check.
2. Resolve relevant capabilities, paths, knowledge, and documents.
3. Report suspect binding knowledge before implementation.
4. Select one primary Navigator and all required reviewing Navigators.
5. Read the Charter sections that apply to the objective.

## Plan gate

Create small tasks with:

- Responsible Navigator
- Required reviewers
- Path scope
- Relevant knowledge IDs
- Charter constraints
- Exact verification
- Expected documentation impact

Save the draft plan under `docs/mauro/chronicles/<voyage-id>/plan.md`.
Record user changes and rejected plan options. Wait for approval.

## Execute and verify

For each task:

1. Ask the primary Navigator to implement or guide the implementation.
2. Capture concise decisions, failed attempts, constraints, and rejected
   alternatives in structured output.
3. Ask an independent verifier to inspect the code and run checks.
4. Retry once when the verifier supplies a concrete correction.
5. Stop before dependent work when verification still fails.

Executors must not commit, push, or deploy.

## Curate context

After code verification, launch `mauro-context-curator` with:

- Approved plan and user gate changes
- Executor and verifier reports
- Actual diff and test evidence
- Current knowledge records
- Relevant Chronicle events

The curator stores most detail in Chronicle. It proposes active knowledge only
when the information is useful, not easily derived, evidenced, scoped, and
supplied with an invalidation condition.

Launch `mauro-context-verifier` for every proposed active record. Promote
only records that pass.

## Finish

1. Update affected documentation or mark it suspect.
2. Update fingerprints.
3. Regenerate affected Claude rules and Navigators.
4. Run a Bearing check.
5. Create or update the Voyage Chronicle.
6. Report code, knowledge, document, and Map changes.

Commit, push, deployment, and pull-request changes require user authorization.
