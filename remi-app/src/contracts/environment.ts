/**
 * @file 执行环境契约模块
 *
 * 本模块定义了 Remi 系统中"执行环境"（Execution Environment）相关的 Schema，
 * 用于描述运行 Provider 工具、命令、脚本的运行时环境信息。
 *
 * ## 核心契约
 *
 * - `ExecutionEnvironmentPlatformOs`：环境平台操作系统枚举
 * - `ExecutionEnvironmentArch`：CPU 架构枚举
 * - `ExecutionEnvironmentShell`：默认 Shell 类型
 * - `ExecutionEnvironment`：执行环境完整描述（OS、架构、Shell、版本等）
 * - `ProviderSandboxPreference`：Provider 是否启用沙箱的偏好
 *
 * ## 使用场景
 *
 * - Provider 启动前探测运行环境的 OS / 架构兼容性
 * - 工具调用前判断是否需要 Shell 转义
 * - UI 中展示当前工作环境信息
 * - 决定是否启用沙箱执行
 *
 * ## 兼容性注意
 *
 * - 路径分隔符与 Shell 语法因平台而异，需配合 `contracts/filesystem` 使用
 * - 架构字段在跨平台部署时至关重要（如 Apple Silicon vs Intel）
 */

import { Schema } from "effect";

import { EnvironmentId, TrimmedNonEmptyString } from "./baseSchemas";

export const ExecutionEnvironmentPlatformOs = Schema.Literals([
  "darwin",
  "linux",
  "windows",
  "unknown",
]);
export type ExecutionEnvironmentPlatformOs = typeof ExecutionEnvironmentPlatformOs.Type;

export const ExecutionEnvironmentPlatformArch = Schema.Literals(["arm64", "x64", "other"]);
export type ExecutionEnvironmentPlatformArch = typeof ExecutionEnvironmentPlatformArch.Type;

export const ExecutionEnvironmentPlatform = Schema.Struct({
  os: ExecutionEnvironmentPlatformOs,
  arch: ExecutionEnvironmentPlatformArch,
});
export type ExecutionEnvironmentPlatform = typeof ExecutionEnvironmentPlatform.Type;

export const ExecutionEnvironmentCapabilities = Schema.Struct({
  repositoryIdentity: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
});
export type ExecutionEnvironmentCapabilities = typeof ExecutionEnvironmentCapabilities.Type;

export const ExecutionEnvironmentDescriptor = Schema.Struct({
  environmentId: EnvironmentId,
  label: TrimmedNonEmptyString,
  platform: ExecutionEnvironmentPlatform,
  serverVersion: TrimmedNonEmptyString,
  capabilities: ExecutionEnvironmentCapabilities,
});
export type ExecutionEnvironmentDescriptor = typeof ExecutionEnvironmentDescriptor.Type;
