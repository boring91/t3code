import { describe, expect, it } from "vite-plus/test";

import type { VcsChange } from "@t3tools/contracts";
import { buildReviewParsedDiff } from "../review/reviewModel";
import {
  buildChangesOverviewMarkers,
  buildChangesCommentPreviewLines,
  buildChangesTreeRows,
  buildCompleteUnifiedDiff,
  changesInDirectory,
  firstChangedRowIndex,
  getInitialChangesLayer,
  nextChangeAfterMutation,
} from "./changesModel";

function change(path: string, layer: VcsChange["layer"] = "unstaged"): VcsChange {
  return {
    identity: path,
    layer,
    kind: "modified",
    path,
    oldPath: null,
    insertions: 1,
    deletions: 1,
    display: "text",
  };
}

describe("changes model", () => {
  it("defaults to unstaged unless only staged changes exist", () => {
    expect(getInitialChangesLayer({ unstaged: [change("a")], staged: [] })).toBe("unstaged");
    expect(getInitialChangesLayer({ unstaged: [], staged: [change("a", "staged")] })).toBe(
      "staged",
    );
  });

  it("builds a deterministic directories-first tree", () => {
    const rows = buildChangesTreeRows(
      [change("z.txt"), change("src/z.ts"), change("src/a.ts")],
      new Set(["src"]),
    );
    expect(rows.map((row) => `${row.kind}:${row.id}`)).toEqual([
      "directory:src",
      "file:unstaged:src/a.ts",
      "file:unstaged:src/z.ts",
      "file:unstaged:z.txt",
    ]);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 1, 0]);
  });

  it("compacts single-child directory chains", () => {
    const rows = buildChangesTreeRows([change("src/features/changes/index.ts")], new Set());
    expect(rows[0]).toMatchObject({
      kind: "directory",
      id: "src/features/changes",
      name: "src/features/changes",
    });
  });

  it("selects only changes inside a directory", () => {
    expect(
      changesInDirectory(
        [change("src/a.ts"), change("src-old/b.ts"), change("root.ts")],
        "src",
      ).map((item) => item.path),
    ).toEqual(["src/a.ts"]);
  });

  it("advances to the nearest remaining file and builds rail markers", () => {
    expect(nextChangeAfterMutation([change("a"), change("c")], "b", ["a", "b", "c"])?.path).toBe(
      "c",
    );
    expect(firstChangedRowIndex([{ change: "context" }, { change: "add" }])).toBe(1);
    expect(
      buildChangesOverviewMarkers(
        [{ kind: "file" }, { kind: "line", change: "add" }, { kind: "line", change: "delete" }],
        [2],
      ),
    ).toEqual([
      { rowIndex: 1, kind: "addition" },
      { rowIndex: 2, kind: "deletion" },
      { rowIndex: 2, kind: "comment" },
    ]);
  });

  it("represents unchanged contents for a pure rename", () => {
    const diff = buildCompleteUnifiedDiff({
      oldPath: "old.ts",
      newPath: "new.ts",
      oldContents: "one\ntwo\n",
      newContents: "one\ntwo\n",
    });
    expect(diff).toContain("@@ -1,2 +1,2 @@");
    expect(diff).toContain(" one\n two");
  });

  it("keeps newline-containing paths inside patch headers", () => {
    const diff = buildCompleteUnifiedDiff({
      oldPath: "old\nname.ts",
      newPath: "new\rname.ts",
      oldContents: "old\n",
      newContents: "new\n",
    });
    expect(diff).toContain("--- old\\nname.ts");
    expect(diff).toContain("+++ new\\nname.ts");
    expect(diff.split("\n").filter((line) => line.startsWith("--- "))).toHaveLength(1);
    expect(buildReviewParsedDiff(diff, "newline-path").kind).toBe("files");
  });

  it("builds comment preview rows from the saved excerpt", () => {
    expect(
      buildChangesCommentPreviewLines({
        excerpt: " context\n+added\n-deleted",
        side: "new",
        startLine: 8,
      }),
    ).toMatchObject([
      { change: "context", content: "context", newLineNumber: 8 },
      { change: "add", content: "added", newLineNumber: 9 },
      { change: "delete", content: "deleted", newLineNumber: 10 },
    ]);
  });
});
