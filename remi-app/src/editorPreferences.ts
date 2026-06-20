/**
 * @file 缂傛牞绶崳銊ヤ焊婵傚€燁啎缂冾喗膩閸? * @description 缁狅紕鎮婇悽銊﹀煕娑撳﹥顐兼担璺ㄦ暏閻ㄥ嫮绱潏鎴濇珤閸嬪繐銈介敍灞炬暜閹?localStorage 閹镐椒绠欓崠鏍モ偓? *              閹绘劒绶电紓鏍帆閸ｃ劌浜告總鐣屾畱鐠囪褰囬妴浣瑰瘮娑斿懎瀵查崪宀冨殰閸斻劍澧﹀鈧崝鐔诲厴閵? */

import { EDITORS, EditorId, NativeApi } from "~/contracts";
import { getLocalStorageItem, setLocalStorageItem, useLocalStorage } from "./hooks/useLocalStorage";
import { useMemo } from "react";

/** localStorage 娑擃厼鐡ㄩ崒銊ょ瑐濞嗏€插▏閻劎绱潏鎴濇珤閻?key */
const LAST_EDITOR_KEY = "remicode:last-editor";

/**
 * React Hook閿涙俺骞忛崣鏍ф嫲鐠佸墽鐤嗛悽銊﹀煕閸嬪繐銈介惃鍕椽鏉堟垵娅? * 娴兼ê鍘涙担璺ㄦ暏娑撳﹥顐奸柅澶嬪閻ㄥ嫮绱潏鎴濇珤閿涘矁瀚㈡稉宥呭讲閻劌鍨崶鐐衡偓鈧崚鏉垮讲閻劎绱潏鎴濇珤閸掓銆冩稉顓犳畱缁楊兛绔存稉? * @param availableEditors - 瑜版挸澧犻崣顖滄暏閻ㄥ嫮绱潏鎴濇珤 ID 閸掓銆? * @returns 閸忓啰绮?[瑜版挸澧犻悽鐔告櫏閻ㄥ嫮绱潏鎴濇珤 ID, 鐠佸墽鐤嗙紓鏍帆閸ｃ劎娈戦崙鑺ユ殶]
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
 * 鐟欙絾鐎介獮鑸靛瘮娑斿懎瀵查悽銊﹀煕閸嬪繐銈介惃鍕椽鏉堟垵娅? * 娴兼ê鍘涙担璺ㄦ暏 localStorage 娑擃厼鐡ㄩ崒銊ф畱閸嬪繐銈介敍宀冨娑撳秴褰查悽銊ュ灟闁瀚ㄩ崣顖滄暏缂傛牞绶崳銊ュ灙鐞涖劋鑵戦惃鍕儑娑撯偓娑擃亜鑻熼幐浣风畽閸? * @param availableEditors - 瑜版挸澧犻崣顖滄暏閻ㄥ嫮绱潏鎴濇珤 ID 閸掓銆? * @returns 閸嬪繐銈介惃鍕椽鏉堟垵娅?ID閿涘本妫ら崣顖滄暏缂傛牞绶崳銊︽鏉╂柨娲?null
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
 * 閸︺劌浜告總鐣岀椽鏉堟垵娅掓稉顓熷ⅵ瀵偓閹稿洤鐣剧捄顖氱窞
 * 閼奉亜濮╅懢宄板絿閸欘垳鏁ょ紓鏍帆閸ｃ劌鍨悰顭掔礉鐟欙絾鐎介崑蹇撱偨缂傛牞绶崳顭掔礉閻掕泛鎮楃拫鍐暏閸樼喓鏁?API 閹垫挸绱? * @param api - NativeApi 鐎圭偘绶? * @param targetPath - 鐟曚焦澧﹀鈧惃鍕瀮娴犺埖鍨ㄩ惄顔肩秿鐠侯垰绶? * @returns 娴ｈ法鏁ら惃鍕椽鏉堟垵娅?ID
 * @throws 瑜版挻鐥呴張澶婂讲閻劎绱潏鎴濇珤閺冭埖濮忛崙娲晩鐠? */
export async function openInPreferredEditor(api: NativeApi, targetPath: string): Promise<EditorId> {
  const { availableEditors } = await api.server.getConfig();
  const editor = resolveAndPersistPreferredEditor(availableEditors);
  if (!editor) throw new Error("No available editors found.");
  await api.shell.openInEditor(targetPath, editor);
  return editor;
}
