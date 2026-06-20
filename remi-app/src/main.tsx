/**
 * @file 应用入口文件
 * @description 初始化 React 应用根节点，挂载路由器并提供全局样式导入。
 * 按顺序加载字体（JetBrains Mono）、KaTeX 数学公式样式、xterm 终端样式、
 * 全局 CSS、存储键迁移脚本，最终渲染 RouterProvider。
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "@fontsource-variable/jetbrains-mono";
import "katex/dist/katex.min.css";
import "@xterm/xterm/css/xterm.css";
import "./index.css";
import "./storageKeyMigration";

import { appHistory } from "./appNavigation";
import { getRouter } from "./router";
import { APP_DISPLAY_NAME } from "./branding";

/** 应用路由器实例，集成 React Query 和 Zustand Store Provider */
const router = getRouter(appHistory);

/** 设置浏览器标签页标题为应用展示名称 */
document.title = APP_DISPLAY_NAME;

/** 将 React 应用挂载到 HTML 根节点 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
