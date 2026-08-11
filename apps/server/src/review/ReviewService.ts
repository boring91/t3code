import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import {
  VcsRepositoryDetectionError,
  VcsUnsupportedOperationError,
  type ReviewDiffFileContentsInput,
  type ReviewDiffFileContentsResult,
  type ReviewDiffPreviewError,
  type ReviewDiffPreviewInput,
  type ReviewDiffPreviewResult,
  type VcsChangesInput,
  type VcsChangesResult,
  type VcsChangeFileInput,
  type VcsChangeFileResult,
  type VcsChangeBatchMutationInput,
  type VcsChangeMutationInput,
  type VcsChangeMutationResult,
} from "@t3tools/contracts";

import * as ServerConfig from "../config.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";

export class ReviewService extends Context.Service<
  ReviewService,
  {
    readonly getDiffPreview: (
      input: ReviewDiffPreviewInput,
    ) => Effect.Effect<ReviewDiffPreviewResult, ReviewDiffPreviewError>;
    readonly getDiffFileContents: (
      input: ReviewDiffFileContentsInput,
    ) => Effect.Effect<ReviewDiffFileContentsResult, ReviewDiffPreviewError>;
    readonly getChanges: (
      input: VcsChangesInput,
    ) => Effect.Effect<VcsChangesResult, ReviewDiffPreviewError>;
    readonly getChangeFile: (
      input: VcsChangeFileInput,
    ) => Effect.Effect<VcsChangeFileResult, ReviewDiffPreviewError>;
    readonly stageChange: (
      input: VcsChangeMutationInput,
    ) => Effect.Effect<VcsChangeMutationResult, ReviewDiffPreviewError>;
    readonly unstageChange: (
      input: VcsChangeMutationInput,
    ) => Effect.Effect<VcsChangeMutationResult, ReviewDiffPreviewError>;
    readonly stageChanges: (
      input: VcsChangeBatchMutationInput,
    ) => Effect.Effect<VcsChangeMutationResult, ReviewDiffPreviewError>;
    readonly unstageChanges: (
      input: VcsChangeBatchMutationInput,
    ) => Effect.Effect<VcsChangeMutationResult, ReviewDiffPreviewError>;
  }
>()("t3/review/ReviewService") {}

export const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const vcsRegistry = yield* VcsDriverRegistry.VcsDriverRegistry;
  const git = yield* GitVcsDriver.GitVcsDriver;

  const canonicalizePath = (value: string) => {
    const resolvedPath = path.resolve(value);
    return fileSystem.realPath(resolvedPath).pipe(
      Effect.catchTags({
        PlatformError: (cause) =>
          cause.reason._tag === "NotFound"
            ? Effect.succeed(resolvedPath)
            : Effect.fail(
                new VcsRepositoryDetectionError({
                  operation: "ReviewService.assertWorkspaceBoundCwd.canonicalizePath",
                  cwd: resolvedPath,
                  detail: "Failed to resolve a path while validating the review workspace.",
                  cause,
                }),
              ),
      }),
    );
  };

  const isWithinRoot = (candidate: string, root: string) => {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  };

  const assertWorkspaceBoundCwd = Effect.fn("ReviewService.assertWorkspaceBoundCwd")(function* (
    operation: string,
    cwd: string,
  ) {
    const [candidate, workspaceRoot, worktreesRoot] = yield* Effect.all([
      canonicalizePath(cwd),
      canonicalizePath(config.cwd),
      canonicalizePath(config.worktreesDir),
    ]);

    if (isWithinRoot(candidate, workspaceRoot) || isWithinRoot(candidate, worktreesRoot)) {
      return;
    }

    return yield* new VcsRepositoryDetectionError({
      operation,
      cwd,
      detail: "VCS review cwd must stay within the configured workspace root.",
    });
  });

  const getDiffPreview: ReviewService["Service"]["getDiffPreview"] = Effect.fn(
    "ReviewService.getDiffPreview",
  )(function* (input) {
    yield* assertWorkspaceBoundCwd("ReviewService.getDiffPreview", input.cwd);

    const handle = yield* vcsRegistry.detect({ cwd: input.cwd, requestedKind: "auto" });
    if (!handle) {
      return {
        cwd: input.cwd,
        generatedAt: yield* DateTime.now,
        sources: [],
      };
    }

    const getDriverDiffPreview = handle.driver.getDiffPreview;
    if (!getDriverDiffPreview) {
      if (handle.kind === "git") {
        return yield* git.getReviewDiffPreview(input);
      }
      return yield* new VcsUnsupportedOperationError({
        operation: "ReviewService.getDiffPreview",
        kind: handle.kind,
        detail: `The ${handle.kind} VCS driver does not support review diff previews.`,
      });
    }

    return yield* getDriverDiffPreview(input);
  });

  const getDiffFileContents: ReviewService["Service"]["getDiffFileContents"] = Effect.fn(
    "ReviewService.getDiffFileContents",
  )(function* (input) {
    yield* assertWorkspaceBoundCwd("ReviewService.getDiffFileContents", input.cwd);

    const handle = yield* vcsRegistry.detect({ cwd: input.cwd, requestedKind: "auto" });
    if (handle?.kind !== "git") {
      return yield* new VcsUnsupportedOperationError({
        operation: "ReviewService.getDiffFileContents",
        kind: handle?.kind ?? "unknown",
        detail: "Unchanged diff expansion currently requires a Git repository.",
      });
    }

    return yield* git.getReviewDiffFileContents(input);
  });

  const getChanges: ReviewService["Service"]["getChanges"] = Effect.fn("ReviewService.getChanges")(
    function* (input) {
      yield* assertWorkspaceBoundCwd("ReviewService.getChanges", input.cwd);
      return yield* git.getChanges(input);
    },
  );

  const getChangeFile: ReviewService["Service"]["getChangeFile"] = Effect.fn(
    "ReviewService.getChangeFile",
  )(function* (input) {
    yield* assertWorkspaceBoundCwd("ReviewService.getChangeFile", input.cwd);
    return yield* git.getChangeFile(input);
  });

  const stageChange: ReviewService["Service"]["stageChange"] = Effect.fn(
    "ReviewService.stageChange",
  )(function* (input) {
    yield* assertWorkspaceBoundCwd("ReviewService.stageChange", input.cwd);
    return yield* git.stageChange(input);
  });

  const unstageChange: ReviewService["Service"]["unstageChange"] = Effect.fn(
    "ReviewService.unstageChange",
  )(function* (input) {
    yield* assertWorkspaceBoundCwd("ReviewService.unstageChange", input.cwd);
    return yield* git.unstageChange(input);
  });

  const stageChanges: ReviewService["Service"]["stageChanges"] = Effect.fn(
    "ReviewService.stageChanges",
  )(function* (input) {
    yield* assertWorkspaceBoundCwd("ReviewService.stageChanges", input.cwd);
    return yield* git.stageChanges(input);
  });

  const unstageChanges: ReviewService["Service"]["unstageChanges"] = Effect.fn(
    "ReviewService.unstageChanges",
  )(function* (input) {
    yield* assertWorkspaceBoundCwd("ReviewService.unstageChanges", input.cwd);
    return yield* git.unstageChanges(input);
  });

  return ReviewService.of({
    getDiffPreview,
    getDiffFileContents,
    getChanges,
    getChangeFile,
    stageChange,
    unstageChange,
    stageChanges,
    unstageChanges,
  });
});

export const layer = Layer.effect(ReviewService, make);
