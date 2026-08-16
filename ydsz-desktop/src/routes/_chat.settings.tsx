/**
 * @file 设置页面路由模块
 * @description 渲染独立的设置界面，包含专属的分section侧边栏和分组面板。
 *   支持的功能包括：
 *   1. 提供者管理（添加、配置、排序 Provider）
 *   2. 外观设置（主题、字体、语言）
 *   3. 通知设置（浏览器通知权限管理）
 *   4. 快捷键配置
 *   5. 工作区和工作树管理
 *   6. 模型渠道配置（服务商网关）
 *   7. 版本历史和更新检查
 * @layer 路由层
 * @depends SettingsNavItems, AppSettings, ServerConfig, ThemePackEditor
 */

import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/settings")({
  component: lazyRouteComponent(() =>
    import("./_chat.settings.lazy").then((m) => ({ default: m.Component })),
  ),
});
