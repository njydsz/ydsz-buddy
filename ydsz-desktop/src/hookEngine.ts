/**
 * @file Hook Engine
 * @description Workspace Hooks 生命周期钩子引擎
 *
 * 负责：
 * 1. 监听应用生命周期事件
 * 2. 匹配对应 event 的已启用 hooks
 * 3. 执行（script 类型 → 调用 Tauri command 在 shell 中运行；skill 类型 → 调用对应 Skill）
 * 4. 超时处理
 * 5. 错误处理（根据 error_policy 决定是否中断后续）
 *
 * ## 架构
 *
 * - 使用 EventEmitter 模式，对外暴露 emit(event, context) 接口
 * - 应用层在合适时机调用 emit()，如 workspaceStore 的 setActiveWorkspace
 * - Hook 引擎异步执行，不阻塞主流程
 * - 执行日志通过回调推送给 UI
 */

import {
  type HookEvent,
  type HookExecutionContext,
  type HookExecutionResult,
  type HookExecutionStatus,
  type WorkspaceHook,
} from "./contracts/hooks";
import { useHooksStore } from "./hooksStore";

// ===== 事件发射器 =====

type HookEventListener = (
  event: HookEvent,
  context: HookExecutionContext,
) => void;

/** Hook 执行完成回调 */
type HookExecCallback = (result: HookExecutionResult) => void;

class HookEngine {
  private listeners: Set<HookEventListener> = new Set();
  private execCallbacks: Set<HookExecCallback> = new Set();
  private initialized = false;
  private fileChangeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly FILE_CHANGE_DEBOUNCE_MS = 500;

  /** 注册事件监听器 */
  onEvent(listener: HookEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 注册执行完成回调 */
  onExecResult(callback: HookExecCallback): () => void {
    this.execCallbacks.add(callback);
    return () => {
      this.execCallbacks.delete(callback);
    };
  }

  /** 初始化引擎（注册内置事件触发点） */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.setupBuiltinTriggers();
    console.info("[HookEngine] 初始化完成");
  }

  /** 销毁引擎 */
  destroy(): void {
    this.initialized = false;
    this.listeners.clear();
    this.execCallbacks.clear();
    // 清理所有文件变更防抖定时器
    for (const timer of this.fileChangeTimers.values()) {
      clearTimeout(timer);
    }
    this.fileChangeTimers.clear();
  }

  /**
   * 触发 Hook 事件
   * @param event - 事件名称
   * @param partialContext - 部分上下文（自动补充 triggerId 和 timestamp）
   */
  emit(
    event: HookEvent,
    partialContext?: Omit<HookExecutionContext, "triggerId" | "timestamp">,
  ): void {
    if (!this.initialized) {
      console.warn("[HookEngine] 引擎未初始化，忽略事件:", event);
      return;
    }

    const context: HookExecutionContext = {
      event,
      triggerId: generateTriggerId(),
      timestamp: new Date().toISOString(),
      ...partialContext,
    };

    // 通知所有监听器
    for (const listener of this.listeners) {
      try {
        listener(event, context);
      } catch (err) {
        console.warn("[HookEngine] 监听器执行异常:", err);
      }
    }

    // 匹配并执行 hooks
    void this.executeHooks(event, context);
  }

