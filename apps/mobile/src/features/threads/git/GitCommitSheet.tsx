import { useFocusEffect, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidSheetHeader } from "../../../components/AndroidScreenHeader";
import { AppText as Text, AppTextInput as TextInput } from "../../../components/AppText";
import { useEnvironmentServerConfig } from "../../../state/entities";
import { useEnvironmentQuery } from "../../../state/query";
import { useThreadSelection } from "../../../state/use-thread-selection";
import { useSelectedThreadGitActions } from "../../../state/use-selected-thread-git-actions";
import { useSelectedThreadGitState } from "../../../state/use-selected-thread-git-state";
import { useSelectedThreadWorktree } from "../../../state/use-selected-thread-worktree";
import { vcsEnvironment } from "../../../state/vcs";
import { SheetActionButton } from "./gitSheetComponents";

type GitCommitSheetProps = StaticScreenProps<{
  readonly environmentId: string;
  readonly threadId: string;
}>;

export function GitCommitSheet(_props: GitCommitSheetProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { selectedThread } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  const gitState = useSelectedThreadGitState();
  const gitActions = useSelectedThreadGitActions();
  const serverConfig = useEnvironmentServerConfig(selectedThread?.environmentId ?? null);
  const supportsChanges = serverConfig?.environment.capabilities.vcsChanges === true;

  const gitStatus = useEnvironmentQuery(
    selectedThread !== null && selectedThreadCwd !== null && supportsChanges
      ? vcsEnvironment.status({
          environmentId: selectedThread.environmentId,
          input: { cwd: selectedThreadCwd },
        })
      : null,
  );
  const changes = useEnvironmentQuery(
    selectedThread !== null && selectedThreadCwd !== null
      ? vcsEnvironment.changes({
          environmentId: selectedThread.environmentId,
          input: { cwd: selectedThreadCwd },
        })
      : null,
  );

  const busy = gitState.gitOperationLabel !== null;
  const isDefaultRef = gitStatus.data?.isDefaultRef ?? false;
  const stagedFiles = supportsChanges
    ? (changes.data?.staged ?? [])
    : (gitStatus.data?.workingTree.files ?? []);

  useFocusEffect(
    useCallback(() => {
      changes.refresh();
    }, [changes.refresh]),
  );

  const [dialogCommitMessage, setDialogCommitMessage] = useState("");
  const selectedInsertions = stagedFiles.reduce((sum, file) => sum + file.insertions, 0);
  const selectedDeletions = stagedFiles.reduce((sum, file) => sum + file.deletions, 0);
  const selectedFilePreview = stagedFiles.slice(0, 3);

  const runCommitAction = useCallback(
    async (featureBranch: boolean) => {
      const commitMessage = dialogCommitMessage.trim();
      navigation.goBack();
      await gitActions.onRunSelectedThreadGitAction({
        action: "commit",
        featureBranch,
        ...(supportsChanges
          ? { preserveIndex: true }
          : { filePaths: stagedFiles.map((file) => file.path) }),
        ...(commitMessage ? { commitMessage } : {}),
      });
    },
    [dialogCommitMessage, gitActions, navigation, stagedFiles, supportsChanges],
  );

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <AndroidSheetHeader title="Commit changes" onBack={() => navigation.goBack()} />
      ) : null}
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentInset={{ bottom: Math.max(insets.bottom, 18) + 18 }}
        contentContainerClassName="gap-4 px-5 pt-2"
      >
        <View className="gap-3 rounded-[22px] border border-border bg-card px-4 py-4">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-foreground-muted text-sm font-medium">Branch</Text>
            <Text className="text-foreground text-base font-t3-bold">
              {gitStatus.data?.refName ?? "(detached HEAD)"}
            </Text>
          </View>
          {isDefaultRef ? (
            <Text className="text-xs leading-normal text-amber-700 dark:text-amber-400">
              Warning: this is the default branch.
            </Text>
          ) : null}
        </View>

        <View className="gap-3 rounded-[22px] border border-border bg-card px-4 py-4">
          <View className="gap-1">
            <Text className="text-foreground text-base font-t3-bold">
              {supportsChanges ? "Staged files" : "Files"}
            </Text>
            <Text className="text-foreground-muted text-xs leading-normal">
              {stagedFiles.length} {supportsChanges ? "staged" : "selected"} · +{selectedInsertions}{" "}
              / -{selectedDeletions}
            </Text>
          </View>

          {stagedFiles.length === 0 ? (
            <Text className="text-foreground-secondary text-sm leading-normal">
              {supportsChanges
                ? "Stage files from Changes before committing."
                : "No changed files are available to commit."}
            </Text>
          ) : (
            <View className="gap-2">
              {selectedFilePreview.map((file) => (
                <View key={file.path} className="flex-row items-center justify-between gap-3">
                  <Text className="text-foreground flex-1 text-sm font-medium" numberOfLines={1}>
                    {file.path}
                  </Text>
                  <Text className="text-xs font-t3-bold text-emerald-500">+{file.insertions}</Text>
                  <Text className="text-xs font-t3-bold text-rose-500">-{file.deletions}</Text>
                </View>
              ))}
              {stagedFiles.length > selectedFilePreview.length ? (
                <Text className="text-foreground-muted text-xs leading-snug">
                  +{stagedFiles.length - selectedFilePreview.length} more files
                </Text>
              ) : null}
            </View>
          )}
        </View>

        <View className="gap-2">
          <Text className="text-foreground text-sm font-t3-bold">Commit message</Text>
          <TextInput
            multiline
            value={dialogCommitMessage}
            onChangeText={setDialogCommitMessage}
            placeholder="Leave empty to auto-generate"
            textAlignVertical="top"
            className="min-h-[128px] rounded-[20px] px-4 py-3.5"
          />
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <SheetActionButton
              icon="arrow.branch"
              label="Commit on new branch"
              disabled={stagedFiles.length === 0 || busy}
              onPress={() => void runCommitAction(true)}
            />
          </View>
          <View className="flex-1">
            <SheetActionButton
              icon="checkmark.circle"
              label="Commit"
              tone="primary"
              disabled={stagedFiles.length === 0 || busy}
              onPress={() => void runCommitAction(false)}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
