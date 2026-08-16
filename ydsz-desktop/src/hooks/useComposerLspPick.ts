/**
 * @file Composer LSP 预设 Pick Hook
 *
 * 当 Composer 中识别到 `@lsp` 触发器时,从后端
 * `lsp_list_presets` 拉取可用的语言服务器预设列表,并映射为
 * `ComposerCommandItem` 列表。
 *
 * ## 工作机制
 *
 * 1. **触发器识别**: 仅在 `composerTrigger.kind === "mention"` 且
 *    query 以 `lsp` 开头时启用。
 * 2. **防抖拉取**: 使用 200ms 防抖,避免用户连续按键时频繁调用后端。
 * 3. **结果排序**: 已启动的预设(active=true)排在最前,便于用户复用。
 * 4. **状态降级**: 没有结果时,返回 hint/empty。
 * 5. **错误降级**: 后端调用失败时返回 lsp-empty 提示。
 *
 * ## 使用场景
 *
 * - `useComposerCommandMenuItems` 在 `mention` 触发器下拉取 lsp 结果
 * - ChatView 主动传入当前 workspaceRoot,确保 lsp_start_server 选
 *   中后能正确启动(选中逻辑由 ChatView 接管)
 *
 * ## 注意事项
 *
 * - 该 hook 不会自动调用 `lsp_start_server`;选中后由 ChatView 决定
 *   是直接插入 @lsp token,还是先启动再插入。
 * - LSP 预设是静态的(4 种语言),所以"加载中"是网络等待而非计算。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import type { ComposerTrigger } from "../composer-logic";

/** 触发字符串(不含 `@` 前缀) */
const LSP_TRIGGER = "lsp";

/** 防抖延迟(毫秒) */
const LSP_DEBOUNCE_MS = 200;

/** 单预设结果上限(目前固定 4 个,保留扩展位) */
const LSP_RESULT_LIMIT = 16;

export interface LspPresetInfo {
  language: string;
  displayName: string;
  fileExtensions: readonly string[];
  active: boolean;
}

export interface UseComposerLspPickResult {
  items: ComposerCommandItem[];
  isLoading: boolean;
  hasError: boolean;
  query: string;
  /** 选中预设时由 ChatView 调用的回调:把预设元数据提供给 ChatView */
  selectPreset: (language: string) => LspPresetInfo | null;
}

interface ExtractedLspQuery {
  matches: boolean;
  query: string;
}

/**
 * 判断 mention 触发器是否匹配 @lsp 模式
 *
 * - `@lsp` (query === "lsp"):列出所有预设
 * - `@lsp <keywords>` (query 以 "lsp " 开头):按关键词过滤
 */
function extractLspQuery(trigger: ComposerTrigger | null): ExtractedLspQuery {
  if (!trigger || trigger.kind !== "mention") {
    return { matches: false, query: "" };
  }
  const raw = trigger.query.trim();
  if (raw === LSP_TRIGGER) {
    return { matches: true, query: "" };
  }
  if (raw.startsWith(LSP_TRIGGER) && raw.length > LSP_TRIGGER.length) {
    const remainder = raw.slice(LSP_TRIGGER.length);
    if (remainder.startsWith(" ")) {
      return { matches: true, query: remainder.slice(1).trim() };
    }
  }
  return { matches: false, query: "" };
}

/**
 * 按关键词过滤预设(命中 displayName / language / fileExtensions)
 *
 * 注意:用户在 Composer 中可能输入带前导点的扩展名(如 ".rs" / ".ts"),
 * 这里会先剥掉前导点再做匹配,避免 `.rs` vs `rs` 失配.
 */
function filterPresets(
  presets: readonly LspPresetInfo[],
  keyword: string,
): LspPresetInfo[] {
  if (!keyword) return [...presets];
  const normalized = keyword.replace(/^\./, "").toLowerCase();
  if (!normalized) return [...presets];
  return presets.filter((preset) => {
    if (preset.language.toLowerCase().includes(normalized)) return true;
    if (preset.displayName.toLowerCase().includes(normalized)) return true;
    if (preset.fileExtensions.some((ext) => ext.toLowerCase().includes(normalized))) {
      return true;
    }
    return false;
  });
}

