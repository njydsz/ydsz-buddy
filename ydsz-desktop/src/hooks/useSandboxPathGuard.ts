/**
 * @file useSandboxPathGuard.ts
 * @description P0-3: 沙箱路径守卫 Hook
 *
 * 提供 proactive 路径检查 + 确认对话框交互：
 * - `guardPath(path, write)`: 检查路径是否在授权范围内，如不在则弹出确认对话框
 * - `pendingRequest`: 当前待确认的请求（供 SandboxAccessConfirmDialog 使用）
 * - `resolveRequest(decision)`: 处理用户决策
 *
 * 同时监听后端 Tauri 事件 `sandbox://access-denied`，
 * 当后端检测到未授权访问时自动弹出对话框。
 *
 * 使用方式：
 * ```tsx
 * const { guardPath, dialogElement } = useSandboxPathGuard();
 *
 * // 在 Agent 文件操作前检查
 * const allowed = await guardPath("/some/path", true);
 * if (!allowed) return;
 *
 * // 渲染对话框（放在组件 JSX 中）
 * return <>{dialogElement}</>;
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { SandboxAccessRequest, SandboxAccessDecision } from "../components/SandboxAccessConfirmDialog";

// ============================================================================

// Tauri invoke 动态加载
interface TauriInvokeModule {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

let tauriModulePromise: Promise<TauriInvokeModule | null> | null = null;

async function loadTauriInvoke(): Promise<TauriInvokeModule | null> {
  if (tauriModulePromise) return tauriModulePromise;
  tauriModulePromise = (async () => {
    try {
      const mod = await import("@tauri-apps/api/core");
      return mod as TauriInvokeModule;
    } catch {
      return null;
    }
  })();
  return tauriModulePromise;
}

/** 临时授权的路径集合（仅本次会话有效） */
const tempAllowedPaths = new Set<string>();

export interface UseSandboxPathGuardResult {
  /** 当前待确认的请求 */
  pendingRequest: SandboxAccessRequest | null;
  /** 处理用户决策 */
  resolveRequest: (decision: SandboxAccessDecision, request: SandboxAccessRequest) => Promise<void>;
  /**
   * 检查路径是否在授权范围内
   *
   * @param path 要检查的路径
   * @param write 是否需要写入权限
   * @param source 触发来源描述
   * @returns true 表示允许访问，false 表示被拒绝
   */
  guardPath: (path: string, write?: boolean, source?: string) => Promise<boolean>;
  /** 渲染对话框的 React 元素（需放在组件树中） */
}

/**
 * 沙箱路径守卫 Hook
 *
 * 在组件中使用，提供路径预检查和确认对话框交互。
 * 当路径不在授权范围内时，弹出 SandboxAccessConfirmDialog 让用户决策。
 */
export function useSandboxPathGuard(): UseSandboxPathGuardResult {
  const [pendingRequest, setPendingRequest] = useState<SandboxAccessRequest | null>(null);
  const resolveRef = useRef<((allowed: boolean) => void) | null>(null);

  // 监听后端 Tauri 事件 sandbox://access-denied
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        const mod = await loadTauriInvoke();
        if (!mod) return;
        // 动态导入 Tauri event 模块
        const eventMod = await import("@tauri-apps/api/event");
        unlisten = await eventMod.listen<SandboxAccessRequest>(
          "sandbox://access-denied",
          (event) => {
            setPendingRequest(event.payload);
          },
        );
      } catch {
        // Tauri 不可用时静默
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // 处理用户决策
  const resolveRequest = useCallback(
    async (decision: SandboxAccessDecision, request: SandboxAccessRequest) => {
      setPendingRequest(null);

      let allowed = false;

      if (decision === "allow") {
        // 永久授权：调用后端添加授权目录
        try {
          const mod = await loadTauriInvoke();
          if (mod) {
            await mod.invoke("code_sandbox_add_authorized_dir", {
              dir: request.path,
              readOnly: !request.write,
            });
          }
        } catch {
          // 后端调用失败，仍然允许本次访问
        }
        allowed = true;
      } else if (decision === "allow-once") {
        // 临时授权：仅本次会话有效
        tempAllowedPaths.add(`${request.write ? "w" : "r"}:${request.path}`);
        allowed = true;
      } else {
        // deny
        allowed = false;
      }

      // 解决等待中的 Promise
      if (resolveRef.current) {
        resolveRef.current(allowed);
        resolveRef.current = null;
      }
    },
    [],
  );

  // 检查路径是否在授权范围内
  const guardPath = useCallback(
    async (path: string, write = false, source?: string): Promise<boolean> => {
      // 1. 检查临时授权
      const tempKey = `${write ? "w" : "r"}:${path}`;
      if (tempAllowedPaths.has(tempKey)) {
        return true;
      }
      // 读取操作也需要检查读授权
      if (!write) {
        const tempReadKey = `r:${path}`;
        if (tempAllowedPaths.has(tempReadKey)) {
          return true;
        }
      }

      // 2. 调用后端检查路径
      try {
        const mod = await loadTauriInvoke();
        if (!mod) {
          // 非 Tauri 环境，默认允许
          return true;
        }
        const isAuthorized = await mod.invoke<boolean>("code_sandbox_check_path", {
          path,
          write,
        });

        if (isAuthorized) {
          return true;
        }

        // 3. 路径未授权，弹出确认对话框
        return new Promise<boolean>((resolve) => {
          resolveRef.current = resolve;
          setPendingRequest({ path, write, source: source ?? `agent:${write ? "file_write" : "file_read"}` });
        });
      } catch {
        // 检查失败，默认允许（不阻塞用户操作）
        return true;
      }
    },
    [],
  );

  return {
    pendingRequest,
    resolveRequest,
    guardPath,
  };
}
