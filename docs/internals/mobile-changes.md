# Mobile Changes internals

The mobile **Changes** surface is a Git-backed view of one project checkout. For a thread with a
dedicated worktree, the worktree path is the checkout; otherwise it is the project's workspace
root. Reads and mutations always run in the owning environment, so local, relay, and tunnel
connections share the same behavior.

## VCS contract

`vcs.changes` returns two independent snapshots:

- `unstaged` is index to working tree.
- `staged` is `HEAD` to index.

Each entry carries its layer, change kind, exact current and previous paths, line totals, display
capability, and a content identity. Git paths are not trimmed. The Git adapter parses NUL-delimited
porcelain and numstat output and passes literal pathspecs to mutations, which keeps whitespace,
newlines, glob characters, and rename pairs intact.

`vcs.changeFile` loads file contents on demand. It reads the correct Git objects for `HEAD` and the
index, reads the working file only for the unstaged new side, and places a one-megabyte bound on
rendered text. Binary and oversized results remain actionable without returning their contents.

`vcs.stageChange` and `vcs.unstageChange` retain the one-file mutation contract. New servers also
advertise `vcsBatchMutations` and expose `vcs.stageChanges` and `vcs.unstageChanges`. A batch
re-reads Git state, validates every requested identity before changing the index, and returns
`stale` without changing anything if any entry no longer matches. Directory actions use one batch
operation instead of one operation per file when advertised, and fall back to sequential one-file
requests for older servers. Successful mutations publish a lightweight Changes revision through
the existing VCS status stream when the server advertises `vcsChangesNotifications`; mobile keeps
its direct refresh fallback for older servers. Unstage uses `HEAD` when it exists and removes paths
from the initial index in an unborn repository.

The optional `preserveIndex` flag on a stacked Git action is used by the mobile commit sheet. It
skips the legacy reset/add preparation and derives the commit message from the index exactly as the
user staged it. Other clients retain their existing commit preparation behavior.

## Draft notes

Unsent review comments are structured device-local data scoped by environment, checkout path, and
thread. An anchor stores the exact path, old or new side, line range, excerpt, and source identity.
Moving unchanged content between Staged and Unstaged keeps the identity; a later content mismatch
marks the anchor outdated instead of moving it. Notes are converted to one ordinary thread message
only after explicit submission, then use the normal outbox and provider turn lifecycle. The normal
composer draft is never read or changed by this flow. Attached image payloads are persisted once in
separate device-local files; the frequently updated draft index contains only lightweight metadata.
