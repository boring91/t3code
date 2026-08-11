import type {
  EnvironmentId,
  ThreadId,
  VcsChange,
  VcsChangeFileResult,
  VcsChangeLayer,
} from "@t3tools/contracts";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { isGlassEffectAPIAvailable } from "expo-glass-effect";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { ControlPill, ControlPillMenu } from "../../components/ControlPill";
import { GlassSurface } from "../../components/GlassSurface";
import { useThemeColor } from "../../lib/useThemeColor";
import { NativeHeaderToolbar } from "../../native/StackHeader";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useSelectedThreadWorktree } from "../../state/use-selected-thread-worktree";
import { vcsEnvironment } from "../../state/vcs";
import {
  type NativeReviewDiffViewHandle,
  resolveNativeReviewDiffView,
} from "../diffs/nativeReviewDiffSurface";
import {
  buildNativeReviewDiffData,
  NATIVE_REVIEW_DIFF_CONTENT_WIDTH,
} from "../review/nativeReviewDiffAdapter";
import {
  buildReviewCommentTarget,
  formatReviewSelectedRangeLabel,
  getSelectedReviewCommentLines,
  type ReviewCommentTarget,
} from "../review/reviewCommentSelection";
import { buildReviewParsedDiff, type ReviewRenderableLineRow } from "../review/reviewModel";
import { ReviewSelectionActionBar } from "../review/ReviewSelectionActionBar";
import { useNativeReviewDiffBridge } from "../review/useNativeReviewDiffBridge";
import { useAppearanceCodeSurface } from "../settings/appearance/useAppearanceCodeSurface";
import {
  changesCommentRebindTargets,
  changesDraftKey,
  rebindChangesComments,
  useChangesDraft,
} from "./changesDrafts";
import {
  buildChangesOverviewMarkers,
  buildCompleteUnifiedDiff,
  firstChangedRowIndex,
  nextChangeAfterMutation,
} from "./changesModel";

type ChangesFileScreenProps = StaticScreenProps<{
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly layer: VcsChangeLayer;
  readonly path: string;
  readonly oldPath: string | null;
  readonly identity: string;
  readonly orderedPaths: ReadonlyArray<string>;
  readonly visitId: string;
}>;

const EMPTY_CHANGES: ReadonlyArray<VcsChange> = [];

function formatFailure(cause: Cause.Cause<unknown>) {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : "The file diff could not be loaded.";
}

function lineSide(line: ReviewRenderableLineRow): "old" | "new" {
  return line.change === "delete" ? "old" : "new";
}

function lineNumber(line: ReviewRenderableLineRow): number {
  return (lineSide(line) === "old" ? line.oldLineNumber : line.newLineNumber) ?? 0;
}

function FileNavigationButton(props: {
  readonly accessibilityLabel: string;
  readonly disabled: boolean;
  readonly icon: "chevron.left" | "chevron.right";
  readonly onPress: () => void;
}) {
  const iconColor = useThemeColor("--color-icon");
  if (Platform.OS !== "ios") return <ControlPill {...props} />;

  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => ({ opacity: props.disabled ? 0.35 : pressed ? 0.7 : 1 })}
    >
      <GlassSurface
        pointerEvents="none"
        chrome={isGlassEffectAPIAvailable() ? "none" : "default"}
        tintColor="transparent"
        style={{
          height: 44,
          width: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolView name={props.icon} size={16} tintColor={iconColor} type="monochrome" />
      </GlassSurface>
    </Pressable>
  );
}

