# Mobile Git-backed Changes workflow

Status: Ready for implementation
Scope: Mobile clients on iOS and Android

## Problem Statement

Users who supervise coding agents from a phone need a reliable way to inspect the code that is currently uncommitted in a project or worktree. They want Git—not thread turns, checkpoint diffs, or inferred agent attribution—to be the source of truth.

The current mobile review experience can show turn-oriented changes and a combined dirty-worktree diff, but it does not distinguish the Git index from the working tree. A user cannot see separate Staged and Unstaged collections, stage or unstage a whole file, or use the staged version as a baseline for reviewing a provider's next edits. Existing inline review comments also flow into the ordinary thread composer instead of forming a dedicated draft batch that can be reviewed and sent independently.

This is not intended to be a formal approval system or a complete Git client. The user needs a lightweight, non-rigid mobile workflow for navigating changed files, reading complete diffs, collecting line-specific notes, and sending those notes to the agent when useful.

## Solution

Add a dedicated mobile Changes experience, opened directly from a thread's Git menu through an action labeled Review changes. The screen reflects the selected project's current worktree using two tabs:

- Unstaged represents the difference from the Git index to the working tree.
- Staged represents the difference from HEAD to the Git index.

Each tab presents only changed paths in a compact, collapsible directory tree. Selecting a file opens a full-screen unified diff that shows the complete file when it can be rendered safely, jumps to the first changed region, and includes a phone-sized overview rail for locating changes in large files. A sticky toolbar supports previous file, Stage or Unstage, and next file.

Stage and Unstage mutate the real Git index on the environment that owns the project. A path may appear in both tabs when it contains staged content and newer unstaged content. The feature does not infer which thread, turn, provider, or device produced a change.

Users may attach draft comments to individual lines or ranges and add an optional global note. These notes are independent of staging, remain available as the file moves between tabs, and are not sent until the user opens the Notes summary and explicitly chooses Send to agent. Submission is a normal message to the originating thread, remains available even when unstaged files remain, and does not merge with or alter the ordinary thread composer draft.

All repository reads and mutations continue to execute on the server through typed Effect RPC. The mobile client remains a remote-capable presentation and interaction surface; it never operates on a device-local checkout.

## User Stories

