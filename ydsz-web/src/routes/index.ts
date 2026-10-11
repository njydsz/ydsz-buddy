/**
 * @file Web 路由配置
 * @description 简化版 TanStack Router 路由定义（Web 端暂未使用完整路由系统，
 *              仅作为占位文件保留未来扩展能力）
 *
 * 当前 Web 版本使用简单的 App 组件（App.tsx）管理视图切换，
 * 不依赖 TanStack Router。如果未来引入路由，可在此处定义。
 */

export const ROUTES = {
  home: "/",
  chat: "/chat",
  settings: "/settings",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
