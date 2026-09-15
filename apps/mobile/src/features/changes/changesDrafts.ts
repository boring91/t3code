import { useAtomValue } from "@effect/atom-react";
import type { VcsChange, VcsChangeLayer, VcsChangesResult } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Atom } from "effect/unstable/reactivity";
import { useEffect } from "react";

import { SerializedAsyncQueue } from "../../lib/serialized-async-queue";
import { DraftComposerImageAttachmentSchema } from "../../lib/composer-image-schema";
import { composerImageAttachmentDataUrl } from "../../lib/composerAttachmentFiles";
import type { DraftComposerImageAttachment } from "../../lib/composerImages";
import { appAtomRegistry } from "../../state/atom-registry";

const SCHEMA_VERSION = 2;
const LEGACY_SCHEMA_VERSION = 1;
const DIRECTORY = "changes-drafts";
const FILE_NAME = "drafts.json";
const ATTACHMENTS_DIRECTORY = "attachments";
const PERSIST_DEBOUNCE_MS = 200;

export interface ChangesDraftScope {
  readonly environmentId: string;
  readonly cwd: string;
  readonly threadId: string;
}

export interface ChangesDraftComment {
  readonly id: string;
  readonly path: string;
  readonly oldPath: string | null;
  readonly layer: VcsChangeLayer;
  readonly sourceIdentity: string;
  readonly side: "old" | "new";
  readonly startLine: number;
  readonly endLine: number;
  readonly rangeLabel: string;
  readonly excerpt: string;
  readonly text: string;
  readonly attachments: ReadonlyArray<DraftComposerImageAttachment>;
}

export interface ChangesDraft {
  readonly globalNote: string;
  readonly globalAttachments: ReadonlyArray<DraftComposerImageAttachment>;
  readonly comments: ReadonlyArray<ChangesDraftComment>;
}

const LegacyCommentSchema = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  oldPath: Schema.NullOr(Schema.String),
  layer: Schema.Literals(["unstaged", "staged"]),
  sourceIdentity: Schema.String,
  side: Schema.Literals(["old", "new"]),
  startLine: Schema.Number,
  endLine: Schema.Number,
  rangeLabel: Schema.String,
  excerpt: Schema.String,
  text: Schema.String,
  attachments: Schema.optional(Schema.Array(DraftComposerImageAttachmentSchema)),
});
const LegacyDraftSchema = Schema.Struct({
  globalNote: Schema.String,
  globalAttachments: Schema.optional(Schema.Array(DraftComposerImageAttachmentSchema)),
  comments: Schema.Array(LegacyCommentSchema),
});
const LegacyDocumentSchema = Schema.Struct({
  schemaVersion: Schema.Literal(LEGACY_SCHEMA_VERSION),
  drafts: Schema.Record(Schema.String, LegacyDraftSchema),
});
const AttachmentReferenceSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("image"),
  name: Schema.String,
  mimeType: Schema.String,
  sizeBytes: Schema.Number,
});
const PersistedCommentSchema = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  oldPath: Schema.NullOr(Schema.String),
  layer: Schema.Literals(["unstaged", "staged"]),
  sourceIdentity: Schema.String,
  side: Schema.Literals(["old", "new"]),
  startLine: Schema.Number,
  endLine: Schema.Number,
  rangeLabel: Schema.String,
  excerpt: Schema.String,
  text: Schema.String,
  attachments: Schema.Array(AttachmentReferenceSchema),
});
const PersistedDraftSchema = Schema.Struct({
  globalNote: Schema.String,
  globalAttachments: Schema.Array(AttachmentReferenceSchema),
  comments: Schema.Array(PersistedCommentSchema),
});
const PersistedDocumentSchema = Schema.Struct({
  schemaVersion: Schema.Literal(SCHEMA_VERSION),
  drafts: Schema.Record(Schema.String, PersistedDraftSchema),
});
const StoredDocumentSchema = Schema.Union([LegacyDocumentSchema, PersistedDocumentSchema]);
const decodeLegacyDocument = Schema.decodeUnknownSync(LegacyDocumentSchema);
const decodeStoredDocument = Schema.decodeUnknownSync(StoredDocumentSchema);

