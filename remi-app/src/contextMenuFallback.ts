/**
 * @file 右键菜单回退实现
 *
 * 提供命令式的 DOM 右键菜单，匹配应用的 Base UI 菜单样式。
 * 在 Web 环境中当原生菜单不可用时作为回退方案，
 * 显示定位下拉菜单并返回用户点击的选项 ID。
 */

import type { ContextMenuItem } from "@remi-code/contracts";

/**
 * 带图标扩展的右键菜单项。
 * 在基础 ContextMenuItem 上增加 SVG 图标字符串支持。
 */
export interface ContextMenuItemWithIcon<T extends string = string> extends ContextMenuItem<T> {
  /** SVG 图标字符串 */
  icon?: string;
}

/**
 * 显示命令式的右键菜单。
 * 在指定位置显示下拉菜单，支持键盘导航（上下箭头、Enter、Escape）。
 * 菜单溢出视口时自动调整位置。
 *
 * @param items - 菜单项列表
 * @param position - 菜单显示位置，默认为 (0, 0)
 * @returns Promise，点击菜单项返回其 ID，关闭返回 null
 *
 * @example
 * ```ts
 * const result = await showContextMenuFallback(
 *   [{ id: "copy", label: "Copy" }, { id: "delete", label: "Delete", destructive: true }],
 *   { x: 100, y: 200 }
 * );
 * ```
 */
export function showContextMenuFallback<T extends string>(
  items: readonly ContextMenuItemWithIcon<T>[],
  position?: { x: number; y: number },
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999";

    const menu = document.createElement("div");
    menu.className =
      "fixed z-[10000] min-w-[180px] rounded-xl border border-white/[0.08] shadow-xl animate-in fade-in zoom-in-95";

    const x = position?.x ?? 0;
    const y = position?.y ?? 0;
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;
    menu.style.backgroundColor = `color-mix(in srgb, var(--popover) 90%, transparent)`;
    menu.style.backdropFilter = "blur(24px)";
    (menu.style as any).webkitBackdropFilter = "blur(24px)";

    const inner = document.createElement("div");
    inner.className = "p-1";
    menu.appendChild(inner);

    let focusedIndex = -1;
    const buttons: HTMLButtonElement[] = [];

    function cleanup(result: T | null) {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      menu.remove();
      resolve(result);
    }

    function focusItem(index: number) {
      if (index < 0 || index >= buttons.length) return;
      buttons[focusedIndex]?.classList.remove("bg-[var(--sidebar-accent)]");
      focusedIndex = index;
      buttons[focusedIndex]?.classList.add("bg-[var(--sidebar-accent)]");
      buttons[focusedIndex]?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(null);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        focusItem(focusedIndex < buttons.length - 1 ? focusedIndex + 1 : 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusItem(focusedIndex > 0 ? focusedIndex - 1 : buttons.length - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          cleanup(items[focusedIndex]!.id);
        }
      }
    }

    overlay.addEventListener("mousedown", () => cleanup(null));
    document.addEventListener("keydown", onKeyDown);

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const isDestructive = item.destructive === true || item.id === "delete";

      // Keep explicit groups visible in the browser fallback; destructive items remain isolated by default.
      if ((item.separatorBefore === true || isDestructive) && i > 0) {
        const sep = document.createElement("div");
        sep.className = "mx-2.5 my-1 h-px bg-border";
        inner.appendChild(sep);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = isDestructive
        ? "flex w-full min-h-7 cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[length:var(--app-font-size-ui,12px)] text-foreground/86 transition-colors"
        : "flex w-full min-h-7 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[length:var(--app-font-size-ui,12px)] text-foreground/86 transition-colors";

      if (item.icon) {
        const iconWrapper = document.createElement("span");
        iconWrapper.className = "size-4 flex items-center justify-center opacity-60";
        iconWrapper.innerHTML = item.icon;
        btn.appendChild(iconWrapper);
      }

      const label = document.createElement("span");
      label.textContent = item.label;
      btn.appendChild(label);

      btn.addEventListener("click", () => cleanup(item.id));
      btn.addEventListener("mouseenter", () =>
        focusItem(buttons.length > 0 ? buttons.indexOf(btn) : 0),
      );
      btn.addEventListener("mouseleave", () => {
        btn.classList.remove("bg-[var(--sidebar-accent)]");
        focusedIndex = -1;
      });
      buttons.push(btn);
      inner.appendChild(btn);
    }

    document.body.appendChild(overlay);
    document.body.appendChild(menu);

    // Adjust if menu overflows viewport
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 4}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 4}px`;
      }
    });
  });
}
