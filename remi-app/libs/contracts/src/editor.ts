/**
 * @file editor.ts
 * @description 编辑器定义相关的共享契约。定义了支持的编辑器列表、编辑器标识符类型以及在编辑器中打开文件的输入参数 Schema。
 * 客户端和服务端共享使用，用于统一编辑器相关的类型定义和校验规则。
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

/** 编辑器启动样式：direct-path（直接传路径）、goto（使用 --goto 参数）、line-column（行列定位） */
export const EditorLaunchStyle = Schema.Literals(["direct-path", "goto", "line-column"]);
export type EditorLaunchStyle = typeof EditorLaunchStyle.Type;

/** 编辑器定义的内部类型，描述单个编辑器的元信息 */
type EditorDefinition = {
  /** 编辑器唯一标识 */
  readonly id: string;
  /** 编辑器显示名称 */
  readonly label: string;
  /** 编辑器对应的命令行命令列表，null 表示无命令（如文件管理器） */
  readonly commands: readonly [string, ...string[]] | null;
  /** 编辑器支持的启动样式 */
  readonly launchStyle: EditorLaunchStyle;
};

/**
 * 支持的编辑器列表（只读常量）。
 * 包含 Cursor、Trae、VS Code、VS Code Insiders、VSCodium、Zed、Antigravity、IntelliJ IDEA、文件管理器等。
 */
export const EDITORS = [
  { id: "cursor", label: "Cursor", commands: ["cursor"], launchStyle: "goto" },
  { id: "trae", label: "Trae", commands: ["trae"], launchStyle: "goto" },
  { id: "vscode", label: "VS Code", commands: ["code"], launchStyle: "goto" },
  {
    id: "vscode-insiders",
    label: "VS Code Insiders",
    commands: ["code-insiders"],
    launchStyle: "goto",
  },
  { id: "vscodium", label: "VSCodium", commands: ["codium"], launchStyle: "goto" },
  { id: "zed", label: "Zed", commands: ["zed", "zeditor"], launchStyle: "direct-path" },
  { id: "antigravity", label: "Antigravity", commands: ["agy"], launchStyle: "goto" },
  { id: "idea", label: "IntelliJ IDEA", commands: ["idea"], launchStyle: "line-column" },
  { id: "file-manager", label: "File Manager", commands: null, launchStyle: "direct-path" },
] as const satisfies ReadonlyArray<EditorDefinition>;

/** 编辑器 ID 的 Schema，值为 EDITORS 列表中所有编辑器 id 的联合类型 */
export const EditorId = Schema.Literals(EDITORS.map((e) => e.id));
export type EditorId = typeof EditorId.Type;

/** 在编辑器中打开文件的输入参数 Schema，包含工作目录和目标编辑器 */
export const OpenInEditorInput = Schema.Struct({
  /** 当前工作目录（绝对路径） */
  cwd: TrimmedNonEmptyString,
  /** 目标编辑器 ID */
  editor: EditorId,
});
export type OpenInEditorInput = typeof OpenInEditorInput.Type;
