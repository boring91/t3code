import type {
  EnvironmentId,
  ThreadId,
  VcsChange,
  VcsChangeLayer,
  VcsChangesResult,
} from "@t3tools/contracts";
import {
  useFocusEffect,
  useNavigation,
  usePreventRemove,
  type ParamListBase,
  type StaticScreenProps,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MenuAction } from "@react-native-menu/menu";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTransitionProgress } from "react-native-screens";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text } from "../../components/AppText";
import { PierreEntryIcon } from "../../components/PierreEntryIcon";
import { SymbolView } from "../../components/AppSymbol";
import { ControlPill, ControlPillMenu } from "../../components/ControlPill";
import { uuidv4 } from "../../lib/uuid";
import { NativeHeaderToolbar } from "../../native/StackHeader";
import { useEnvironmentServerConfig } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useThreadSelection } from "../../state/use-thread-selection";
import { useSelectedThreadWorktree } from "../../state/use-selected-thread-worktree";
import { vcsEnvironment } from "../../state/vcs";
import {
  changesCommentRebindTargets,
  changesDraftKey,
  clearChangesDraft,
  isChangesDraftEmpty,
  rebindChangesComments,
  useChangesDraft,
} from "./changesDrafts";
import { buildChangesTreeRows, changesInDirectory, getInitialChangesLayer } from "./changesModel";

type ChangesScreenProps = StaticScreenProps<{
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}>;

function changeAction(change: VcsChange): MenuAction {
  return {
    id: change.layer === "unstaged" ? "stage" : "unstage",
    title: change.layer === "unstaged" ? "Stage" : "Unstage",
    image: change.layer === "unstaged" ? "plus.circle" : "minus.circle",
  };
}

function changeMutationTarget(change: VcsChange) {
  return {
    layer: change.layer,
    path: change.path,
    oldPath: change.oldPath,
    expectedIdentity: change.identity,
  };
}

function changeLookupKey(change: Pick<VcsChange, "layer" | "oldPath" | "path">) {
  return `${change.layer}\0${change.path}\0${change.oldPath ?? ""}`;
}

function errorMessage(cause: unknown, fallback: string) {
  const error = Cause.squash(cause as Cause.Cause<unknown>);
  return error instanceof Error ? error.message : fallback;
}

function SelectedRowHighlight() {
  const { goingForward, progress } = useTransitionProgress();
  const opacity = useMemo(
    () =>
      Animated.add(goingForward, Animated.subtract(1, progress)).interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolate: "clamp",
      }),
    [goingForward, progress],
  );

  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-0 bg-subtle-strong"
      style={{ opacity }}
    />
  );
}

