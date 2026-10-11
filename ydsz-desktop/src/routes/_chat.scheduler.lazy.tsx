/**
 * @file 定时任务可视化页面 — lazy 组件
 *
 * 渲染定时任务管理主界面：任务列表、创建/编辑表单、CRON 可视化选择器、
 * 执行历史预览、模板快捷创建。
 *
 * 风格与 AutomationsView 一致，复用相同的后端调度命令。
 */

import { SchedulerView } from "~/components/SchedulerView";

export function Component() {
  return <SchedulerView />;
}
