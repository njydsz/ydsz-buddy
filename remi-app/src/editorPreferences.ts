/**
 * @file 缂栬緫鍣ㄥ亸濂借缃ā鍧? * @description 绠＄悊鐢ㄦ埛涓婃浣跨敤鐨勭紪杈戝櫒鍋忓ソ锛屾敮鎸?localStorage 鎸佷箙鍖栥€? *              鎻愪緵缂栬緫鍣ㄥ亸濂界殑璇诲彇銆佹寔涔呭寲鍜岃嚜鍔ㄦ墦寮€鍔熻兘銆? */

import { EDITORS, EditorId, NativeApi } from "~/contracts";
import { getLocalStorageItem, setLocalStorageItem, useLocalStorage } from "./hooks/useLocalStorage";
import { useMemo } from "react";

/** localStorage 涓瓨鍌ㄤ笂娆′娇鐢ㄧ紪杈戝櫒鐨?key */
const LAST_EDITOR_KEY = "remicode:last-editor";

/**
 * React Hook锛氳幏鍙栧拰璁剧疆鐢ㄦ埛鍋忓ソ鐨勭紪杈戝櫒
 * 浼樺厛浣跨敤涓婃閫夋嫨鐨勭紪杈戝櫒锛岃嫢涓嶅彲鐢ㄥ垯鍥為€€鍒板彲鐢ㄧ紪杈戝櫒鍒楄〃涓殑绗竴涓? * @param availableEditors - 褰撳墠鍙敤鐨勭紪杈戝櫒 ID 鍒楄〃
 * @returns 鍏冪粍 [褰撳墠鐢熸晥鐨勭紪杈戝櫒 ID, 璁剧疆缂栬緫鍣ㄧ殑鍑芥暟]
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
 * 瑙ｆ瀽骞舵寔涔呭寲鐢ㄦ埛鍋忓ソ鐨勭紪杈戝櫒
 * 浼樺厛浣跨敤 localStorage 涓瓨鍌ㄧ殑鍋忓ソ锛岃嫢涓嶅彲鐢ㄥ垯閫夋嫨鍙敤缂栬緫鍣ㄥ垪琛ㄤ腑鐨勭涓€涓苟鎸佷箙鍖? * @param availableEditors - 褰撳墠鍙敤鐨勭紪杈戝櫒 ID 鍒楄〃
 * @returns 鍋忓ソ鐨勭紪杈戝櫒 ID锛屾棤鍙敤缂栬緫鍣ㄦ椂杩斿洖 null
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
 * 鍦ㄥ亸濂界紪杈戝櫒涓墦寮€鎸囧畾璺緞
 * 鑷姩鑾峰彇鍙敤缂栬緫鍣ㄥ垪琛紝瑙ｆ瀽鍋忓ソ缂栬緫鍣紝鐒跺悗璋冪敤鍘熺敓 API 鎵撳紑
 * @param api - NativeApi 瀹炰緥
 * @param targetPath - 瑕佹墦寮€鐨勬枃浠舵垨鐩綍璺緞
 * @returns 浣跨敤鐨勭紪杈戝櫒 ID
 * @throws 褰撴病鏈夊彲鐢ㄧ紪杈戝櫒鏃舵姏鍑洪敊璇? */
export async function openInPreferredEditor(api: NativeApi, targetPath: string): Promise<EditorId> {
  const { availableEditors } = await api.server.getConfig();
  const editor = resolveAndPersistPreferredEditor(availableEditors);
  if (!editor) throw new Error("No available editors found.");
  await api.shell.openInEditor(targetPath, editor);
  return editor;
}
