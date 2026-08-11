import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useCallback, useMemo } from "react";

import { appendReviewCommentToDraft } from "../../state/use-thread-composer-state";
import { ReviewCommentComposer } from "./ReviewCommentComposer";
import {
  clearReviewCommentTarget,
  formatReviewCommentContext,
  getReviewUnifiedLineNumber,
  getSelectedReviewCommentLines,
  useReviewCommentTarget,
} from "./reviewCommentSelection";

type ReviewCommentComposerSheetProps = StaticScreenProps<{
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}>;

export function ReviewCommentComposerSheet(props: ReviewCommentComposerSheetProps) {
  const navigation = useNavigation();
  const target = useReviewCommentTarget();
  const { environmentId, threadId } = props.route.params;
  const selectedLines = useMemo(
    () => (target ? getSelectedReviewCommentLines(target) : []),
    [target],
  );
  const lastLine = selectedLines.at(-1);
  const firstNumber = selectedLines[0] ? getReviewUnifiedLineNumber(selectedLines[0]) : null;
  const lastNumber = lastLine ? getReviewUnifiedLineNumber(lastLine) : null;
  const selectionLabel =
    selectedLines.length === 1
      ? firstNumber !== null
        ? `Line ${firstNumber}`
        : "File comment"
      : firstNumber !== null && lastNumber !== null
        ? `Lines ${firstNumber}-${lastNumber}`
        : `${selectedLines.length} lines selected`;
  const dismissComposer = useCallback(() => {
    clearReviewCommentTarget();
    navigation.goBack();
  }, [navigation]);

  return (
    <ReviewCommentComposer
      target={
        target
          ? {
              filePath: target.filePath,
              selectionLabel,
              lines: selectedLines,
            }
          : null
      }
      onDismiss={dismissComposer}
      onSubmit={({ text, attachments }) => {
        if (!target || !environmentId || !threadId) return;
        appendReviewCommentToDraft({
          environmentId,
          threadId,
          text: formatReviewCommentContext(target, text),
          attachments,
        });
        dismissComposer();
      }}
    />
  );
}
