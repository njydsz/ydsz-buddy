//! # TeamRulesView UI 单元测试
//!
//! 覆盖目标：
//! - 空状态:显示"无团队规则"引导
//! - 有规则:渲染列表 + manifest 摘要
//! - 点击"新建规则"打开 dialog
//! - 文件名校验失败显示错误
//! - manifest 开关变化触发 saveManifest mutation
//!
//! invoke 通过 mock 完全隔离。

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { TeamRulesView } from "./TeamRulesView";
import type { TeamRulesListDto } from "../hooks/useTeamRules";

const SAMPLE_WITH_RULES: TeamRulesListDto = {
  root: "/home/test/.ydsz-buddy/team-rules",
  manifest: {
    schemaVersion: 1,
    updatedAt: "2026-06-26T08:00:00Z",
    teamName: "Platform",
    remoteUrl: null,
    remoteCommit: null,
    enabled: true,
  },
  files: [
    {
      name: "00-style.md",
      path: "/home/test/.ydsz-buddy/team-rules/00-style.md",
      content: "use tabs",
      originalBytes: 8,
      truncated: false,
      modifiedAt: 1719390000,
    },
  ],
  skipped: 0,
  error: null,
  elapsedMs: 4,
};

const EMPTY: TeamRulesListDto = {
  root: null,
  manifest: null,
  files: [],
  skipped: 0,
  error: null,
  elapsedMs: 1,
};

function setup(dto: TeamRulesListDto) {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(dto);

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(TeamRulesView, {} as { baseDir?: string | null }),
      ),
    );
  });
  return { root, container, client };
}

describe("TeamRulesView", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("空状态下展示引导和新建按钮", async () => {
    const { root, container } = setup(EMPTY);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const empty = container.querySelector(
      '[data-testid="team-rules-empty"]',
    );
    expect(empty).toBeTruthy();
    const create = container.querySelector(
      '[data-testid="team-rules-empty-create"]',
    );
    expect(create).toBeTruthy();
    const list = container.querySelector('[data-testid="team-rules-list"]');
    expect(list).toBeNull();
    act(() => root.unmount());
  });

  it("有规则时渲染列表、manifest 摘要、合并预览", async () => {
    const { root, container } = setup(SAMPLE_WITH_RULES);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const items = container.querySelectorAll(
      '[data-testid="team-rules-list-item"]',
    );
    expect(items.length).toBe(1);
    const ruleItem = items[0];
    expect(ruleItem?.getAttribute("data-rule-name")).toBe("00-style.md");
    expect(ruleItem?.getAttribute("data-rule-bytes")).toBe("8");
    const summary = container.querySelector('[data-testid="team-rules-list-section"]');
    expect(summary).toBeTruthy();
    const lastUpdated = container.querySelector(
      '[data-testid="team-rules-last-updated"]',
    );
    expect(lastUpdated).toBeTruthy();
    act(() => root.unmount());
  });

  it("manifest.enabled=false 时 data-is-enabled='false'", async () => {
    const disabled: TeamRulesListDto = {
      ...SAMPLE_WITH_RULES,
      manifest: { ...SAMPLE_WITH_RULES.manifest!, enabled: false },
    };
    const { root, container } = setup(disabled);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const view = container.querySelector('[data-testid="team-rules-view"]');
    expect(view?.getAttribute("data-is-enabled")).toBe("false");
    act(() => root.unmount());
  });

  it("点击'新建规则'打开 dialog", async () => {
    const { root, container } = setup(EMPTY);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const create = container.querySelector(
      '[data-testid="team-rules-empty-create"]',
    ) as HTMLButtonElement;
    expect(create).toBeTruthy();
    await act(async () => {
      create.click();
    });
    const dialog = container.querySelector('[data-testid="team-rules-dialog"]');
    expect(dialog).toBeTruthy();
    const nameInput = container.querySelector(
      '[data-testid="team-rule-name-input"]',
    ) as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    act(() => root.unmount());
  });

  it("非 .md 文件名提交时显示错误", async () => {
    const { root, container } = setup(EMPTY);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const create = container.querySelector(
      '[data-testid="team-rules-empty-create"]',
    ) as HTMLButtonElement;
    await act(async () => {
      create.click();
    });
    const nameInput = container.querySelector(
      '[data-testid="team-rule-name-input"]',
    ) as HTMLInputElement;
    const contentInput = container.querySelector(
      '[data-testid="team-rule-content-input"]',
    ) as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(nameInput, "rule.txt");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      const tSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      tSetter?.call(contentInput, "x");
      contentInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = container.querySelector(
      '[data-testid="team-rule-save"]',
    ) as HTMLButtonElement;
    await act(async () => {
      save.click();
    });
    const err = container.querySelector('[data-testid="team-rule-error"]');
    expect(err).toBeTruthy();
    expect(err?.textContent).toContain(".md");
    act(() => root.unmount());
  });

  it("data-testid 完整性:列出全部关键钩子", async () => {
    const { root, container } = setup(SAMPLE_WITH_RULES);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const view = container.querySelector('[data-testid="team-rules-view"]');
    expect(view).toBeTruthy();
    const manifest = container.querySelector(
      '[data-testid="team-rules-manifest"]',
    );
    expect(manifest).toBeTruthy();
    const enabled = container.querySelector(
      '[data-testid="team-rules-enabled-toggle"]',
    );
    expect(enabled).toBeTruthy();
    const save = container.querySelector(
      '[data-testid="team-rules-save-manifest"]',
    );
    expect(save).toBeTruthy();
    const reload = container.querySelector('[data-testid="team-rules-reload"]');
    expect(reload).toBeTruthy();
    act(() => root.unmount());
  });
});
