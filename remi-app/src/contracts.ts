/**
 * @file contracts
 * @description 核心合约类型定义 - ID 类型、常量、接口定义
 */

// ============ Branded ID Types ============

declare const brand: unique symbol;
export interface Brand<T> {
  readonly [brand]: T;
}

export type CommandId = string & Brand<"CommandId">;
export type MessageId = string & Brand<"MessageId">;
export type ProjectId = string & Brand<"ProjectId">;
export type ThreadId = string & Brand<"ThreadId">;
export type TurnId = string & Brand<"TurnId">;

// ============ Constants ============

/** 单条消息最大附件数 */
export const MAX_ATTACHMENTS = 10;

/** Provider 发送 Turn 时图片的最大字节数 */
export const PROVIDER_SEND_TURN_MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

// ============ Enums / Union Types ============

export type ThreadEnvironmentMode = "coding" | "browsing";

export type ProviderKind =
  | "anthropic"
  | "openai"
  | "google"
  | "mistral"
  | "xai"
  | "cohere"
  | "pi"
  | "github-copilot"
  | "custom-openai"
  | "custom-ollama";

// ============ Interface Types ============

export interface NativeApi {
  /** 调用 Tauri invoke 命令 */
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

export interface ProjectFileSystemEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
}

export interface ProjectLocalSearchEntry {
  path: string;
  content?: string;
  matches?: Array<{ line: number; text: string }>;
}

export interface GitReadWorkingTreeDiffInput {
  projectPath: string;
  basePath?: string;
  includeUntracked?: boolean;
}

export interface UserInputQuestion {
  id: string;
  question: string;
  type: "text" | "select" | "multiselect" | "confirm";
  options?: Array<{ label: string; value: string }>;
  default?: string | boolean;
}

export type ProviderUserInputAnswers = Record<string, string | boolean | string[]>;
