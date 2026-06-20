/**
 * @file 聚焦聊天上下文模�? * @description 解析当前聚焦的聊天上下文，支持单视图和分屏视图�? *              为快捷键、发现功能、线程创建等流程提供当前活跃线程和项目信息�? */

import { ThreadId, type ThreadId as ThreadIdType } from "~/contracts";
import { useParams, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { type DraftThreadState, useComposerDraftStore } from "./composerDraftStore";
import { parseDiffRouteSearch } from "./diffRouteSearch";
import {
  resolveSplitViewFocusedPaneThreadId,
  selectSplitView,
  type SplitView,
  useSplitViewStore,
} from "./splitViewStore";
import { useStore } from "./store";
import { createProjectSelector, createThreadSelector } from "./storeSelectors";
import type { Project, Thread } from "./types";

/**
 * 聚焦聊天上下文，包含当前活跃的线程、草稿和项目信息
 * @property routeThreadId - 路由参数中的线程 ID
 * @property splitView - 当前分屏视图状态，无分屏时�?null
 * @property focusedThreadId - 实际聚焦的线�?ID（考虑分屏后的结果�? * @property activeThread - 聚焦线程的完整数�? * @property activeDraftThread - 聚焦线程的草稿状�? * @property activeProject - 活跃项目数据
 * @property activeProjectId - 活跃项目 ID
 */
export interface FocusedChatContext {
  routeThreadId: ThreadIdType | null;
  splitView: SplitView | null;
  focusedThreadId: ThreadIdType | null;
  activeThread: Thread | null;
  activeDraftThread: DraftThreadState | null;
  activeProject: Project | null;
  activeProjectId: Project["id"] | null;
}

/**
 * 纯函数：解析聚焦的聊天上下文
 * 分屏视图时取分屏聚焦面板的线�?ID，否则使用路由中的线�?ID
 * @param input - 包含路由线程 ID、分屏视图、线程列表、项目列表和草稿的输入对�? * @returns 聚焦聊天上下�? */
export function resolveFocusedChatContext(input: {
  routeThreadId: ThreadIdType | null;
  splitView: SplitView | null;
  threads: readonly Thread[];
  projects: readonly Project[];
  draftThreadsByThreadId: Record<string, DraftThreadState | undefined>;
}): FocusedChatContext {
  const focusedThreadId = input.splitView
    ? resolveSplitViewFocusedPaneThreadId(input.splitView)
    : input.routeThreadId;
  const activeThread =
    focusedThreadId !== null
      ? (input.threads.find((thread) => thread.id === focusedThreadId) ?? null)
      : null;
  const activeDraftThread =
    focusedThreadId !== null ? (input.draftThreadsByThreadId[focusedThreadId] ?? null) : null;
  const activeProjectId =
    activeDraftThread?.projectId ??
    activeThread?.projectId ??
    input.splitView?.ownerProjectId ??
    null;
  const activeProject =
    activeProjectId !== null
      ? (input.projects.find((project) => project.id === activeProjectId) ?? null)
      : null;

  return {
    routeThreadId: input.routeThreadId,
    splitView: input.splitView,
    focusedThreadId,
    activeThread,
    activeDraftThread,
    activeProject,
    activeProjectId,
  };
}

/**
 * React Hook：获取当前聚焦的聊天上下�? * 自动从路由参数、分屏视图状态、全局 store 中提取并计算聚焦信息
 * @returns 聚焦聊天上下�? */
export function useFocusedChatContext(): FocusedChatContext {
  const draftThreadsByThreadId = useComposerDraftStore((store) => store.draftThreadsByThreadId);
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const routeSearch = useSearch({
    strict: false,
    select: (search) => parseDiffRouteSearch(search),
  });
  const activeSplitView = useSplitViewStore(selectSplitView(routeSearch.splitViewId ?? null));
  const focusedThreadId = useMemo(
    () => (activeSplitView ? resolveSplitViewFocusedPaneThreadId(activeSplitView) : routeThreadId),
    [activeSplitView, routeThreadId],
  );
  const activeThread = useStore(
    useMemo(() => createThreadSelector(focusedThreadId), [focusedThreadId]),
  );
  const activeDraftThread =
    focusedThreadId !== null ? (draftThreadsByThreadId[focusedThreadId] ?? null) : null;
  const activeProjectId =
    activeDraftThread?.projectId ??
    activeThread?.projectId ??
    activeSplitView?.ownerProjectId ??
    null;
  const activeProject = useStore(
    useMemo(() => createProjectSelector(activeProjectId), [activeProjectId]),
  );

  return useMemo(
    () => ({
      routeThreadId,
      splitView: activeSplitView,
      focusedThreadId,
      activeThread: activeThread ?? null,
      activeDraftThread,
      activeProject: activeProject ?? null,
      activeProjectId,
    }),
    [
      activeDraftThread,
      activeProject,
      activeProjectId,
      activeSplitView,
      activeThread,
      focusedThreadId,
      routeThreadId,
    ],
  );
}
