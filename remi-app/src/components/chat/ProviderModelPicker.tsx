/**
 * @file ProviderModelPicker
 * @description 编辑器服务提供者/模型选择菜单，支持受控打开和快捷键触发。
 *              展示可用和不可用的服务提供者，支持模型搜索、收藏和分组显示。
 */

import { type ModelSlug, type ProviderKind, type ServerProviderStatus } from "~/contracts";
import { resolveSelectableModel } from "~/shared/model";
import * as Schema from "effect/Schema";
import {
  Fragment,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type ProviderPickerKind, PROVIDER_OPTIONS } from "../../session-logic";
import { formatProviderModelOptionName } from "../../providerModelOptions";
import { compareProvidersByOrder } from "../../providerOrdering";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
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
import { PROVIDER_ICON_COMPONENT_BY_PROVIDER } from "../ProviderIcon";
import { cn } from "~/lib/utils";
import { PickerPanelShell } from "./PickerPanelShell";
import { PickerTriggerButton } from "./PickerTriggerButton";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ShortcutKbd } from "../ui/shortcut-kbd";
import {
  groupProviderModelOptions,
  groupProviderModelOptionsWithFavorites,
  type ProviderModelOption,
} from "../../providerModelOptions";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { StarFilledIcon, StarIcon } from "../../lib/icons";
import { Skeleton } from "../ui/skeleton";

/**
 * 类型守卫：判断服务提供者选项是否可用。
 *
 * @param option - 服务提供者选项
 * @returns 是否为可用的服务提供者选项
 */
function isAvailableProviderOption(option: (typeof PROVIDER_OPTIONS)[number]): option is {
  value: ProviderKind;
  label: string;
  available: true;
} {
  return option.available;
}

/**
 * 解析服务提供者的实时可用性状态。
 * 根据服务提供者状态和认证信息判断是否可用及显示标签。
 *
 * @param provider - 服务提供者状态信息
 * @returns 包含禁用状态和显示标签的对象
 */
function resolveLiveProviderAvailability(provider: ServerProviderStatus | undefined): {
  disabled: boolean;
  label: string | null;
} {
  if (!provider) {
    return {
      disabled: true,
      label: "Checking",
    };
  }

  if (!provider.available) {
    return {
      disabled: true,
      label: provider.authStatus === "unauthenticated" ? "Sign in" : "Unavailable",
    };
  }

  if (provider.authStatus === "unauthenticated") {
    return {
      disabled: true,
      label: "Sign in",
    };
  }

  return {
    disabled: false,
    label: null,
  };
}

/** 可用的服务提供者选项列表 */
export const AVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter(isAvailableProviderOption);
/** 不可用的服务提供者选项列表 */
const UNAVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter((option) => !option.available);

/**
 * 根据可见性过滤服务提供者选项列表。
 * 移除用户隐藏的提供者，但始终保留受保护的提供者（如当前活跃和锁定的提供者）。
 *
 * @param options - 待过滤的选项列表
 * @param hiddenProviders - 用户隐藏的提供者集合
 * @param protectedProviders - 受保护的提供者集合
 * @returns 过滤后的选项列表
 */
function filterProviderOptionsByVisibility<T extends { value: ProviderKind }>(
  options: ReadonlyArray<T>,
  hiddenProviders: ReadonlySet<ProviderKind>,
  protectedProviders: ReadonlySet<ProviderKind>,
): ReadonlyArray<T> {
  if (hiddenProviders.size === 0) {
    return options;
  }
  return options.filter(
    (option) => protectedProviders.has(option.value) || !hiddenProviders.has(option.value),
  );
}

/**
 * 获取服务提供者图标的 CSS 类名。
 * 部分提供者需要使用前景色而非默认的弱化色。
 *
 * @param provider - 服务提供者类型
 * @param fallbackClassName - 默认的 CSS 类名
 * @returns 适用的 CSS 类名
 */
