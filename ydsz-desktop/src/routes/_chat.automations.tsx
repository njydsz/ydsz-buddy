/**
 * @file 自动化路由模块
 * @description 在共享聊天外壳下注册自动化视图路由
 * @layer 路由层
 * @exports Route - 自动化路由配置
 */

import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

/**
 * 自动化路由配置
 * @description 定义 /_chat/automations 路径的路由，渲染自动化视图组件
 */
export const Route = createFileRoute("/_chat/automations")({
  component: lazyRouteComponent(() =>
    import("./_chat.automations.lazy").then((m) => ({ default: m.Component })),
  ),
});