const EMPTY_DRAFT: ChangesDraft = { globalNote: "", globalAttachments: [], comments: [] };
const changesDraftsAtom = Atom.make<Record<string, ChangesDraft>>({}).pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:changes-drafts"),
);

let loadPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const persistenceQueue = new SerializedAsyncQueue();

export function changesDraftKey(scope: ChangesDraftScope): string {
  return JSON.stringify([scope.environmentId, scope.cwd, scope.threadId]);
}

export function isChangesDraftEmpty(draft: ChangesDraft): boolean {
  return (
    draft.globalNote.trim().length === 0 &&
    draft.globalAttachments.length === 0 &&
    draft.comments.length === 0
  );
}

export function getChangesDraft(draftKey: string): ChangesDraft {
  return appAtomRegistry.get(changesDraftsAtom)[draftKey] ?? EMPTY_DRAFT;
}

function updateDrafts(
  update: (drafts: Record<string, ChangesDraft>) => Record<string, ChangesDraft>,
) {
  const next = update(appAtomRegistry.get(changesDraftsAtom));
  appAtomRegistry.set(changesDraftsAtom, next);
  schedulePersist(next);
}

function setDraft(draftKey: string, draft: ChangesDraft) {
  updateDrafts((current) => {
    const next = { ...current };
    if (isChangesDraftEmpty(draft)) delete next[draftKey];
    else next[draftKey] = draft;
    return next;
  });
}

export function setChangesGlobalNote(draftKey: string, globalNote: string) {
  setDraft(draftKey, { ...getChangesDraft(draftKey), globalNote });
}

export function setChangesGlobalAttachments(
  draftKey: string,
  globalAttachments: ReadonlyArray<DraftComposerImageAttachment>,
) {
  setDraft(draftKey, { ...getChangesDraft(draftKey), globalAttachments });
}

export function changesDraftAttachments(
  draft: ChangesDraft,
): ReadonlyArray<DraftComposerImageAttachment> {
  return [...draft.globalAttachments, ...draft.comments.flatMap((comment) => comment.attachments)];
}

export function upsertChangesComment(draftKey: string, comment: ChangesDraftComment) {
  const current = getChangesDraft(draftKey);
  const existingIndex = current.comments.findIndex((item) => item.id === comment.id);
  const comments = [...current.comments];
  if (existingIndex < 0) comments.push(comment);
  else comments[existingIndex] = comment;
  setDraft(draftKey, { ...current, comments });
}

export function removeChangesComment(draftKey: string, commentId: string) {
  const current = getChangesDraft(draftKey);
  setDraft(draftKey, {
    ...current,
    comments: current.comments.filter((comment) => comment.id !== commentId),
  });
}

export function rebindChangesComments(
  draftKey: string,
  rebindings: ReadonlyArray<{
    readonly from: { readonly path: string; readonly identity: string };
    readonly targets: ChangesCommentRebindTargets;
  }>,
) {
  setDraft(
    draftKey,
    rebindings.reduce(
      (draft, rebind) => rebindChangesDraftComments(draft, rebind.from, rebind.targets),
      getChangesDraft(draftKey),
    ),
  );
}

type ChangesCommentRebindTarget = Pick<VcsChange, "path" | "oldPath" | "layer" | "identity"> | null;

export interface ChangesCommentRebindTargets {
  readonly old: ChangesCommentRebindTarget;
  readonly new: ChangesCommentRebindTarget;
}

export function rebindChangesDraftComments(
  current: ChangesDraft,
  from: { readonly path: string; readonly identity: string },
  targets: ChangesCommentRebindTargets,
): ChangesDraft {
  return {
    ...current,
    comments: current.comments.map((comment) => {
      const target = targets[comment.side];
      return target && comment.path === from.path && comment.sourceIdentity === from.identity
        ? {
            ...comment,
            path: target.path,
            oldPath: target.oldPath,
            layer: target.layer,
            sourceIdentity: target.identity,
          }
        : comment;
    }),
  };
}

