/**
 * @file 内联代码编辑器路由模块
 * @description 在共享聊天外壳下注册独立的 Monaco 代码编辑器路由,
 *   对应 /_chat/editor 路径,渲染 CodeEditorPanel 组件。
 *   用户可在不进入对话线程的情况下直接浏览和编辑工作区文件。
 * @layer 路由层
 */

import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/editor")({
  component: lazyRouteComponent(() =>
    import("./_chat.editor.lazy").then((m) => ({ default: m.Component })),
  ),
});
