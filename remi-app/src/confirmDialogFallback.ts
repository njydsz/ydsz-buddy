/**
 * @file 确认对话框回退实现
 *
 * 当确认请求来自 Web/Native 桥接层时，提供轻量级的 DOM 确认对话框。
 * 直接操作 DOM 创建模态对话框，不依赖 React 组件树，
 * 使用应用已有的 Tailwind 主题变量保持视觉一致性。
 */

/**
 * 显示轻量级的确认对话框。
 * 将消息的第一行作为标题，其余行作为描述。
 * 支持 Escape（取消）和 Enter（确认）键盘操作。
 *
 * @param message - 对话框消息，第一行为标题，后续行为描述
 * @returns Promise，确认返回 true，取消返回 false
 *
 * @example
 * ```ts
 * const confirmed = await showConfirmDialogFallback("Delete file?\nThis action cannot be undone.");
 * if (confirmed) { ... }
 * ```
 */
export function showConfirmDialogFallback(message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // Split message into title (first line) and description (rest)
    const lines = message.split("\n");
    const title = lines[0] ?? message;
    const description = lines.slice(1).join("\n").trim();

    // Backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "fixed inset-0 z-50 bg-black/50";
    backdrop.style.cssText = "animation:fadeIn .15s ease-out";

    // Viewport (centers the dialog)
    const viewport = document.createElement("div");
    viewport.className = "fixed inset-0 z-50 flex items-center justify-center p-4";

    // Popup
    const popup = document.createElement("div");
    popup.className =
      "flex w-full max-w-[22rem] flex-col rounded-xl border border-[color:var(--color-border-light)] bg-[var(--composer-surface)] text-[var(--color-text-foreground)] shadow-xl";
    popup.style.cssText = "animation:scaleIn .15s ease-out";

    // Header
    const header = document.createElement("div");
    header.className = "flex flex-col gap-1.5 px-4 py-3.5 text-center sm:text-left";

    const titleEl = document.createElement("h2");
    titleEl.className = "font-heading font-semibold text-base leading-snug";
    titleEl.textContent = title;
    header.appendChild(titleEl);

    if (description) {
      const descEl = document.createElement("p");
      descEl.className = "text-muted-foreground text-[13px] leading-5";
      descEl.textContent = description;
      header.appendChild(descEl);
    }

    popup.appendChild(header);

    // Footer
    const footer = document.createElement("div");
    footer.className =
      "flex flex-col-reverse gap-2 border-t border-[color:var(--color-border-light)] bg-[var(--color-background-elevated-secondary)] px-4 py-3 sm:flex-row sm:justify-end sm:rounded-b-[calc(var(--radius-xl)-1px)]";

    function cleanup(result: boolean) {
      document.removeEventListener("keydown", onKeyDown);
      backdrop.remove();
      viewport.remove();
      resolve(result);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        cleanup(true);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    backdrop.addEventListener("mousedown", () => cleanup(false));

    // Cancel button (outline style)
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.className =
      "inline-flex h-8 min-w-20 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-[color:var(--color-border)] bg-[var(--color-background-elevated-primary-opaque)] px-3 text-[13px] font-medium text-[var(--color-text-foreground)] outline-none transition-colors hover:bg-[var(--color-background-elevated-secondary)] focus-visible:ring-1 focus-visible:ring-ring/60";
    cancelBtn.addEventListener("click", () => cleanup(false));

    // Confirm button mirrors the chat send action's foreground-on-background treatment.
    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.textContent = "Confirm";
    confirmBtn.className =
      "inline-flex h-8 min-w-20 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-foreground bg-foreground px-3 text-[13px] font-medium text-background outline-none transition-all duration-150 hover:scale-[1.02] hover:bg-foreground/92 focus-visible:ring-1 focus-visible:ring-ring/60";

    confirmBtn.addEventListener("click", () => cleanup(true));

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    popup.appendChild(footer);
    viewport.appendChild(popup);

    document.body.appendChild(backdrop);
    document.body.appendChild(viewport);

    // Auto-focus confirm button
    requestAnimationFrame(() => confirmBtn.focus());
  });
}
