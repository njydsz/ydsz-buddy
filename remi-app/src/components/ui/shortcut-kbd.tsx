/** @file shortcut-kbd
 * @description 快捷键展示组件，将快捷键标签字符串拆分为多个按键并使用 Kbd 组件渲染。
 */

import { Kbd, KbdGroup } from "./kbd";
import { splitShortcutLabel } from "../../keybindings";
import { cn } from "~/lib/utils";

/**
 * 快捷键展示组件
 * @param props.shortcutLabel - 快捷键标签字符串，如 "Ctrl+K"
 * @param props.className - 单个按键的自定义类名
 * @param props.groupClassName - 按键组的自定义类名
 */
export function ShortcutKbd(props: {
  shortcutLabel: string;
  className?: string;
  groupClassName?: string;
}) {
  const parts = splitShortcutLabel(props.shortcutLabel);

  return (
    <KbdGroup className={cn("gap-1", props.groupClassName)}>
      {parts.map((part) => (
        <Kbd key={part} className={props.className}>
          {part}
        </Kbd>
      ))}
    </KbdGroup>
  );
}
