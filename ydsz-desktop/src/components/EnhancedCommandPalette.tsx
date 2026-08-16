/**
 * @file 增强版命令面板
 *
 * 基于模糊搜索算法的命令面板，支持：
 *
 * - **模糊搜索**：fzf 风格匹配（"sc" → "Scheduler"）
 * - **分组展示**：导航 / Provider / Mode / Skill / Theme
 * - **近期命令**：Top 10 最近使用的命令
 * - **快捷键**：Cmd+K / Ctrl+K 触发
 * - **性能优化**：< 100ms 弹出
 *
 * ## 核心功能
 *
 * - 模糊搜索算法（见 fuzzySearch.ts）
 * - 命令分组与排序
 * - 近期命令持久化
 * - 键盘导航（↑/↓/Enter/Esc）
 *
 * ## 使用场景
 *
 * - 全局快捷操作
 * - 快速切换 Provider/Mode
 * - 导航到功能页面
 *
 * ## 注意事项
 *
 * - 响应时间 < 100ms
 * - 支持键盘完全操作
 * - 近期命令最多保存 10 条
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { PiCommand, PiMagnifyingGlass } from "react-icons/pi";
import { fuzzySearch, highlightMatches, type FuzzyMatchResult } from "~/lib/fuzzySearch";
import { cn } from "~/lib/utils";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import {
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import { Kbd, KbdGroup } from "./ui/kbd";
import { isMacPlatform } from "~/lib/utils";

/** 命令类型 */
export type CommandCategory = "navigation" | "provider" | "mode" | "skill" | "theme" | "action";

/** 命令项 */
export interface CommandItem {
  /** 唯一 ID */
  id: string;
  /** 显示标签 */
  label: string;
  /** 描述 */
  description?: string;
  /** 分类 */
  category: CommandCategory;
  /** 图标 */
  icon?: React.ComponentType<{ className?: string }>;
  /** 快捷键标签 */
  shortcutLabel?: string;
  /** 执行函数 */
  action: () => void;
  /** 搜索关键词 */
  keywords?: string[];
}

/** 近期命令记录 */
interface RecentCommand {
  id: string;
  count: number;
  lastUsed: number;
}

/** 命令面板 Props */
interface EnhancedCommandPaletteProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 命令列表 */
  commands: CommandItem[];
  /** 占位文本 */
  placeholder?: string;
}

/** 分类标签 */
const CATEGORY_LABELS: Record<CommandCategory, string> = {
  navigation: "导航",
  provider: "Provider",
  mode: "模式",
  skill: "技能",
  theme: "主题",
  action: "操作",
};

/** 分类排序权重 */
const CATEGORY_ORDER: Record<CommandCategory, number> = {
  navigation: 0,
  provider: 1,
  mode: 2,
  skill: 3,
  theme: 4,
  action: 5,
};

/**
 * 增强版命令面板
 */
