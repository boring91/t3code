# Custom Changes Log

This file tracks intentional changes carried by this fork. When syncing from `origin`, compare each
entry with upstream and keep only the behavior that upstream has not replaced.

Upstream was last checked at `pingdotgg/t3code@9c7622dac` on 2026-08-11. It did not include the
mobile Changes workflow or its change-file, stage, and unstage RPCs.

## Mobile Git Changes workflow

- Adds mobile Staged and Unstaged trees, on-demand full-file diffs, native overview rails, file and
  folder staging controls, stale-snapshot protection, and staged-index-aware commits.
- The current Nightly mutation contract accepts one file per request. Folder actions therefore run
  sequentially; replace this fallback if upstream ships a compatible batch mutation RPC.

## Mobile review notes and reliability

- Reuses the review comment composer for line and range notes, including image attachments, and
  supports image attachments in the final global note sent to the thread.
- Includes exact Git path and merge-conflict handling, bounded binary/large-file reads, stable diff
  loading and navigation, and a development-build guard around unsupported Expo update checks.
