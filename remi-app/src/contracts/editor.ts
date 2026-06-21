// FILE: editor.ts
// Purpose: Define editor ids and launch metadata shared by the client and server.
// Layer: Shared contracts
// Exports: EDITORS, EditorId, OpenInEditorInput
//
// 本模块定义了 Remi 系统中支持的外部编辑器（External Editor）相关契约，
// 涵盖编辑器列表、启动方式、"在编辑器中打开"操作。
//
// ## 核心契约
//
// - `EDITORS`：支持的编辑器列表（VS Code、Cursor、Zed、Sublime、Vim、Emacs 等）
// - `EditorId`：编辑器唯一标识
// - `EditorLaunchStyle`：编辑器启动方式（direct-path / goto / line-column）
// - `OpenInEditorInput`：在编辑器中打开的输入（文件路径 + 可选行列号）
// - `EditorDefinition`：编辑器元数据（id、label、commands）
//
// ## 使用场景
//
// - Composer 中点击"在编辑器中打开"按钮
// - 文件链接跳转到外部编辑器
// - 设置面板中配置默认编辑器
//
// ## 启动方式说明
//
// - `direct-path`：直接打开文件，忽略行列号
// - `goto`：传递 file:line:column 格式（如 `file:10:5`）
// - `line-column`：分别传递行列号

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

export const EditorLaunchStyle = Schema.Literals(["direct-path", "goto", "line-column"]);
export type EditorLaunchStyle = typeof EditorLaunchStyle.Type;

type EditorDefinition = {
  readonly id: string;
  readonly label: string;
  readonly commands: readonly [string, ...string[]] | null;
  readonly launchStyle: EditorLaunchStyle;
};

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

export const EditorId = Schema.Literals(EDITORS.map((e) => e.id));
export type EditorId = typeof EditorId.Type;

export const OpenInEditorInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  editor: EditorId,
});
export type OpenInEditorInput = typeof OpenInEditorInput.Type;
