/**
 * @file useProjectRules.ts
 * @description 项目级 AI 协作规则 Hook（AGENTS.md / CLAUDE.md / .ydsz/rules/ 等）
 *
 * ## 核心能力
 *
 * - 调用 Tauri 命令 `project_rules_load` 扫描项目根目录下的规则文件
 * - 60 秒内存缓存命中（避免同一项目重复 IO）
 * - 失败降级：后端调用失败时返回空规则，不阻塞 Composer
 * - 提供 mergedMarkdown 用于注入 Composer / Provider turn 的 system context
 *
 * ## 支持的规则文件
 *
 * 优先级（先匹配先用）：
 *
 * 1. `AGENTS.md`（Codex / OpenAI / Cursor / Gemini CLI **行业事实标准**）
 * 2. `CLAUDE.md`（Claude Code 等价）
 * 3. `.ydsz/rules.md` 或 `.ydsz/rules/*.md`（云顶数字 自家规范）
 * 4. `.codex/instructions.md`（Codex 备选）
 * 5. `.cursorrules`（Cursor 兼容）
 * 6. `.windsurfrules`（Windsurf 兼容）
 *
 * ## 使用方式
 *
 * ```tsx
 * const { data, merged, isPending } = useProjectRules(workspaceRoot);
 *
 * // merged 是可直接注入 Composer 的 markdown
 * useEffect(() => {
 *   if (merged) setSystemContext(merged);
 * }, [merged]);
 * ```
 *
 * @module hooks/useProjectRules
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * 规则来源标识符
 */
export type ProjectRuleSource =
  | "AGENTS.md"
  | "CLAUDE.md"
  | ".ydsz/rules.md"
  | ".ydsz/rules/"
  | ".codex/instructions.md"
  | ".cursorrules"
  | ".windsurfrules";

/**
 * 单个规则文件
 */
export interface ProjectRuleFile {
  source: ProjectRuleSource;
  path: string;
  content: string;
  originalBytes: number;
  truncated: boolean;
}

/**
 * 加载结果
 */
export interface ProjectRulesDto {
  fromCache: boolean;
  elapsedMs: number;
  files: ProjectRuleFile[];
  merged: string | null;
  totalBytes: number;
  skipped: number;
  /**
   * 团队规则摘要(P2-5)
   * - 始终存在(后端会探测 `~/.ydsz-buddy/team-rules/`)
   * - fileCount = 0 表示尚未配置团队规则
   * - enabled = false 表示被 manifest 禁用或加载出错
   */
  teamRules?: TeamRulesSummaryDto | null;
}

/**
 * 团队规则摘要(由 `project_rules_load` 命令透传)
 */
export interface TeamRulesSummaryDto {
  /** 团队规则根目录绝对路径 */
  root: string;
  /** 文件数量 */
  fileCount: number;
  /** 总字节数 */
  totalBytes: number;
  /** 是否启用 */
  enabled: boolean;
  /** 团队名称 */
  teamName?: string | null;
  /** 远程仓库地址 */
  remoteUrl?: string | null;
  /** 加载耗时 */
  elapsedMs: number;
  /** 错误信息 */
  error?: string | null;
}

/**
 * Hook 输入参数
 */
export interface UseProjectRulesInput {
  /** 项目根目录绝对路径。传空字符串/undefined 不会触发请求 */
  workspaceRoot: string | null | undefined;
  /** 是否禁用（默认 false） */
  enabled?: boolean;
}

/**
 * 加载项目规则
 *
 * @param input - 输入参数
 * @returns React Query 结果 + 派生 merged 字段
 */
export function useProjectRules(input: UseProjectRulesInput) {
  const { workspaceRoot, enabled = true } = input;
  const normalizedRoot = workspaceRoot?.trim() ?? "";

  const query = useQuery({
    queryKey: ["project-rules", normalizedRoot] as const,
    enabled: enabled && normalizedRoot.length > 0,
    // 60 秒内不重复请求（与后端缓存 TTL 对齐）
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    // 后端已经做了 60 秒缓存,这里用 0 retry 避免抖动
    retry: 0,
    queryFn: async (): Promise<ProjectRulesDto> => {
      return invoke<ProjectRulesDto>("project_rules_load", {
        params: { workspaceRoot: normalizedRoot },
      });
    },
  });

  /**
   * 兼容空数据 / 失败 / 加载中的 merged 派生
   */
  const merged = useMemo<string | null>(() => {
    if (!query.data) return null;
    if (query.data.files.length === 0) {
      // 项目级规则为空时,可能由团队规则兜底 → 仍返回 merged(由后端拼接)
      return query.data.merged;
    }
    return query.data.merged;
  }, [query.data]);

  /**
   * 简短描述,用于 UI 提示
   */
  const summary = useMemo<string>(() => {
    if (!query.data || query.data.files.length === 0) {
      return "未发现项目规则";
    }
    const names = query.data.files.map((f) => f.source).join(" · ");
    return `已加载 ${query.data.files.length} 个规则文件（${names}）`;
  }, [query.data]);

  /**
   * 团队规则是否实际注入到 merged
   * = 团队规则存在 + 启用 + 项目级 .ydsz/rules/ 为空
   */
  const teamRulesApplied = useMemo<boolean>(() => {
    if (!query.data) return false;
    const team = query.data.teamRules;
    if (!team || !team.enabled || team.fileCount === 0) return false;
    // 项目级 .ydsz/rules/ 存在 → 不应用兜底
    const hasYdszRules = query.data.files.some(
      (f) => f.source === ".ydsz/rules.md" || f.source === ".ydsz/rules/",
    );
    return !hasYdszRules;
  }, [query.data]);

  return {
    /** React Query 原始结果 */
    query,
    /** 规则文件列表 */
    files: query.data?.files ?? [],
    /** 合并后的 markdown,适合注入 Composer / Provider turn */
    merged,
    /** 加载耗时（毫秒） */
    elapsedMs: query.data?.elapsedMs ?? 0,
    /** 总字节数 */
    totalBytes: query.data?.totalBytes ?? 0,
    /** 是否命中缓存 */
    fromCache: query.data?.fromCache ?? false,
    /** 简短描述 */
    summary,
    /** 是否至少有一个规则文件 */
    hasRules: (query.data?.files.length ?? 0) > 0,
    /**
     * 团队规则摘要(始终可能为 null:后端未填充或项目无 team-rules 目录)
     * - 包含 `enabled` / `fileCount` / `error` 等元数据
     * - 供 ProjectRulesIndicator 与 Settings 入口使用
     */
    teamRules: query.data?.teamRules ?? null,
    /**
     * 是否实际把团队规则拼接到 merged 中
     * = teamRules.enabled && teamRules.fileCount > 0 && 项目级 .ydsz/rules/ 为空
     */
    teamRulesApplied,
  } as const;
}

/**
 * 手动重新加载（跳过缓存）
 *
 * @param workspaceRoot - 项目根目录
 */
export async function reloadProjectRules(
  workspaceRoot: string,
): Promise<ProjectRulesDto> {
  return invoke<ProjectRulesDto>("project_rules_load", {
    params: { workspaceRoot, noCache: true },
  });
}
