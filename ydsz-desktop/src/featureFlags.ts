/**
 * @file 功能开关（Feature Flags）管理模块
 * @description 提供应用内功能开关的注册、持久化和响应式读取能力。支持两种类型的功能开关：
 * - action 类型：一次性触发动作，无开关状态
 * - toggle 类型：可开启/关闭的开关，状态持久化到 localStorage
 *
 * 使用 React 的 useSyncExternalStore 实现状态同步，
 * 支持跨标签页通过 StorageEvent 实时更新。
 */

import { useSyncExternalStore } from "react";

/**
 * 功能开关定义，支持 action 和 toggle 两种类型
 * - action: 触发一次性动作，无状态
 * - toggle: 可切换的开关，具有默认启用状态
 */
export type FeatureFlag =
  | {
      /** action 类型功能开关标识 */
      id: "trigger-action-failed-toasts";
      kind: "action";
      /** 开关显示标签 */
      label: string;
      /** 开关功能描述 */
      description: string;
    }
  | {
      /** toggle 类型功能开关标识 */
      id: ToggleFeatureFlagId;
      kind: "toggle";
      /** 开关显示标签 */
      label: string;
      /** 开关功能描述 */
      description: string;
      /** 默认是否启用 */
      defaultEnabled: boolean;
    };

/** 可切换的功能开关 ID 枚举 */
export type ToggleFeatureFlagId =
  | "persist-action-failed-debug-toasts"
  | "show-debug-task-banner"
  | "show-expanded-cursor-model-variants"
  // Work 模式能力开关
  | "work-browser-act"
  | "work-cron-persist"
  | "work-skill-mention"
  // Agent 智能体能力开关
  | "agent-worktree-isolation"
  | "agent-auto-retry"
  // CUE 语音能力开关
  | "cue-voice-polish"
  // 对话流能力开关
  | "flow-context-compaction"
  | "flow-streaming"
  // 浏览器自动化能力开关
  | "browser-automation"
  | "browser-screenshot-inject"
  // 索引与文档能力开关
  | "indexer-semantic"
  // 规则与记忆能力开关
  | "rules-team-enabled";

/** 功能开关状态映射，键为开关 ID，值为是否启用 */
type FeatureFlagState = Record<ToggleFeatureFlagId, boolean>;

/** localStorage 中功能开关数据的存储键 */
const FEATURE_FLAG_STORAGE_KEY = "ydsz-buddy:feature-flags";

/** 功能开关的默认状态 */
const DEFAULT_FEATURE_FLAG_STATE: FeatureFlagState = {
  "persist-action-failed-debug-toasts": false,
  "show-debug-task-banner": false,
  "show-expanded-cursor-model-variants": false,
  // Work 模式能力开关默认值
  "work-browser-act": false, // 浏览器自动化是敏感能力,默认关闭,用户主动开启
  "work-cron-persist": true, // CRON 持久化已稳定,默认开启
  "work-skill-mention": true, // Composer Skill 提及已稳定,默认开启
  // Agent 智能体能力开关默认值
  "agent-worktree-isolation": true, // Worktree 隔离默认开启
  "agent-auto-retry": true, // 自动重试默认开启
  // CUE 语音能力开关默认值
  "cue-voice-polish": true, // 语音润色默认开启
  // 对话流能力开关默认值
  "flow-context-compaction": true, // 上下文压缩默认开启
  "flow-streaming": true, // 流式响应默认开启
  // 浏览器自动化能力开关默认值
  "browser-automation": false, // 浏览器自动化是敏感能力,默认关闭
  "browser-screenshot-inject": true, // 截图注入默认开启
  // 索引与文档能力开关默认值
  "indexer-semantic": true, // 语义索引默认开启
  // 规则与记忆能力开关默认值
  "rules-team-enabled": true, // 团队规则默认开启
};

