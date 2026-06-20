/**
 * @file 缂栬緫鍣ㄥ厓鏁版嵁妯″潡
 * @description 涓烘敮鎸佺殑缂栬緫鍣ㄦ彁渚涚粺涓€鐨勬爣绛惧拰鍥炬爣瑙ｆ瀽鑳藉姏銆? *              鐢ㄤ簬鑱婂ぉ澶撮儴鍜?鎵撳紑鏂瑰紡"閫夋嫨鍣ㄧ瓑 UI 缁勪欢锛? *              纭繚鏂板缂栬緫鍣ㄦ椂鏃犻渶鍦ㄥ澶勯噸澶嶇淮鎶ょ紪杈戝櫒鍒楄〃銆? */

import { EDITORS, type EditorId } from "~/contracts";
import type { Icon } from "./components/Icons";
import {
  AntigravityIcon,
  CursorIcon,
  OpenCodeIcon,
  VisualStudioCode,
  Zed,
} from "./components/Icons";
import { FolderClosedIcon } from "./lib/icons";
import { isMacPlatform, isWindowsPlatform } from "./lib/utils";

/**
 * 缂栬緫鍣ㄩ€夐」锛岀敤浜?UI 灞曠ず
 * @property value - 缂栬緫鍣ㄦ爣璇? * @property label - 缂栬緫鍣ㄦ樉绀哄悕绉? * @property Icon - 缂栬緫鍣ㄥ浘鏍囩粍浠? */
export interface EditorOption {
  readonly value: EditorId;
  readonly label: string;
  readonly Icon: Icon;
}

/** 缂栬緫鍣?ID 鍒板浘鏍囩粍浠剁殑鏄犲皠锛屾湭閰嶇疆鐨勭紪杈戝櫒灏嗕娇鐢ㄩ粯璁ゅ浘鏍?*/
const EDITOR_ICONS: Partial<Record<EditorId, Icon>> = {
  cursor: CursorIcon,
  trae: OpenCodeIcon,
  vscode: VisualStudioCode,
  "vscode-insiders": VisualStudioCode,
  vscodium: VisualStudioCode,
  zed: Zed,
  antigravity: AntigravityIcon,
  idea: OpenCodeIcon,
  "file-manager": FolderClosedIcon,
};

/**
 * 瑙ｆ瀽缂栬緫鍣ㄧ殑鏄剧ず鏍囩
 * 鏍规嵁鍏变韩缂栬緫鍣ㄧ洰褰曟瀯寤烘爣绛撅紝鏂板缂栬緫鍣ㄦ棤闇€鍦ㄥ澶勯噸澶嶇淮鎶? * @param editorId - 缂栬緫鍣ㄦ爣璇? * @param platform - 骞冲彴鏍囪瘑瀛楃涓? * @returns 缂栬緫鍣ㄧ殑鏄剧ず鍚嶇О锛屾枃浠剁鐞嗗櫒浼氭牴鎹钩鍙拌繑鍥?Finder/Explorer/Files
 */
export function resolveEditorLabel(editorId: EditorId, platform: string): string {
  if (editorId === "file-manager") {
    return isMacPlatform(platform) ? "Finder" : isWindowsPlatform(platform) ? "Explorer" : "Files";
  }

  return EDITORS.find((editor) => editor.id === editorId)?.label ?? editorId;
}

/**
 * 瑙ｆ瀽缂栬緫鍣ㄧ殑鍥炬爣缁勪欢
 * 鍗充娇鍝佺墝涓撶敤鍥炬爣灏氭湭閰嶇疆锛屼篃杩斿洖榛樿鍥炬爣浠ヤ繚鎸?UI 鍋ュ．鎬? * @param editorId - 缂栬緫鍣ㄦ爣璇? * @returns 鍥炬爣缁勪欢锛屾湭鍖归厤鏃惰繑鍥?OpenCodeIcon
 */
export function resolveEditorIcon(editorId: EditorId): Icon {
  return EDITOR_ICONS[editorId] ?? OpenCodeIcon;
}

/**
 * 瑙ｆ瀽褰撳墠鍙敤鐨勭紪杈戝櫒閫夐」鍒楄〃
 * 鏍规嵁鍙敤缂栬緫鍣ㄥ垪琛ㄨ繃婊ゅ叡浜紪杈戝櫒鐩綍锛岀敓鎴愬寘鍚爣绛惧拰鍥炬爣鐨勫畬鏁撮€夐」
 * @param platform - 骞冲彴鏍囪瘑瀛楃涓? * @param availableEditors - 褰撳墠鍙敤鐨勭紪杈戝櫒 ID 鍒楄〃
 * @returns 缂栬緫鍣ㄩ€夐」鏁扮粍锛屽寘鍚爣璇嗐€佹爣绛惧拰鍥炬爣
 */
export function resolveAvailableEditorOptions(
  platform: string,
  availableEditors: ReadonlyArray<EditorId>,
): ReadonlyArray<EditorOption> {
  const availableEditorIds = new Set(availableEditors);
  return EDITORS.filter((editor) => availableEditorIds.has(editor.id)).map((editor) => ({
    value: editor.id,
    label: resolveEditorLabel(editor.id, platform),
    Icon: resolveEditorIcon(editor.id),
  }));
}
