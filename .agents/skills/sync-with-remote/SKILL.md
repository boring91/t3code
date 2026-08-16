---
name: sync-with-remote
description: Synchronize this T3 Code fork with pingdotgg/t3code upstream while preserving and reconciling the fork's documented custom changes, resolving conflicts, running focused verification, and producing the macOS DMG and provisioned Release IPA. Use only when the user explicitly invokes this skill to perform an upstream sync and release build.
---

# Sync With Remote

Run the complete workflow from the repository root. Treat a successful upstream integration and
both verified release artifacts as the terminal condition.

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
   unrelated changes and do not push either remote unless the user explicitly asks.

If `upstream/main` is already integrated, skip the merge commit and proceed to release generation.

## 4. Build and verify both releases

1. Run `vp run dist:custom:release`. This existing command builds the host-architecture macOS DMG
   and a Release-configuration IPA, using the personal bundle identifier and Apple team from the
   repository-root `.env.local`.
2. If the build exposes a source or sync regression, fix it minimally, rerun focused verification,
   commit the fix, and rerun the combined release command. If signing or another external
   prerequisite is missing, report the exact requirement rather than claiming completion.
3. Use the exact artifact paths printed by the command. Verify the DMG with `hdiutil verify` and the
   IPA with `unzip -tq`.
4. Record SHA-256 checksums for both artifacts with `shasum -a 256`.

The default IPA export method is `debugging`: it is a Release binary installable on devices
provisioned by the selected Apple team, not an App Store upload. Honor
`T3CODE_IOS_EXPORT_METHOD` when the user deliberately configures another export method.

## 5. Report the outcome

Lead with whether the sync and both builds succeeded. Include:

- the previous local `HEAD` and integrated upstream commit;
- incoming features and how overlapping custom behavior was handled;
- conflicts resolved and focused checks run;
- clickable absolute paths and SHA-256 checksums for the DMG and IPA;
- final `git status` and whether anything remains uncommitted;
- confirmation that no remote was pushed, unless the user explicitly requested a push.
