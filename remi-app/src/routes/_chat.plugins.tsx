/**
 * @file 插件路由模块
 * @description 在共享聊天外壳下注册插件和技能浏览器
 * @layer 路由层
 * @exports Route
 */

import { createFileRoute } from "@tanstack/react-router";
import { PluginLibrary } from "~/components/PluginLibrary";
import { parsePluginsRouteSearch } from "~/pluginsRouteSearch";

/**
 * 插件路由定义
 * @description 定义 /_chat/plugins 路由，用于展示插件库界面
 * @param validateSearch - 验证和解析路由搜索参数
 * @param component - 路由组件，使用 PluginLibrary 展示插件库
 */
export const Route = createFileRoute("/_chat/plugins")({
  validateSearch: (search) => parsePluginsRouteSearch(search),
  component: PluginLibrary,
});