1. As a mobile user, I want to open Changes directly from a thread's Git menu, so that I can inspect repository changes without navigating through Git Overview.
2. As a mobile user, I want the action to be labeled Review changes and the destination to be titled Changes, so that the feature does not imply GitHub pull-request review.
3. As a mobile user, I want Changes to reflect real Git state, so that the same staged and unstaged state appears in my terminal and other Git tools.
4. As a mobile user, I want to see every uncommitted change in the selected project or worktree, so that changes from agents, editors, terminals, and other devices are represented honestly.
5. As a mobile user, I want the screen to avoid claiming that changes belong to a particular thread or turn, so that repository-wide state is not misattributed.
6. As a mobile user, I want a thread with a dedicated worktree to review that worktree, so that its naturally isolated Git state is preserved.
7. As a mobile user, I want threads sharing a workspace root to see the same index and working tree, so that the UI matches Git's shared state.
8. As a remote mobile user, I want Git operations to execute on the connected environment, so that review works over local network connections, relay connections, and tunnels.
9. As a mobile user, I want separate Unstaged and Staged tabs, so that the screen stays uncluttered while exposing both Git layers.
10. As a mobile user, I want each tab label to show its file count, so that I can understand the current repository state at a glance.
11. As a mobile user, I want Unstaged to open first whenever it contains files, so that the next work requiring attention is immediately available.
12. As a mobile user, I want Staged to open automatically when Unstaged is empty, so that a fully staged repository does not open to an empty primary view.
13. As a mobile user, I want the same path to be allowed in both tabs, so that a staged baseline and newer working-tree edits are both represented.
14. As a mobile user, I want changed files organized into a directory tree, so that I can understand their relationship to the codebase.
15. As a mobile user, I want the tree to contain only changed paths and their ancestors, so that unrelated repository files do not create noise.
16. As a mobile user, I want single-child directories compacted, so that deep paths use less horizontal and vertical space.
17. As a mobile user, I want changed paths expanded initially, so that files are visible without repetitive folder navigation.
18. As a mobile user, I want to collapse and expand directories, so that I can control density in a large change set.
19. As a mobile user, I want directory expansion and tree scroll state retained during the current visit, so that returning from a diff preserves my place.
20. As a mobile user, I want directories listed before files and both groups sorted alphabetically, so that the tree remains spatially stable.
21. As a mobile user, I want each file row to show its change type, filename, parent path, and compact addition/deletion totals, so that I can choose what to inspect without overcrowding the list.
22. As a mobile user, I want a file row to show its draft-comment count only when nonzero, so that notes are discoverable without permanent visual noise.
23. As a mobile user, I want tapping a file row to open its diff, so that the primary interaction remains direct and predictable.
24. As a mobile user, I want a visible file-row overflow menu, so that I can Stage or Unstage an understood file without opening it.
25. As a mobile user, I want no search control in the initial Changes experience, so that the overview remains focused and minimal.
26. As a mobile user, I want a selected file to open as a full-screen diff, so that code receives enough space on a phone.
27. As a mobile user, I want a unified diff on phones, so that additions and deletions remain readable at narrow widths.
28. As a mobile user, I want the complete file represented when it can be rendered safely, so that I can inspect unchanged context as well as changed hunks.
29. As a mobile user, I want the first opening of a file to jump to its first change, so that I can begin reviewing immediately.
30. As a mobile user, I want reopening a file during the same visit to restore its last scroll position, so that I can continue where I stopped.
31. As a mobile user, I want a narrow overview rail beside the diff, so that I can locate changes throughout a large file.
32. As a mobile user, I want additions, deletions, and draft comments represented distinctly on the overview rail, so that I can understand their distribution.
33. As a mobile user, I want to tap a marker on the overview rail to jump to that region, so that change navigation does not require a second toolbar.
34. As a mobile user with color-vision differences, I want overview markers to remain distinguishable without color alone, so that navigation is accessible.
35. As a mobile user, I want long lines to scroll horizontally by default, so that code structure is not distorted.
36. As a mobile user, I want a Wrap lines option in the diff overflow menu, so that prose and unusually long lines can be read without horizontal scrolling.
37. As a mobile user, I want all unchanged context available rather than permanently collapsed, so that the diff does not hide code I may need to inspect.
38. As a mobile user, I want the diff header to show the filename, full path, change type, addition/deletion totals, and active Git layer count, so that I retain orientation without excessive chrome.
39. As a mobile user, I want the header to say Unstaged with the remaining count or Staged with its file count, so that dynamic staging does not produce misleading position labels.
40. As a mobile user, I want a sticky bottom toolbar above the device safe area, so that file navigation and staging remain available while I scroll.
41. As a mobile user, I want Previous and Next to move through files in the active tab's visible tree order, so that navigation is predictable.
42. As a mobile user, I want file navigation to stop at tab boundaries rather than wrap, so that I know when I have reached the end.
43. As a mobile user, I want Stage to add the entire current working-tree version of the file to the real index, so that whole-file staging has clear semantics.
44. As a mobile user, I want Stage from an open unstaged diff to advance to the nearest remaining unstaged file, so that reviewing many files is fast.
45. As a mobile user, I want Unstage to remove all staged changes for the file while leaving working-tree contents untouched, so that Git state changes without discarding code.
46. As a mobile user, I want Stage and Unstage to happen immediately without confirmation or an Undo toast, so that ordinary reversible Git actions stay lightweight.
47. As a mobile user, I want no Stage all or Unstage all action in Changes, so that mutating the entire index is not accidentally encouraged.
48. As a mobile user, I want a partially staged file's remaining changes to be fully staged when I choose Stage, so that whole-file behavior remains consistent.
49. As a mobile user, I want binary and oversized files to show useful metadata and normal Stage or Unstage actions, so that unsupported rendering does not hide repository state.
50. As a mobile user, I want untracked files to appear as additions, so that new files are reviewable and stageable.
51. As a mobile user, I want deleted files to show their previous content as removed, so that deletions can be reviewed and staged.
52. As a mobile user, I want renames to show both old and new paths and stage atomically, so that neither half of a rename is lost.
53. As a mobile user, I want staged files in a repository without an initial commit to remain visible, so that first-commit workflows work correctly.
54. As a mobile user, I want the current diff snapshot to remain stable when a file changes externally, so that code does not move while I am reading or commenting.
55. As a mobile user, I want a File changed — Reload notice when the visible snapshot becomes stale, so that I can deliberately load the new state.
56. As a mobile user, I want a stale Stage or Unstage action rejected, so that newer code I have not seen is never staged or unstaged accidentally.
57. As a mobile user, I want repository status refreshed when Changes opens or regains focus, after Git actions, and after an agent finishes, so that meaningful transitions are reflected.
58. As a mobile user, I want pull-to-refresh, so that I can explicitly reconcile state after external Git activity.
59. As a mobile user, I want no continuous Git polling, so that remote traffic, server work, and phone battery use remain bounded.
60. As a mobile reviewer, I want to tap a line number to begin a comment, so that comment creation is precise without adding controls to every line.
61. As a mobile reviewer, I want to select a single line or contiguous range, so that a note can target the smallest useful context.
62. As a mobile reviewer, I want to comment on added, deleted, and unchanged lines, so that feedback is not limited to newly added code.
63. As a mobile reviewer, I want deleted-line comments to preserve the old side and other comments to preserve the appropriate diff side, so that the agent receives unambiguous context.
64. As a mobile reviewer, I want a comment composer sheet to show the selected path, range, excerpt, and text field, so that I can verify the target before adding a note.
65. As a mobile reviewer, I want the composer action to say Add to review rather than Send, so that I know the agent has not received anything yet.
66. As a mobile reviewer, I want numbered gutter markers and aggregate counts for draft comments, so that I can find and manage collected feedback.
67. As a mobile reviewer, I want to edit or delete an individual draft comment, so that I can refine the batch before submission.
68. As a mobile reviewer, I want comments to remain independent of Stage and Unstage, so that Git organization does not erase review feedback.
69. As a mobile reviewer, I want a comment to remain associated with its file when that path moves between tabs, so that staging does not interrupt the review draft.
70. As a mobile reviewer, I want an unmatched anchor marked Outdated rather than silently moved, so that feedback is not attached to the wrong code.
71. As a mobile reviewer, I want an outdated comment to preserve its original path, side, range, and short excerpt, so that I may still send useful context deliberately.
72. As a mobile reviewer, I want unfinished notes persisted on the device for the repository and destination thread, so that navigation or an app restart does not lose my work.
73. As a mobile reviewer, I want leaving the entire Changes flow with unsent notes to offer Keep draft, Discard, and Cancel, so that draft retention is explicit.
74. As a mobile reviewer, I want Discard all notes available from the Notes overflow menu with confirmation, so that I have a clear reverse action for a draft batch.
75. As a mobile reviewer, I want a top-right Notes action with the current count, so that I can open the batch summary from either the tree or a file diff.
76. As a mobile reviewer, I want the Notes screen to group comments by file and show their ranges and outdated state, so that I can review the batch before sending it.
77. As a mobile reviewer, I want to add an optional global note on the Notes screen, so that cross-cutting feedback does not need an artificial line anchor.
78. As a mobile reviewer, I want the Notes screen to identify the destination thread, so that I know which agent will receive the batch.
79. As a mobile reviewer, I want Send to agent available even when unstaged files remain, so that the tool supports flexible rather than enforced review order.
80. As a mobile reviewer, I want remaining unstaged files shown as non-blocking information, so that I retain context without a submission gate.
81. As an agent user, I want submitted feedback to contain only the optional global note plus comments grouped by file with compact line and excerpt context, so that the provider receives a small, actionable message.
82. As an agent user, I want review submission to leave the ordinary thread composer text and attachments untouched, so that unrelated drafts are never mixed into or erased by the review.
83. As an agent user, I want review submission to inherit the thread's normal send or queue behavior when the provider is working, so that Changes does not invent a second message queue.
84. As a mobile reviewer, I want a successful send to clear the submitted inline comments and global note while leaving Git state unchanged, so that the next batch starts cleanly.
85. As a mobile reviewer, I want a failed send to retain the entire draft batch, so that transient connection errors do not lose feedback.
86. As a mobile reviewer, I want Finish review to return to the thread without sending when no comments or global note exist, so that an empty message is not created.
87. As a mobile user, I want to remain in the thread after sending notes, so that the current conversation stays in focus.
88. As a mobile user, I want no automatic reopening of Changes and no new Review N changes prompt after the agent finishes, so that existing thread behavior remains unchanged.
89. As a mobile user, I want an empty Changes screen to say No uncommitted changes and offer Back, so that a clean repository has a clear, quiet state.
90. As a mobile user, I want an unavailable or unreadable repository to show the real error and Retry without offering initialization, so that this focused surface does not become repository setup.
91. As an iOS user, I want the complete Changes workflow, so that the feature works on my phone.
92. As an Android user, I want behavior equivalent to iOS, so that mobile capability does not depend on platform.
93. As a mobile Git user, I want the existing Commit flow to commit exactly the current staged set, so that it does not silently destroy the index state established through Changes.
94. As a performance-sensitive user, I want status metadata loaded before individual file contents and diffs loaded on demand, so that repositories with many changes do not send every patch over the WebSocket.

