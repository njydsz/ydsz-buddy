/**
 * @file Pull Requests 路由模块
 * @description 在共享聊天外壳下注册独立的 GitHub Pull Requests 浏览器路由,
 *   对应 /_chat/pulls 路径,渲染 PullRequestBrowser 组件。
 *   用户可在不进入对话线程的情况下直接浏览当前工作区的 GitHub PRs,
 *   并执行合并 / 关闭 / 重开 / 评论等操作(依赖系统 `gh` CLI 已认证)。
 * @layer 路由层
 */

import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/pulls")({
  component: lazyRouteComponent(() =>
    import("./_chat.pulls.lazy").then((m) => ({ default: m.Component })),
  ),
});
