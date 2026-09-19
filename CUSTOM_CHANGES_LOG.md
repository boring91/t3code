# Custom Changes Log

This file tracks intentional changes carried by this fork. When syncing from `upstream`, compare each
entry with upstream and keep only the behavior that upstream has not replaced.

Upstream was last synced at `pingdotgg/t3code@5378f87f99` on 2026-09-19. It still does not include the
mobile Changes workflow or its change-file, stage, and unstage RPCs.

## Upstream exclusions

- Do not merge or enable Orchestrator v2. Keep the shipped v1 orchestration path unless the user
  explicitly reverses this decision.

## Custom release workflow

- Adds `vp run dist:custom:release` to produce a local macOS DMG, provisioned Release IPA, and
  installable custom `t3` server package after syncing the fork. Upstream supplies the personal-team
  iOS configuration used by this command.
- Adds the user-invoked `$sync-with-remote` project skill to audit and integrate upstream, reconcile
  this log, run focused checks, build all release artifacts, and deploy the custom headless server
  to the configured Tailscale host. After validation and deployment succeed, it pushes the current
  branch to the configured fork remote. The server artifact uses upstream's self-contained CLI
  archive layout and the matching upstream Linux package's native runtime dependencies, so macOS
  can cross-package a Linux server without requiring a system JavaScript runtime on the host.
- Keeps production CORS headers on normal Bun server responses so desktop and web clients can pair
  with the deployed headless server.
- Keeps release packaging deterministic by disabling the optional `msgpackr-extract` install script,
  using the repository-managed npm to fetch Linux runtime dependencies, and retaining the custom
  runtime-externals archive flag across Effect CLI upgrades.

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