## Implementation Decisions

- **Feature boundary:** Add a dedicated mobile Changes mode. Preserve the existing turn/checkpoint-oriented Review experience rather than adding staged and unstaged sources to its turn-first selector.
- **Entry point:** Add the new Review changes action directly to the active thread's Git menu. Do not add a second entry from Git Overview or a permanent application tab.
- **Repository selection:** Resolve the target from the thread's worktree when present and otherwise from the project's workspace root. Git state is scoped to that directory, never to thread identity.
- **Comment destination:** Bind each draft batch to the originating thread even though the displayed Git state is repository-wide. Clearly display the destination on the Notes screen.
- **Source of truth:** Treat HEAD, the real Git index, and the working tree as authoritative. Do not derive this feature from checkpoints, turn diffs, activities, orchestration events, or a separate reviewed-file model.
- **Git layers:** Define Staged as HEAD to index and Unstaged as index to working tree. A path may have entries in both layers and must not be modeled as belonging to exactly one bucket.
- **Status contract:** Extend the typed VCS contract with exact staged and unstaged change metadata. Preserve change kind, current path, old path for renames, insertion/deletion counts, display capability, and a stable identity suitable for detecting a stale view.
- **Exact path parsing:** Base exact change identity on NUL-separated porcelain output so whitespace, newlines, renames, and literal pathspecs remain correct. Do not build the new contract on the current lossy status summary.
- **Metadata-first transport:** Stream or query compact status metadata independently of patch bodies. Fetch the selected file's diff or contents on demand to avoid sending every changed file over the WebSocket.
- **Diff semantics:** For Staged, read the old side from HEAD and the new side from the index. For Unstaged, read the old side from the index and the new side from the filesystem. Handle absent sides for additions, deletions, untracked files, renames, and unborn HEAD.
- **Full-file rendering:** Produce a complete unified representation for safely renderable files rather than only ordinary Git hunk context. Preserve every unchanged line while retaining addition, deletion, old-line, and new-line identities.
- **Rendering limits:** Retain bounded file-content and message-size safeguards. Oversized or binary files return metadata and an explicit non-renderable reason rather than an unbounded patch.
- **Git mutation contract:** Add server-side whole-file Stage and Unstage operations over typed RPC. Mutations accept one or more exact file identities from the same layer, validate the complete selection against current Git state, and apply it atomically in one command.
- **Stage behavior:** Stage the complete current working-tree state for the selected file with literal path handling. A partially staged file absorbs all remaining working-tree changes.
- **Unstage behavior:** Restore the selected file's index entry from HEAD while leaving working-tree contents untouched. Define equivalent behavior for an unborn HEAD and treat both sides of a rename atomically.
- **Stale protection:** Compare the mutation's expected identity to current Git state. If the file or relevant index state changed after loading, reject the mutation and return a reloadable stale-state result rather than acting on unseen content.
- **Status publication:** Refresh and publish local VCS status after successful Stage, Unstage, and index-respecting Commit operations. Continue refreshing after a provider turn settles.
- **Authorization:** Reuse existing read and operate scopes for status/diff reads and Git mutations. Do not introduce a mobile-only or review-specific authentication model.
- **Remote operation:** Execute every Git read and mutation inside the environment's server. Mobile communicates only through the shared typed RPC and client runtime.
- **Client scheduling:** Reuse the client runtime's per-environment and cwd VCS command scheduling and invalidation patterns. Stale tokens remain necessary because another client, provider, terminal, or editor can mutate Git outside that scheduler.
- **Commit coherence:** Change the existing mobile Commit behavior to commit the current staged set exactly. It must not reset the index, restage a temporary selection, or stage all dirty files implicitly.
- **Overview structure:** Use two tab roots, Unstaged and Staged, with counts. Prefer Unstaged while nonempty, then Staged. Build a deterministic changed-path tree with compacted directories, expanded initial paths, directories-first alphabetical ordering, and session-local expansion/scroll restoration.
- **Overview density:** File rows show change kind, filename, muted parent path, compact insertion/deletion totals, and a nonzero note count. There is no initial search control, viewed checkbox, or review-completion state.
- **File actions:** Tapping a row opens the diff. File and directory overflow menus offer the layer-appropriate Stage or Unstage action; a directory action applies to all descendant files in one mutation. Do not expose repository-wide Stage/Unstage or destructive discard operations.
- **Diff navigation:** Use a full-screen unified diff on phones. Open at the first changed region on first visit, restore scroll during the current Changes visit, and keep Previous/Next within the active tab's current tree order without wrapping.
- **Diff header:** Show filename, full path, change kind, insertion/deletion totals, and Unstaged remaining count or Staged file count. Avoid dynamic position labels such as 3 of 8 because staging changes the queue.
- **Sticky toolbar:** Keep Previous, Stage or Unstage, and Next fixed above the safe area, with content inset so the final lines remain visible. Stage advances to the nearest remaining unstaged file. There is no confirmation and no Undo toast.
- **Long lines:** Preserve horizontal scrolling by default and place Wrap lines in the diff overflow menu.
- **Change overview rail:** Extend the native diff surface on both platforms with a proportional vertical rail for additions, deletions, and comments. Markers must not rely on color alone, and tapping a marker scrolls to that region. Do not add a draggable viewport thumb or a separate previous/next-change toolbar.
- **Native performance:** Continue drawing only the visible viewport and requesting syntax highlighting near the visible range. Avoid eagerly serializing, highlighting, or prewarming complete contents for non-selected files.
- **External changes:** Do not replace a visible diff automatically. Mark it stale with File changed — Reload, preserve the current snapshot and scroll, and update it only after an explicit reload.
- **Refresh policy:** Refresh on entry, focus, successful Git mutations, and provider completion, plus pull-to-refresh. Do not continuously poll local status.
- **Draft data model:** Store inline notes as structured mobile draft data rather than appending them to the normal composer. Scope persistence by environment, repository/worktree cwd, and destination thread.
- **Draft locality:** Persist drafts on the mobile device across navigation and app restarts. Cross-device synchronization is not required.
- **Comment anchors:** Record file identity, Git layer at creation, old/new side, line or contiguous range, concise code excerpt, user text, and source identity. Permit comments on changed, deleted, and unchanged lines.
- **Comment drift:** Never silently fuzzy-match or move an anchor. If its source identity or excerpt no longer matches, retain the note as Outdated and keep its original context available for deliberate editing, deletion, or submission.
- **Cross-tab notes:** Note ownership is independent of Git layer. Keep file-level counts visible when the path moves between tabs or appears in both; show inline markers only where the saved anchor matches and otherwise show the file's attached-note summary.
- **Comment composer:** Open a bottom sheet from a tapped line number, allow a contiguous range, preview the path/range/excerpt, and use Add to review as the commit action.
- **Draft presentation:** Show numbered gutter markers, file and total note counts, and edit/delete affordances without inserting permanent comment cards between code lines.
- **Notes summary:** Add a top-right Notes count accessible from the overview and file diff. The summary groups notes by file, shows anchors and outdated warnings, identifies the destination thread, permits editing/deleting, and contains an optional global note.
- **Flexible submission:** Permit Send to agent whenever at least one inline note or global note exists. Remaining unstaged files are non-blocking information, not a workflow gate.
- **Message serialization:** Send one compact normal user message containing only the optional global note and notes grouped by file, with line/range identity and short excerpts. Do not attach the whole repository diff or an automated status summary.
- **Composer isolation:** Submission must not read, merge, replace, or clear the ordinary thread composer text or attachments. It inherits the thread's established send/queue behavior.
- **Draft lifecycle:** Clear the submitted note batch and global note only after successful message acceptance. Preserve everything on failure. With no notes or global note, Finish review returns to the thread without sending.
- **Leaving Changes:** When leaving the entire flow with unsent notes, offer Keep draft, Discard, and Cancel. Discard all notes also exists in the Notes overflow and requires confirmation; individual edit/delete operations do not require a batch-level confirmation.
- **Post-send behavior:** Return to and remain in the destination thread. Do not reopen Changes automatically, add a Review N changes prompt, or change the existing provider-finished experience.
- **Errors and empty states:** A clean repository shows No uncommitted changes and Back. A non-repository or unreadable state shows the real error and Retry without offering Git initialization.
- **Client scope:** Ship equivalent functionality on iOS and Android phones. Reuse adaptive mobile foundations where helpful, but do not require a new tablet-specific layout.
- **Documentation:** Document the user-visible mobile behavior in the user documentation and describe new VCS contract semantics in internals documentation using project, workspace root, worktree, thread, turn, provider, client, and environment consistently with the glossary.

