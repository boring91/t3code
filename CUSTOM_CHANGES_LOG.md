# Custom Changes Log

This file tracks intentional changes carried by this fork. When syncing from `upstream`, compare each
entry with upstream and keep only the behavior that upstream has not replaced.

Upstream was last synced at `pingdotgg/t3code@b21d87243` on 2026-09-02. It still does not include the
mobile Changes workflow or its change-file, stage, and unstage RPCs.

## Personal-team iOS builds

- Allows contributor builds to use a personal Apple team, omits unsupported associated domains,
  and disables updates from the official EAS project for those builds.
- Adds `vp run dist:custom:release` to produce a local macOS DMG and provisioned Release IPA after
  syncing the fork.
- Adds the user-invoked `$sync-with-remote` project skill to audit and integrate upstream, reconcile
  this log, run focused checks, and build both release artifacts.

## Mobile Git Changes workflow

- Adds mobile Staged and Unstaged trees, on-demand full-file diffs, native overview rails, file and
  folder staging controls, stale-snapshot protection, and staged-index-aware commits.
- Adds capability-gated batch stage and unstage RPCs. New servers validate the whole selection and
  update it as one batch operation; mobile falls back to sequential one-file requests on older
  servers.
- Streams batch pathspecs to Git instead of placing them in process arguments, so large folders and
  unusual path names remain safe, and broadcasts lightweight change revisions so connected clients
  refresh their shared Changes data without a full repository-status refresh.

## Mobile review notes and reliability

- Reuses the review comment composer for line and range notes, including image attachments, and
  supports image attachments in the final global note sent to the thread.
- Includes exact Git path and merge-conflict handling, bounded binary/large-file reads, stable diff
  loading, and stable navigation.
