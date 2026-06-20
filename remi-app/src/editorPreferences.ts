/**
 * @file 编辑器偏好设置模�? * @description 管理用户上次使用的编辑器偏好，支�?localStorage 持久化�? *              提供编辑器偏好的读取、持久化和自动打开功能�? */

import { EDITORS, EditorId, NativeApi } from "~/contracts";
import { getLocalStorageItem, setLocalStorageItem, useLocalStorage } from "./hooks/useLocalStorage";
import { useMemo } from "react";

/** localStorage 中存储上次使用编辑器�?key */
const LAST_EDITOR_KEY = "remicode:last-editor";

/**
 * React Hook：获取和设置用户偏好的编辑器
 * 优先使用上次选择的编辑器，若不可用则回退到可用编辑器列表中的第一�? * @param availableEditors - 当前可用的编辑器 ID 列表
 * @returns 元组 [当前生效的编辑器 ID, 设置编辑器的函数]
 */
export function usePreferredEditor(availableEditors: ReadonlyArray<EditorId>) {
  const [lastEditor, setLastEditor] = useLocalStorage<EditorId | null>(LAST_EDITOR_KEY, null);

  const effectiveEditor = useMemo(() => {
    if (lastEditor && availableEditors.includes(lastEditor)) return lastEditor;
    return EDITORS.find((editor) => availableEditors.includes(editor.id))?.id ?? null;
  }, [lastEditor, availableEditors]);

  return [effectiveEditor, setLastEditor] as const;
}

/**
 * 解析并持久化用户偏好的编辑器
 * 优先使用 localStorage 中存储的偏好，若不可用则选择可用编辑器列表中的第一个并持久�? * @param availableEditors - 当前可用的编辑器 ID 列表
 * @returns 偏好的编辑器 ID，无可用编辑器时返回 null
 */
export function resolveAndPersistPreferredEditor(
  availableEditors: readonly EditorId[],
): EditorId | null {
  const availableEditorIds = new Set(availableEditors);
  const stored = getLocalStorageItem<EditorId | null>(LAST_EDITOR_KEY);
  if (stored && availableEditorIds.has(stored)) return stored;
  const editor = EDITORS.find((editor) => availableEditorIds.has(editor.id))?.id ?? null;
  if (editor) setLocalStorageItem(LAST_EDITOR_KEY, editor);
  return editor ?? null;
}

/**
 * 在偏好编辑器中打开指定路径
 * 自动获取可用编辑器列表，解析偏好编辑器，然后调用原生 API 打开
 * @param api - NativeApi 实例
 * @param targetPath - 要打开的文件或目录路径
 * @returns 使用的编辑器 ID
 * @throws 当没有可用编辑器时抛出错�? */
export async function openInPreferredEditor(api: NativeApi, targetPath: string): Promise<EditorId> {
  const { availableEditors } = await api.server.getConfig();
  const editor = resolveAndPersistPreferredEditor(availableEditors);
  if (!editor) throw new Error("No available editors found.");
  await api.shell.openInEditor(targetPath, editor);
  return editor;
}
