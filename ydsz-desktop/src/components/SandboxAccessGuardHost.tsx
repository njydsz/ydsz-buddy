/**
 * @file SandboxAccessGuardHost.tsx
 * @description P0-3: 沙箱访问守卫全局宿主组件
 *
 * 职责：
 * - 全局监听后端 `sandbox://access-denied` 事件
 * - 渲染 SandboxAccessConfirmDialog 供用户决策
 * - 将 guardPath 函数暴露到 window.__ydszSandboxGuard，供其他模块主动调用
 *
 * 挂载位置：__root.tsx 中与 EventRouter / CrashRecoveryHost 同级
 */

import { useEffect } from "react";
import {
  SandboxAccessConfirmDialog,
  type SandboxAccessDecision,
  type SandboxAccessRequest,
} from "./SandboxAccessConfirmDialog";
import { useSandboxPathGuard } from "../hooks/useSandboxPathGuard";

declare global {
  interface Window {
    __ydszSandboxGuard?: {
      guardPath: (path: string, write?: boolean, source?: string) => Promise<boolean>;
    };
  }
}

export function SandboxAccessGuardHost() {
  const { pendingRequest, resolveRequest, guardPath } = useSandboxPathGuard();

  // 将 guardPath 暴露到全局，供非 React 模块（如 store / RPC handler）调用
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__ydszSandboxGuard = { guardPath };
    }
    return () => {
      if (typeof window !== "undefined") {
        delete window.__ydszSandboxGuard;
      }
    };
  }, [guardPath]);

  const handleResolve = async (
    decision: SandboxAccessDecision,
    request: SandboxAccessRequest,
  ) => {
    await resolveRequest(decision, request);
  };

  return (
    <SandboxAccessConfirmDialog
      request={pendingRequest}
      onResolve={handleResolve}
    />
  );
}
