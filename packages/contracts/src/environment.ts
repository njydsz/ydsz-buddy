/**
 * @file 执行环境 Schema 定义
 * @description 定义执行环境的平台信息、能力声明和环境描述符，
 * 用于描述远程或本地执行环境的操作系统、架构、服务端版本及支持的能力。
 */
import { Schema } from "effect";

import { EnvironmentId, TrimmedNonEmptyString } from "./baseSchemas";

/** 执行环境操作系统类型 */
export const ExecutionEnvironmentPlatformOs = Schema.Literals([
  "darwin",
  "linux",
  "windows",
  "unknown",
]);
export type ExecutionEnvironmentPlatformOs = typeof ExecutionEnvironmentPlatformOs.Type;

/** 执行环境 CPU 架构 */
export const ExecutionEnvironmentPlatformArch = Schema.Literals(["arm64", "x64", "other"]);
export type ExecutionEnvironmentPlatformArch = typeof ExecutionEnvironmentPlatformArch.Type;

/** 执行环境平台信息，包含操作系统和架构 */
export const ExecutionEnvironmentPlatform = Schema.Struct({
  os: ExecutionEnvironmentPlatformOs,
  arch: ExecutionEnvironmentPlatformArch,
});
export type ExecutionEnvironmentPlatform = typeof ExecutionEnvironmentPlatform.Type;

/** 执行环境能力声明，标识环境支持的功能特性 */
export const ExecutionEnvironmentCapabilities = Schema.Struct({
  /** 是否支持仓库身份识别 */
  repositoryIdentity: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
});
export type ExecutionEnvironmentCapabilities = typeof ExecutionEnvironmentCapabilities.Type;

/** 执行环境描述符，完整描述一个执行环境的标识、标签、平台、版本和能力 */
export const ExecutionEnvironmentDescriptor = Schema.Struct({
  environmentId: EnvironmentId,
  label: TrimmedNonEmptyString,
  platform: ExecutionEnvironmentPlatform,
  serverVersion: TrimmedNonEmptyString,
  capabilities: ExecutionEnvironmentCapabilities,
});
export type ExecutionEnvironmentDescriptor = typeof ExecutionEnvironmentDescriptor.Type;