function providerIconClassName(
  provider: ProviderKind | ProviderPickerKind,
  fallbackClassName: string,
): string {
  return provider === "claudeAgent" || provider === "gemini" || provider === "pi"
    ? "text-foreground"
    : fallbackClassName;
}

/** 触发模型搜索功能的最小模型数量阈值 */
const SEARCHABLE_MODEL_PICKER_THRESHOLD = 15;
/** 各提供者的收藏模型本地存储键 */
const FAVORITE_MODEL_STORAGE_KEYS = {
  cursor: "remicode:cursor-favourite-models:v1",
  kilo: "remicode:kilo-favourite-models:v1",
  opencode: "remicode:opencode-favourite-models:v1",
  pi: "remicode:pi-favourite-models:v1",
} as const;
/** 收藏模型 slug 数组的 Schema 定义 */
const FavoriteModelSlugs = Schema.Array(Schema.String);
/** 支持收藏功能的提供者类型 */
type FavoriteModelProvider = keyof typeof FAVORITE_MODEL_STORAGE_KEYS;

/**
 * 判断服务提供者是否支持模型收藏功能。
 *
 * @param provider - 服务提供者类型
 * @returns 是否支持收藏功能
 */
function supportsModelFavorites(provider: ProviderKind): provider is FavoriteModelProvider {
  return (
    provider === "cursor" || provider === "kilo" || provider === "opencode" || provider === "pi"
  );
}

/**
 * 切换收藏模型 slug，保持列表紧凑且保留用户顺序。
 *
 * @param current - 当前收藏列表
 * @param slug - 待切换的模型 slug
 * @returns 更新后的收藏列表
 */
function toggleFavoriteModelSlug(current: ReadonlyArray<string>, slug: string): string[] {
  const normalizedCurrent = Array.from(new Set(current.filter((entry) => entry.trim().length > 0)));
  return normalizedCurrent.includes(slug)
    ? normalizedCurrent.filter((entry) => entry !== slug)
    : [...normalizedCurrent, slug];
}

/**
 * 移除模型名称中的参数化后缀（如 `[fast=false]`）。
 *
 * @param model - 模型标识
 * @returns 去除参数化后缀的模型标识
 */
function stripParameterizedModelSuffix(model: string): string {
  return model.trim().replace(/\[[^\]]*\]$/u, "");
}

/**
 * 解析当前选中模型的显示标签。
 * 优先精确匹配，对 Cursor 提供者还会尝试去除参数化后缀后匹配。
 *
 * @param input.provider - 服务提供者类型
 * @param input.model - 当前模型标识
 * @param input.options - 可用模型选项列表
 * @returns 模型的显示标签
 */
function resolveSelectedModelLabel(input: {
  provider: ProviderKind;
  model: string;
  options: ReadonlyArray<ProviderModelOption>;
}): string {
  const exact = input.options.find((option) => option.slug === input.model);
  if (exact) {
    return exact.name;
  }
  if (input.provider === "cursor") {
    const baseModel = stripParameterizedModelSuffix(input.model);
    const baseMatch = input.options.find(
      (option) => stripParameterizedModelSuffix(option.slug) === baseModel,
    );
    if (baseMatch) {
      return baseMatch.name;
    }
  }
  return formatProviderModelOptionName({
    provider: input.provider,
    slug: input.model,
  });
}

/**
 * 构建模型选项的搜索文本，将名称、slug、上游提供者信息拼接为小写字符串。
 *
 * @param option - 模型选项
 * @returns 用于搜索匹配的小写字符串
 */