export function ChangesFileScreen(props: ChangesFileScreenProps) {
  const { environmentId, threadId, layer, path, oldPath, identity, orderedPaths, visitId } =
    props.route.params;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const iconColor = useThemeColor("--color-icon");
  const { nativeReviewDiffStyle } = useAppearanceCodeSurface();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  const cwd = selectedThreadCwd;
  const changesQuery = useEnvironmentQuery(
    cwd ? vcsEnvironment.changes({ environmentId, input: { cwd } }) : null,
  );
  const loadFile = useAtomCommand(vcsEnvironment.changeFile, { reportFailure: false });
  const stageChange = useAtomCommand(vcsEnvironment.stageChange, { reportFailure: false });
  const unstageChange = useAtomCommand(vcsEnvironment.unstageChange, { reportFailure: false });
  const [fileResult, setFileResult] = useState<VcsChangeFileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const [railHeight, setRailHeight] = useState(0);
  const [rangeAnchor, setRangeAnchor] = useState<{
    readonly rowId: string;
    readonly lineIndex: number;
    readonly lines: ReadonlyArray<ReviewRenderableLineRow>;
  } | null>(null);
  const [selectedCommentTarget, setSelectedCommentTarget] = useState<ReviewCommentTarget | null>(
    null,
  );
  const nativeRef = useRef<NativeReviewDiffViewHandle>(null);
  const fileRequestId = useRef(0);
  const savedRowByFile = useRef(new Map<string, number>());
  const visitKey = `${visitId}:${layer}:${path}`;
  const contentKey = `${visitKey}:${identity}`;
  const draftKey = changesDraftKey({ environmentId, cwd: cwd ?? "", threadId });
  const draft = useChangesDraft(draftKey);
  const changesInLayer = changesQuery.data?.[layer] ?? EMPTY_CHANGES;
  const changesByPath = useMemo(
    () => new Map(changesInLayer.map((change) => [change.path, change])),
    [changesInLayer],
  );

  const expectedChange = useMemo(
    () => (changesByPath.get(path)?.oldPath === oldPath ? (changesByPath.get(path) ?? null) : null),
    [changesByPath, oldPath, path],
  );

  const fetchFile = useCallback(async () => {
    if (!cwd) return;
    const requestId = ++fileRequestId.current;
    setLoading(true);
    setError(null);
    const result = await loadFile({
      environmentId,
      input: { cwd, layer, path, oldPath, expectedIdentity: identity },
    });
    if (requestId !== fileRequestId.current) return;
    setLoading(false);
    if (AsyncResult.isFailure(result)) {
      setError(formatFailure(result.cause));
      return;
    }
    if (result.value._tag === "stale") {
      setStale(true);
      changesQuery.refresh();
      return;
    }
    setFileResult(result.value);
    setStale(false);
  }, [changesQuery.refresh, cwd, environmentId, identity, layer, loadFile, oldPath, path]);

  useEffect(() => {
    setFileResult(null);
    setRangeAnchor(null);
    setSelectedCommentTarget(null);
    void fetchFile();
    return () => {
      fileRequestId.current += 1;
    };
  }, [fetchFile]);

  useEffect(() => {
    if (expectedChange && expectedChange.identity !== identity) setStale(true);
    if (changesQuery.data && !expectedChange) setStale(true);
  }, [changesQuery.data, expectedChange, identity]);

  const openNotes = useCallback(() => {
    navigation.navigate("ThreadChangesNotes", { environmentId, threadId });
  }, [environmentId, navigation, threadId]);
  const notesLabel = `Notes${draft.comments.length > 0 ? ` ${draft.comments.length}` : ""}`;

  useEffect(() => {
    navigation.setOptions({ title: path.slice(path.lastIndexOf("/") + 1) });
  }, [navigation, path]);

  const refreshFile = useCallback(async () => {
    setRefreshing(true);
    changesQuery.refresh();
    try {
      await fetchFile();
    } finally {
      setRefreshing(false);
    }
  }, [changesQuery.refresh, fetchFile]);

  const patch = useMemo(() => {
    if (fileResult?._tag !== "ready") return null;
    return buildCompleteUnifiedDiff({
      oldPath: fileResult.change.oldPath ?? fileResult.change.path,
      newPath: fileResult.change.path,
      oldContents: fileResult.oldContents,
      newContents: fileResult.newContents,
    });
  }, [fileResult]);
  const parsedDiff = useMemo(() => buildReviewParsedDiff(patch, contentKey), [contentKey, patch]);
  const baseNativeData = useMemo(() => buildNativeReviewDiffData(parsedDiff), [parsedDiff]);
  const currentComments = useMemo(
    () =>
      draft.comments.filter(
        (comment) => comment.path === path && comment.sourceIdentity === identity,
      ),
    [draft.comments, identity, path],
  );
  const commentNumbersByLine = useMemo(
    () =>
      new Map(
        draft.comments.flatMap((comment, index) =>
          comment.path === path && comment.sourceIdentity === identity
            ? [[`${comment.side}:${comment.startLine}`, index + 1] as const]
            : [],
        ),
      ),
    [draft.comments, identity, path],
  );
  const nativeData = useMemo(
    () => ({
      ...baseNativeData,
      rows: baseNativeData.rows
        .filter((row) => row.kind !== "file")
        .map((row) => {
          if (row.kind !== "line") return row;
          const commentNumber =
            (row.oldLineNumber == null
              ? undefined
              : commentNumbersByLine.get(`old:${row.oldLineNumber}`)) ??
            (row.newLineNumber == null
              ? undefined
              : commentNumbersByLine.get(`new:${row.newLineNumber}`));
          return commentNumber === undefined ? row : { ...row, commentNumber };
        }),
    }),
    [baseNativeData, commentNumbersByLine],
  );
  const selectedRowIds = useMemo(() => {
    if (selectedCommentTarget) {
      return getSelectedReviewCommentLines(selectedCommentTarget).flatMap((line) => {
        const rowId = nativeData.rowIdByCommentLineId.get(line.id);
        return rowId ? [rowId] : [];
      });
    }
    return rangeAnchor ? [rangeAnchor.rowId] : [];
  }, [nativeData.rowIdByCommentLineId, rangeAnchor, selectedCommentTarget]);
  const nativeBridge = useNativeReviewDiffBridge({
    threadKey: `${environmentId}:${threadId}`,
    sectionId: contentKey,
    diff: patch,
    data: nativeData,
    scheme: colorScheme === "dark" ? "dark" : "light",
    collapsedFileIds: [],
    viewedFileIds: [],
    selectedRowIds,
    canHighlight: parsedDiff.kind === "files",
  });
  const NativeDiffView = resolveNativeReviewDiffView();
  const initialRowIndex = useMemo(
    () => savedRowByFile.current.get(visitKey) ?? firstChangedRowIndex(nativeData.rows),
    [nativeData.rows, visitKey],
  );
  const rowIndexesByLine = useMemo(
    () =>
      new Map(
        nativeData.rows.flatMap((row, rowIndex) =>
          row.kind !== "line"
            ? []
            : [
                ...(row.oldLineNumber == null
                  ? []
                  : ([[`old:${row.oldLineNumber}`, rowIndex]] as const)),
                ...(row.newLineNumber == null
                  ? []
                  : ([[`new:${row.newLineNumber}`, rowIndex]] as const)),
              ],
        ),
      ),
    [nativeData.rows],
  );
  const commentRowIndexes = useMemo(
    () =>
      currentComments.flatMap((comment) => {
        const rowIndex = rowIndexesByLine.get(`${comment.side}:${comment.startLine}`);
        return rowIndex === undefined ? [] : [rowIndex];
      }),
    [currentComments, rowIndexesByLine],
  );
  const markers = useMemo(
    () => buildChangesOverviewMarkers(nativeData.rows, commentRowIndexes),
    [commentRowIndexes, nativeData.rows],
  );

  const handleDebug = useCallback(
    (event: NativeSyntheticEvent<Record<string, unknown>>) => {
      nativeBridge.onDebug(event);
      const payload = event.nativeEvent;
      if (
        payload.message === "visible-range" &&
        typeof payload.firstRowIndex === "number" &&
        typeof payload.lastRowIndex === "number"
      ) {
        const first = Math.floor(payload.firstRowIndex);
        savedRowByFile.current.set(visitKey, first);
      }
    },
    [nativeBridge, visitKey],
  );

  const openComment = useCallback(
    (target: ReviewCommentTarget) => {
      const selected = getSelectedReviewCommentLines(target);
      const first = selected[0];
      const last = selected.at(-1);
      if (!first || !last) return;
      const side = selected.every((line) => line.change === "delete") ? "old" : "new";
      const selectedLineNumbers = selected.flatMap((line) => {
        const value = side === "old" ? line.oldLineNumber : line.newLineNumber;
        return value === null ? [] : [value];
      });
      const startLine = selectedLineNumbers[0] ?? lineNumber(first);
      const endLine = selectedLineNumbers.at(-1) ?? lineNumber(last);
      const marker = side === "old" ? "-" : "+";
      navigation.navigate("ThreadChangesComment", {
        environmentId,
        threadId,
        path,
        oldPath,
        layer,
        sourceIdentity: identity,
        side,
        startLine,
        endLine,
        rangeLabel:
          startLine === endLine
            ? `${marker}${startLine}`
            : `${marker}${startLine} to ${marker}${endLine}`,
        excerpt: selected
          .map(
            (line) =>
              `${line.change === "add" ? "+" : line.change === "delete" ? "-" : " "}${line.content}`,
          )
          .join("\n"),
      });
      setRangeAnchor(null);
      setSelectedCommentTarget(null);
    },
    [environmentId, identity, layer, navigation, oldPath, path, threadId],
  );

  const onPressLine = useCallback(
    (
      event: NativeSyntheticEvent<{
        readonly rowId?: string;
        readonly gesture?: "tap" | "longPress";
      }>,
    ) => {
      const rowId = event.nativeEvent.rowId;
      if (!rowId) return;
      const target = nativeData.commentTargetsByRowId.get(rowId);
      if (!target) return;
      if (event.nativeEvent.gesture === "longPress") {
        setSelectedCommentTarget(null);
        setRangeAnchor({ rowId, lineIndex: target.lineIndex, lines: target.lines });
        return;
      }
      if (rangeAnchor && rangeAnchor.lines === target.lines) {
        const selectedTarget = buildReviewCommentTarget(
          {
            sectionId: contentKey,
            sectionTitle: path,
            filePath: path,
            lines: target.lines,
          },
          rangeAnchor.lineIndex,
          target.lineIndex,
        );
        setRangeAnchor(null);
        if (selectedTarget.startIndex === selectedTarget.endIndex) {
          openComment(selectedTarget);
        } else {
          setSelectedCommentTarget(selectedTarget);
        }
      } else {
        openComment(
          buildReviewCommentTarget(
            {
              sectionId: contentKey,
              sectionTitle: path,
              filePath: path,
              lines: target.lines,
            },
            target.lineIndex,
            target.lineIndex,
          ),
        );
      }
    },
    [contentKey, nativeData.commentTargetsByRowId, openComment, path, rangeAnchor],
  );

  const clearLineSelection = useCallback(() => {
    setRangeAnchor(null);
    setSelectedCommentTarget(null);
  }, []);

  const navigateTo = useCallback(
    (change: VcsChange) => {
      navigation.setParams({
        layer: change.layer,
        path: change.path,
        oldPath: change.oldPath,
        identity: change.identity,
      });
    },
    [navigation],
  );
  const layerChanges = useMemo(
    () =>
      orderedPaths.flatMap((orderedPath) => {
        const change = changesByPath.get(orderedPath);
        return change ? [change] : [];
      }),
    [changesByPath, orderedPaths],
  );
  const currentIndex = useMemo(
    () => layerChanges.findIndex((change) => change.path === path),
    [layerChanges, path],
  );
  const previous = currentIndex > 0 ? layerChanges[currentIndex - 1] : null;
  const next = currentIndex >= 0 ? (layerChanges[currentIndex + 1] ?? null) : null;

  const mutate = useCallback(async () => {
    if (!cwd || stale || mutating) return;
    setMutating(true);
    const command = layer === "unstaged" ? stageChange : unstageChange;
    try {
      const result = await command({
        environmentId,
        input: { cwd, layer, path, oldPath, expectedIdentity: identity },
      });
      if (AsyncResult.isFailure(result)) {
        setError(formatFailure(result.cause));
        return;
      }
      if (result.value._tag === "stale") {
        setStale(true);
        changesQuery.refresh();
        return;
      }
      changesQuery.refresh();
      const before = changesQuery.data;
      if (before && expectedChange) {
        rebindChangesComments(draftKey, [
          {
            from: { path, identity },
            targets: changesCommentRebindTargets(expectedChange, before, result.value.changes),
          },
        ]);
      }
      const remainingByPath = new Map(
        result.value.changes[layer].map((change) => [change.path, change]),
      );
      const remaining = orderedPaths.flatMap((orderedPath) => {
        const change = remainingByPath.get(orderedPath);
        return change ? [change] : [];
      });
      const nextChange = nextChangeAfterMutation(remaining, path, orderedPaths);
      if (nextChange) navigateTo(nextChange);
      else navigation.goBack();
    } finally {
      setMutating(false);
    }
  }, [
    cwd,
    changesQuery.data,
    changesQuery.refresh,
    draftKey,
    environmentId,
    expectedChange,
    identity,
    layer,
    mutating,
    navigateTo,
    navigation,
    oldPath,
    orderedPaths,
    path,
    stageChange,
    stale,
    unstageChange,
  ]);

  const rowCount = Math.max(nativeData.rows.length, 1);
  return (
    <View className="flex-1 bg-sheet">
      {Platform.OS === "ios" ? (
        <NativeHeaderToolbar placement="right">
          <NativeHeaderToolbar.Button
            accessibilityLabel={notesLabel}
            label={notesLabel}
            onPress={openNotes}
            separateBackground
          />
        </NativeHeaderToolbar>
      ) : null}
      {Platform.OS === "android" ? (
        <AndroidScreenHeader
          title={path.slice(path.lastIndexOf("/") + 1)}
          onBack={() => navigation.goBack()}
          trailing={<ControlPill label={notesLabel} onPress={openNotes} variant="pill" />}
        />
      ) : null}
      {stale ? (
        <View className="flex-row items-center justify-between border-b border-amber-300 bg-amber-100 px-4 py-3 dark:border-amber-800 dark:bg-amber-950">
          <Text className="text-sm font-t3-bold text-amber-900 dark:text-amber-100">
            File changed
          </Text>
          <Pressable
            onPress={() => {
              if (expectedChange) navigateTo(expectedChange);
              else navigation.goBack();
            }}
          >
            <Text className="text-xs font-t3-bold text-amber-900 dark:text-amber-100">Reload</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <View className="border-b border-danger-border bg-danger px-4 py-3">
          <Text className="text-sm text-danger-foreground">{error}</Text>
          <Pressable onPress={() => void fetchFile()} className="mt-2 self-start">
            <Text className="text-xs font-t3-bold text-danger-foreground">Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {fileResult && fileResult._tag !== "stale" ? (
        <View className="border-b border-border bg-card">
          <ScrollView
            horizontal
            bounces={false}
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="px-4 pb-1 pt-2"
          >
            <Text className="text-xs font-t3-bold text-foreground">{path}</Text>
          </ScrollView>
          <View className="flex-row items-center gap-3 px-4 pb-2">
            <Text numberOfLines={1} className="min-w-0 flex-1 text-2xs text-foreground-muted">
              {fileResult.change.kind}
              {fileResult.change.oldPath ? ` · from ${fileResult.change.oldPath}` : ""}
            </Text>
            <Text className="text-xs font-t3-bold text-emerald-500">
              +{fileResult.change.insertions}
            </Text>
            <Text className="text-xs font-t3-bold text-rose-500">
              -{fileResult.change.deletions}
            </Text>
            <Text className="text-2xs font-t3-bold uppercase text-foreground-muted">
              {layer} {changesInLayer.length}
            </Text>
            <ControlPillMenu
              actions={[
                {
                  id: "wrap",
                  title: "Wrap lines",
                  state: wrap ? "on" : "off",
                },
                ...(Platform.OS === "android"
                  ? [{ id: "refresh", title: "Refresh" } as const]
                  : []),
              ]}
              onPressAction={({ nativeEvent }) => {
                if (nativeEvent.event === "wrap") setWrap((current) => !current);
                if (nativeEvent.event === "refresh") void refreshFile();
              }}
            >
              <Pressable accessibilityLabel="Diff options" hitSlop={8}>
                <SymbolView name="ellipsis" size={18} tintColor={iconColor} />
              </Pressable>
            </ControlPillMenu>
          </View>
        </View>
      ) : null}
      {loading && fileResult === null ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator />
          <Text className="text-sm text-foreground-muted">Loading complete diff…</Text>
        </View>
      ) : fileResult?._tag === "unrenderable" ? (
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <Text className="text-base font-t3-bold text-foreground">
            {fileResult.reason === "binary" ? "Binary file" : "File is too large"}
          </Text>
          <Text className="text-center text-sm text-foreground-muted">
            Diff contents are not available, but this file can still be{" "}
            {layer === "unstaged" ? "staged" : "unstaged"}.
          </Text>
        </View>
      ) : fileResult?._tag === "ready" && NativeDiffView && parsedDiff.kind === "files" ? (
        <View
          collapsable={false}
          className="flex-1"
          onLayout={(event) => setSurfaceWidth(event.nativeEvent.layout.width)}
          style={{ backgroundColor: nativeBridge.theme.background }}
        >
          <NativeDiffView
            collapsable={false}
            testID="changes-native-diff-view"
            refreshing={refreshing}
            onPullToRefresh={() => void refreshFile()}
            style={StyleSheet.absoluteFill}
            appearanceScheme={colorScheme === "dark" ? "dark" : "light"}
            collapsedFileIdsJson={nativeBridge.collapsedFileIdsJson}
            collapsedCommentIdsJson={nativeBridge.collapsedCommentIdsJson}
            contentResetKey={contentKey}
            contentWidth={wrap ? Math.max(surfaceWidth, 320) : NATIVE_REVIEW_DIFF_CONTENT_WIDTH}
            wrapLines={wrap}
            initialRowIndex={initialRowIndex}
            nativeViewRef={nativeRef}
            rowHeight={nativeReviewDiffStyle.rowHeight}
            rowsJson={nativeBridge.rowsJson}
            selectedRowIdsJson={nativeBridge.selectedRowIdsJson}
            styleJson={nativeBridge.styleJson}
            themeJson={nativeBridge.themeJson}
            tokensPatchJson={nativeBridge.tokensPatchJson}
            tokensResetKey={nativeBridge.tokensResetKey}
            viewedFileIdsJson={nativeBridge.viewedFileIdsJson}
            onDebug={handleDebug}
            onPressLine={onPressLine}
            onToggleComment={nativeBridge.onToggleComment}
          />
          <Pressable
            accessibilityHint="Jumps to the nearest changed region"
            accessibilityLabel="Change overview"
            className="absolute bottom-2 right-0 top-2 w-8 items-end pr-1"
            onLayout={(event) => setRailHeight(event.nativeEvent.layout.height)}
            onPress={(event) => {
              if (railHeight <= 0 || markers.length === 0) return;
              const intendedRow =
                (event.nativeEvent.locationY / railHeight) * Math.max(rowCount - 1, 0);
              const marker = markers.reduce((nearest, candidate) =>
                Math.abs(candidate.rowIndex - intendedRow) <
                Math.abs(nearest.rowIndex - intendedRow)
                  ? candidate
                  : nearest,
              );
              void nativeRef.current?.scrollToRow(marker.rowIndex, false);
            }}
          >
            <View
              pointerEvents="none"
              className="relative h-full w-3 rounded-full bg-black/10 dark:bg-white/10"
            >
              {markers.map((marker) => (
                <View
                  key={`${marker.kind}:${marker.rowIndex}`}
                  className={`absolute right-0 ${marker.kind === "comment" ? "h-1 w-3 bg-blue-500" : marker.kind === "addition" ? "h-0.5 w-2 bg-emerald-500" : "h-1 w-1 rounded-full bg-rose-500"}`}
                  style={{ top: (marker.rowIndex / rowCount) * railHeight }}
                />
              ))}
            </View>
          </Pressable>
        </View>
      ) : patch ? (
        <ScrollView horizontal className="flex-1 p-4">
          <Text selectable className="font-mono text-xs text-foreground">
            {patch}
          </Text>
        </ScrollView>
      ) : null}
      <View
        className="flex-row items-center justify-between gap-2 border-t border-border bg-card px-3 pt-2"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        <FileNavigationButton
          icon="chevron.left"
          accessibilityLabel="Previous file"
          disabled={loading || !previous}
          onPress={() => {
            if (previous) navigateTo(previous);
          }}
        />
        <ControlPill
          icon={layer === "unstaged" ? "plus.circle" : "minus.circle"}
          label={layer === "unstaged" ? "Stage" : "Unstage"}
          variant="primary"
          disabled={stale || loading || mutating}
          onPress={() => void mutate()}
        />
        <FileNavigationButton
          icon="chevron.right"
          accessibilityLabel="Next file"
          disabled={loading || !next}
          onPress={() => {
            if (next) navigateTo(next);
          }}
        />
      </View>
      <ReviewSelectionActionBar
        bottomInset={insets.bottom + 50}
        title={
          selectedCommentTarget
            ? `Comment on ${formatReviewSelectedRangeLabel(selectedCommentTarget)}`
            : rangeAnchor
              ? "Select range end"
              : null
        }
        onOpenComment={selectedCommentTarget ? () => openComment(selectedCommentTarget) : null}
        onClear={clearLineSelection}
      />
    </View>
  );
}
