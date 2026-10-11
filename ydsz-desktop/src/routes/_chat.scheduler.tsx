/**
 * @file 定时任务路由模块
 * @description 在共享聊天外壳下注册定时任务可视化页面路由
 * @layer 路由层
 * @exports Route - 定时任务路由配置
 */

import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

/**
 * 定时任务路由配置
 * @description 定义 /_chat/scheduler 路径的路由，渲染定时任务可视化组件
 */
export const Route = createFileRoute("/_chat/scheduler")({
  component: lazyRouteComponent(() =>
    import("./_chat.scheduler.lazy").then((m) => ({ default: m.Component })),
  ),
});