function buildModelSearchText(option: ProviderModelOption): string {
  return [option.name, option.slug, option.upstreamProviderName, option.upstreamProviderId]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

/**
 * 服务提供者/模型选择器组件。
 * 以菜单形式展示可用和不可用的服务提供者，支持模型搜索、收藏和分组显示。
 * 当提供者被锁定时直接展示模型列表，否则展示提供者子菜单。
 *
 * @param props.provider - 当前服务提供者
 * @param props.model - 当前模型标识
 * @param props.lockedProvider - 锁定的服务提供者（线程中途不可切换时）
 * @param props.providers - 服务提供者状态列表
 * @param props.modelOptionsByProvider - 各提供者的模型选项映射
 * @param props.loadingModelProviders - 正在加载模型的提供者映射
 * @param props.hiddenProviders - 用户隐藏的提供者集合
 * @param props.providerOrder - 提供者排序顺序
 * @param props.activeProviderIconClassName - 活跃提供者图标的 CSS 类名
 * @param props.compact - 是否使用紧凑模式
 * @param props.disabled - 是否禁用选择器
 * @param props.open - 受控的菜单打开状态
 * @param props.onOpenChange - 菜单打开状态变更回调
 * @param props.onSelectionCommitted - 选择提交后的回调
 * @param props.shortcutLabel - 快捷键标签
 * @param props.onProviderModelChange - 提供者/模型变更回调
 */
export const ProviderModelPicker = memo(function ProviderModelPicker(props: {
  provider: ProviderKind;
  model: ModelSlug;
  lockedProvider: ProviderKind | null;
  providers?: ReadonlyArray<ServerProviderStatus>;
  modelOptionsByProvider: Record<ProviderKind, ReadonlyArray<ProviderModelOption>>;
  loadingModelProviders?: Partial<Record<ProviderKind, boolean>>;
  hiddenProviders?: ReadonlyArray<ProviderKind>;
  providerOrder?: ReadonlyArray<ProviderKind>;
  activeProviderIconClassName?: string;
  compact?: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelectionCommitted?: () => void;
  shortcutLabel?: string | null;
  onProviderModelChange: (provider: ProviderKind, model: ModelSlug) => void;
}) {
  const { onOpenChange, onSelectionCommitted, open } = props;
  const [uncontrolledMenuOpen, setUncontrolledMenuOpen] = useState(false);
  const selectionCommitTimerRef = useRef<number | null>(null);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [kiloFavoriteModelSlugs, setKiloFavoriteModelSlugs] = useLocalStorage(
    FAVORITE_MODEL_STORAGE_KEYS.kilo,
    [] as string[],
    FavoriteModelSlugs,
  );
  const [cursorFavoriteModelSlugs, setCursorFavoriteModelSlugs] = useLocalStorage(
    FAVORITE_MODEL_STORAGE_KEYS.cursor,
    [] as string[],
    FavoriteModelSlugs,
  );
  const [openCodeFavoriteModelSlugs, setOpenCodeFavoriteModelSlugs] = useLocalStorage(
    FAVORITE_MODEL_STORAGE_KEYS.opencode,
    [] as string[],
    FavoriteModelSlugs,
  );
  const [piFavoriteModelSlugs, setPiFavoriteModelSlugs] = useLocalStorage(
    FAVORITE_MODEL_STORAGE_KEYS.pi,
    [] as string[],
    FavoriteModelSlugs,
  );
  const deferredModelSearchQuery = useDeferredValue(modelSearchQuery);
  const activeProvider = props.lockedProvider ?? props.provider;
  const isMenuOpen = open ?? uncontrolledMenuOpen;
  const hiddenProviders = props.hiddenProviders;
  const providerOrder = props.providerOrder;
  const hiddenProviderSet = useMemo(
    () => new Set<ProviderKind>(hiddenProviders ?? []),
    [hiddenProviders],
  );
  const protectedProviderSet = useMemo(() => {
    const set = new Set<ProviderKind>([props.provider]);
    if (props.lockedProvider !== null) {
      set.add(props.lockedProvider);
    }
    return set;
  }, [props.provider, props.lockedProvider]);
  const visibleAvailableProviderOptions = useMemo(
    () =>
      filterProviderOptionsByVisibility(
        [...AVAILABLE_PROVIDER_OPTIONS].sort((left, right) =>
          compareProvidersByOrder(providerOrder ?? [], left.value, right.value),
        ),
        hiddenProviderSet,
        protectedProviderSet,
      ),
    [hiddenProviderSet, protectedProviderSet, providerOrder],
  );
  const visibleUnavailableProviderOptions = useMemo(
    () =>
      filterProviderOptionsByVisibility(
        [...UNAVAILABLE_PROVIDER_OPTIONS].sort((left, right) =>
          compareProvidersByOrder(providerOrder ?? [], left.value, right.value),
        ),
        hiddenProviderSet,
        protectedProviderSet,
      ),
    [hiddenProviderSet, protectedProviderSet, providerOrder],
  );
  const kiloFavoriteModelSlugSet = useMemo(
    () => new Set(kiloFavoriteModelSlugs),
    [kiloFavoriteModelSlugs],
  );
  const openCodeFavoriteModelSlugSet = useMemo(
    () => new Set(openCodeFavoriteModelSlugs),
    [openCodeFavoriteModelSlugs],
  );
  const cursorFavoriteModelSlugSet = useMemo(
    () => new Set(cursorFavoriteModelSlugs),
    [cursorFavoriteModelSlugs],
  );
  const piFavoriteModelSlugSet = useMemo(
    () => new Set(piFavoriteModelSlugs),
    [piFavoriteModelSlugs],
  );
  const favoriteModelSlugSets = useMemo(
    () => ({
      cursor: cursorFavoriteModelSlugSet,
      kilo: kiloFavoriteModelSlugSet,
      opencode: openCodeFavoriteModelSlugSet,
      pi: piFavoriteModelSlugSet,
    }),
    [
      cursorFavoriteModelSlugSet,
      kiloFavoriteModelSlugSet,
      openCodeFavoriteModelSlugSet,
      piFavoriteModelSlugSet,
    ],
  );
  const selectedProviderOptions = props.modelOptionsByProvider[activeProvider];
  const selectedModelLabel = resolveSelectedModelLabel({
    provider: activeProvider,
    model: props.model,
    options: selectedProviderOptions,
  });
  const ProviderIcon = PROVIDER_ICON_COMPONENT_BY_PROVIDER[activeProvider];
  const setMenuOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setUncontrolledMenuOpen(nextOpen);
      }
      if (!nextOpen) {
        setModelSearchQuery("");
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );
  const scheduleSelectionCommitted = useCallback(() => {
    if (selectionCommitTimerRef.current !== null) {
      window.clearTimeout(selectionCommitTimerRef.current);
    }
    // Base UI restores focus to the trigger while closing; refocus callers after that tick.
    selectionCommitTimerRef.current = window.setTimeout(() => {
      selectionCommitTimerRef.current = null;
      onSelectionCommitted?.();
    }, 0);
  }, [onSelectionCommitted]);
  useEffect(
    () => () => {
      if (selectionCommitTimerRef.current !== null) {
        window.clearTimeout(selectionCommitTimerRef.current);
      }
    },
    [],
  );
  const handleModelChange = (provider: ProviderKind, value: string) => {
    if (props.disabled) return;
    if (!value) return;
    const resolvedModel = resolveSelectableModel(
      provider,
      value,
      props.modelOptionsByProvider[provider],
    );
    if (!resolvedModel) return;
    props.onProviderModelChange(provider, resolvedModel);
    setMenuOpen(false);
    scheduleSelectionCommitted();
  };
  const toggleFavoriteModel = useCallback(
    (provider: FavoriteModelProvider, slug: string) => {
      const setFavoriteModelSlugs =
        provider === "cursor"
          ? setCursorFavoriteModelSlugs
          : provider === "kilo"
            ? setKiloFavoriteModelSlugs
            : provider === "pi"
              ? setPiFavoriteModelSlugs
              : setOpenCodeFavoriteModelSlugs;
      setFavoriteModelSlugs((current) => toggleFavoriteModelSlug(current, slug));
    },
    [
      setCursorFavoriteModelSlugs,
      setKiloFavoriteModelSlugs,
      setOpenCodeFavoriteModelSlugs,
      setPiFavoriteModelSlugs,
    ],
  );

  const renderModelRadioGroup = (provider: ProviderKind) => {
    if (props.loadingModelProviders?.[provider]) {
      return (
        <div className="w-60 space-y-2 px-2 py-2" aria-label="Loading models">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-2 rounded-md px-2 py-1.5">
              <Skeleton className="size-3.5 rounded-full" />
              <Skeleton className={cn("h-3.5 rounded-full", index % 3 === 0 ? "w-24" : "w-32")} />
            </div>
          ))}
        </div>
      );
    }

    const providerOptions = props.modelOptionsByProvider[provider];
    const shouldShowSearch =
      (provider === "kilo" ||
        provider === "opencode" ||
        provider === "cursor" ||
        provider === "pi") &&
      providerOptions.length >= SEARCHABLE_MODEL_PICKER_THRESHOLD;
    const normalizedModelSearchQuery = deferredModelSearchQuery.trim().toLowerCase();
    const filteredOptions =
      shouldShowSearch && normalizedModelSearchQuery.length > 0
        ? providerOptions.filter((option) =>
            buildModelSearchText(option).includes(normalizedModelSearchQuery),
          )
        : providerOptions;
    const favoriteProvider = supportsModelFavorites(provider) ? provider : null;
    const favoriteModelSlugSet =
      favoriteProvider !== null ? favoriteModelSlugSets[favoriteProvider] : undefined;
    const groupedOptions =
      favoriteModelSlugSet !== undefined
        ? groupProviderModelOptionsWithFavorites({
            options: filteredOptions,
            favoriteSlugs: favoriteModelSlugSet,
          })
        : groupProviderModelOptions(filteredOptions);

    const content =
      groupedOptions.length > 0 ? (
        <MenuRadioGroup
          value={activeProvider === provider ? props.model : ""}
          onValueChange={(value) => handleModelChange(provider, value)}
        >
          {groupedOptions.map((group, index) => (
            <Fragment key={`${provider}:${group.key}`}>
              <MenuGroup>
                {group.label ? <MenuGroupLabel>{group.label}</MenuGroupLabel> : null}
                {group.options.map((modelOption) => {
                  const isFavorite = favoriteModelSlugSet?.has(modelOption.slug) ?? false;
                  return (
                    <MenuRadioItem
                      key={`${provider}:${modelOption.slug}`}
                      value={modelOption.slug}
                      onClick={() => {
                        setMenuOpen(false);
                        scheduleSelectionCommitted();
                      }}
                    >
                      {favoriteModelSlugSet !== undefined ? (
                        <span className="flex w-full min-w-0 items-center gap-2">
                          <span className="block min-w-0 flex-1 truncate">{modelOption.name}</span>
                          <button
                            type="button"
                            aria-label={
                              isFavorite
                                ? `Remove ${modelOption.name} from favourites`
                                : `Add ${modelOption.name} to favourites`
                            }
                            className={cn(
                              "-me-2 ms-auto inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground/55 transition-colors hover:bg-(--color-background-elevated-tertiary) hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60",
                              isFavorite && "text-amber-300 hover:text-amber-200",
                            )}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (favoriteProvider !== null) {
                                toggleFavoriteModel(favoriteProvider, modelOption.slug);
                              }
                            }}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                            }}
                          >
                            {isFavorite ? (
                              <StarFilledIcon aria-hidden="true" className="size-3.5" />
                            ) : (
                              <StarIcon aria-hidden="true" className="size-3.5" />
                            )}
                          </button>
                        </span>
                      ) : (
                        modelOption.name
                      )}
                    </MenuRadioItem>
                  );
                })}
              </MenuGroup>
              {index < groupedOptions.length - 1 ? <MenuSeparator /> : null}
            </Fragment>
          ))}
        </MenuRadioGroup>
      ) : (
        <div className="px-2 py-2 text-muted-foreground text-sm">No matches</div>
      );

    if (!shouldShowSearch) {
      return content;
    }

    return (
      <PickerPanelShell
        searchPlaceholder="Search models or providers"
        query={modelSearchQuery}
        onQueryChange={setModelSearchQuery}
        stopSearchKeyPropagation
        autoFocusSearch
        widthClassName="w-60"
        bleedParentPadding
      >
        {content}
      </PickerPanelShell>
    );
  };

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={(open) => {
        if (props.disabled) {
          setMenuOpen(false);
          return;
        }
        setMenuOpen(open);
      }}
    >
      {props.shortcutLabel ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={
                  <PickerTriggerButton
                    disabled={props.disabled ?? false}
                    compact={props.compact ?? false}
                    icon={
                      <ProviderIcon
                        aria-hidden="true"
                        className={cn(
                          "size-3.5 shrink-0",
                          providerIconClassName(activeProvider, "text-muted-foreground/70"),
                          props.activeProviderIconClassName,
                        )}
                      />
                    }
                    label={selectedModelLabel}
                  />
                }
              />
            }
          >
            <span className="sr-only">{selectedModelLabel}</span>
          </TooltipTrigger>
          {!isMenuOpen ? (
            <TooltipPopup side="top" sideOffset={6}>
              <span className="inline-flex items-center gap-2 px-1 py-0.5">
                <span>Change model</span>
                <ShortcutKbd
                  shortcutLabel={props.shortcutLabel}
                  className="h-4 min-w-4 px-1 text-(length:--app-font-size-ui-2xs,9px) text-muted-foreground"
                />
              </span>
            </TooltipPopup>
          ) : null}
        </Tooltip>
      ) : (
        <MenuTrigger
          render={
            <PickerTriggerButton
              disabled={props.disabled ?? false}
              compact={props.compact ?? false}
              icon={
                <ProviderIcon
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 shrink-0",
                    providerIconClassName(activeProvider, "text-muted-foreground/70"),
                    props.activeProviderIconClassName,
                  )}
                />
              }
              label={selectedModelLabel}
            />
          }
        >
          <span className="sr-only">{selectedModelLabel}</span>
        </MenuTrigger>
      )}
      <MenuPopup align="start">
        {props.lockedProvider !== null ? (
          renderModelRadioGroup(props.lockedProvider)
        ) : (
          <>
            {visibleAvailableProviderOptions.map((option) => {
              const OptionIcon = PROVIDER_ICON_COMPONENT_BY_PROVIDER[option.value];
              const liveProvider = props.providers?.find(
                (entry) => entry.provider === option.value,
              );
              const availability = resolveLiveProviderAvailability(liveProvider);
              if (availability.disabled) {
                return (
                  <MenuItem key={option.value} disabled>
                    <OptionIcon
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0 opacity-80",
                        providerIconClassName(option.value, "text-muted-foreground/85"),
                      )}
                    />
                    <span>{option.label}</span>
                    <span className="ms-auto text-[11px] text-muted-foreground/80 uppercase tracking-[0.08em]">
                      {availability.label}
                    </span>
                  </MenuItem>
                );
              }
              return (
                <MenuSub key={option.value}>
                  <MenuSubTrigger>
                    <OptionIcon
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0",
                        providerIconClassName(option.value, "text-muted-foreground/85"),
                      )}
                    />
                    {option.label}
                  </MenuSubTrigger>
                  <MenuSubPopup className="[--available-height:min(24rem,70vh)]">
                    {renderModelRadioGroup(option.value)}
                  </MenuSubPopup>
                </MenuSub>
              );
            })}
            {visibleUnavailableProviderOptions.length > 0 && <MenuSeparator />}
            {visibleUnavailableProviderOptions.map((option) => {
              const OptionIcon = PROVIDER_ICON_COMPONENT_BY_PROVIDER[option.value];
              return (
                <MenuItem key={option.value} disabled>
                  <OptionIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground/85 opacity-80"
                  />
                  <span>{option.label}</span>
                  <span className="ms-auto text-[11px] text-muted-foreground/80 uppercase tracking-[0.08em]">
                    Coming soon
                  </span>
                </MenuItem>
              );
            })}
          </>
        )}
      </MenuPopup>
    </Menu>
  );
});
