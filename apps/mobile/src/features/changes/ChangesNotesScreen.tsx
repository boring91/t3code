import { CommandId, MessageId, type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { TextInputWrapper } from "expo-paste-input";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ImageViewing from "react-native-image-viewing";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { ComposerAttachmentStrip } from "../../components/ComposerAttachmentStrip";
import { ControlPill, ControlPillMenu } from "../../components/ControlPill";
import { convertPastedImagesToAttachments, pickComposerImages } from "../../lib/composerImages";
import { useThemeColor } from "../../lib/useThemeColor";
import { useNativePaste } from "../../lib/useNativePaste";
import { makeQueuedMessageMetadata } from "../../lib/commandMetadata";
import { useEnvironmentQuery } from "../../state/query";
import { enqueueThreadOutboxMessage } from "../../state/thread-outbox";
import { setPendingConnectionError } from "../../state/use-remote-environment-registry";
import { useThreadSelection } from "../../state/use-thread-selection";
import { useSelectedThreadWorktree } from "../../state/use-selected-thread-worktree";
import { vcsEnvironment } from "../../state/vcs";
import {
  changesDraftAttachments,
  changesDraftKey,
  clearChangesDraft,
  isChangesCommentOutdated,
  isChangesDraftEmpty,
  removeChangesComment,
  serializeChangesDraft,
  setChangesGlobalAttachments,
  setChangesGlobalNote,
  useChangesDraft,
} from "./changesDrafts";

type ChangesNotesScreenProps = StaticScreenProps<{
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}>;

export function ChangesNotesScreen(props: ChangesNotesScreenProps) {
  const { environmentId, threadId } = props.route.params;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const iconColor = useThemeColor("--color-icon");
  const { selectedThread } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  const cwd = selectedThreadCwd;
  const draftKey = changesDraftKey({ environmentId, cwd: cwd ?? "", threadId });
  const draft = useChangesDraft(draftKey);
  const changes = useEnvironmentQuery(
    cwd ? vcsEnvironment.changes({ environmentId, input: { cwd } }) : null,
  );
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const allChanges = useMemo(
    () => [...(changes.data?.unstaged ?? []), ...(changes.data?.staged ?? [])],
    [changes.data],
  );
  const sortedComments = useMemo(
    () => [...draft.comments].sort((left, right) => left.path.localeCompare(right.path)),
    [draft.comments],
  );
  const attachments = changesDraftAttachments(draft);
  const empty = isChangesDraftEmpty(draft);
  const handleNativePaste = useNativePaste((uris) => {
    void (async () => {
      try {
        const images = await convertPastedImagesToAttachments({
          uris,
          existingCount: attachments.length,
        });
        if (images.length > 0) {
          setChangesGlobalAttachments(draftKey, [...draft.globalAttachments, ...images]);
        }
      } catch (error) {
        console.error("[changes notes] error converting pasted images", error);
      }
    })();
  });

  const pickImages = async () => {
    const result = await pickComposerImages({ existingCount: attachments.length });
    if (result.images.length > 0) {
      setChangesGlobalAttachments(draftKey, [...draft.globalAttachments, ...result.images]);
    }
    if (result.error) setPendingConnectionError(result.error);
  };

  const discardAll = useCallback(() => {
    Alert.alert("Discard all notes?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => clearChangesDraft(draftKey),
      },
    ]);
  }, [draftKey]);

  const discardMenu = useMemo(
    () => (
      <ControlPillMenu
        actions={[{ id: "discard", title: "Discard all notes", attributes: { destructive: true } }]}
        onPressAction={({ nativeEvent }) => {
          if (nativeEvent.event === "discard") discardAll();
        }}
      >
        <Pressable accessibilityLabel="Notes actions" hitSlop={8}>
          <SymbolView name="ellipsis.circle" size={22} tintColor={iconColor} />
        </Pressable>
      </ControlPillMenu>
    ),
    [discardAll, iconColor],
  );

  useEffect(() => {
    if (Platform.OS === "ios") navigation.setOptions({ headerRight: () => discardMenu });
  }, [discardMenu, navigation]);

  const send = async () => {
    if (!selectedThread || String(selectedThread.id) !== String(threadId)) return;
    if (empty) {
      navigation.navigate("Thread", { environmentId, threadId }, { pop: true });
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const metadata = makeQueuedMessageMetadata();
      await enqueueThreadOutboxMessage({
        environmentId,
        threadId,
        messageId: MessageId.make(metadata.messageId),
        commandId: CommandId.make(metadata.commandId),
        text: serializeChangesDraft(draft),
        attachments,
        modelSelection: selectedThread.modelSelection,
        runtimeMode: selectedThread.runtimeMode,
        interactionMode: selectedThread.interactionMode,
        createdAt: metadata.createdAt,
      });
      clearChangesDraft(draftKey);
      navigation.navigate("Thread", { environmentId, threadId }, { pop: true });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Review notes could not be queued.");
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <AndroidScreenHeader
          title="Notes"
          onBack={() => navigation.goBack()}
          trailing={discardMenu}
        />
      ) : null}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-4 p-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 76 }}
      >
        <View className="gap-1 rounded-[20px] border border-border bg-card p-4">
          <Text className="text-2xs font-t3-bold uppercase text-foreground-muted">
            Destination thread
          </Text>
          <Text numberOfLines={1} className="text-sm font-t3-bold text-foreground">
            {selectedThread?.title ?? String(threadId)}
          </Text>
          {(changes.data?.unstaged.length ?? 0) > 0 ? (
            <Text className="text-xs text-foreground-muted">
              {changes.data!.unstaged.length} unstaged file
              {changes.data!.unstaged.length === 1 ? " remains" : "s remain"}. You can still send
              these notes.
            </Text>
          ) : null}
        </View>
        {draft.comments.length === 0 ? (
          <View className="rounded-[20px] border border-border bg-card p-4">
            <Text className="text-sm text-foreground-muted">
              No inline comments yet. Tap a diff line, or long-press one to select a range.
            </Text>
          </View>
        ) : (
          sortedComments.map((comment, index) => {
            const outdated = isChangesCommentOutdated(comment, allChanges);
            return (
              <View key={comment.id} className="gap-2">
                {index === 0 || sortedComments[index - 1]?.path !== comment.path ? (
                  <Text className="px-1 text-xs font-t3-bold text-foreground-muted">
                    {comment.path}
                  </Text>
                ) : null}
                <View className="gap-2 rounded-[20px] border border-border bg-card p-4">
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <Text
                        className={`text-xs ${outdated ? "text-amber-600" : "text-foreground-muted"}`}
                      >
                        #{draft.comments.indexOf(comment) + 1} · {comment.rangeLabel}
                        {outdated ? " · Outdated" : ""}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        navigation.navigate("ThreadChangesComment", {
                          environmentId,
                          threadId,
                          commentId: comment.id,
                          path: comment.path,
                          oldPath: comment.oldPath,
                          layer: comment.layer,
                          sourceIdentity: comment.sourceIdentity,
                          side: comment.side,
                          startLine: comment.startLine,
                          endLine: comment.endLine,
                          rangeLabel: comment.rangeLabel,
                          excerpt: comment.excerpt,
                        })
                      }
                    >
                      <Text className="text-xs font-t3-bold text-primary">Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => removeChangesComment(draftKey, comment.id)}>
                      <Text className="text-xs font-t3-bold text-rose-500">Delete</Text>
                    </Pressable>
                  </View>
                  <Text className="text-sm leading-normal text-foreground">{comment.text}</Text>
                  {comment.attachments.length > 0 ? (
                    <ComposerAttachmentStrip
                      attachments={comment.attachments}
                      imageBorderRadius={14}
                      imageSize={56}
                      onPressImage={setPreviewImageUri}
                    />
                  ) : null}
                </View>
              </View>
            );
          })
        )}
        <View className="gap-2">
          <Text className="text-sm font-t3-bold text-foreground">Global note</Text>
          <View className="overflow-hidden rounded-[20px] border border-border bg-card">
            <View className="min-h-32 px-4 py-3">
              <TextInputWrapper onPaste={handleNativePaste} style={{ flex: 1 }}>
                <TextInput
                  multiline
                  value={draft.globalNote}
                  onChangeText={(value) => setChangesGlobalNote(draftKey, value)}
                  placeholder="Anything else the agent should consider?"
                  textAlignVertical="top"
                  className="min-h-28 flex-1 border-0 bg-transparent px-0 py-0"
                />
              </TextInputWrapper>
            </View>
            {draft.globalAttachments.length > 0 ? (
              <View className="px-4 pb-3">
                <ComposerAttachmentStrip
                  attachments={draft.globalAttachments}
                  imageBorderRadius={16}
                  imageSize={60}
                  onPressImage={setPreviewImageUri}
                  removeButtonPlacement="gutter"
                  onRemove={(imageId) =>
                    setChangesGlobalAttachments(
                      draftKey,
                      draft.globalAttachments.filter((image) => image.id !== imageId),
                    )
                  }
                />
              </View>
            ) : null}
            <View className="flex-row border-t border-border px-3 py-2">
              <ControlPill
                accessibilityLabel="Add image"
                icon="plus"
                onPress={() => void pickImages()}
              />
            </View>
          </View>
        </View>
        {sendError ? <Text className="text-sm text-rose-500">{sendError}</Text> : null}
      </ScrollView>
      <View
        className="absolute inset-x-0 bottom-0 border-t border-border bg-card px-4 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <Pressable
          disabled={sending}
          onPress={() => void send()}
          className="rounded-full bg-primary px-5 py-3 disabled:opacity-50"
        >
          <Text className="text-center text-xs font-t3-bold text-primary-foreground">
            {sending ? "Queueing…" : empty ? "Finish review" : "Send to agent"}
          </Text>
        </Pressable>
      </View>
      <ImageViewing
        images={previewImageUri ? [{ uri: previewImageUri }] : []}
        imageIndex={0}
        visible={previewImageUri !== null}
        onRequestClose={() => setPreviewImageUri(null)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
      />
    </View>
  );
}
