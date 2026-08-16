// editor 契约：类型来自 Rust 端 specta 自动生成；运行时 Schema 保留 effect Schema。
//
// 真实源（Single Source of Truth）：ydsz-shared/src/contracts/editor.rs
// 重新生成类型：
//   pnpm --filter @ydsz-buddy/desktop contracts:gen
//   → ydsz-desktop/src/contracts/_generated/ydsz_shared/contracts/editor.ts
//
// 命名约定：
// - 编译期类型：从 generated re-export（如 `type EditorId`）
// - 运行时 Schema：本地 effect Schema 加 *Schema 后缀与同名类型隔离。

import { Schema } from "effect";

import { TrimmedNonEmptyString } from "./baseSchemas";

// ===== 编译期类型（来自 Rust 单一来源）=====

export type { EditorId, EditorLaunchStyle, OpenInEditorInput } from "./_generated/ydsz_shared/contracts/editor";

// ===== 运行时 Schema + EDITORS 常量 =====

export const EditorLaunchStyleSchema = Schema.Literal("direct-path", "goto", "line-column");

type EditorDefinition = {
  readonly id: string;
  readonly label: string;
  readonly commands: readonly [string, ...string[]] | null;
  readonly launchStyle: "direct-path" | "goto" | "line-column";
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

export const EditorIdSchema = Schema.Literal(...EDITORS.map((e) => e.id));

export const OpenInEditorInputSchema = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  editor: EditorIdSchema,
});