export function ChangesScreen(props: ChangesScreenProps) {
  const { environmentId, threadId } = props.route.params;
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const insets = useSafeAreaInsets();
  const { selectedThread } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  const serverConfig = useEnvironmentServerConfig(environmentId);
  const supportsChanges = serverConfig?.environment.capabilities.vcsChanges === true;
  const supportsBatchMutations = serverConfig?.environment.capabilities.vcsBatchMutations === true;
  const supportsChangesNotifications =
    serverConfig?.environment.capabilities.vcsChangesNotifications === true;
  const cwd = selectedThreadCwd;
  const query = useEnvironmentQuery(
    cwd && supportsChanges ? vcsEnvironment.changes({ environmentId, input: { cwd } }) : null,
  );
  const status = useEnvironmentQuery(
    cwd ? vcsEnvironment.status({ environmentId, input: { cwd } }) : null,
  );
  const stageChange = useAtomCommand(vcsEnvironment.stageChange, { reportFailure: false });
  const unstageChange = useAtomCommand(vcsEnvironment.unstageChange, { reportFailure: false });
  const stageChanges = useAtomCommand(vcsEnvironment.stageChanges, { reportFailure: false });
  const unstageChanges = useAtomCommand(vcsEnvironment.unstageChanges, { reportFailure: false });
  const [layer, setLayer] = useState<VcsChangeLayer>("unstaged");
  const [expandedDirectories, setExpandedDirectories] = useState<ReadonlySet<string>>(new Set());
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const didPullRefreshStart = useRef(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationChanges, setMutationChanges] = useState<VcsChangesResult | null>(null);
  const draftKey = changesDraftKey({ environmentId, cwd: cwd ?? "", threadId });
  const draft = useChangesDraft(draftKey);
  const [allowRemoval, setAllowRemoval] = useState(false);
  const pendingRemovalRef = useRef<(() => void) | null>(null);
  const didSelectInitialLayer = useRef(false);
  const previousStatusSignature = useRef<string | null>(null);
  const previousProviderStatus = useRef(selectedThread?.session?.status ?? null);
  const knownDirectories = useRef(new Set<string>());
  const visitId = useRef(uuidv4()).current;

  const changes = mutationChanges ?? query.data;
  const staged = changes?.staged ?? [];
  const unstaged = changes?.unstaged ?? [];
  const visibleChanges = layer === "unstaged" ? unstaged : staged;
  const rows = useMemo(
    () => buildChangesTreeRows(visibleChanges, expandedDirectories),
    [expandedDirectories, visibleChanges],
  );

  useEffect(() => {
    if (!changes || didSelectInitialLayer.current) return;
    didSelectInitialLayer.current = true;
    setLayer(getInitialChangesLayer(changes));
  }, [changes]);

  useEffect(() => {
    const data = changes;
    if (!data) return;
    setExpandedDirectories((current) => {
      const next = new Set(current);
      for (const change of [...data.unstaged, ...data.staged]) {
        const parts = change.path.split("/").slice(0, -1);
        parts.forEach((_, index) => {
          const directory = parts.slice(0, index + 1).join("/");
          if (!knownDirectories.current.has(directory)) next.add(directory);
          knownDirectories.current.add(directory);
        });
      }
      return next.size === current.size ? current : next;
    });
  }, [changes]);

  useEffect(() => setMutationChanges(null), [query.data]);

  useFocusEffect(
    useCallback(() => {
      query.refresh();
    }, [query.refresh]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") query.refresh();
    });
    return () => subscription.remove();
  }, [query.refresh]);

  const statusSignature = JSON.stringify({
    workingTree: status.data?.workingTree ?? null,
    changesRevision: status.data?.changesRevision ?? null,
  });
  useEffect(() => {
    if (previousStatusSignature.current === null) {
      previousStatusSignature.current = statusSignature;
      return;
    }
    if (previousStatusSignature.current !== statusSignature) {
      previousStatusSignature.current = statusSignature;
      query.refresh();
    }
  }, [query.refresh, statusSignature]);

  const providerStatus = selectedThread?.session?.status ?? null;
  useEffect(() => {
    const previous = previousProviderStatus.current;
    previousProviderStatus.current = providerStatus;
    if (
      (previous === "running" || previous === "starting") &&
      providerStatus !== "running" &&
      providerStatus !== "starting"
    ) {
      query.refresh();
    }
  }, [providerStatus, query.refresh]);

  usePreventRemove(!allowRemoval && !isChangesDraftEmpty(draft), ({ data }) => {
    const remove = () => {
      pendingRemovalRef.current = () => navigation.dispatch(data.action);
      setAllowRemoval(true);
    };
    Alert.alert("Keep review notes?", "Your notes are saved on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          clearChangesDraft(draftKey);
          remove();
        },
      },
      { text: "Keep draft", onPress: remove },
    ]);
  });

  useEffect(() => {
    if (!allowRemoval) return;
    const frame = requestAnimationFrame(() => {
      pendingRemovalRef.current?.();
      pendingRemovalRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [allowRemoval]);

  const openNotes = useCallback(() => {
    navigation.navigate("ThreadChangesNotes", { environmentId, threadId });
  }, [environmentId, navigation, threadId]);
  const notesLabel = `Notes${draft.comments.length > 0 ? ` ${draft.comments.length}` : ""}`;

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    navigation.setOptions({ title: "Changes" });
  }, [navigation]);

  useEffect(
    () =>
      navigation.addListener("transitionEnd", (event) => {
        if (!event.data.closing) setSelectedChangeId(null);
      }),
    [navigation],
  );

  const handlePullRefresh = useCallback(() => {
    didPullRefreshStart.current = false;
    setIsPullRefreshing(true);
    query.refresh();
  }, [query.refresh]);

  useEffect(() => {
    if (!isPullRefreshing) return;
    if (query.isPending) {
      didPullRefreshStart.current = true;
    } else if (didPullRefreshStart.current) {
      didPullRefreshStart.current = false;
      setIsPullRefreshing(false);
    }
  }, [isPullRefreshing, query.isPending]);

  const mutate = useCallback(
    async (requestedChanges: ReadonlyArray<VcsChange>) => {
      if (!cwd || requestedChanges.length === 0) return;
      setMutationError(null);
      const before = changes;
      let refreshAfterMutation = !supportsChangesNotifications;
      try {
        const currentChanges = before
          ? new Map(
              [...before.staged, ...before.unstaged].map((change) => [
                changeLookupKey(change),
                change,
              ]),
            )
          : null;
        const selected = requestedChanges.map(
          (requestedChange) =>
            currentChanges?.get(changeLookupKey(requestedChange)) ?? requestedChange,
        );
        let updatedChanges: VcsChangesResult | null = null;
        if (supportsBatchMutations) {
          const command = selected[0]?.layer === "unstaged" ? stageChanges : unstageChanges;
          const result = await command({
            environmentId,
            input: {
              cwd,
              changes: selected.map(changeMutationTarget),
            },
          });
          if (AsyncResult.isFailure(result)) {
            refreshAfterMutation = true;
            setMutationError(errorMessage(result.cause, "The selection could not be updated."));
            return;
          }
          if (result.value._tag === "stale") {
            refreshAfterMutation = true;
            setMutationError("Files changed since this list loaded. Refresh and try again.");
            return;
          }
          updatedChanges = result.value.changes;
        } else {
          const command = selected[0]?.layer === "unstaged" ? stageChange : unstageChange;
          for (const change of selected) {
            const result = await command({
              environmentId,
              input: { cwd, ...changeMutationTarget(change) },
            });
            if (AsyncResult.isFailure(result)) {
              refreshAfterMutation = true;
              setMutationError(errorMessage(result.cause, "The selection could not be updated."));
              return;
            }
            if (result.value._tag === "stale") {
              refreshAfterMutation = true;
              setMutationError("Files changed since this list loaded. Refresh and try again.");
              return;
            }
            updatedChanges = result.value.changes;
          }
        }
        if (updatedChanges) {
          setMutationChanges(updatedChanges);
        }
        if (before && updatedChanges) {
          rebindChangesComments(
            draftKey,
            selected.map((change) => ({
              from: { path: change.path, identity: change.identity },
              targets: changesCommentRebindTargets(change, before, updatedChanges),
            })),
          );
        }
      } finally {
        if (refreshAfterMutation) query.refresh();
      }
    },
    [
      changes,
      cwd,
      draftKey,
      environmentId,
      query.refresh,
      stageChange,
      stageChanges,
      supportsBatchMutations,
      supportsChangesNotifications,
      unstageChange,
      unstageChanges,
    ],
  );

  const openFile = useCallback(
    (change: VcsChange) => {
      setSelectedChangeId(`${change.layer}:${change.path}`);
      const orderedPaths = rows.flatMap((row) => (row.kind === "file" ? [row.change.path] : []));
      navigation.navigate("ThreadChangesFile", {
        environmentId,
        threadId,
        layer: change.layer,
        path: change.path,
        oldPath: change.oldPath,
        identity: change.identity,
        orderedPaths,
        visitId,
      });
    },
    [environmentId, navigation, rows, threadId, visitId],
  );

  const isClean = changes !== null && staged.length === 0 && unstaged.length === 0;
  const isUnsupported = serverConfig !== null && !supportsChanges;
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
          title="Changes"
          onBack={() => navigation.goBack()}
          trailing={<ControlPill label={notesLabel} onPress={openNotes} variant="pill" />}
        />
      ) : null}
      {!isUnsupported ? (
        <View className="flex-row gap-2 border-b border-border px-4 py-3">
          {(["unstaged", "staged"] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setLayer(item)}
              className={`flex-1 rounded-full px-4 py-2.5 ${layer === item ? "bg-primary" : "bg-subtle"}`}
            >
              <Text
                className={`text-center text-xs font-t3-bold ${layer === item ? "text-primary-foreground" : "text-foreground"}`}
              >
                {item === "unstaged" ? "Unstaged" : "Staged"}{" "}
                {item === "unstaged" ? unstaged.length : staged.length}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {mutationError || query.error ? (
        <View className="border-b border-danger-border bg-danger px-4 py-3">
          <Text className="text-sm text-danger-foreground">{mutationError ?? query.error}</Text>
          <Pressable onPress={query.refresh} className="mt-2 self-start">
            <Text className="text-xs font-t3-bold text-danger-foreground">Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {isUnsupported ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-base font-t3-bold text-foreground">
            The connected environment does not support Git-backed Changes.
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            className="rounded-full bg-primary px-5 py-3"
          >
            <Text className="text-xs font-t3-bold text-primary-foreground">Back</Text>
          </Pressable>
        </View>
      ) : query.isPending && query.data === null ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator />
          <Text className="text-sm text-foreground-muted">Loading changes…</Text>
        </View>
      ) : isClean ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <SymbolView name="checkmark.circle" size={36} tintColorClassName="accent-icon" />
          <Text className="text-center text-base font-t3-bold text-foreground">
            No uncommitted changes
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            className="rounded-full bg-primary px-5 py-3"
          >
            <Text className="text-xs font-t3-bold text-primary-foreground">Back</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          refreshControl={
            <RefreshControl refreshing={isPullRefreshing} onRefresh={handlePullRefresh} />
          }
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
          renderItem={({ item }) => {
            if (item.kind === "directory") {
              const actionId = layer === "unstaged" ? "stage-folder" : "unstage-folder";
              return (
                <View className="flex-row items-stretch border-b border-border-subtle">
                  <Pressable
                    onPress={() =>
                      setExpandedDirectories((current) => {
                        const next = new Set(current);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                    className="min-w-0 flex-1 flex-row items-center gap-2 py-3 pr-2"
                    style={{ paddingLeft: 16 + item.depth * 18 }}
                  >
                    <SymbolView
                      name={item.expanded ? "chevron.down" : "chevron.right"}
                      size={12}
                      tintColorClassName="accent-icon-subtle"
                    />
                    <SymbolView name="folder" size={16} tintColorClassName="accent-icon" />
                    <Text
                      numberOfLines={1}
                      className="min-w-0 flex-1 text-sm font-t3-bold text-foreground"
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                  <ControlPillMenu
                    actions={[
                      {
                        id: actionId,
                        title: layer === "unstaged" ? "Stage folder" : "Unstage folder",
                        image: layer === "unstaged" ? "plus.circle" : "minus.circle",
                      },
                    ]}
                    onPressAction={({ nativeEvent }) => {
                      if (nativeEvent.event === actionId) {
                        void mutate(changesInDirectory(visibleChanges, item.id));
                      }
                    }}
                  >
                    <Pressable
                      accessibilityLabel={`Folder actions for ${item.id}`}
                      className="min-h-12 w-12 items-center justify-center"
                    >
                      <SymbolView name="ellipsis" size={18} tintColorClassName="accent-icon" />
                    </Pressable>
                  </ControlPillMenu>
                </View>
              );
            }
            const change = item.change;
            const parentPath = change.path.includes("/")
              ? change.path.slice(0, change.path.lastIndexOf("/"))
              : ".";
            const noteCount = draft.comments.filter(
              (comment) => comment.path === change.path,
            ).length;
            const selected = selectedChangeId === item.id;
            return (
              <View className="flex-row items-stretch border-b border-border-subtle">
                {selected ? <SelectedRowHighlight /> : null}
                <Pressable
                  accessibilityState={{ selected }}
                  onPress={() => openFile(change)}
                  className="min-w-0 flex-1 flex-row items-center gap-2 py-3 pr-2"
                  style={{ paddingLeft: 16 + item.depth * 18 }}
                >
                  <View className="w-3" />
                  <PierreEntryIcon path={change.path} kind="file" size={17} />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                      {item.name}
                    </Text>
                    <Text numberOfLines={1} className="text-2xs text-foreground-muted">
                      {change.kind} · {parentPath}
                      {change.oldPath ? ` · from ${change.oldPath}` : ""}
                    </Text>
                  </View>
                  {noteCount > 0 ? (
                    <Text className="rounded-full bg-blue-500 px-2 py-0.5 text-2xs font-t3-bold text-white">
                      {noteCount}
                    </Text>
                  ) : null}
                  <Text className="text-xs font-t3-bold text-emerald-500">
                    +{change.insertions}
                  </Text>
                  <Text className="text-xs font-t3-bold text-rose-500">-{change.deletions}</Text>
                </Pressable>
                <ControlPillMenu
                  actions={[changeAction(change)]}
                  onPressAction={({ nativeEvent }) => {
                    if (nativeEvent.event === "stage" || nativeEvent.event === "unstage") {
                      void mutate([change]);
                    }
                  }}
                >
                  <Pressable
                    accessibilityLabel={`File actions for ${change.path}`}
                    className="min-h-14 w-12 items-center justify-center"
                  >
                    <SymbolView name="ellipsis" size={18} tintColorClassName="accent-icon" />
                  </Pressable>
                </ControlPillMenu>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
