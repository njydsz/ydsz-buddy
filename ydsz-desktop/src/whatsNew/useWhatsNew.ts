/**
 * @fileoverview "What's New" 功能 React Hook
 * @description 驱动两阶段"What's New"界面的 React Hook:
 *   1. 一个小型弹出卡片(左下角),宣传新版本。
 *   2. 一个包含版本说明的对话框,仅在用户点击卡片时打开。
 *              使用 localStorage 持久化"已阅读此版本"标记,以便在关闭后不会再次弹出。
 * @layer Hook 层 —— 连接 `logic.ts`(纯规则)、更新日志数据和弹出卡片/对话框组件。
 *
 * @remarks
 * 行为概要(参见 `resolveWhatsNewState` 规则):
 * - 首次启动 —— 静默记录当前版本,不显示弹出卡片。
 * - 用户已在最新版本(或更高) —— 不显示弹出卡片。
 * - 用户升级且有精选说明 —— 显示弹出卡片。
 * - 用户升级但没有精选说明 —— 静默推进标记。
 *
 * 对话框永远不会自动打开 —— 仅通过弹出卡片点击打开。
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

const WHATS_NEW_STORAGE_KEY = "ydsz-buddy:whats-new:v1";

// Using an Option<string> via Schema.NullOr keeps the "never seen" sentinel
// explicit on disk. Omitting the field (undefined) would round-trip poorly
// through JSON; `null` stays faithful across reloads.
const WhatsNewStorageSchema = Schema.Struct({
  lastSeenVersion: Schema.NullOr(Schema.String),
});
type WhatsNewStorage = typeof WhatsNewStorageSchema.Type;

const INITIAL_STORAGE: WhatsNewStorage = { lastSeenVersion: null };

/**
 * useWhatsNew Hook 返回结果
 * @description 包含"What's New"功能所需的所有状态和回调
 */
export interface UseWhatsNewResult {
  /**
   * 匹配安装构建的版本条目。当为 null 时表示"没有什么要宣传的"
   * —— 静默引导或空操作。当为 null 时,弹出卡片和对话框都不应该渲染。
   */
  readonly currentEntry: WhatsNewEntry | null;
  /** 完整的精选历史记录,按版本降序排列,用于更新日志视图。 */
  readonly allEntries: readonly WhatsNewEntry[];
  /** 弹出卡片/对话框正在宣布的版本(安装的构建)。 */
  readonly currentVersion: string;
  /** 是否应该渲染左下角的"新: ..."卡片。 */
  readonly isPopoutVisible: boolean;
  /** 是否应该渲染更新后版本说明对话框。 */
  readonly isDialogOpen: boolean;
  /**
   * 在响应用户点击弹出卡片时打开对话框。我们这里不标记为已读
   * —— 承认卡片不等于承认说明。`onDialogOpenChange(false)` 处理那个。
   */
  readonly openDialog: () => void;
  /**
   * 通过卡片的 ✕ 按钮关闭弹出卡片。这将版本标记为已读,
   * 永远不会重新提示 —— 即使用户从未打开对话框。
   * 匹配 IndieDevs 行为:点击 X 是一个深思熟虑的"我不关心"。
   */
  readonly dismissPopout: () => void;
  /**
   * 对话框的关闭处理程序(base-ui `onOpenChange(open)` 形状)。
   * 当对话框关闭时,保存已读标记并隐藏弹出卡片,
   * 这样用户就不会被他们刚刚操作的卡片打扰。
   */
  readonly onDialogOpenChange: (open: boolean) => void;
}

/**
 * 驱动"What's New"更新后界面的 Hook
 * @description 管理弹出卡片和对话框的显示逻辑,处理版本检测和本地存储持久化
 * @param options - 可选配置项
 * @param options.entries - 更新日志条目列表,默认为 WHATS_NEW_ENTRIES
 * @param options.currentVersion - 当前应用版本,默认为 APP_VERSION
 * @returns 包含状态和回调的对象,用于渲染"What's New"界面
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

  // Snapshot the decision once per mount using the initial storage value so
  // that updating localStorage (e.g. acknowledging the dialog) doesn't flip
  // the UI back and forth while animations are still running.
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

  // The popout starts visible only when we actually have something to show.
  const [isPopoutVisible, setIsPopoutVisible] = useState(initialState.kind === "show");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Silent bootstrap (first launch or no curated notes for this upgrade):
  // advance the marker in the background so the next upgrade is correctly
  // detected. Done in an effect so we only touch storage once per mount.
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
    // Just open the dialog. The user is about to read the notes —don't mark
    // as seen yet; that happens on dialog close.
    setIsDialogOpen(true);
  }, []);

  const dismissPopout = useCallback(() => {
    // X on the card: treat as "I've acknowledged this update". Mark as seen
    // and hide the popout forever (for this version).
    setIsPopoutVisible(false);
    markSeen();
  }, [markSeen]);

  const onDialogOpenChange = useCallback(
    (open: boolean) => {
      setIsDialogOpen(open);
      if (!open) {
        // Dismissing the dialog = finished reading the notes. Hide the
        // popout too so we don't leave the "click me" affordance lingering
        // after the user clearly engaged.
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
