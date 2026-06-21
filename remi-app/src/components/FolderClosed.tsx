// FILE: FolderClosed.tsx
// Purpose: Shared closed-folder glyph used by the sidebar and sidebar command palette.
// Exports: FolderClosed
/**
 * @file 闭合文件夹图标
 *
 * 侧边栏与命令面板中复用的"闭合文件夹"图标：
 *
 * - 标准 24x24 viewBox
 * - `currentColor` 颜色，继承父级文本色
 * - `aria-hidden` 由父级标签承担语义
 *
 * ## 核心导出
 *
 * - `FolderClosed`：React 函数组件
 *
 * ## 使用场景
 *
 * - Sidebar 折叠的目录
 * - 命令面板中的目录项
 */
import type { SVGProps } from "react";

export function FolderClosed(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M9.13202 3.75H4.75C3.64543 3.75 2.75 4.64543 2.75 5.75V17.25C2.75 18.3546 3.64543 19.25 4.75 19.25H19.25C20.3546 19.25 21.25 18.3546 21.25 17.25V7.75C21.25 6.64543 20.3546 5.75 19.25 5.75H12.8124C12.2915 5.75 11.7911 5.54674 11.4177 5.18345L10.5267 4.31655C10.1534 3.95326 9.65297 3.75 9.13202 3.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.75 12.75V11.75C2.75 10.6454 3.64543 9.75 4.75 9.75H19.25C20.3546 9.75 21.25 10.6454 21.25 11.75V12.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
