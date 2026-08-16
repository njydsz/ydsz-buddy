/**
 * @file 应用路由器
 * @description 创建并配置 TanStack Router 实例，集成 React Query 和 Zustand Store Provider，
 * 为所有路由提供统一的上下文包装。
 */

import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { StoreProvider } from "./store";
import { useMarketplaceUrlBootSync } from "./hooks/useSkillMarketplace";

/**
 * 路由器根组件：包裹 store + 启动同步副作用
 *
 * - `useMarketplaceUrlBootSync` 必须在 `StoreProvider` 内部挂载，
 *   才能访问到 localStorage 中的 marketplaceUrl。
 * - 该 hook 在首次渲染后即触发一次性同步，失败时只记日志不抛错。
 */
function RouterWrap({ children }: { children: React.ReactNode }) {
  useMarketplaceUrlBootSync();
  return createElement(StoreProvider, null, children);
}

/** 路由历史实例的类型，从 createRouter 参数中推导 */
type RouterHistory = NonNullable<Parameters<typeof createRouter>[0]["history"]>;

/**
 * 创建应用路由器实例
 *
 * @description 初始化 React Query 客户端和 TanStack Router，
 * 并通过 Wrap 属性为所有路由组件注入 QueryClientProvider 和 StoreProvider。
 *
 * @param history - 路由历史实例，由调用方提供（浏览器历史或哈希历史）
 * @returns 配置完成的 TanStack Router 实例
 *
 * @example
 * ```ts
 * const router = getRouter(createBrowserHistory());
 * // 在 <RouterProvider router={router} /> 中使用
 * ```
 */
export function getRouter(history: RouterHistory) {
  const queryClient = new QueryClient();

  return createRouter({
    routeTree,
    history,
    context: {
      queryClient,
    },
    Wrap: ({ children }) =>
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(RouterWrap, null, children),
      ),
  });
}

/** 应用路由器类型，用于 TanStack Router 的类型注册 */
export type AppRouter = ReturnType<typeof getRouter>;

// 向 TanStack Router 注册路由器类型，使路由钩子获得完整类型推导
declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
