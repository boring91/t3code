import { describe, expect, it } from "vite-plus/test";

import {
  changesCommentRebindTargets,
  changesDraftAttachments,
  changesDraftKey,
  decodeChangesDrafts,
  encodeChangesDraftsForPersistence,
  isChangesCommentOutdated,
  rebindChangesDraftComments,
  serializeChangesDraft,
  type ChangesDraft,
  type ChangesDraftComment,
} from "./changesDrafts";

const attachment = {
  id: "image-one",
  type: "image" as const,
  name: "context.png",
  mimeType: "image/png",
  sizeBytes: 1,
  dataUrl: "data:image/png;base64,AA==",
  previewUri: "data:image/png;base64,AA==",
};

const comment: ChangesDraftComment = {
  id: "one",
  path: "src/a.ts",
  oldPath: null,
  layer: "unstaged",
  sourceIdentity: "identity",
  side: "new",
  startLine: 2,
  endLine: 3,
  rangeLabel: "+2 to +3",
  excerpt: "+const a = 1;",
  text: "Can this be named?",
  attachments: [],
};

describe("changes drafts", () => {
  it("scopes drafts by environment, cwd, and thread", () => {
    expect(changesDraftKey({ environmentId: "a", cwd: "/repo", threadId: "b" })).not.toBe(
      changesDraftKey({ environmentId: "a", cwd: "/other", threadId: "b" }),
    );
  });

  it("serializes structured comments only when explicitly sent", () => {
    const draft: ChangesDraft = {
      globalNote: "Ship carefully.",
      globalAttachments: [],
      comments: [comment],
    };
    expect(serializeChangesDraft(draft)).toContain("## src/a.ts");
    expect(serializeChangesDraft(draft)).toContain("Can this be named?");
    expect(serializeChangesDraft(draft)).toContain("## General");
  });

  it("decodes valid persisted drafts and detects changed anchors", () => {
    const { attachments: _attachments, ...legacyComment } = comment;
    expect(
      decodeChangesDrafts({
        schemaVersion: 1,
        drafts: { scoped: { globalNote: "", comments: [legacyComment] } },
      }),
    ).toEqual({
      scoped: {
        globalNote: "",
        globalAttachments: [],
        comments: [comment],
      },
    });
    expect(isChangesCommentOutdated(comment, [{ path: comment.path, identity: "new" }])).toBe(true);
    expect(
      isChangesCommentOutdated(comment, [{ path: comment.path, identity: comment.sourceIdentity }]),
    ).toBe(false);
  });

  it("collects and describes attached images", () => {
    const draft: ChangesDraft = {
      globalNote: "",
      globalAttachments: [attachment],
      comments: [{ ...comment, attachments: [{ ...attachment, id: "image-two" }] }],
    };

    expect(changesDraftAttachments(draft)).toHaveLength(2);
    expect(serializeChangesDraft(draft)).toContain("Attached images: context.png");
    expect(JSON.stringify(encodeChangesDraftsForPersistence({ scoped: draft }))).not.toContain(
      attachment.dataUrl,
    );
  });

  it("rebinds a matching anchor after an explicit layer mutation", () => {
    const rebound = rebindChangesDraftComments(
      { globalNote: "", globalAttachments: [], comments: [comment] },
      { path: comment.path, identity: comment.sourceIdentity },
      {
        old: null,
        new: {
          path: comment.path,
          oldPath: null,
          layer: "staged",
          identity: "staged-snapshot",
        },
      },
    );
    expect(rebound.comments[0]).toMatchObject({
      path: comment.path,
      layer: "staged",
      sourceIdentity: "staged-snapshot",
      oldPath: comment.oldPath,
    });
  });

  it("keeps unsafe partial-stage anchors outdated and maps rename sides exactly", () => {
    const unstaged = {
      identity: "unstaged",
      layer: "unstaged" as const,
      kind: "renamed" as const,
      path: "new.ts",
      oldPath: "old.ts",
      insertions: 1,
      deletions: 1,
      display: "text" as const,
    };
    const staged = { ...unstaged, identity: "staged", layer: "staged" as const };
    const before = { cwd: "/repo", staged: [staged], unstaged: [unstaged] };
    const after = {
      cwd: "/repo",
      staged: [],
      unstaged: [
        {
          ...unstaged,
          identity: "deleted",
          kind: "deleted" as const,
          path: "old.ts",
          oldPath: null,
        },
        { ...unstaged, identity: "added", kind: "added" as const, oldPath: null },
      ],
    };
    const targets = changesCommentRebindTargets(staged, before, after);
    expect(targets.old).toMatchObject({ path: "old.ts", identity: "deleted" });
    expect(targets.new).toBeNull();
  });
});
