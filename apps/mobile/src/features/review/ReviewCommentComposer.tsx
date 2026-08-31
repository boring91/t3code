import { TextInputWrapper } from "expo-paste-input";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { KeyboardAvoidingView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ImageViewing from "react-native-image-viewing";

import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { ComposerAttachmentStrip } from "../../components/ComposerAttachmentStrip";
import { ControlPill } from "../../components/ControlPill";
import { cn } from "../../lib/cn";
import type { DraftComposerImageAttachment } from "../../lib/composerImages";
import { convertPastedImagesToAttachments, pickComposerImages } from "../../lib/composerImages";
import { useNativePaste } from "../../lib/useNativePaste";
import { setPendingConnectionError } from "../../state/use-remote-environment-registry";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { useAppearanceCodeSurface } from "../settings/appearance/useAppearanceCodeSurface";
import { getReviewUnifiedLineNumber } from "./reviewCommentSelection";
import { changeTone, DiffTokenText, ReviewChangeBar } from "./reviewDiffRendering";
import type { ReviewRenderableLineRow } from "./reviewModel";
import {
  highlightReviewSelectedLines,
  type ReviewHighlightedToken,
} from "./shikiReviewHighlighter";

const REVIEW_COMMENT_PREVIEW_MAX_LINES = 5;
const EMPTY_REVIEW_COMMENT_LINES: ReadonlyArray<ReviewRenderableLineRow> = [];

export interface ReviewCommentComposerTarget {
  readonly filePath: string;
  readonly selectionLabel: string;
  readonly lines: ReadonlyArray<ReviewRenderableLineRow>;
}

export function ReviewCommentComposer(props: {
  readonly target: ReviewCommentComposerTarget | null;
  readonly title?: string;
  readonly submitLabel?: string;
  readonly initialText?: string;
  readonly initialAttachments?: ReadonlyArray<DraftComposerImageAttachment>;
  readonly attachmentCountOffset?: number;
  readonly onDismiss: () => void;
  readonly onSubmit: (input: {
    readonly text: string;
    readonly attachments: ReadonlyArray<DraftComposerImageAttachment>;
  }) => void;
}) {
  const isAndroid = Platform.OS === "android";
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { themeAppearance: selectedTheme } = useAppearancePreferences();
  const { codeSurface } = useAppearanceCodeSurface();
  const [commentText, setCommentText] = useState(props.initialText ?? "");
  const [attachments, setAttachments] = useState<ReadonlyArray<DraftComposerImageAttachment>>(
    props.initialAttachments ?? [],
  );
  const [highlightedLinesById, setHighlightedLinesById] = useState<
    Record<string, ReadonlyArray<ReviewHighlightedToken>>
  >({});
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const selectedLines = props.target?.lines ?? EMPTY_REVIEW_COMMENT_LINES;
  const canSubmit = commentText.trim().length > 0 && props.target !== null;
  const previewHeight = Math.max(
    Math.min(selectedLines.length, REVIEW_COMMENT_PREVIEW_MAX_LINES) * codeSurface.rowHeight,
    codeSurface.rowHeight,
  );
  const previewViewportWidth = Math.max(width - 40, 280);
  const existingAttachmentCount = (props.attachmentCountOffset ?? 0) + attachments.length;
  const handleNativePaste = useNativePaste((uris) => {
    void (async () => {
      try {
        const images = await convertPastedImagesToAttachments({
          uris,
          existingCount: existingAttachmentCount,
        });
        if (images.length > 0) setAttachments((current) => [...current, ...images]);
      } catch (error) {
        console.error("[review comment] error converting pasted images", error);
      }
    })();
  });

  useEffect(() => {
    if (!props.target || selectedLines.length === 0) {
      setHighlightedLinesById({});
      return;
    }

    let cancelled = false;
    void highlightReviewSelectedLines({
      filePath: props.target.filePath,
      lines: selectedLines,
      theme: selectedTheme,
    })
      .then((next) => {
        if (!cancelled) setHighlightedLinesById(next);
      })
      .catch(() => {
        if (!cancelled) setHighlightedLinesById({});
      });
    return () => {
      cancelled = true;
    };
  }, [props.target?.filePath, selectedLines, selectedTheme]);

  async function handlePickImages(): Promise<void> {
    const result = await pickComposerImages({ existingCount: existingAttachmentCount });
    if (result.images.length > 0) setAttachments((current) => [...current, ...result.images]);
    if (result.error) setPendingConnectionError(result.error);
  }

  const handleSubmit = () => {
    const text = commentText.trim();
    if (!props.target || !text) return;
    props.onSubmit({ text, attachments });
  };

  return (
    <View className="flex-1 bg-sheet">
      <KeyboardAvoidingView automaticOffset behavior="padding" className="flex-1">
        <View
          className="flex-1 px-5"
          style={{
            paddingTop: isAndroid ? insets.top + 8 : 8,
            paddingBottom: props.target ? (isAndroid ? 72 : 0) : Math.max(insets.bottom, 18),
          }}
        >
          <View className="flex-row items-center justify-between py-2">
            <Pressable
              className="h-12 w-12 items-center justify-center rounded-full bg-subtle"
              onPress={props.onDismiss}
            >
              <SymbolView
                name="xmark"
                size={18}
                tintColorClassName={"accent-icon"}
                type="monochrome"
              />
            </Pressable>
            <Text className="text-lg font-t3-bold text-foreground">
              {props.title ?? "Add Comment"}
            </Text>
            <View className="h-12 w-12" />
          </View>

          {!props.target ? (
            <View className="rounded-[22px] border border-border bg-card px-4 py-5">
              <Text className="text-base font-t3-bold text-foreground">No selection</Text>
              <Text className="mt-1 text-sm leading-normal text-foreground-muted">
                Select a diff line or range first.
              </Text>
            </View>
          ) : (
            <View className="min-h-0 flex-1 gap-4">
              <View className="gap-1 px-1">
                <Text className="text-2xs font-t3-bold uppercase text-foreground-muted">
                  {props.target.selectionLabel}
                </Text>
                <Text
                  className="font-mono text-xs leading-snug text-foreground-muted"
                  ellipsizeMode="middle"
                  numberOfLines={2}
                >
                  {props.target.filePath}
                </Text>
              </View>

              <View className="overflow-hidden rounded-[22px] border border-border bg-card">
                <ScrollView
                  horizontal
                  bounces={false}
                  keyboardShouldPersistTaps="always"
                  showsHorizontalScrollIndicator={false}
                >
                  <ScrollView
                    bounces={false}
                    scrollEnabled={selectedLines.length > REVIEW_COMMENT_PREVIEW_MAX_LINES}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="always"
                    showsVerticalScrollIndicator={
                      selectedLines.length > REVIEW_COMMENT_PREVIEW_MAX_LINES
                    }
                    style={{ height: previewHeight }}
                  >
                    <View style={{ minWidth: previewViewportWidth }}>
                      {selectedLines.map((line) => (
                        <View
                          key={line.id}
                          className={cn("flex-row items-start", changeTone(line.change))}
                          style={{ height: codeSurface.rowHeight }}
                        >
                          <ReviewChangeBar change={line.change} height={codeSurface.rowHeight} />
                          <Text className="w-9 py-1 pr-1 text-right text-2xs font-mono text-foreground-muted">
                            {getReviewUnifiedLineNumber(line) ?? ""}
                          </Text>
                          <View className="min-w-0 flex-1 shrink-0 px-1 py-1">
                            <DiffTokenText
                              fallback={line.content}
                              tokens={highlightedLinesById[line.id] ?? null}
                              change={line.change}
                              fontSize={codeSurface.fontSize}
                              lineHeight={codeSurface.rowHeight}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </ScrollView>
              </View>

              <View className="min-h-0 flex-1 gap-2">
                <Text className="text-sm font-t3-bold text-foreground">Comment</Text>
                <View className="min-h-[132px] flex-1 overflow-hidden rounded-[20px] border border-border bg-card">
                  <View className="min-h-0 flex-1 px-4 pt-3.5">
                    <TextInputWrapper onPaste={handleNativePaste} style={{ flex: 1, minHeight: 0 }}>
                      <TextInput
                        autoFocus
                        multiline
                        scrollEnabled
                        placeholder="Leave a comment..."
                        textAlignVertical="top"
                        value={commentText}
                        onChangeText={setCommentText}
                        className="h-full min-h-0 flex-1 border-0 bg-transparent px-0 py-0 font-sans text-base"
                      />
                    </TextInputWrapper>
                  </View>
                  {attachments.length > 0 ? (
                    <View className="px-4 pb-3 pt-2">
                      <ComposerAttachmentStrip
                        attachments={attachments}
                        imageBorderRadius={16}
                        imageSize={60}
                        onPressImage={setPreviewImageUri}
                        removeButtonPlacement="gutter"
                        onRemove={(imageId) =>
                          setAttachments((current) =>
                            current.filter((image) => image.id !== imageId),
                          )
                        }
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          )}
        </View>
        {!isAndroid && props.target ? (
          <View className="flex-row items-center gap-3 bg-sheet px-5 py-2">
            <ControlPill
              accessibilityLabel="Add image"
              icon="plus"
              onPress={() => void handlePickImages()}
            />
            <View className="flex-1" />
            <ControlPill
              accessibilityLabel={props.submitLabel ?? "Comment"}
              icon="arrow.up"
              label={props.submitLabel ?? "Comment"}
              variant="primary"
              disabled={!canSubmit}
              onPress={handleSubmit}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {isAndroid && props.target ? (
        <KeyboardStickyView
          className="absolute inset-x-0 bottom-0"
          offset={{ closed: 0, opened: 0 }}
        >
          <View
            className="flex-row items-center gap-3 border-t border-border bg-sheet px-5 pt-2"
            style={{ paddingBottom: Math.max(insets.bottom, 10) }}
          >
            <ControlPill
              accessibilityLabel="Add image"
              icon="plus"
              onPress={() => void handlePickImages()}
            />
            <View className="flex-1" />
            <ControlPill
              accessibilityLabel={props.submitLabel ?? "Comment"}
              icon="arrow.up"
              label={props.submitLabel ?? "Comment"}
              variant="primary"
              disabled={!canSubmit}
              onPress={handleSubmit}
            />
          </View>
        </KeyboardStickyView>
      ) : null}
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