## Testing Decisions

- **Testing philosophy:** Assert externally visible Git, RPC, state-model, and message outcomes. Do not assert exact Git subprocess argument sequences, component implementation structure, private native drawing calls, or snapshot large rendered trees.
- **Primary repository seam:** Extend the existing VCS driver contract harness and Git-backed integration tests using temporary real repositories. This is the highest established seam for proving that status, diff, Stage, Unstage, stale protection, and Commit produce correct Git-visible outcomes.
- **Repository cases:** Cover clean state; independent staged and unstaged files; one path present in both layers; partial staging followed by whole-file Stage; Unstage with working-tree preservation; additions; deletions; renames; untracked files; binary and oversized files; literal paths with spaces and newlines; unborn HEAD; external index/worktree changes; stale mutation rejection; and committing exactly the staged set.
- **Service and RPC coverage:** Keep thin focused tests at the existing review/VCS service and typed RPC boundaries for workspace-bound cwd validation, schema round-tripping, authorization scopes, error attribution, and status publication after mutations. These support the primary repository seam rather than creating a second Git behavior suite.
- **Client runtime coverage:** Extend existing VCS runtime tests for per-environment/cwd command serialization, status invalidation, remote errors, stale results, and preserving the caller's refresh policy.
- **Primary mobile seam:** Test a pure Changes state/model boundary for tab selection, dual-layer paths, deterministic tree construction, directory expansion, active-file navigation, Stage auto-advance, scroll restoration, stale banners, comment counts, cross-tab notes, outdated anchors, and empty/error states.
- **Draft and serialization coverage:** Extend existing comment-selection and draft-state prior art to prove single-line and range anchors on both diff sides, unchanged-line comments, compact message output, optional global notes, ordinary composer isolation, send-success clearing, send-failure retention, app-restart persistence, and Keep draft/Discard/Cancel behavior.
- **Native adapter coverage:** Extend existing native diff adapter tests for complete-file row identity, first-change lookup, proportional overview markers, accessible marker kinds, comment markers, viewport positioning, and cache invalidation when contents or notes change.
- **Performance coverage:** Add focused tests or benchmarks ensuring file status is metadata-first, non-selected full contents are not fetched or prewarmed, visible-driven highlighting remains bounded, and oversized files use the metadata fallback. Do not use continuously repainting animations.
- **Integrated verification:** After implementation is integrated, run one real-client pass with the repository's mobile testing workflow on both iOS and Android against a disposable environment seeded with staged, unstaged, dual-state, untracked, deleted, renamed, large, and binary files.
- **Integrated core loop:** Verify direct entry from a thread, tab/tree navigation, complete unified diff, overview-rail jumps, inline/range note creation, whole-file Stage with auto-advance, Notes summary, submission with unstaged files remaining, composer isolation, return to the thread, provider edits appearing as new unstaged changes against the staged baseline, and stale-file reload behavior.
- **Async correctness:** Await RPC completion and observable status refreshes. Do not use sleeps or polling to make tests pass.
- **Focused verification:** Run only the targeted VCS, contract, client-runtime, and mobile tests touched by the implementation, plus the integrated mobile passes. Repository-wide checks remain CI's responsibility.

