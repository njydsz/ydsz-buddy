/**
 * 执行环境合约定义
 *
 * 用途：定义执行环境的平台信息、能力描述等结构，供客户端与服务端共享使用。
 * 所属模块：共享契约层（Shared Contracts）
 * 主要导出：
 *   - ExecutionEnvironmentPlatformOs —— 操作系统类型
 *   - ExecutionEnvironmentPlatformArch —— CPU 架构类型
 *   - ExecutionEnvironmentPlatform —— 平台信息
 *   - ExecutionEnvironmentCapabilities —— 环境能力
 *   - ExecutionEnvironmentDescriptor —— 环境描述符
 */

import { Schema } from "effect";

import { EnvironmentId, TrimmedNonEmptyString } from "./baseSchemas";

/** 操作系统类型 */
export const ExecutionEnvironmentPlatformOs = Schema.Literals([
  "darwin",
  "linux",
  "windows",
  "unknown",
]);
export type ExecutionEnvironmentPlatformOs = typeof ExecutionEnvironmentPlatformOs.Type;

/** CPU 架构类型 */
export const ExecutionEnvironmentPlatformArch = Schema.Literals(["arm64", "x64", "other"]);
export type ExecutionEnvironmentPlatformArch = typeof ExecutionEnvironmentPlatformArch.Type;

/** 平台信息（操作系统 + 架构） */
export const ExecutionEnvironmentPlatform = Schema.Struct({
  os: ExecutionEnvironmentPlatformOs,
  arch: ExecutionEnvironmentPlatformArch,
});
export type ExecutionEnvironmentPlatform = typeof ExecutionEnvironmentPlatform.Type;

/** 执行环境能力 */
export const ExecutionEnvironmentCapabilities = Schema.Struct({
  /** 是否支持仓库身份识别 */
  repositoryIdentity: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
});
export type ExecutionEnvironmentCapabilities = typeof ExecutionEnvironmentCapabilities.Type;

/** 执行环境描述符 */
export const ExecutionEnvironmentDescriptor = Schema.Struct({
  environmentId: EnvironmentId,
  label: TrimmedNonEmptyString,
  platform: ExecutionEnvironmentPlatform,
  serverVersion: TrimmedNonEmptyString,
  capabilities: ExecutionEnvironmentCapabilities,
});
export type ExecutionEnvironmentDescriptor = typeof ExecutionEnvironmentDescriptor.Type;