  /** 触发文件变更事件（带防辩） */
  emitFileChange(filePath: string, workspacePath?: string): void {
    const key = filePath;
    const existing = this.fileChangeTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.fileChangeTimers.delete(key);
      this.emit("file:changed", { filePath, workspacePath });
    }, this.FILE_CHANGE_DEBOUNCE_MS);

    this.fileChangeTimers.set(key, timer);
  }

  // ===== 内部执行逻辑 =====

  private async executeHooks(
    event: HookEvent,
    context: HookExecutionContext,
  ): Promise<void> {
    const hooks = useHooksStore.getState().listHooksByEvent(event);
    const enabledHooks = hooks.filter((h) => h.enabled);

    if (enabledHooks.length === 0) return;

    console.info(
      `[HookEngine] 事件 ${event} 匹配到 ${enabledHooks.length} 个 Hook`,
    );

    let shouldAbort = false;

    for (const hook of enabledHooks) {
      if (shouldAbort) {
        console.info(`[HookEngine] 因前序 Hook 设置了 abort 策略，跳过: ${hook.name}`);
        this.notifyResult({
          hookId: hook.id,
          hookName: hook.name,
          event,
          status: "skipped",
          durationMs: 0,
          errorMessage: "前序 Hook 设置为 abort 策略",
        });
        continue;
      }

      const result = await this.executeSingleHook(hook, context);
      this.notifyResult(result);

      if (result.status === "error" && hook.errorPolicy === "abort") {
        console.warn(`[HookEngine] Hook "${hook.name}" 失败且策略为 abort，中断后续`);
        shouldAbort = true;
      }
    }
  }

  private async executeSingleHook(
    hook: WorkspaceHook,
    context: HookExecutionContext,
  ): Promise<HookExecutionResult> {
    const startTime = performance.now();

    try {
      if (hook.handlerType === "script") {
        return await this.executeScriptHook(hook, context, startTime);
      } else {
        return await this.executeSkillHook(hook, context, startTime);
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMessage = err instanceof Error ? err.message : String(err);

      return {
        hookId: hook.id,
        hookName: hook.name,
        event: context.event,
        status: "error",
        durationMs,
        errorMessage,
      };
    }
  }

  private async executeScriptHook(
    hook: WorkspaceHook,
    context: HookExecutionContext,
    startTime: number,
  ): Promise<HookExecutionResult> {
    const scriptContent = hook.scriptContent ?? "";
    const timeoutMs = hook.timeoutSecs * 1000;

    // 环境变量
    const env: Record<string, string> = {
      HOOK_EVENT: context.event,
      HOOK_TRIGGER_ID: context.triggerId,
      HOOK_TIMESTAMP: context.timestamp,
      ...(context.workspaceId ? { HOOK_WORKSPACE_ID: context.workspaceId } : {}),
      ...(context.workspacePath
        ? { HOOK_WORKSPACE_PATH: context.workspacePath }
        : {}),
      ...(context.sessionId ? { HOOK_SESSION_ID: context.sessionId } : {}),
      ...(context.filePath ? { HOOK_FILE_PATH: context.filePath } : {}),
      ...(context.command ? { HOOK_COMMAND: context.command } : {}),
    };

    // 使用 AbortController 实现超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await invokeHookScript(scriptContent, env, controller.signal);
      clearTimeout(timeoutId);

      const durationMs = Math.round(performance.now() - startTime);

      if (result.timedOut) {
        return {
          hookId: hook.id,
          hookName: hook.name,
          event: context.event,
          status: "timeout",
          durationMs,
          errorMessage: `执行超时 (${hook.timeoutSecs}s)`,
        };
      }

      return {
        hookId: hook.id,
        hookName: hook.name,
        event: context.event,
        status: result.exitCode === 0 ? "success" : "error",
        durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        errorMessage:
          result.exitCode !== 0
            ? `退出码 ${result.exitCode}: ${result.stderr || "未知错误"}`
            : undefined,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const durationMs = Math.round(performance.now() - startTime);

      if (err instanceof Error && err.name === "AbortError") {
        return {
          hookId: hook.id,
          hookName: hook.name,
          event: context.event,
          status: "timeout",
          durationMs,
          errorMessage: `执行超时 (${hook.timeoutSecs}s)`,
        };
      }

      throw err;
    }
  }

  private async executeSkillHook(
    hook: WorkspaceHook,
    context: HookExecutionContext,
    startTime: number,
  ): Promise<HookExecutionResult> {
    // 预留 Skill 调用接入点
    // TODO: 接入 Skill 运行时系统
    console.info(
      `[HookEngine] Skill Hook "${hook.name}" (skill: ${hook.skillId}) — Skill 调用暂为存根`,
    );

    const durationMs = Math.round(performance.now() - startTime);

    return {
      hookId: hook.id,
      hookName: hook.name,
      event: context.event,
      status: "success",
      durationMs,
      stdout: "Skill 调用已接受（存根模式）",
    };
  }

  /** 内置事件触发点设置（预留扩展接口） */
  private setupBuiltinTriggers(): void {
    // 此处预留：监听 workspaceStore 的 setActiveWorkspace 等
    // 实际集成在 App 初始化阶段通过调用 hookEngine.emit() 实现
    console.info("[HookEngine] 内置事件触发点已注册（等待 App 层集成）");
  }

  private notifyResult(result: HookExecutionResult): void {
    for (const cb of this.execCallbacks) {
      try {
        cb(result);
      } catch (err) {
        console.warn("[HookEngine] 结果回调异常:", err);
      }
    }
  }
}

// ===== 脚本执行适配层 =====

interface ScriptResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * 调用 Tauri 命令执行 Hook 脚本
 *
 * 在 Tauri 桌面端，调用 `hook_run_script` 命令将脚本发送到 Rust 后端，
 * 由 Rust 在子进程中执行。在 Web/开发模式下，返回模拟结果。
 */
async function invokeHookScript(
  scriptContent: string,
  env: Record<string, string>,
  signal: AbortSignal,
): Promise<ScriptResult> {
  // 检查是否在 Tauri 环境
  const isTauriEnv =
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__;

  if (!isTauriEnv) {
    // 开发/Web 模式：模拟执行
    console.info("[HookEngine] 非 Tauri 环境，模拟执行脚本");
    if (signal.aborted) {
      return { exitCode: 1, stdout: "", stderr: "Aborted", timedOut: true };
    }
    return {
      exitCode: 0,
      stdout: "[模拟] 脚本执行成功",
      stderr: "",
      timedOut: false,
    };
  }

  try {
    // Tauri 2.x 环境：调用后端命令
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exit_code: number;
      stdout: string;
      stderr: string;
      timed_out: boolean;
    }>("hook_run_script", {
      scriptContent,
      env,
    });

    return {
      exitCode: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: result.timed_out,
    };
  } catch (err) {
    console.error("[HookEngine] Tauri 调用失败:", err);
    return {
      exitCode: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      timedOut: false,
    };
  }
}

// ===== 工具函数 =====

function generateTriggerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ===== 单例导出 =====

let engineInstance: HookEngine | null = null;

/** 获取 HookEngine 单例 */
export function getHookEngine(): HookEngine {
  if (!engineInstance) {
    engineInstance = new HookEngine();
  }
  return engineInstance;
}

export type { HookEngine };