/**
 * 把 LspPresetInfo 映射为 ComposerCommandItem 列表
 */
function mapPresetsToItems(presets: readonly LspPresetInfo[]): ComposerCommandItem[] {
  // active=true 排在最前
  const sorted = [...presets].sort((a, b) => {
    if (a.active && !b.active) return -1;
    if (b.active && !a.active) return 1;
    return a.language.localeCompare(b.language);
  });
  const limited = sorted.slice(0, LSP_RESULT_LIMIT);
  return limited.map((preset) => ({
    id: `lsp-result:${preset.language}`,
    type: "lsp-result" as const,
    language: preset.language,
    displayName: preset.displayName,
    fileExtensions: [...preset.fileExtensions],
    active: preset.active,
    label: preset.displayName,
    description: preset.active
      ? `已启动 · ${preset.fileExtensions.join(", ")}`
      : `未启动 · ${preset.fileExtensions.join(", ")}`,
  }));
}

/**
 * Composer LSP 预设 Pick hook
 *
 * @param trigger - 当前 Composer 触发器
 * @param _workspaceRoot - 当前工作区根目录(可选,目前 hook 不直接使用,
 *   但保留参数以备未来 ChatView 在 selectPreset 时启动 LSP server)
 */
export function useComposerLspPick(
  trigger: ComposerTrigger | null,
  _workspaceRoot: string | null,
): UseComposerLspPickResult {
  const { matches, query } = extractLspQuery(trigger);
  const [presets, setPresets] = useState<LspPresetInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!matches) {
      setPresets([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);

    const timer = setTimeout(() => {
      void invoke<LspPresetInfo[]>("lsp_list_presets")
        .then((response) => {
          if (cancelled || !mountedRef.current) return;
          setPresets(Array.isArray(response) ? [...response] : []);
          setIsLoading(false);
        })
        .catch((error) => {
          if (cancelled || !mountedRef.current) return;
          // eslint-disable-next-line no-console
          console.warn("[useComposerLspPick] lsp_list_presets 失败", error);
          setHasError(true);
          setPresets([]);
          setIsLoading(false);
        });
    }, LSP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matches]);

  const items = useMemo<ComposerCommandItem[]>(() => {
    if (!matches) return [];

    if (isLoading) {
      return [
        {
          id: "lsp-hint:loading",
          type: "lsp-hint",
          label: "加载 LSP 预设中…",
          description: "正在拉取语言服务器列表",
        } satisfies ComposerCommandItem,
      ];
    }

    if (hasError) {
      return [
        {
          id: "lsp-empty:error",
          type: "lsp-empty",
          label: "加载 LSP 预设失败",
          description: "请检查后端日志,或稍后重试",
        } satisfies ComposerCommandItem,
      ];
    }

    const filtered = filterPresets(presets, query);

    if (filtered.length === 0) {
      if (query) {
        return [
          {
            id: `lsp-empty:no-match:${query}`,
            type: "lsp-empty",
            label: `未找到与「${query}」匹配的 LSP 预设`,
            description: "内置支持 typescript / python / rust / go",
          } satisfies ComposerCommandItem,
        ];
      }
      return [
        {
          id: "lsp-empty:no-presets",
          type: "lsp-empty",
          label: "暂无可用 LSP 预设",
          description: "请检查 ydsz-code 的 lsp 模块是否正确构建",
        } satisfies ComposerCommandItem,
      ];
    }

    return mapPresetsToItems(filtered);
  }, [matches, isLoading, hasError, presets, query]);

  const selectPreset = (language: string): LspPresetInfo | null => {
    return presets.find((p) => p.language === language) ?? null;
  };

  return { items, isLoading, hasError, query, selectPreset };
}