export function changesCommentRebindTargets(
  change: VcsChange,
  before: VcsChangesResult,
  after: VcsChangesResult,
): ChangesCommentRebindTargets {
  const targetLayer = change.layer === "unstaged" ? "staged" : "unstaged";
  const targetChanges = after[targetLayer];
  const currentTarget = targetChanges.find((candidate) => candidate.path === change.path) ?? null;
  const oldTarget =
    change.oldPath === null
      ? currentTarget
      : (targetChanges.find((candidate) => candidate.path === change.oldPath) ?? currentTarget);
  const hadParallelChange = before[targetLayer].some(
    (candidate) => candidate.path === change.path || candidate.path === change.oldPath,
  );
  if (!hadParallelChange) return { old: oldTarget, new: currentTarget };
  return change.layer === "unstaged"
    ? { old: null, new: currentTarget }
    : { old: oldTarget, new: null };
}

export function clearChangesDraft(draftKey: string) {
  setDraft(draftKey, EMPTY_DRAFT);
}

export function useChangesDraft(draftKey: string): ChangesDraft {
  useEffect(ensureChangesDraftsLoaded, []);
  return useAtomValue(changesDraftsAtom)[draftKey] ?? EMPTY_DRAFT;
}

export function serializeChangesDraft(draft: ChangesDraft): string {
  const commentsByPath = new Map<string, ChangesDraftComment[]>();
  draft.comments.forEach((comment) => {
    const comments = commentsByPath.get(comment.path) ?? [];
    comments.push(comment);
    commentsByPath.set(comment.path, comments);
  });
  const sections = Array.from(commentsByPath.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, comments]) => {
      const entries = comments.map((comment) => {
        const excerpt = comment.excerpt.trim();
        const compactExcerpt = excerpt.length > 500 ? `${excerpt.slice(0, 500)}…` : excerpt;
        const attachmentNames = comment.attachments.map((image) => image.name).join(", ");
        return `- ${comment.rangeLabel} (${comment.side} side, ${comment.layer})${comment.oldPath ? `, renamed from ${comment.oldPath}` : ""}: ${comment.text.trim()}${attachmentNames ? `\n\nAttached images: ${attachmentNames}` : ""}\n\n\`\`\`diff\n${compactExcerpt}\n\`\`\``;
      });
      return `## ${path}\n\n${entries.join("\n\n")}`;
    });
  if (draft.globalNote.trim() || draft.globalAttachments.length > 0) {
    const attachmentNames = draft.globalAttachments.map((image) => image.name).join(", ");
    sections.push(
      `## General\n\n${draft.globalNote.trim()}${attachmentNames ? `${draft.globalNote.trim() ? "\n\n" : ""}Attached images: ${attachmentNames}` : ""}`,
    );
  }
  return `Please review these notes against the current changes:\n\n${sections.join("\n\n")}`;
}

export function isChangesCommentOutdated(
  comment: ChangesDraftComment,
  changes: ReadonlyArray<{ readonly path: string; readonly identity: string }>,
): boolean {
  return !changes.some(
    (change) => change.path === comment.path && change.identity === comment.sourceIdentity,
  );
}

export function decodeChangesDrafts(value: unknown): Record<string, ChangesDraft> {
  const decoded = decodeLegacyDocument(value);
  return Object.fromEntries(
    Object.entries(decoded.drafts)
      .map(
        ([key, draft]) =>
          [
            key,
            {
              globalNote: draft.globalNote,
              globalAttachments: draft.globalAttachments ?? [],
              comments: draft.comments.map((comment) => ({
                ...comment,
                attachments: comment.attachments ?? [],
              })),
            } satisfies ChangesDraft,
          ] as const,
      )
      .filter(([, draft]) => !isChangesDraftEmpty(draft)),
  );
}

function attachmentReference(attachment: DraftComposerImageAttachment) {
  return {
    id: attachment.id,
    type: attachment.type,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
  } as const;
}

