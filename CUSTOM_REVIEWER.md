# Custom reviewer runbook

Use this runbook to audit custom changes before they are committed or carried across an upstream
sync.

## Launch the review

Read `AGENTS.md`, then launch three read-only subagents in parallel:

1. **Correctness and bugs** — Trace the changed behavior end to end. Check edge cases, failure and
   reverse paths, stale or concurrent state, compatibility, and whether tests prove the behavior.
2. **Performance and remote readiness** — Check network round trips and payloads, subprocess and
   filesystem work, render frequency, list behavior, caching, concurrency, and large-input costs.
3. **Repository conventions and code quality** — Compare nearby patterns. Check Effect and Schema
   idioms, naming, API shape, unnecessary abstraction, duplication, code smells, documentation, and
   test quality.

Give each reviewer the current user request and the relevant diff. Reviewers must not edit files.
Each reviewer should report only concrete findings with:

- Severity
- Absolute file path and line number
- Evidence and user impact
- The smallest viable fix

They must explicitly say when they found nothing.

## Reconcile the results

The primary agent must verify every finding against the source, reject false positives, merge
duplicates, and report the accepted findings in severity order. Do not implement fixes unless the
user explicitly asks for them.
