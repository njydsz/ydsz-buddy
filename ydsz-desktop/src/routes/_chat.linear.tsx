/**
 * @file Linear Tasks 路由模块
 * @description 在共享聊天外壳下注册独立的 Linear 任务浏览器路由,
 *   对应 /_chat/linear 路径,渲染 LinearTaskBrowser 组件。
 *   用户可在不进入对话线程的情况下直接浏览 Linear 任务,
 *   并从任务创建 worktree 线程(依赖已通过 setup 视图配置 API Key)。
 * @layer 路由层
 */

import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/linear")({
  component: lazyRouteComponent(() =>
    import("./_chat.linear.lazy").then((m) => ({ default: m.Component })),
  ),
});