export function encodeChangesDraftsForPersistence(drafts: Record<string, ChangesDraft>) {
  return {
    schemaVersion: SCHEMA_VERSION,
    drafts: Object.fromEntries(
      Object.entries(drafts)
        .filter(([, draft]) => !isChangesDraftEmpty(draft))
        .map(([key, draft]) => [
          key,
          {
            globalNote: draft.globalNote,
            globalAttachments: draft.globalAttachments.map(attachmentReference),
            comments: draft.comments.map((comment) => ({
              ...comment,
              attachments: comment.attachments.map(attachmentReference),
            })),
          },
        ]),
    ),
  } as const;
}

async function draftsDirectory() {
  const { Directory, Paths } = await import("expo-file-system");
  const directory = new Directory(Paths.document, DIRECTORY);
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

async function draftsFile() {
  const { File } = await import("expo-file-system");
  return new File(await draftsDirectory(), FILE_NAME);
}

async function attachmentsDirectory() {
  const { Directory } = await import("expo-file-system");
  const directory = new Directory(await draftsDirectory(), ATTACHMENTS_DIRECTORY);
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function attachmentFileName(id: string): string {
  return `${encodeURIComponent(id)}.data`;
}

async function hydrateAttachment(
  reference: typeof AttachmentReferenceSchema.Type,
): Promise<DraftComposerImageAttachment | null> {
  const { File } = await import("expo-file-system");
  const file = new File(await attachmentsDirectory(), attachmentFileName(reference.id));
  if (!file.exists) return null;
  const dataUrl = await file.text();
  return { ...reference, dataUrl, previewUri: dataUrl };
}

async function loadPersisted(): Promise<Record<string, ChangesDraft>> {
  try {
    const file = await draftsFile();
    if (!file.exists) return {};
    const decoded = decodeStoredDocument(JSON.parse(await file.text()) as unknown);
    if (decoded.schemaVersion === LEGACY_SCHEMA_VERSION) return decodeChangesDrafts(decoded);
    const drafts = await Promise.all(
      Object.entries(decoded.drafts).map(async ([key, draft]) => {
        const globalAttachments = (
          await Promise.all(draft.globalAttachments.map(hydrateAttachment))
        ).filter((attachment): attachment is DraftComposerImageAttachment => attachment !== null);
        const comments = await Promise.all(
          draft.comments.map(async (comment) => ({
            ...comment,
            attachments: (await Promise.all(comment.attachments.map(hydrateAttachment))).filter(
              (attachment): attachment is DraftComposerImageAttachment => attachment !== null,
            ),
          })),
        );
        return [key, { globalNote: draft.globalNote, globalAttachments, comments }] as const;
      }),
    );
    return Object.fromEntries(drafts.filter(([, draft]) => !isChangesDraftEmpty(draft)));
  } catch (error) {
    console.warn("[changes-drafts] ignored persisted draft failure", error);
    return {};
  }
}

async function writePersisted(drafts: Record<string, ChangesDraft>) {
  const { File } = await import("expo-file-system");
  const attachments = Object.values(drafts).flatMap(changesDraftAttachments);
  const directory = await attachmentsDirectory();
  const activeFiles = new Set(attachments.map((attachment) => attachmentFileName(attachment.id)));
  for (const attachment of attachments) {
    const file = new File(directory, attachmentFileName(attachment.id));
    if (!file.exists) {
      file.create({ intermediates: true, overwrite: true });
      file.write(await composerImageAttachmentDataUrl(attachment));
    }
  }
  const file = await draftsFile();
  if (!file.exists) file.create({ intermediates: true, overwrite: true });
  file.write(JSON.stringify(encodeChangesDraftsForPersistence(drafts)));
  for (const entry of directory.list()) {
    if (entry instanceof File && !activeFiles.has(entry.name)) entry.delete();
  }
}

function schedulePersist(drafts: Record<string, ChangesDraft>) {
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistenceQueue
      .run(() => writePersisted(drafts))
      .catch((error: unknown) => {
        console.warn("[changes-drafts] failed to persist drafts", error);
      });
  }, PERSIST_DEBOUNCE_MS);
}

export function ensureChangesDraftsLoaded() {
  if (loadPromise !== null) return;
  loadPromise = loadPersisted().then((persisted) => {
    appAtomRegistry.set(changesDraftsAtom, {
      ...persisted,
      ...appAtomRegistry.get(changesDraftsAtom),
    });
  });
}
