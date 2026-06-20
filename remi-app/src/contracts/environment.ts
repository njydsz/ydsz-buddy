/**
 * @file 执行环境类型定义
 * @description 定义执行环境的平台信息、能力声明和环境描述符，
 * 用于描述远程或本地执行环境的操作系统、架构、服务端版本及支持的能力。
 */

import type { EnvironmentId, TrimmedNonEmptyString } from "./baseSchemas";

/** 执行环境操作系统类型 */
export type ExecutionEnvironmentPlatformOs = "darwin" | "linux" | "windows" | "unknown";

/** 执行环境 CPU 架构 */
export type ExecutionEnvironmentPlatformArch = "arm64" | "x64" | "other";

/** 执行环境平台信息，包含操作系统和架构 */
export interface ExecutionEnvironmentPlatform {
  /** 操作系统类型 */
  os: ExecutionEnvironmentPlatformOs;
  /** CPU 架构 */
  arch: ExecutionEnvironmentPlatformArch;
}

/** 执行环境能力声明，标识环境支持的功能特性 */
export interface ExecutionEnvironmentCapabilities {
  /** 是否支持仓库身份识别（如 Git 用户信息获取） */
  repositoryIdentity: boolean;
}

/** 执行环境描述符，完整描述一个执行环境的标识、标签、平台、版本和能力 */
export interface ExecutionEnvironmentDescriptor {
  /** 环境唯一标识 ID */
  environmentId: EnvironmentId;
  /** 环境显示标签（人类可读名称） */
  label: string;
  /** 平台信息（操作系统和架构） */
  platform: ExecutionEnvironmentPlatform;
  /** 服务端版本号 */
  serverVersion: string;
  /** 环境能力声明 */
  capabilities: ExecutionEnvironmentCapabilities;
}
