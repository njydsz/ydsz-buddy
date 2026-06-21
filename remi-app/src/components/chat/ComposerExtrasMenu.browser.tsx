// FILE: ComposerExtrasMenu.browser.tsx
// Purpose: Verifies the composer `+` menu exposes image-only uploads and quick mode toggles.
// Layer: Browser UI test
// Depends on: vitest browser rendering helpers and the ComposerExtrasMenu component.
/**
 * @file ComposerExtrasMenu 浏览器端测试
 *
 * 验证 Composer "+" 菜单在真实浏览器中的行为：
 *
 * - **图片附件**：仅支持图片类型上传
 * - **快速模式切换**：fast mode 等开关
 * - **菜单项展示**：所有可选项可见
 *
 * ## 使用场景
 *
 * - CI 浏览器集成测试
 * - Composer 附加菜单回归
 *
 * ## 注意事项
 *
 * - 通过 `mountMenu` 工具函数挂载
 * - 使用 `fastModeEnabled` 等 props 控制初始状态
 */
import "../../index.css";

import { page } from "@vitest/browser/context";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ComposerExtrasMenu } from "./ComposerExtrasMenu";

async function mountMenu(props?: {
  fastModeEnabled?: boolean;
  interactionMode?: "default" | "plan";
  supportsFastMode?: boolean;
}) {
  const onAddPhotos = vi.fn();
  const onToggleFastMode = vi.fn();
  const onSetPlanMode = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const screen = await render(
    <ComposerExtrasMenu
      interactionMode={props?.interactionMode ?? "default"}
      supportsFastMode={props?.supportsFastMode ?? true}
      fastModeEnabled={props?.fastModeEnabled ?? false}
      onAddPhotos={onAddPhotos}
      onToggleFastMode={onToggleFastMode}
      onSetPlanMode={onSetPlanMode}
    />,
    { container: host },
  );

  const cleanup = async () => {
    await screen.unmount();
    host.remove();
  };

  return {
    [Symbol.asyncDispose]: cleanup,
    cleanup,
    onAddPhotos,
    onToggleFastMode,
    onSetPlanMode,
  };
}

describe("ComposerExtrasMenu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("uses an image-only file picker and forwards selected images", async () => {
    await using menu = await mountMenu();

    const input = document.querySelector<HTMLInputElement>("[data-testid='composer-photo-input']");
    expect(input).not.toBeNull();
    expect(input?.accept).toBe("image/*");

    const files = new DataTransfer();
    files.items.add(new File(["photo"], "photo.png", { type: "image/png" }));
    Object.defineProperty(input, "files", {
      configurable: true,
      value: files.files,
    });
    input?.dispatchEvent(new Event("change", { bubbles: true }));

    expect(menu.onAddPhotos).toHaveBeenCalledTimes(1);
    expect(menu.onAddPhotos.mock.calls[0]?.[0]?.[0]?.name).toBe("photo.png");
  });

  it("shows the attachment action in the menu", async () => {
    await using _ = await mountMenu({ interactionMode: "plan", fastModeEnabled: true });

    await page.getByLabelText("Composer extras").click();

    await vi.waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("Add image");
      expect(text).toContain("Plan mode");
      expect(text).toContain("Fast");
      expect(text).not.toContain("Plugins");
    });
  });

  it("wires the plan and speed controls", async () => {
    await using menu = await mountMenu();

    await page.getByLabelText("Composer extras").click();
    await page.getByText("Plan mode").click();
    await page.getByText("Fast").click();
    await page.getByRole("menuitemradio", { name: "Fast" }).click();

    expect(menu.onSetPlanMode).toHaveBeenCalledWith(true);
    expect(menu.onToggleFastMode).toHaveBeenCalledTimes(1);
  });
});