## Out of Scope

- Web or desktop Changes UI.
- GitHub pull requests, review conversations, approvals, requested-changes states, or remote hosting-provider APIs.
- Attributing repository changes to a thread, turn, provider, user, or device.
- Replacing or redesigning checkpoint, turn-diff, or existing Review functionality.
- Hunk-level or line-level staging.
- Stage all or Unstage all across the repository.
- Changed-file search or a Tree/List display toggle.
- Commit, Pull, Push, branch, worktree, initialization, or destructive discard controls inside Changes.
- Editing source files from the diff.
- Inserting review comments into source files.
- Enforcing that every file is reviewed or staged before notes can be sent.
- Treating Staged as reviewer-owned or preventing providers and external Git tools from changing the index.
- Continuous local Git polling.
- Automatic reopening, new provider-finished prompts, or a Review N changes call to action.
- A separate message queue or special provider protocol for review notes.
- Merging review notes into the ordinary thread composer.
- Keeping submitted notes as a second review-history database; the sent thread message is the durable record.
- Cross-device synchronization of unsent review drafts.
- Side-by-side diffs on phones.
- A required tablet-specific split-view redesign.
- Rendering binary files or unbounded full contents for oversized files.
- A dedicated mobile authentication scope for Changes.
- A general-purpose mobile Git client.

