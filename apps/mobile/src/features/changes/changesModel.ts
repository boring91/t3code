import type { VcsChange, VcsChangeLayer } from "@t3tools/contracts";
import { createTwoFilesPatch } from "diff";

import { buildFileTree, type FileTreeNode } from "../files/fileTree";
import type { ReviewRenderableLineRow } from "../review/reviewModel";

export interface ChangesTreeDirectoryRow {
  readonly kind: "directory";
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly expanded: boolean;
}

export interface ChangesTreeFileRow {
  readonly kind: "file";
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly change: VcsChange;
}

export type ChangesTreeRow = ChangesTreeDirectoryRow | ChangesTreeFileRow;

export interface ChangesOverviewMarker {
  readonly rowIndex: number;
  readonly kind: "addition" | "deletion" | "comment";
}

export function buildChangesCommentPreviewLines(input: {
  readonly excerpt: string;
  readonly side: "old" | "new";
  readonly startLine: number;
}): ReadonlyArray<ReviewRenderableLineRow> {
  return input.excerpt.split("\n").map((rawLine, index) => {
    const marker = rawLine[0];
    const change = marker === "+" ? "add" : marker === "-" ? "delete" : "context";
    const lineNumber = input.startLine + index;
    return {
      kind: "line",
      id: `changes-comment:${index}`,
      change,
      oldLineNumber: input.side === "old" ? lineNumber : null,
      newLineNumber: input.side === "new" ? lineNumber : null,
      content: marker === "+" || marker === "-" || marker === " " ? rawLine.slice(1) : rawLine,
      additionTokenIndex: null,
      deletionTokenIndex: null,
      comparison: null,
    };
  });
}

export function getInitialChangesLayer(input: {
  readonly staged: ReadonlyArray<VcsChange>;
  readonly unstaged: ReadonlyArray<VcsChange>;
}): VcsChangeLayer {
  return input.unstaged.length > 0 || input.staged.length === 0 ? "unstaged" : "staged";
}

export function changesInDirectory(
  changes: ReadonlyArray<VcsChange>,
  directoryPath: string,
): ReadonlyArray<VcsChange> {
  const prefix = `${directoryPath}/`;
  return changes.filter((change) => change.path.startsWith(prefix));
}

export function buildChangesTreeRows(
  changes: ReadonlyArray<VcsChange>,
  expandedDirectoryIds: ReadonlySet<string>,
): ReadonlyArray<ChangesTreeRow> {
  const changesByPath = new Map(changes.map((change) => [change.path, change]));
  const tree = buildFileTree(changes.map((change) => ({ kind: "file", path: change.path })));
  const rows: ChangesTreeRow[] = [];
  const append = (nodes: ReadonlyArray<FileTreeNode>, depth: number) => {
    for (const initialNode of nodes) {
      if (initialNode.kind === "directory") {
        let node = initialNode;
        let name = node.name;
        while (node.children.length === 1 && node.children[0]?.kind === "directory") {
          node = node.children[0];
          name = `${name}/${node.name}`;
        }
        const expanded = expandedDirectoryIds.has(node.path);
        rows.push({ kind: "directory", id: node.path, name, depth, expanded });
        if (expanded) append(node.children, depth + 1);
        continue;
      }

      const change = changesByPath.get(initialNode.path);
      if (!change) continue;
      rows.push({
        kind: "file",
        id: `${change.layer}:${change.path}`,
        name: initialNode.name,
        depth,
        change,
      });
    }
  };
  append(tree, 0);
  return rows;
}

export function nextChangeAfterMutation(
  visibleChanges: ReadonlyArray<VcsChange>,
  currentPath: string,
  previousOrder: ReadonlyArray<string> = visibleChanges.map((change) => change.path),
): VcsChange | null {
  const currentIndex = visibleChanges.findIndex((change) => change.path === currentPath);
  if (currentIndex < 0) {
    const previousIndex = previousOrder.indexOf(currentPath);
    if (previousIndex < 0) return visibleChanges[0] ?? null;
    const orderByPath = new Map(previousOrder.map((path, index) => [path, index]));
    return (
      visibleChanges.find((change) => (orderByPath.get(change.path) ?? -1) > previousIndex) ??
      visibleChanges
        .toReversed()
        .find(
          (change) => (orderByPath.get(change.path) ?? Number.MAX_SAFE_INTEGER) < previousIndex,
        ) ??
      null
    );
  }
  return visibleChanges[currentIndex + 1] ?? visibleChanges[currentIndex - 1] ?? null;
}

export function firstChangedRowIndex(rows: ReadonlyArray<{ readonly change?: string }>): number {
  const index = rows.findIndex((row) => row.change === "add" || row.change === "delete");
  return index < 0 ? 0 : index;
}

export function buildCompleteUnifiedDiff(input: {
  readonly oldPath: string;
  readonly newPath: string;
  readonly oldContents: string;
  readonly newContents: string;
}): string {
  const oldPath = input.oldPath.replace(/[\r\n]/g, "\\n");
  const newPath = input.newPath.replace(/[\r\n]/g, "\\n");
  const patch = createTwoFilesPatch(
    oldPath,
    newPath,
    input.oldContents,
    input.newContents,
    "",
    "",
    { context: Number.MAX_SAFE_INTEGER },
  );
  if (input.oldContents !== input.newContents || input.oldContents.length === 0) return patch;

  const contents = input.oldContents.endsWith("\n")
    ? input.oldContents.slice(0, -1)
    : input.oldContents;
  const lines = contents.split("\n");
  return `${patch}@@ -1,${lines.length} +1,${lines.length} @@\n${lines.map((line) => ` ${line}`).join("\n")}\n`;
}

export function buildChangesOverviewMarkers(
  rows: ReadonlyArray<{ readonly kind: string; readonly change?: string }>,
  commentRowIndexes: ReadonlyArray<number>,
): ReadonlyArray<ChangesOverviewMarker> {
  const markers: ChangesOverviewMarker[] = [];
  let previousChange: string | undefined;
  rows.forEach((row, rowIndex) => {
    if (row.kind !== "line") {
      previousChange = undefined;
      return;
    }
    if (row.change === "add" && previousChange !== "add") {
      markers.push({ rowIndex, kind: "addition" });
    }
    if (row.change === "delete" && previousChange !== "delete") {
      markers.push({ rowIndex, kind: "deletion" });
    }
    previousChange = row.change;
  });
  new Set(commentRowIndexes).forEach((rowIndex) => markers.push({ rowIndex, kind: "comment" }));
  return markers;
}
