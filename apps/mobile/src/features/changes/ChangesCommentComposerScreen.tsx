import type { EnvironmentId, ThreadId, VcsChangeLayer } from "@t3tools/contracts";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useMemo } from "react";

import { uuidv4 } from "../../lib/uuid";
import { useSelectedThreadWorktree } from "../../state/use-selected-thread-worktree";
import { ReviewCommentComposer } from "../review/ReviewCommentComposer";
import {
  changesDraftAttachments,
  changesDraftKey,
  upsertChangesComment,
  useChangesDraft,
} from "./changesDrafts";
import { buildChangesCommentPreviewLines } from "./changesModel";

type ChangesCommentComposerScreenProps = StaticScreenProps<{
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly commentId?: string;
  readonly path: string;
  readonly oldPath: string | null;
  readonly layer: VcsChangeLayer;
  readonly sourceIdentity: string;
  readonly side: "old" | "new";
  readonly startLine: number;
  readonly endLine: number;
  readonly rangeLabel: string;
  readonly excerpt: string;
}>;

export function ChangesCommentComposerScreen(props: ChangesCommentComposerScreenProps) {
  const navigation = useNavigation();
  const params = props.route.params;
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  const draftKey = changesDraftKey({
    environmentId: params.environmentId,
    cwd: selectedThreadCwd ?? "",
    threadId: params.threadId,
  });
  const draft = useChangesDraft(draftKey);
  const existing = params.commentId
    ? draft.comments.find((comment) => comment.id === params.commentId)
    : null;
  const initialAttachments = existing?.attachments ?? [];
  const previewLines = useMemo(
    () =>
      buildChangesCommentPreviewLines({
        excerpt: params.excerpt,
        side: params.side,
        startLine: params.startLine,
      }),
    [params.excerpt, params.side, params.startLine],
  );

  return (
    <ReviewCommentComposer
      title={existing ? "Edit Comment" : "Add Comment"}
      submitLabel={existing ? "Save" : "Add to review"}
      initialText={existing?.text}
      initialAttachments={initialAttachments}
      attachmentCountOffset={changesDraftAttachments(draft).length - initialAttachments.length}
      target={{
        filePath: params.path,
        selectionLabel:
          params.startLine === params.endLine
            ? `Line ${params.startLine}`
            : `Lines ${params.startLine}-${params.endLine}`,
        lines: previewLines,
      }}
      onDismiss={() => navigation.goBack()}
      onSubmit={({ text, attachments }) => {
        upsertChangesComment(draftKey, {
          id: params.commentId ?? uuidv4(),
          path: params.path,
          oldPath: params.oldPath,
          layer: params.layer,
          sourceIdentity: params.sourceIdentity,
          side: params.side,
          startLine: params.startLine,
          endLine: params.endLine,
          rangeLabel: params.rangeLabel,
          excerpt: params.excerpt,
          text,
          attachments,
        });
        navigation.goBack();
      }}
    />
  );
}