export const EnhancedCommandPalette = memo(function EnhancedCommandPalette({
  isOpen,
  onClose,
  commands,
  placeholder = "搜索命令...",
}: EnhancedCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [recentCommands, setRecentCommands] = useLocalStorage<RecentCommand[]>(
    "command-palette:recent",
    [],
  );

  // 模糊搜索
  const searchResults = useMemo(() => {
    if (!query.trim()) {
      // 空查询：显示近期命令 + 全部命令
      const recentIds = new Set(recentCommands.map((r) => r.id));
      const recent = commands.filter((c) => recentIds.has(c.id));
      const others = commands.filter((c) => !recentIds.has(c.id));
      return [...recent, ...others].map((item) => ({
        item,
        score: 0,
        matches: [],
      }));
    }

    // 模糊搜索
    return fuzzySearch(
      query,
      commands,
      (cmd) => `${cmd.label} ${cmd.description ?? ""} ${(cmd.keywords ?? []).join(" ")}`,
    );
  }, [query, commands, recentCommands]);

  // 按分类分组
  const groupedResults = useMemo(() => {
    const groups = new Map<CommandCategory, FuzzyMatchResult<CommandItem>[]>();

    for (const result of searchResults) {
      const category = result.item.category;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(result);
    }

    // 按分类权重排序
    return Array.from(groups.entries()).sort(
      ([a], [b]) => CATEGORY_ORDER[a] - CATEGORY_ORDER[b],
    );
  }, [searchResults]);

  // 记录命令使用
  const recordCommandUsage = useCallback(
    (commandId: string) => {
      setRecentCommands((prev) => {
        const existing = prev.find((r) => r.id === commandId);
        const now = Date.now();

        let next: RecentCommand[];
        if (existing) {
          next = prev.map((r) =>
            r.id === commandId ? { ...r, count: r.count + 1, lastUsed: now } : r,
          );
        } else {
          next = [...prev, { id: commandId, count: 1, lastUsed: now }];
        }

        // 按使用次数和最近使用时间排序，保留 Top 10
        return next
          .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return b.lastUsed - a.lastUsed;
          })
          .slice(0, 10);
      });
    },
    [setRecentCommands],
  );

  // 执行命令
  const executeCommand = useCallback(
    (command: CommandItem) => {
      recordCommandUsage(command.id);
      command.action();
      onClose();
      setQuery("");
    },
    [recordCommandUsage, onClose],
  );

  // 键盘导航
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setSelectedIndex(0);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % searchResults.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = searchResults[selectedIndex];
        if (selected) {
          executeCommand(selected.item);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, searchResults, selectedIndex, executeCommand]);

  // 渲染命令项
  const renderCommandItem = useCallback(
    (result: FuzzyMatchResult<CommandItem>, index: number) => {
      const { item, matches } = result;
      const Icon = item.icon;
      const isSelected = index === selectedIndex;

      // 高亮匹配字符
      const highlightedLabel = query.trim()
        ? highlightMatches(item.label, matches)
        : [{ text: item.label, highlighted: false }];

      return (
        <CommandItem
          key={item.id}
          value={item.id}
          data-testid={`command-palette-item-${item.id}`}
          className={cn(
            "flex items-center gap-2 px-3 py-2",
            isSelected && "bg-accent text-accent-foreground",
          )}
          onSelect={() => executeCommand(item)}
        >
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {highlightedLabel.map((part, i) =>
                  part.highlighted ? (
                    <mark key={i} className="bg-primary/20 text-primary">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </span>
              {item.shortcutLabel && (
                <KbdGroup className="ml-auto">
                  <Kbd>{item.shortcutLabel}</Kbd>
                </KbdGroup>
              )}
            </div>
            {item.description && (
              <span className="text-xs text-muted-foreground">{item.description}</span>
            )}
          </div>
        </CommandItem>
      );
    },
    [query, selectedIndex, executeCommand],
  );

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <CommandDialogPopup className="max-w-2xl" data-testid="command-palette">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <PiMagnifyingGlass className="size-4 text-muted-foreground" />
          <CommandInput
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="flex-1 border-0 p-0 text-sm focus:ring-0"
            autoFocus
            data-testid="command-palette-input"
          />
          <KbdGroup>
            <Kbd>Esc</Kbd>
          </KbdGroup>
        </div>

        <CommandList className="max-h-96 overflow-y-auto" data-testid="command-palette-list">
          {groupedResults.length === 0 ? (
            <CommandEmpty>未找到匹配的命令</CommandEmpty>
          ) : (
            <>
              {groupedResults.map(([category, results], groupIndex) => (
                <React.Fragment key={category}>
                  <CommandGroup>
                    <CommandGroupLabel>{CATEGORY_LABELS[category]}</CommandGroupLabel>
                    {results.map((result) => {
                      const globalIndex = groupedResults
                        .slice(0, groupIndex)
                        .reduce((sum, [, r]) => sum + r.length, 0);
                      const itemIndex = globalIndex + results.indexOf(result);
                      return renderCommandItem(result, itemIndex);
                    })}
                  </CommandGroup>
                  {groupIndex < groupedResults.length - 1 && <CommandSeparator />}
                </React.Fragment>
              ))}
            </>
          )}
        </CommandList>

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <KbdGroup>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </KbdGroup>
            <span>导航</span>
            <KbdGroup>
              <Kbd>Enter</Kbd>
            </KbdGroup>
            <span>选择</span>
          </div>
          <div className="flex items-center gap-1">
            {isMacPlatform(typeof navigator !== "undefined" ? navigator.platform : "") ? <PiCommand className="size-3" /> : <span>Ctrl</span>}
            <Kbd>K</Kbd>
          </div>
        </div>
      </CommandDialogPopup>
    </CommandDialog>
  );
});

/**
 * 命令面板 Hook
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  // 全局快捷键 Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}