/** 所有功能开关的注册列表 */
export const FEATURE_FLAGS: readonly FeatureFlag[] = [
  {
    id: "trigger-action-failed-toasts",
    kind: "action",
    label: "Trigger action failed toasts",
    description: "Show stacked Git action failure toasts for local UI testing.",
  },
  {
    id: "persist-action-failed-debug-toasts",
    kind: "toggle",
    label: "Keep debug error toasts open",
    description: "Disable auto-dismiss for locally triggered error toasts.",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["persist-action-failed-debug-toasts"],
  },
  {
    id: "show-debug-task-banner",
    kind: "toggle",
    label: "Show debug task banner",
    description: "Render a local sample active task banner for UI testing.",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["show-debug-task-banner"],
  },
  {
    id: "show-expanded-cursor-model-variants",
    kind: "toggle",
    label: "Show Cursor model variants",
    description: "Show every Cursor CLI model variant as a separate picker row.",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["show-expanded-cursor-model-variants"],
  },
  // ── Work 模式能力开关 ──
  {
    id: "work-browser-act",
    kind: "toggle",
    label: "Work: Browser Automation",
    description: "启用浏览器自动化执行能力(CDP 工具集)。敏感能力,默认关闭。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["work-browser-act"],
  },
  {
    id: "work-cron-persist",
    kind: "toggle",
    label: "Work: Cron Persistence",
    description: "持久化定时任务到 .ydsz/scheduler-jobs.json,重启后自动恢复。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["work-cron-persist"],
  },
  {
    id: "work-skill-mention",
    kind: "toggle",
    label: "Work: Skill Mentions",
    description: "在 Composer 中启用 @indexer/@ppt/@html 等 Work 域 Skill 提及节点。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["work-skill-mention"],
  },
  // ── Agent 智能体能力开关 ──
  {
    id: "agent-worktree-isolation",
    kind: "toggle",
    label: "Agent: Worktree Isolation",
    description: "智能体执行时使用 Worktree 隔离,保护主分支不受污染。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["agent-worktree-isolation"],
  },
  {
    id: "agent-auto-retry",
    kind: "toggle",
    label: "Agent: Auto Retry",
    description: "智能体执行失败时自动重试,提高任务完成率。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["agent-auto-retry"],
  },
  // ── CUE 语音能力开关 ──
  {
    id: "cue-voice-polish",
    kind: "toggle",
    label: "CUE: Voice Polish",
    description: "语音输入后自动润色文本,提升表达质量。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["cue-voice-polish"],
  },
  // ── 对话流能力开关 ──
  {
    id: "flow-context-compaction",
    kind: "toggle",
    label: "Flow: Context Compaction",
    description: "上下文窗口超限时自动压缩历史消息,保持对话连贯。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["flow-context-compaction"],
  },
  {
    id: "flow-streaming",
    kind: "toggle",
    label: "Flow: Streaming Response",
    description: "启用流式响应,实时显示生成内容。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["flow-streaming"],
  },
  // ── 浏览器自动化能力开关 ──
  {
    id: "browser-automation",
    kind: "toggle",
    label: "Browser: Automation",
    description: "启用 CDP 浏览器自动化执行能力。敏感能力,默认关闭。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["browser-automation"],
  },
  {
    id: "browser-screenshot-inject",
    kind: "toggle",
    label: "Browser: Screenshot Inject",
    description: "自动将浏览器截图注入到对话上下文中。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["browser-screenshot-inject"],
  },
  // ── 索引与文档能力开关 ──
  {
    id: "indexer-semantic",
    kind: "toggle",
    label: "Indexer: Semantic Search",
    description: "启用语义向量索引,支持基于含义的代码搜索。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["indexer-semantic"],
  },
  // ── 规则与记忆能力开关 ──
  {
    id: "rules-team-enabled",
    kind: "toggle",
    label: "Rules: Team Rules",
    description: "加载 .ydsz/rules/ 目录下的团队共享规则文件。",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["rules-team-enabled"],
  },
];

/** 状态变更监听器集合 */
const listeners = new Set<() => void>();
/** 内存中的功能开关状态（用于 localStorage 不可用时的回退） */
let memoryState = DEFAULT_FEATURE_FLAG_STATE;
/** 缓存的原始 localStorage 值，用于避免重复 JSON 解析 */
let cachedRawFeatureFlagState: string | null | undefined;
/** 缓存的解析后功能开关状态 */
let cachedFeatureFlagState = DEFAULT_FEATURE_FLAG_STATE;

/** 检测当前环境是否可使用 localStorage */
function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * 将未知值标准化为功能开关状态对象
 * 对每个开关字段进行类型校验，无效值回退到默认状态
 * @param value - 待标准化的值
 * @returns 标准化后的功能开关状态
 */
