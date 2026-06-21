// FILE: DebugFeatureFlagsMenu.tsx
// Purpose: Keeps local-only feature flag controls reusable without showing them in the product sidebar.
// Exports: DebugFeatureFlagsMenu
/**
 * @file 调试用 Feature Flag 菜单
 *
 * 仅在本地调试构建中启用的功能开关菜单：
 *
 * - **Feature Flag 切换**：列出 `FEATURE_FLAGS` 中所有可切换项
 * - **调试 Toast**：提供"模拟 git 错误"等本地 toast 触发器
 * - **复用 UI**：从 `Sidebar` 抽出，避免污染产品侧栏
 *
 * ## 核心导出
 *
 * - `DebugFeatureFlagsMenu`：菜单组件
 *
 * ## 使用场景
 *
 * - 本地开发环境侧边栏
 * - 调试 toast / 异常路径
 *
 * ## 注意事项
 *
 * - 仅在 `import.meta.env.DEV` 或调试构建中显示
 * - 切换 flag 通过 `setFeatureFlagEnabled` 写入 `localStorage`
 * - 不应在生产构建中渲染
 */
import { FlagIcon } from "~/lib/icons";
import {
  FEATURE_FLAGS,
  setFeatureFlagEnabled,
  useFeatureFlags,
  type ToggleFeatureFlagId,
} from "../featureFlags";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import { SidebarMenuButton } from "./ui/sidebar";
import { toastManager } from "./ui/toast";

// Triggers local-only toast scenarios that are awkward to reproduce through real Git failures.
function triggerActionFailedToasts(values: Record<ToggleFeatureFlagId, boolean>): void {
  const copyText =
    "Error: Git command failed in /Users/ibrahime/Documents/Projects/remi-claw\n\n" +
    "Command: git push upstream main\n" +
    "fatal: unable to access upstream remote for local debug toast preview";
  const toastData = {
    copyText,
    ...(values["persist-action-failed-debug-toasts"] ? {} : { dismissAfterVisibleMs: 30_000 }),
  };

  toastManager.add({
    type: "error",
    title: "Action failed",
    description: "Error: Git command failed in /Users/ibrahime/Documents/Projects/remi-claw",
    data: toastData,
  });
  toastManager.add({
    type: "error",
    title: "Action failed",
    description: "Error: Git command failed in /Users/ibrahime/Documents/Projects/remi-claw",
    data: toastData,
  });
}

export function DebugFeatureFlagsMenu() {
  const values = useFeatureFlags();

  return (
    <Menu>
      <MenuTrigger
        render={
          <SidebarMenuButton
            size="default"
            className="h-8 flex-1 gap-2.5 rounded-lg px-2 text-(length:--app-font-size-ui,12px) font-normal text-muted-foreground/72 hover:bg-(--sidebar-accent)"
          />
        }
      >
        <FlagIcon className="size-[15px]" />
        <span>Feature flags</span>
      </MenuTrigger>
      <MenuPopup
        align="start"
        side="top"
        className="min-w-72 rounded-lg border-(--color-border) bg-(--color-background-elevated-primary-opaque) shadow-lg"
      >
        <MenuGroup>
          <MenuGroupLabel>Local feature flags</MenuGroupLabel>
          {FEATURE_FLAGS.map((flag) => {
            if (flag.kind === "action") {
              return (
                <MenuItem
                  key={flag.id}
                  onClick={() => triggerActionFailedToasts(values)}
                  className="py-2"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span>{flag.label}</span>
                    <span className="text-(length:--app-font-size-ui-xs,10px) leading-4 text-muted-foreground/70">
                      {flag.description}
                    </span>
                  </div>
                </MenuItem>
              );
            }

            return (
              <MenuCheckboxItem
                key={flag.id}
                checked={values[flag.id]}
                onCheckedChange={(checked) => {
                  setFeatureFlagEnabled(flag.id, Boolean(checked));
                }}
                variant="switch"
                className="py-2"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span>{flag.label}</span>
                  <span className="text-(length:--app-font-size-ui-xs,10px) leading-4 text-muted-foreground/70">
                    {flag.description}
                  </span>
                </div>
              </MenuCheckboxItem>
            );
          })}
        </MenuGroup>
        <MenuSeparator />
        <div className="px-2 py-1.5 text-(length:--app-font-size-ui-xs,10px) leading-4 text-muted-foreground/58">
          Stored only in this browser profile.
        </div>
      </MenuPopup>
    </Menu>
  );
}
