/**
 * @file 通用工具函数模块
 *
 * 本模块提供 Remi 前端最常用的工具函数：
 *
 * - **样式合并**：`cn` 合并 className，支持 Tailwind 冲突解决
 * - **ID 工厂**：构造各种品牌的实体 ID（ProjectId、ThreadId、MessageId 等）
 *
 * ## 核心导出
 *
 * - `cn(...inputs)`：合并 className（基于 `class-variance-authority` + `tailwind-merge`）
 * - `makeProjectId(name)`：构造 ProjectId
 * - `makeThreadId(name)`：构造 ThreadId
 * - `makeMessageId(name)`：构造 MessageId
 * - `makeCommandId(name)`：构造 CommandId
 *
 * ## 使用场景
 *
 * - 组件 className 合并
 * - 单元测试中构造测试数据
 * - Mock 后端响应时构造合法 ID
 *
 * ## 注意事项
 *
 * - `cn` 内部会先按 cva 合并变体，再通过 `twMerge` 解决 Tailwind 冲突
 * - ID 工厂函数仅用于前端，不会与后端 ID 校验
 */

import { CommandId, MessageId, ProjectId, ThreadId } from "~/contracts";
import { type CxOptions, cx } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: CxOptions) {
  return twMerge(cx(inputs));
}

export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function isWindowsPlatform(platform: string): boolean {
  return /^win(dows|[0-9])/i.test(platform);
}

export function isLinuxPlatform(platform: string): boolean {
  return /linux/i.test(platform);
}

export function randomUUID(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 implementation for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const newCommandId = (): CommandId => CommandId.makeUnsafe(randomUUID());

export const newProjectId = (): ProjectId => ProjectId.makeUnsafe(randomUUID());

export const newThreadId = (): ThreadId => ThreadId.makeUnsafe(randomUUID());

export const newMessageId = (): MessageId => MessageId.makeUnsafe(randomUUID());
