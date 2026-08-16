// Extension 契约：与 src-tauri/src/commands/extensions.rs 中的 Tauri 命令对齐。
//
// 后端单源：ydsz-desktop/src-tauri/src/commands/extensions.rs
// 前端手写契约（与 office.ts / lsp.ts 同模式）。

import { invoke } from "@tauri-apps/api/core";

// ===== 共享类型 =====

/** 扩展状态 */
export type ExtensionState = "installed" | "activated" | "deactivated" | "error";

/** 扩展列表项 DTO */
export interface ExtensionDto {
  name: string;
  version: string;
  displayName: string;
  description: string;
  author: string;
  categories: string[];
  installPath: string;
  state: ExtensionState;
  error: string | null;
  contributesCommands: number;
  contributesSettings: number;
  contributesProviders: number;
  contributesLanguages: number;
}

/** 命令贡献 DTO */
export interface CommandContributionDto {
  id: string;
  title: string;
  keybinding: string | null;
  icon: string | null;
  category: string | null;
}

/** 设置贡献 DTO */
export interface SettingContributionDto {
  key: string;
  default: unknown;
  settingType: string;
  description: string;
}

/** Provider 贡献 DTO */
export interface ProviderContributionDto {
  displayName: string;
  protocol: string;
  defaultModel: string;
  models: string[];
}

/** 语言贡献 DTO */
export interface LanguageContributionDto {
  id: string;
  extensions: string[];
  syntaxPath: string | null;
}

/** 扩展贡献集合 DTO */
export interface ExtensionContributionDto {
  commands: CommandContributionDto[];
  settings: SettingContributionDto[];
  providers: ProviderContributionDto[];
  languages: LanguageContributionDto[];
}

/** 扩展详情 DTO（含完整 contributes 信息） */
export interface ExtensionDetailDto {
  name: string;
  version: string;
  displayName: string;
  description: string;
  author: string;
  categories: string[];
  installPath: string;
  state: ExtensionState;
  error: string | null;
  contributes: ExtensionContributionDto;
  extensionDependencies: string[];
}

// ===== 命令调用封装 =====

/**
 * 初始化扩展系统（扫描 ~/.ydsz/extensions/ 目录）
 * @returns 扫描到的扩展数量
 */
export function extensionInit(): Promise<number> {
  return invoke<number>("extension_init");
}

/**
 * 列出所有已安装扩展
 */
export function extensionList(): Promise<ExtensionDto[]> {
  return invoke<ExtensionDto[]>("extension_list");
}

/**
 * 获取扩展详情（含完整 contributes 信息）
 */
export function extensionGet(name: string): Promise<ExtensionDetailDto | null> {
  return invoke<ExtensionDetailDto | null>("extension_get", { name });
}

/**
 * 激活扩展
 */
export function extensionActivate(name: string): Promise<void> {
  return invoke<void>("extension_activate", { name });
}

/**
 * 停用扩展
 */
export function extensionDeactivate(name: string): Promise<void> {
  return invoke<void>("extension_deactivate", { name });
}

/**
 * 卸载扩展（删除目录 + 注销注册）
 */
export function extensionUninstall(name: string): Promise<void> {
  return invoke<void>("extension_uninstall", { name });
}

/**
 * 从本地路径安装扩展
 * @param path 包含 extension.json 的目录路径
 */
export function extensionInstallFromPath(path: string): Promise<ExtensionDto> {
  return invoke<ExtensionDto>("extension_install_from_path", { path });
}

/**
 * 从 GitHub 仓库安装扩展
 * @param repo owner/repo 或 https://github.com/owner/repo
 * @param subdir 子目录（可选）
 */
export function extensionInstallFromGithub(
  repo: string,
  subdir?: string,
): Promise<ExtensionDto> {
  return invoke<ExtensionDto>("extension_install_from_github", { repo, subdir });
}

/**
 * 列出所有已激活扩展贡献的命令
 */
export function extensionListCommands(): Promise<CommandContributionDto[]> {
  return invoke<CommandContributionDto[]>("extension_list_commands");
}

/**
 * 触发 OnStartup 激活事件
 * @returns 被激活的扩展名称列表
 */
export function extensionTriggerStartup(): Promise<string[]> {
  return invoke<string[]>("extension_trigger_startup");
}
