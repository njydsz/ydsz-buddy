/**
 * @file ComposerExtrasMenu.tsx
 * @description 聊天编辑器的附加功能菜单（"+"按钮），提供图片附件添加、计划模式切换和快速模式切换等功能。
 */

import { type ProviderInteractionMode } from "~/contracts";
import { memo, useId, useRef, type ChangeEvent } from "react";
import { GoTasklist } from "react-icons/go";

import { PaperclipIcon, PlusIcon } from "~/lib/icons";
import { Button } from "../ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";

/**
 * ComposerExtrasMenu 组件
 * @description 编辑器附加功能菜单，包含添加图片、计划模式开关和快速模式子菜单
 * @param props.interactionMode - 当前交互模式（默认/计划）
 * @param props.supportsFastMode - 当前模型是否支持快速模式
 * @param props.fastModeEnabled - 快速模式是否已启用
 * @param props.onAddPhotos - 添加图片回调
 * @param props.onToggleFastMode - 切换快速模式回调
 * @param props.onSetPlanMode - 设置计划模式回调
 */
export const ComposerExtrasMenu = memo(function ComposerExtrasMenu(props: {
  interactionMode: ProviderInteractionMode;
  supportsFastMode: boolean;
  fastModeEnabled: boolean;
  onAddPhotos: (files: File[]) => void;
  onToggleFastMode: () => void;
  onSetPlanMode: (enabled: boolean) => void;
}) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset the hidden input so selecting the same image twice still emits a change event.
  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      props.onAddPhotos(files);
    }
    event.target.value = "";
  };

  return (
    <>
      <input
        id={inputId}
        ref={fileInputRef}
        data-testid="composer-photo-input"
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleFileInputChange}
      />
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="icon-sm"
              variant="chrome"
              className="shrink-0 rounded-md"
              aria-label="Composer extras"
            />
          }
        >
          <PlusIcon aria-hidden="true" className="size-4" />
        </MenuTrigger>
        <MenuPopup align="start">
          <MenuItem
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            <PaperclipIcon className="size-4 shrink-0" />
            Add image
          </MenuItem>

          <MenuSeparator />
          <MenuCheckboxItem
            checked={props.interactionMode === "plan"}
            variant="switch"
            onCheckedChange={(checked) => {
              props.onSetPlanMode(checked === true);
            }}
          >
            <span className="inline-flex items-center gap-2">
              <GoTasklist className="size-4 shrink-0" />
              Plan mode
            </span>
          </MenuCheckboxItem>

          {props.supportsFastMode ? (
            <>
              <MenuSeparator />
              <MenuSub>
                <MenuSubTrigger>Fast</MenuSubTrigger>
                <MenuSubPopup>
                  <MenuRadioGroup
                    value={props.fastModeEnabled ? "fast" : "normal"}
                    onValueChange={(value) => {
                      const shouldEnableFast = value === "fast";
                      if (shouldEnableFast === props.fastModeEnabled) return;
                      props.onToggleFastMode();
                    }}
                  >
                    <MenuRadioItem value="normal">Default</MenuRadioItem>
                    <MenuRadioItem value="fast">Fast</MenuRadioItem>
                  </MenuRadioGroup>
                </MenuSubPopup>
              </MenuSub>
            </>
          ) : null}
        </MenuPopup>
      </Menu>
    </>
  );
});
