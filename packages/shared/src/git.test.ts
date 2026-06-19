import { describe, expect, it } from "vitest";

import {
  WORKTREE_BRANCH_PREFIX,
  buildPeakcodeBranchName,
  buildTemporaryWorktreeBranchName,
  isTemporaryWorktreeBranch,
  resolveUniquePeakcodeBranchName,
  resolveThreadBranchRegressionGuard,
} from "./git";

describe("isTemporaryWorktreeBranch", () => {
  it("matches generated temporary worktree branches", () => {
    expect(isTemporaryWorktreeBranch(buildTemporaryWorktreeBranchName())).toBe(true);
  });

  it("matches generated temporary worktree branches", () => {
    expect(isTemporaryWorktreeBranch(`${WORKTREE_BRANCH_PREFIX}/deadbeef`)).toBe(true);
    expect(isTemporaryWorktreeBranch(` ${WORKTREE_BRANCH_PREFIX}/DEADBEEF `)).toBe(true);
  });

  it("rejects semantic branch names", () => {
    expect(isTemporaryWorktreeBranch(`${WORKTREE_BRANCH_PREFIX}/feature/demo`)).toBe(false);
    expect(isTemporaryWorktreeBranch("feature/demo")).toBe(false);
  });
});

describe("resolveThreadBranchRegressionGuard", () => {
  it("keeps a semantic branch when the next branch is only a temporary worktree placeholder", () => {
    expect(
      resolveThreadBranchRegressionGuard({
        currentBranch: "feature/semantic-branch",
        nextBranch: `${WORKTREE_BRANCH_PREFIX}/deadbeef`,
      }),
    ).toBe("feature/semantic-branch");
  });

  it("accepts real branch changes", () => {
    expect(
      resolveThreadBranchRegressionGuard({
        currentBranch: "feature/old",
        nextBranch: "feature/new",
      }),
    ).toBe("feature/new");
  });

  it("allows clearing the branch", () => {
    expect(
      resolveThreadBranchRegressionGuard({
        currentBranch: "feature/old",
        nextBranch: null,
      }),
    ).toBeNull();
  });
});

describe("buildPeakcodeBranchName", () => {
  it("uses peakcode as the branch namespace", () => {
    expect(buildPeakcodeBranchName("fix toast copy")).toBe("peakcode/fix-toast-copy");
  });

  it("keeps non-peakcode namespaces inside the peakcode branch", () => {
    expect(buildPeakcodeBranchName("feature/refine-toolbar-actions")).toBe(
      "peakcode/feature/refine-toolbar-actions",
    );
  });

  it("normalizes legacy codex-style prefixes before rebuilding the branch", () => {
    expect(buildPeakcodeBranchName("codex/refine toolbar actions")).toBe(
      "peakcode/refine-toolbar-actions",
    );
  });

  it("falls back to peakcode/update when no preferred name is provided", () => {
    expect(buildPeakcodeBranchName()).toBe("peakcode/update");
  });
});

describe("resolveUniquePeakcodeBranchName", () => {
  it("increments suffix when the peakcode branch already exists", () => {
    expect(
      resolveUniquePeakcodeBranchName(
        ["main", "peakcode/fix-toast-copy", "peakcode/fix-toast-copy-2"],
        "fix toast copy",
      ),
    ).toBe("peakcode/fix-toast-copy-3");
  });
});
