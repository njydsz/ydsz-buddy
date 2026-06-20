/**
 * @file 终端焦点检测
 * @description 检测当前焦点元素是否位于终端区域内，用于判断终端是否处于活跃交互状态。
 */

/**
 * 判断当前终端是否获得焦点
 *
 * 检测文档的 activeElement 是否为 xterm 辅助文本区域或位于终端抽屉面板内。
 *
 * @returns 若焦点在终端区域则返回 `true`，否则返回 `false`
 */
export function isTerminalFocused(): boolean {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;
  if (!activeElement.isConnected) return false;
  if (activeElement.classList.contains("xterm-helper-textarea")) return true;
  return activeElement.closest(".thread-terminal-drawer .xterm") !== null;
}