/**
 * @file Hooks Store
 * @description Workspace Hooks 持久化管理（zustand + localStorage）
 *
 * 管理用户配置的生命周期钩子列表，支持 CRUD 操作。
 * 内置引导示例 hooks，帮助用户快速上手。
 *
 * ## 持久化
 *
 * - 存储 key: `ydsz-buddy:hooks:v1`
 * - 使用 zustand/middleware persist + localStorage
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  HOOK_EVENT_NAMES,
  type HookErrorPolicy,
  type HookEvent,
  type HookHandlerType,
  type WorkspaceHook,
} from "./contracts/hooks";

const HOOKS_STORAGE_KEY = "ydsz-buddy:hooks:v1";
const HOOK_DEFAULT_TIMEOUT_SECS = 30;

// ===== 工具函数 =====

/** 生成简单 UUID */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `hook-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 获取当前 ISO 时间戳 */
function nowIso(): string {
  return new Date().toISOString();
}

// ===== 内置示例 Hooks =====

function createBuiltinHooks(): WorkspaceHook[] {
  const ts = nowIso();
  return [
    {
      id: generateId(),
      event: "workspace:opened",
      name: "打开工作区时拉取最新代码",
      enabled: false,
      handlerType: "script",
      scriptContent: '#!/bin/bash\n# 自动拉取最新代码\ngit fetch --all --prune\necho "Fetched latest from all remotes"',
      skillId: undefined,
      timeoutSecs: 30,
      errorPolicy: "continue",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: generateId(),
      event: "workspace:opened",
      name: "工作区打开欢迎提示",
      enabled: false,
      handlerType: "script",
      scriptContent:
        '#!/bin/bash\n# 输出工作区信息\necho "Workspace opened at $(date)"',
      skillId: undefined,
      timeoutSecs: 10,
      errorPolicy: "continue",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: generateId(),
      event: "session:started",
      name: "会话开始时加载项目上下文",
      enabled: false,
      handlerType: "script",
      scriptContent:
        '#!/bin/bash\n# 输出当前项目的基础信息\nif [ -f package.json ]; then\n  echo "Node.js project detected"\n  cat package.json | grep \'"name"\' | head -1\nfi',
      skillId: undefined,
      timeoutSecs: 15,
      errorPolicy: "continue",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: generateId(),
      event: "file:changed",
      name: "文件变更时自动格式化",
      enabled: false,
      handlerType: "script",
      scriptContent:
        '#!/bin/bash\n# 对变更的文件运行 prettier（需先配置）\n# prettier --write "$HOOK_FILE_PATH"\necho "File changed: $HOOK_FILE_PATH"',
      skillId: undefined,
      timeoutSecs: 20,
      errorPolicy: "continue",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: generateId(),
      event: "command:before_exec",
      name: "危险命令执行前记录日志",
      enabled: false,
      handlerType: "script",
      scriptContent:
        '#!/bin/bash\n# 记录所有执行的命令到日志文件\necho "[$(date -Iseconds)] COMMAND: $HOOK_COMMAND" >> ~/.ydsz-buddy/command-audit.log',
      skillId: undefined,
      timeoutSecs: 5,
      errorPolicy: "continue",
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

// ===== Store 定义 =====

interface HooksStoreState {
  hooks: WorkspaceHook[];
  builtInSeeded: boolean;

  // CRUD
  listHooks: () => WorkspaceHook[];
  listHooksByEvent: (event: HookEvent) => WorkspaceHook[];
  getHook: (id: string) => WorkspaceHook | undefined;
  addHook: (input: {
    event: HookEvent;
    name: string;
    handlerType: HookHandlerType;
    scriptContent?: string;
    skillId?: string;
    timeoutSecs?: number;
    errorPolicy?: HookErrorPolicy;
    enabled?: boolean;
  }) => WorkspaceHook;
  updateHook: (
    id: string,
    patch: Partial<
      Omit<WorkspaceHook, "id" | "createdAt" | "updatedAt">
    >,
  ) => boolean;
  removeHook: (id: string) => boolean;
  toggleHook: (id: string) => boolean;

  // 批量操作
  importHooks: (hooks: WorkspaceHook[]) => void;

  // 初始化内置示例
  seedBuiltinHooks: () => void;
}

/** 校验 Hook 数据合法性 */
function validateHook(hook: WorkspaceHook): string | null {
  if (!hook.id || typeof hook.id !== "string") return "Hook ID 无效";
  if (!HOOK_EVENT_NAMES.includes(hook.event)) return `无效的事件类型: ${hook.event}`;
  if (!hook.name || hook.name.length > 128) return "Hook 名称无效（1-128 字符）";
  if (!["script", "skill"].includes(hook.handlerType))
    return "Handler 类型无效";

  if (hook.handlerType === "script" && !hook.scriptContent) {
    return "Script 类型 Hook 必须提供脚本内容";
  }
  if (hook.handlerType === "skill" && !hook.skillId) {
    return "Skill 类型 Hook 必须提供 Skill ID";
  }
  if ((hook.timeoutSecs ?? HOOK_DEFAULT_TIMEOUT_SECS) < 1 || (hook.timeoutSecs ?? HOOK_DEFAULT_TIMEOUT_SECS) > 300) {
    return "超时时间必须在 1-300 秒之间";
  }
  return null;
}

export const useHooksStore = create<HooksStoreState>()(
  persist(
    (set, get) => ({
      hooks: [],
      builtInSeeded: false,

      listHooks: () => get().hooks,

      listHooksByEvent: (event) => get().hooks.filter((h) => h.event === event),

      getHook: (id) => get().hooks.find((h) => h.id === id),

      addHook: (input) => {
        const ts = nowIso();
        const newHook: WorkspaceHook = {
          id: generateId(),
          event: input.event,
          name: input.name,
          enabled: input.enabled ?? true,
          handlerType: input.handlerType,
          scriptContent: input.scriptContent,
          skillId: input.skillId,
          timeoutSecs: input.timeoutSecs ?? 30,
          errorPolicy: input.errorPolicy ?? "continue",
          createdAt: ts,
          updatedAt: ts,
        };

        const error = validateHook(newHook);
        if (error) {
          console.warn(`[hooksStore] Hook 校验失败: ${error}`);
          throw new Error(error);
        }

        set((state) => ({
          hooks: [...state.hooks, newHook],
        }));

        return newHook;
      },

      updateHook: (id, patch) => {
        let updated = false;
        set((state) => {
          const idx = state.hooks.findIndex((h) => h.id === id);
          if (idx === -1) return state;

          const current = state.hooks[idx];
          const nextHook: WorkspaceHook = {
            ...current,
            ...patch,
            id: current.id,
            createdAt: current.createdAt,
            updatedAt: nowIso(),
          };

          const error = validateHook(nextHook);
          if (error) {
            console.warn(`[hooksStore] Hook 更新校验失败: ${error}`);
            return state;
          }

          updated = true;
          const next = [...state.hooks];
          next[idx] = nextHook;
          return { hooks: next };
        });
        return updated;
      },

      removeHook: (id) => {
        let removed = false;
        set((state) => {
          const idx = state.hooks.findIndex((h) => h.id === id);
          if (idx === -1) return state;
          removed = true;
          return { hooks: state.hooks.filter((h) => h.id !== id) };
        });
        return removed;
      },

      toggleHook: (id) => {
        let toggled = false;
        set((state) => {
          const idx = state.hooks.findIndex((h) => h.id === id);
          if (idx === -1) return state;
          toggled = true;
          const next = [...state.hooks];
          next[idx] = {
            ...next[idx],
            enabled: !next[idx].enabled,
            updatedAt: nowIso(),
          };
          return { hooks: next };
        });
        return toggled;
      },

      importHooks: (hooks) => {
        const valid = hooks.filter((h) => !validateHook(h));
        set((state) => ({
          hooks: [...state.hooks, ...valid],
        }));
      },

      seedBuiltinHooks: () => {
        if (get().builtInSeeded) return;
        const builtins = createBuiltinHooks();
        set((state) => ({
          hooks: [...state.hooks, ...builtins],
          builtInSeeded: true,
        }));
      },
    }),
    {
      name: HOOKS_STORAGE_KEY,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return window.localStorage;
      }),
      version: 1,
      partialize: (state) => ({
        hooks: state.hooks,
        builtInSeeded: state.builtInSeeded,
      }),
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as Partial<HooksStoreState>;
        return {
          ...currentState,
          hooks: Array.isArray(p.hooks) ? p.hooks : [],
          builtInSeeded: p.builtInSeeded ?? false,
        };
      },
    },
  ),
);
