/**
 * @file Composer 图像生成 Pick Hook
 *
 * 当 Composer 中识别到 `@image` 触发器时，调用后端 `image_gen.list_providers`
 * 获取可用 Provider 列表，并映射为 `ComposerCommandItem` 列表。
 *
 * ## 工作机制
 *
 * 1. **触发器识别**: 仅在 `composerTrigger.kind === "mention"` 且
 *    query 以 `image` 开头时启用。
 * 2. **Provider 列表**: 首次触发时拉取可用 Provider 缓存。
 * 3. **Prompt 输入**: `@image <prompt>` 用户直接输入提示词后按 Enter 触发生成。
 * 4. **配置引导**: 未配置 API key 时引导用户去设置页配置。
 *
 * ## 使用场景
 *
 * - `useComposerCommandMenuItems` 在 `mention` 模式下拉取 image 结果
 * - 选中后由 ChatView 负责把 prompt 写入对话并调用生成接口
 */

import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import type { ComposerTrigger } from "../composer-logic";

/** 触发字符串(不含 `@` 前缀) */
const IMAGE_TRIGGER = "image";

/** 标签页结果上限 */
const IMAGE_RESULT_LIMIT = 10;

export interface ImageGenProviderInfo {
  provider: string;
  displayName: string;
  models: string[];
  configRequirements: {
    requiresApiKey: boolean;
    apiKeyEnv?: string;
    requiresEndpoint: boolean;
    defaultEndpoint?: string;
  };
}

export interface UseComposerImageGenPickResult {
  items: ComposerCommandItem[];
  isLoading: boolean;
  hasError: boolean;
  query: string;
  providers: ImageGenProviderInfo[];
}

interface ExtractedImageQuery {
  matches: boolean;
  query: string;
  /** 是否为纯 `@image`（无后续 prompt） */
  isbare: boolean;
}

/**
 * 判断 mention 触发器是否匹配 @image 模式
 *
 * - `@image` (query === "image"): 展示 Provider 选择 + 提示输入 prompt
 * - `@image <prompt>` (query 以 "image " 开头): 用户已输入 prompt，可直接生成
 */
function extractImageQuery(trigger: ComposerTrigger | null): ExtractedImageQuery {
  if (!trigger || trigger.kind !== "mention") {
    return { matches: false, query: "", isbare: false };
  }
  const raw = trigger.query.trim();
  if (raw === IMAGE_TRIGGER) {
    return { matches: true, query: "", isbare: true };
  }
  if (raw.startsWith(IMAGE_TRIGGER) && raw.length > IMAGE_TRIGGER.length) {
    const remainder = raw.slice(IMAGE_TRIGGER.length);
    if (remainder.startsWith(" ")) {
      return { matches: true, query: remainder.slice(1).trim(), isbare: false };
    }
  }
  return { matches: false, query: "", isbare: false };
}

/**
 * Composer @image 提及 Pick Hook
 *
 * @param trigger - 当前 Composer 触发器状态
 * @param threadId - 当前线程 ID（用于上下文）
 */
export function useComposerImageGenPick(
  trigger: ComposerTrigger | null,
  threadId?: string,
): UseComposerImageGenPickResult {
  const [providers, setProviders] = useState<ImageGenProviderInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const extracted = extractImageQuery(trigger);
  const isActive = extracted.matches;

  // 拉取可用 Provider 列表
  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);

    invoke<ImageGenProviderInfo[]>("image_gen.list_providers")
      .then((result) => {
        if (cancelled) return;
        setProviders(result.slice(0, IMAGE_RESULT_LIMIT));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[image_gen] 拉取 Provider 失败:", err);
        setHasError(true);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isActive, threadId]);

  // 构建菜单项
  const items = useMemo(() => {
    if (!isActive) return [];

    const menuItems: ComposerCommandItem[] = [];

    if (isLoading) {
      menuItems.push({
        id: "image-loading",
        label: "正在加载图像生成 Provider...",
        kind: "hint",
        disabled: true,
      });
      return menuItems;
    }

    if (hasError) {
      menuItems.push({
        id: "image-error",
        label: "加载失败，请检查网络后重试",
        kind: "hint",
        disabled: true,
      });
      return menuItems;
    }

    // 用户已输入 prompt → 提供生成选项
    if (!extracted.isbare && extracted.query.length > 0) {
      if (providers.length === 0) {
        menuItems.push({
          id: "image-no-provider",
          label: "未配置图像生成 Provider，请在设置中配置",
          kind: "hint",
          disabled: true,
        });
      } else {
        // 默认 Provider 直接生成
        const defaultProvider = providers[0];
        menuItems.push({
          id: `image-generate-${defaultProvider.provider}`,
          label: `使用 ${defaultProvider.displayName} 生成图像`,
          description: `提示词: "${extracted.query.slice(0, 40)}${extracted.query.length > 40 ? "..." : ""}"`,
          kind: "action",
          icon: "image",
          metadata: {
            action: "image_generate",
            prompt: extracted.query,
            provider: defaultProvider.provider,
          },
        });
        // 可选其他 Provider
        for (const p of providers.slice(1, 5)) {
          menuItems.push({
            id: `image-generate-${p.provider}`,
            label: `${p.displayName}`,
            description: `使用 ${p.models[0] ?? p.provider} 生成`,
            kind: "action",
            icon: "image",
            metadata: {
              action: "image_generate",
              prompt: extracted.query,
              provider: p.provider,
            },
          });
        }
      }
    } else {
      // 裸 @image → 提示输入 prompt
      if (providers.length === 0) {
        menuItems.push({
          id: "image-hint",
          label: "继续输入图像描述，生成 AI 图片",
          kind: "hint",
          disabled: true,
        });
        menuItems.push({
          id: "image-config-hint",
          label: "⚙️ 在设置中配置 FLUX / DALL-E / SD API Key",
          kind: "action",
          icon: "settings",
          metadata: { action: "open_settings", tab: "imageGen" },
        });
      } else {
        menuItems.push({
          id: "image-hint",
          label: "继续输入图像描述，按 Enter 生成",
          kind: "hint",
          disabled: true,
        });
        // 展示可用 Provider 快捷入口
        for (const p of providers.slice(0, 3)) {
          menuItems.push({
            id: `image-provider-${p.provider}`,
            label: `${p.displayName}`,
            description: p.models[0] ?? "",
            kind: "info",
            icon: "check",
            disabled: true,
          });
        }
      }
    }

    return menuItems;
  }, [isActive, isLoading, hasError, extracted.isbare, extracted.query, providers]);

  return {
    items,
    isLoading,
    hasError,
    query: extracted.query,
    providers,
  };
}
