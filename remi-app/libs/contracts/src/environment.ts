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
  os: ExecutionEnvironmentPlatformOs;
  arch: ExecutionEnvironmentPlatformArch;
}

/** 执行环境能力声明，标识环境支持的功能特性 */
export interface ExecutionEnvironmentCapabilities {
  /** 是否支持仓库身份识别 */
  repositoryIdentity: boolean;
}

/** 执行环境描述符，完整描述一个执行环境的标识、标签、平台、版本和能力 */
export interface ExecutionEnvironmentDescriptor {
  environmentId: typeof EnvironmentId.Type;
  label: typeof TrimmedNonEmptyString.Type;
  platform: ExecutionEnvironmentPlatform;
  serverVersion: typeof TrimmedNonEmptyString.Type;
  capabilities: ExecutionEnvironmentCapabilities;
}