function normalizeFeatureFlagState(value: unknown): FeatureFlagState {
  if (!value || typeof value !== "object") {
    return DEFAULT_FEATURE_FLAG_STATE;
  }

  const record = value as Partial<Record<ToggleFeatureFlagId, unknown>>;
  return {
    "persist-action-failed-debug-toasts":
      typeof record["persist-action-failed-debug-toasts"] === "boolean"
        ? record["persist-action-failed-debug-toasts"]
        : DEFAULT_FEATURE_FLAG_STATE["persist-action-failed-debug-toasts"],
    "show-debug-task-banner":
      typeof record["show-debug-task-banner"] === "boolean"
        ? record["show-debug-task-banner"]
        : DEFAULT_FEATURE_FLAG_STATE["show-debug-task-banner"],
    "show-expanded-cursor-model-variants":
      typeof record["show-expanded-cursor-model-variants"] === "boolean"
        ? record["show-expanded-cursor-model-variants"]
        : DEFAULT_FEATURE_FLAG_STATE["show-expanded-cursor-model-variants"],
    "work-browser-act":
      typeof record["work-browser-act"] === "boolean"
        ? record["work-browser-act"]
        : DEFAULT_FEATURE_FLAG_STATE["work-browser-act"],
    "work-cron-persist":
      typeof record["work-cron-persist"] === "boolean"
        ? record["work-cron-persist"]
        : DEFAULT_FEATURE_FLAG_STATE["work-cron-persist"],
    "work-skill-mention":
      typeof record["work-skill-mention"] === "boolean"
        ? record["work-skill-mention"]
        : DEFAULT_FEATURE_FLAG_STATE["work-skill-mention"],
    "agent-worktree-isolation":
      typeof record["agent-worktree-isolation"] === "boolean"
        ? record["agent-worktree-isolation"]
        : DEFAULT_FEATURE_FLAG_STATE["agent-worktree-isolation"],
    "agent-auto-retry":
      typeof record["agent-auto-retry"] === "boolean"
        ? record["agent-auto-retry"]
        : DEFAULT_FEATURE_FLAG_STATE["agent-auto-retry"],
    "cue-voice-polish":
      typeof record["cue-voice-polish"] === "boolean"
        ? record["cue-voice-polish"]
        : DEFAULT_FEATURE_FLAG_STATE["cue-voice-polish"],
    "flow-context-compaction":
      typeof record["flow-context-compaction"] === "boolean"
        ? record["flow-context-compaction"]
        : DEFAULT_FEATURE_FLAG_STATE["flow-context-compaction"],
    "flow-streaming":
      typeof record["flow-streaming"] === "boolean"
        ? record["flow-streaming"]
        : DEFAULT_FEATURE_FLAG_STATE["flow-streaming"],
    "browser-automation":
      typeof record["browser-automation"] === "boolean"
        ? record["browser-automation"]
        : DEFAULT_FEATURE_FLAG_STATE["browser-automation"],
    "browser-screenshot-inject":
      typeof record["browser-screenshot-inject"] === "boolean"
        ? record["browser-screenshot-inject"]
        : DEFAULT_FEATURE_FLAG_STATE["browser-screenshot-inject"],
    "indexer-semantic":
      typeof record["indexer-semantic"] === "boolean"
        ? record["indexer-semantic"]
        : DEFAULT_FEATURE_FLAG_STATE["indexer-semantic"],
    "rules-team-enabled":
      typeof record["rules-team-enabled"] === "boolean"
        ? record["rules-team-enabled"]
        : DEFAULT_FEATURE_FLAG_STATE["rules-team-enabled"],
  };
}

/**
 * 从 localStorage 读取功能开关状态
 * 使用缓存机制避免重复 JSON 解析，localStorage 不可用时回退到内存状态
 * @returns 当前的功能开关状态
 */
function readFeatureFlagState(): FeatureFlagState {
  if (!canUseLocalStorage()) {
    return memoryState;
  }

  try {
    const raw = window.localStorage.getItem(FEATURE_FLAG_STORAGE_KEY);
    if (raw === cachedRawFeatureFlagState) {
      return cachedFeatureFlagState;
    }

    cachedRawFeatureFlagState = raw;
    cachedFeatureFlagState = normalizeFeatureFlagState(raw ? JSON.parse(raw) : null);
    return cachedFeatureFlagState;
  } catch {
    return DEFAULT_FEATURE_FLAG_STATE;
  }
}

/**
 * 将功能开关状态写???localStorage 并通知所有监听器??? * 写入失败时静默处理，因为功能开关是尽力而为的开发者工具??? *
 * @param state - 要写入的功能开关状??? */
function writeFeatureFlagState(state: FeatureFlagState): void {
  memoryState = state;

  if (canUseLocalStorage()) {
    try {
      const raw = JSON.stringify(state);
      window.localStorage.setItem(FEATURE_FLAG_STORAGE_KEY, raw);
      cachedRawFeatureFlagState = raw;
      cachedFeatureFlagState = state;
    } catch {
      // Local feature flags are best-effort developer tools.
    }
  }

  for (const listener of listeners) {
    listener();
  }
}

/**
 * 订阅功能开关状态变更。同时监???localStorage ???storage 事件以支持跨标签页同步??? *
 * @param listener - 状态变更回调函??? * @returns 取消订阅的函??? */
function subscribeFeatureFlags(listener: () => void): () => void {
  listeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      listeners.delete(listener);
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === FEATURE_FLAG_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * 设置指定功能开关的启用状态，并持久化???localStorage??? *
 * @param id - 功能开???ID
 * @param enabled - 是否启用
 */
export function setFeatureFlagEnabled(id: ToggleFeatureFlagId, enabled: boolean): void {
  writeFeatureFlagState({
    ...readFeatureFlagState(),
    [id]: enabled,
  });
}

/**
 * React Hook：获取当前所有功能开关的状态??? * 使用 useSyncExternalStore 实现响应式更新，支持跨标签页同步??? *
 * @returns 当前功能开关状态映??? *
 * @example
 * ```tsx
 * const flags = useFeatureFlags();
 * if (flags["show-debug-task-banner"]) { ... }
 * ```
 */
export function useFeatureFlags(): FeatureFlagState {
  return useSyncExternalStore(
    subscribeFeatureFlags,
    readFeatureFlagState,
    () => DEFAULT_FEATURE_FLAG_STATE,
  );
}
