/**
 * @file Diff Worker 池 Provider
 *
 * 为 `@pierre/diffs` 提供 Web Worker 渲染池：
 *
 * - **多 worker 并行**：从单一 worker 升级到 worker 池以加速大型 diff
 * - **主题同步**：`DiffWorkerThemeSync` 跟随应用主题切换 diff 主题
 * - **生命周期**：Provider 卸载时 worker 池自动释放
 *
 * ## 核心导出
 *
 * - `DiffWorkerPoolProvider`：React Provider 组件
 *
 * ## 使用场景
 *
 * - 应用顶层 Provider 树
 * - DiffPanel 外部包裹
 *
 * ## 注意事项
 *
 * - 主题切换通过 worker 的 `setRenderOptions` 异步应用
 * - 多个 DiffPanel 共用同一个池
 * - Provider 应包裹所有用到 `@pierre/diffs` 渲染的组件
 */
import { WorkerPoolContextProvider, useWorkerPool } from "@pierre/diffs/react";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { useEffect, useMemo, type ReactNode } from "react";
import { useTheme } from "../hooks/useTheme";
import { resolveDiffThemeName, type DiffThemeName } from "../lib/diffRendering";

function DiffWorkerThemeSync({ themeName }: { themeName: DiffThemeName }) {
  const workerPool = useWorkerPool();

  useEffect(() => {
    if (!workerPool) {
      return;
    }

    const current = workerPool.getDiffRenderOptions();
    if (current.theme === themeName) {
      return;
    }

    void workerPool
      .setRenderOptions({
        ...current,
        theme: themeName,
      })
      .catch(() => undefined);
  }, [themeName, workerPool]);

  return null;
}

export function DiffWorkerPoolProvider({ children }: { children?: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const diffThemeName = resolveDiffThemeName(resolvedTheme);
  const workerPoolSize = useMemo(() => {
    const cores =
      typeof navigator === "undefined" ? 4 : Math.max(1, navigator.hardwareConcurrency || 4);
    return Math.max(2, Math.min(6, Math.floor(cores / 2)));
  }, []);

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: () => new DiffsWorker(),
        poolSize: workerPoolSize,
        totalASTLRUCacheSize: 240,
      }}
      highlighterOptions={{
        theme: diffThemeName,
        tokenizeMaxLineLength: 1_000,
      }}
    >
      <DiffWorkerThemeSync themeName={diffThemeName} />
      {children}
    </WorkerPoolContextProvider>
  );
}
