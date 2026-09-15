---
name: sync-with-remote
description: Synchronize this T3 Code fork with pingdotgg/t3code upstream while preserving and reconciling the fork's documented custom changes, resolving conflicts, running focused verification, producing the macOS DMG, provisioned Release IPA, and custom server package, deploying the headless server to the configured Tailscale host, and pushing the validated branch to the user's fork. Use only when the user explicitly invokes this skill to perform an upstream sync and release deployment.
---

# Sync With Remote

Run the complete workflow from the repository root. Treat a successful upstream integration, three
verified release artifacts, a healthy remote headless server, and a pushed fork branch as the
terminal condition.

## 1. Establish the local contract

1. Read `AGENTS.md` and `CUSTOM_CHANGES_LOG.md` completely before fetching or editing anything.
2. Record the current branch, `HEAD`, worktree status, and remote URLs.
3. Require the worktree, including untracked files, to be clean before merging. Do not stash,
   discard, or commit unrelated work. If pre-existing changes would enter the merge, stop and ask
   the user to handle them. Ignored files under `release/` do not block the sync.
4. Verify `origin` is the user's fork and `upstream` is
   `https://github.com/pingdotgg/t3code.git`. Add a missing `upstream` remote, but never overwrite a
   different configured URL without user approval.

## 2. Fetch and audit upstream

1. Run `git fetch upstream main --tags`.
2. Resolve the last synced upstream commit recorded in `CUSTOM_CHANGES_LOG.md`. Use it as the audit
   base when valid; otherwise use `git merge-base HEAD upstream/main` and call out the fallback.
3. Inspect:
   - commits in `HEAD..upstream/main`;
   - files changed locally and upstream since the audit base;
   - the intersection of those file sets;
   - each behavior in `CUSTOM_CHANGES_LOG.md`, searching upstream for semantic equivalents even
     when upstream changed different files.
4. Summarize the incoming features, likely conflicts, and custom behaviors that upstream now
   replaces. Continue with the sync unless preserving a custom behavior requires a product choice
   the user has not made.

## 3. Integrate with one merge commit

1. Run `git merge --no-commit --no-ff upstream/main`.
2. Resolve conflicts by understanding both implementations. Preserve documented custom behavior
   only where upstream does not provide it. Prefer upstream conventions and delete redundant fork
   code when upstream has an equivalent implementation. Never resolve a whole file with `ours` or
   `theirs` without reviewing the lost side.
   If resolution requires an unmade product choice, abort the merge before asking the user so the
   repository is not left mid-merge.
3. Review non-conflicting overlapping files too; a clean textual merge can still be a semantic
   conflict.
4. Update `CUSTOM_CHANGES_LOG.md` in the same merge:
   - set the last-synced commit and date to the fetched `upstream/main`;
   - remove or rewrite entries now fully supplied by upstream;
   - retain concise descriptions of behavior still unique to the fork.
5. If dependency manifests or the lockfile changed, run `vp i` before verification.
6. Run the smallest focused tests, lint, or type checks covering conflict resolutions and retained
   custom behavior. Do not run repo-wide checks unless the user requests them.
7. Inspect the staged diff and commit the integration as `chore: sync upstream main`. Do not include
   unrelated changes. Leave pushing to step 6 so only a verified release reaches the fork.

If `upstream/main` is already integrated, skip the merge commit and proceed to release generation.

## 4. Build and verify the releases

1. Run `vp run dist:custom:release`. This existing command builds the host-architecture macOS DMG
   and a Release-configuration IPA, using the personal bundle identifier and Apple team from the
   repository-root `.env.local`. It also builds the custom `t3` server as a self-contained Linux
   x64 CLI archive.
2. If the build exposes a source or sync regression, fix it minimally, rerun focused verification,
   commit the fix, and rerun the combined release command. If signing or another external
   prerequisite is missing, report the exact requirement rather than claiming completion.
3. Use the exact artifact paths printed by the command. Verify the DMG with `hdiutil verify`, the
   IPA with `unzip -tq`, and the server package with `tar -tzf`. Confirm the server archive root
   names the release version and contains `t3`, the web client, and the Linux resource monitor.
4. Record SHA-256 checksums for all three artifacts with `shasum -a 256`.

The default IPA export method is `debugging`: it is a Release binary installable on devices
provisioned by the selected Apple team, not an App Store upload. Honor
`T3CODE_IOS_EXPORT_METHOD` when the user deliberately configures another export method.

## 5. Deploy the headless server

1. After all local artifacts pass validation, run
   `bash scripts/deploy-custom-server.sh <absolute-server-package-path>`. It defaults to
   `boring@100.108.40.121`; honor `T3CODE_REMOTE_HOST` when deliberately configured.
2. The deployer verifies the upload, installs the self-contained executable as an immutable server
   release, restarts `t3code-custom.service` with `t3 serve`, and
   persists a Tailscale Serve mapping to it. Do not use `t3 service install`, which resolves the
   official npm package instead of this fork's archive.
3. Require the reported package version to match, the service state to be `active`, and the pairing
   command to return successfully. Preserve and report its pairing URL so the user can add the
   environment from desktop or mobile.
4. Report `Linger=no` as a persistence warning. The service runs immediately, but the user must run
   `sudo loginctl enable-linger boring` once on the remote host for guaranteed startup without a
   login session.

Do not modify or remove unrelated remote services, Tailscale configuration, projects, or T3 home
data. If SSH, package installation, or Tailscale Serve fails, leave the validated local artifacts
intact and report the exact remote blocker.

## 6. Push the fork

1. Reconfirm that `origin` is the user's fork and resolve the current branch. Do not push from a
   detached `HEAD`.
2. Push the current commit to the same branch on `origin` with `git push origin HEAD:<branch>`. Never
   push to `upstream` or force-push.
3. If the push is rejected because the remote branch diverged, fetch `origin` and inspect the
   difference. Do not overwrite remote work. Stop for user input unless the integration is
   unambiguous and can be verified again.

## 7. Report the outcome

Lead with whether the sync and release builds succeeded. Then summarize the upstream changes from
the exact audit range used in step 2. Group user-visible work under short, impact-based headings
such as main features, mobile, reliability, and performance or packaging. Translate commit
subjects into plain descriptions of what changed; omit routine chores, tests, and dependency bumps
unless they materially affect the user. Call out which documented custom features upstream still
does not replace.

Also include:

- the previous local `HEAD` and integrated upstream commit;
- how overlapping custom behavior was handled;
- conflicts resolved and focused checks run;
- clickable absolute paths and SHA-256 checksums for the DMG, IPA, and server package;
- the remote server version, service state, Tailscale address, pairing URL, and linger state;
- final `git status` and whether anything remains uncommitted;
- the branch and exact commit pushed to `origin`, plus confirmation that `upstream` was not pushed.
