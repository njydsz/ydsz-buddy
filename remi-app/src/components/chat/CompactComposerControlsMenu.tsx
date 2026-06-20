/**
 * @file CompactComposerControlsMenu.tsx
 * @description 紧凑模式下的编辑器控制菜单，提供交互模式切换、计划侧边栏显示和特性菜单等控制项。
 */

import { ProviderInteractionMode, RuntimeMode } from "~/contracts";
import { memo, type ReactNode } from "react";
import { EllipsisIcon, ListTodoIcon } from "~/lib/icons";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuTrigger,
} from "../ui/menu";

/**
 * CompactComposerControlsMenu 组件
 * @description 紧凑模式下的编辑器控制菜单，通过省略号按钮触发，包含模式切换和计划侧边栏控制
 * @param props.activePlan - 是否有活跃的计划
 * @param props.interactionMode - 当前交互模式（默认/计划）
 * @param props.planSidebarOpen - 计划侧边栏是否已打开
 * @param props.runtimeMode - 当前运行时模式
 * @param props.traitsMenuContent - 特性菜单内容（可选）
 * @param props.onToggleInteractionMode - 切换交互模式回调
 * @param props.onTogglePlanSidebar - 切换计划侧边栏回调
 * @param props.onToggleRuntimeMode - 切换运行时模式回调
 */
export const CompactComposerControlsMenu = memo(function CompactComposerControlsMenu(props: {
  activePlan: boolean;
  interactionMode: ProviderInteractionMode;
  planSidebarOpen: boolean;
  runtimeMode: RuntimeMode;
  traitsMenuContent?: ReactNode;
  onToggleInteractionMode: () => void;
  onTogglePlanSidebar: () => void;
  onToggleRuntimeMode: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="chrome"
            className="shrink-0 px-2"
            aria-label="More composer controls"
          />
        }
      >
        <EllipsisIcon aria-hidden="true" className="size-4" />
      </MenuTrigger>
      <MenuPopup align="start">
        {props.traitsMenuContent ? (
          <>
            {props.traitsMenuContent}
            <MenuDivider />
          </>
        ) : null}
        <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Mode</div>
        <MenuRadioGroup
          value={props.interactionMode}
          onValueChange={(value) => {
            if (!value || value === props.interactionMode) return;
            props.onToggleInteractionMode();
          }}
        >
          <MenuRadioItem value="default">Build</MenuRadioItem>
          <MenuRadioItem value="plan">Plan</MenuRadioItem>
        </MenuRadioGroup>
        {props.activePlan ? (
          <>
            <MenuDivider />
            <MenuItem onClick={props.onTogglePlanSidebar}>
              <ListTodoIcon className="size-4 shrink-0" />
              {props.planSidebarOpen ? "Hide plan sidebar" : "Show plan sidebar"}
            </MenuItem>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
});
