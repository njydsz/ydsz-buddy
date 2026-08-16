/**
 * @file suppressQueryResponses.ts
 * @description 抑制终端查询响应中泄漏的可见垃圾文本。
 * 仅抑制响应使用与查询不同的终止字节的序列，避免误吞真实命令。
 */

import type { Terminal } from "@xterm/xterm";

/**
 * 抑制终端查询响应，防止其作为可见垃圾文本泄漏
 *
 * @param terminal - xterm Terminal 实例
 * @returns 取消抑制的清理函数
 *
 * @remarks 抑制的序列包括：
 * - CSI R — 光标位置报告（查询为 CSI 6n）
 * - CSI I — 焦点进入报告（模式 1004，无查询）
 * - CSI O — 焦点离开报告（模式 1004，无查询）
 * - CSI $y — 模式报告（查询为 CSI $p）
 */
export function suppressQueryResponses(terminal: Terminal): () => void {
  const disposables: { dispose(): void }[] = [];
  const p = terminal.parser;

  disposables.push(p.registerCsiHandler({ final: "R" }, () => true));
  disposables.push(p.registerCsiHandler({ final: "I" }, () => true));
  disposables.push(p.registerCsiHandler({ final: "O" }, () => true));
  disposables.push(p.registerCsiHandler({ intermediates: "$", final: "y" }, () => true));

  return () => {
    for (const d of disposables) d.dispose();
  };
}