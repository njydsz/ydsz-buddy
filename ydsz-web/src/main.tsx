/**
 * @file Web 应用启动入口
 * @description React 19 + Vite Web SPA 入口文件
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";

// 初始化主题
const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
if (isDark) {
  document.documentElement.classList.add("dark");
}

// 挂载应用
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