## Further Notes

- Changes is a product label for inspecting Git state; it is not shorthand for GitHub review.
- The central loop relies on ordinary Git semantics: a user stages the reviewed version, sends notes, and later provider edits appear under Unstaged as index-to-working-tree changes while the reviewed baseline remains staged.
- Because Git state belongs to a worktree, dedicated thread worktrees provide natural isolation. Threads sharing a workspace root necessarily share staged and unstaged state.
- Providers, terminals, editors, and other clients may mutate the index. The feature reflects that reality and uses stale-action protection rather than claiming ownership.
- Existing mobile code already provides a high-performance native diff surface, line/range comment interaction, responsive review navigation, and a reusable changed-path tree foundation. The principal new foundation is exact staged/unstaged contracts, index-aware file reads, whole-file Stage/Unstage RPCs, structured review drafts, and native overview-rail navigation.
- Current combined dirty-worktree previews are insufficient because they compare HEAD directly to the filesystem and discard the distinction between index and working tree.
- Current mobile Commit behavior must be made coherent with the real index before this workflow can be considered complete.
- No relevant architecture decision record exists for this area. The repository architecture nevertheless establishes the required boundary: filesystem and Git work run on the server, typed contracts cross the authenticated WebSocket, and non-visual client behavior belongs in the shared client runtime.
