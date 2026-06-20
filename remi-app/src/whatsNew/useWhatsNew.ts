/**
 * @file "新增内容" React Hook
 * @description 驱动"新增内容"两阶段展示界面的 React Hook：
 *   1. 左下角的小浮窗卡片，宣传新版本。
 *   2. 包含发布说明的弹窗，仅在用户点击卡片时打开。
 * 将"已查看此版本"标记持久化到 localStorage，使浮窗关闭后不再出现。
 * @layer Hook 层——连接 `logic.ts`（纯规则）、更新日志数据和浮窗 + 弹窗组件
 */

import { Schema } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { APP_VERSION } from "../branding";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { WHATS_NEW_ENTRIES } from "./entries";
import {
  resolveWhatsNewState,
  type WhatsNewEntry,
  type WhatsNewInputs,
  type WhatsNewState,
} from "./logic";

const WHATS_NEW_STORAGE_KEY = "remicode:whats-new:v1";

// 使用 Schema.NullOr 的 Option<string> 保持磁盘上"从未查看"标记的显式性。
// 省略该字段（undefined）在 JSON 往返中会丢失；`null` 在重载后保持不变。
const WhatsNewStorageSchema = Schema.Struct({
  lastSeenVersion: Schema.NullOr(Schema.String),
});
type WhatsNewStorage = typeof WhatsNewStorageSchema.Type;

const INITIAL_STORAGE: WhatsNewStorage = { lastSeenVersion: null };

/** useWhatsNew Hook 返回结果 */
export interface UseWhatsNewResult {
  /**
   * 匹配当前安装版本的发布条目。`null` 表示"无需展示"——
   * 静默引导或无操作。为 null 时，浮窗和弹窗均不应渲染。
   */
  readonly currentEntry: WhatsNewEntry | null;
  /** 完整的精选历史，按最新优先排序，用于更新日志视图 */
  readonly allEntries: readonly WhatsNewEntry[];
  /** 浮窗/弹窗正在宣传的版本号（当前安装版本） */
  readonly currentVersion: string;
  /** 是否应渲染左下角的"新增: ..."卡片 */
  readonly isPopoutVisible: boolean;
  /** 是否应渲染更新后发布说明弹窗为打开状态 */
  readonly isDialogOpen: boolean;
  /**
   * 响应用户点击浮窗卡片而打开弹窗。此处不标记更新为已读——
   * 确认卡片不等于确认说明。`onDialogOpenChange(false)` 处理标记已读。
   */
  readonly openDialog: () => void;
  /**
   * 通过 ✕ 按钮关闭浮窗。此操作标记版本为已读，且不再重新提示——
   * 即使用户从未打开弹窗。与 IndieDevs 行为一致：点击 ✕ 表示"我不关心"。
   */
  readonly dismissPopout: () => void;
  /**
   * 弹窗的关闭处理器（base-ui `onOpenChange(open)` 形式）。
   * 弹窗关闭时，持久化已读标记并隐藏浮窗，避免用户刚操作过的卡片继续显示。
   */
  readonly onDialogOpenChange: (open: boolean) => void;
}

/**
 * "新增内容"更新后展示界面的驱动 Hook
 *
 * @description 行为摘要（参见 `resolveWhatsNewState` 了解规则）：
 *   - 首次启动——静默记录当前版本，不显示浮窗。
 *   - 用户已是最新（或版本超前）——不显示浮窗。
 *   - 用户升级且有精选说明——显示浮窗卡片。
 *   - 用户升级但无精选说明——静默推进标记。
 *
 * 弹窗从不自动打开——仅通过点击浮窗卡片触发。
 */
export function useWhatsNew(options?: {
  readonly entries?: readonly WhatsNewEntry[];
  readonly currentVersion?: string;
}): UseWhatsNewResult {
  const entries = options?.entries ?? WHATS_NEW_ENTRIES;
  const currentVersion = options?.currentVersion ?? APP_VERSION;

  const [storage, setStorage] = useLocalStorage(
    WHATS_NEW_STORAGE_KEY,
    INITIAL_STORAGE,
    WhatsNewStorageSchema,
  );

  // 在每次挂载时使用初始存储值快照决策，使更新 localStorage
  // （如确认弹窗）不会在动画仍在运行时翻转 UI。
  const initialStorageRef = useRef(storage);
  const initialState = useMemo<WhatsNewState>(
    () =>
      resolveWhatsNewState({
        entries,
        currentVersion,
        lastSeenVersion: initialStorageRef.current.lastSeenVersion,
      } satisfies WhatsNewInputs),
    [entries, currentVersion],
  );

  // 浮窗仅在有内容展示时开始可见
  const [isPopoutVisible, setIsPopoutVisible] = useState(initialState.kind === "show");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // 静默引导（首次启动或本次升级无精选说明）：
  // 在后台推进标记，使下次升级能正确检测。在 effect 中执行，确保每次挂载仅触及存储一次。
  useEffect(() => {
    if (initialState.kind === "silent-bootstrap") {
      setStorage({ lastSeenVersion: initialState.nextLastSeenVersion });
    }
  }, [initialState, setStorage]);

  const currentEntry = useMemo<WhatsNewEntry | null>(
    () => (initialState.kind === "show" ? initialState.currentEntry : null),
    [initialState],
  );

  const allEntries = useMemo<readonly WhatsNewEntry[]>(
    () => (initialState.kind === "show" ? initialState.allEntries : []),
    [initialState],
  );

  const markSeen = useCallback(() => {
    if (initialState.kind === "show") {
      setStorage({ lastSeenVersion: initialState.nextLastSeenVersion });
    }
  }, [initialState, setStorage]);

  const openDialog = useCallback(() => {
    // 仅打开弹窗。用户即将阅读说明——暂不标记已读；
    // 标记在弹窗关闭时执行。
    setIsDialogOpen(true);
  }, []);

  const dismissPopout = useCallback(() => {
    // 卡片上的 ✕：视为"我已确认此更新"。标记已读并永久隐藏浮窗（此版本内）。
    setIsPopoutVisible(false);
    markSeen();
  }, [markSeen]);

  const onDialogOpenChange = useCallback(
    (open: boolean) => {
      setIsDialogOpen(open);
      if (!open) {
        // 关闭弹窗 = 已读完说明。同时隐藏浮窗，
        // 避免用户已明确操作后"点击查看"提示继续残留。
        setIsPopoutVisible(false);
        markSeen();
      }
    },
    [markSeen],
  );

  return {
    currentEntry,
    allEntries,
    currentVersion,
    isPopoutVisible,
    isDialogOpen,
    openDialog,
    dismissPopout,
    onDialogOpenChange,
  };
}
