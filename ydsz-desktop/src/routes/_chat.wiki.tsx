/**
 * @file Wiki 路由模块
 * @description 在共享聊天外壳下注册 Wiki 知识库视图路由,
 *   对应 /_chat/wiki 路径,渲染 WikiView 组件。
 * @layer 路由层
 * @exports Route
 */

import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

/**
 * Wiki 路由配置
 * @description 定义 /_chat/wiki 路径的路由,渲染 WikiView 组件展示项目知识库。
 */
export const Route = createFileRoute("/_chat/wiki")({
  component: lazyRouteComponent(() =>
    import("./_chat.wiki.lazy").then((m) => ({ default: m.Component })),
  ),
});
