/**
 * @file useTeamRules.ts
 * @description 团队共享规则 Hook（~/.ydsz-buddy/team-rules/）
 *
 * ## 核心能力
 *
 * - 调用 Tauri 命令 `team_rules_list` / `team_rules_save` / `team_rules_delete` 等
 * - 提供 `data` / `mutations` / `state` 三个维度：
 *   - `data` 来自 `useQuery`，自动缓存
 *   - `mutations` 提供 `saveRule` / `deleteRule` / `saveManifest` 等
 *   - `state` 派生出 `hasRules` / `summary` / `isEnabled` / `merged`
 * - 失败降级：后端调用失败时返回空规则，不阻塞 UI
 *
 * ## 与 useProjectRules 的关系
 *
 * 项目级规则（`useProjectRules`）和团队级规则（`useTeamRules`）完全解耦：
 * - 项目级：扫描 `<workspace>/AGENTS.md`、`CLAUDE.md`、`.ydsz/rules/`，受工作区切换影响
 * - 团队级：扫描 `~/.ydsz-buddy/team-rules/`，跨项目复用，由 manifest 控开关
 *
 * ## 使用方式
 *
 * ```tsx
 * const { data, merged, saveRule, deleteRule, isEnabled } = useTeamRules();
 * ```
 *
 * @module hooks/useTeamRules
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * 团队规则 manifest 配置
 */
export interface TeamRulesManifestDto {
  schemaVersion: number;
  updatedAt: string;
  teamName?: string | null;
  remoteUrl?: string | null;
  remoteCommit?: string | null;
  enabled: boolean;
}

/**
 * 团队规则文件
 */
export interface TeamRuleFileDto {
  name: string;
  path: string;
  content: string;
  originalBytes: number;
  truncated: boolean;
  modifiedAt: number;
}

/**
 * 列表响应
 */
export interface TeamRulesListDto {
  root?: string | null;
  manifest?: TeamRulesManifestDto | null;
  files: TeamRuleFileDto[];
  skipped: number;
  error?: string | null;
  elapsedMs: number;
}

/**
 * 读取单文件结果
 */
export interface TeamRuleReadResult {
  found: boolean;
  file?: TeamRuleFileDto | null;
  error?: string | null;
}

/**
 * 写入入参
 */
export interface TeamRuleSaveInput {
  fileName: string;
  content: string;
}

/**
 * 列表命令入参
 */
export interface TeamRulesListInput {
  baseDir?: string | null;
}

const QUERY_KEY = ["team-rules"] as const;
const STALE_TIME = 30 * 1000;
const GC_TIME = 5 * 60 * 1000;

/**
 * Hook 返回结构
 */
export interface UseTeamRulesResult {
  /** React Query 原始结果 */
  query: ReturnType<typeof useQuery<TeamRulesListDto>>;
  /** 团队规则文件列表 */
  files: TeamRuleFileDto[];
  /** manifest 配置 */
  manifest: TeamRulesManifestDto | null;
  /** 根目录绝对路径 */
  root: string | null;
  /** 合并后的 markdown,适合直接注入 Provider turn */
  merged: string | null;
  /** 总字节数 */
  totalBytes: number;
  /** 是否启用（manifest.enabled=true 且无错误） */
  isEnabled: boolean;
  /** 是否有规则 */
  hasRules: boolean;
  /** 简短摘要,适合 UI 提示 */
  summary: string;
  /** 加载耗时（毫秒） */
  elapsedMs: number;
  /** 跳过的文件数 */
  skipped: number;
  /** 错误信息 */
  error: string | null;
  /** 创建/更新一条规则 */
  saveRule: ReturnType<
    typeof useMutation<TeamRuleFileDto, Error, TeamRuleSaveInput>
  >;
  /** 删除一条规则 */
  deleteRule: ReturnType<typeof useMutation<boolean, Error, string>>;
  /** 写入 manifest */
  saveManifest: ReturnType<
    typeof useMutation<TeamRulesManifestDto, Error, TeamRulesManifestDto>
  >;
  /** 重新加载(强制跳过缓存) */
  refresh: () => Promise<TeamRulesListDto>;
}

/**
 * 合并文件为单一 markdown,适合注入 Provider turn
 */
function buildMergedMarkdown(files: TeamRuleFileDto[]): string | null {
  if (files.length === 0) return null;
  const out: string[] = ["# Team Rules", ""];
  out.push("以下规则由团队共享,跨项目自动加载,请严格遵守。");
  out.push("");
  for (const f of files) {
    out.push(`## ${f.name}`);
    out.push("");
    if (f.truncated) {
      out.push(
        `_[注: 原文件 ${f.originalBytes} bytes,已截断到 ${f.content.length} bytes]_`,
      );
      out.push("");
    }
    out.push(f.content);
    if (!f.content.endsWith("\n")) out.push("");
    out.push("");
  }
  return out.join("\n");
}

/**
 * 加载团队共享规则
 */
export function useTeamRules(input: { baseDir?: string | null } = {}): UseTeamRulesResult {
  const { baseDir } = input;
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => {
    if (baseDir && baseDir.length > 0) return [...QUERY_KEY, baseDir] as const;
    return QUERY_KEY;
  }, [baseDir]);

  const query = useQuery<TeamRulesListDto>({
    queryKey,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: 0,
    queryFn: async (): Promise<TeamRulesListDto> => {
      return invoke<TeamRulesListDto>("team_rules_list", {
        baseDir: baseDir ?? null,
      });
    },
  });

  const data = query.data;
  const files = data?.files ?? [];
  const manifest = data?.manifest ?? null;
  const root = data?.root ?? null;
  const isEnabled = manifest?.enabled !== false && !data?.error;

  const merged = useMemo<string | null>(() => {
    if (!isEnabled) return null;
    return buildMergedMarkdown(files);
  }, [files, isEnabled]);

  const totalBytes = useMemo<number>(
    () => files.reduce((acc, f) => acc + f.content.length, 0),
    [files],
  );

  const summary = useMemo<string>(() => {
    if (data?.error) {
      return `加载失败: ${data.error}`;
    }
    if (!manifest || manifest.enabled === false) {
      return "团队规则已被禁用";
    }
    if (files.length === 0) {
      return "未配置团队规则";
    }
    const names = files.map((f) => f.name).join(" · ");
    return `已加载 ${files.length} 个团队规则（${names}）`;
  }, [data, manifest, files]);

  const saveRule = useMutation<TeamRuleFileDto, Error, TeamRuleSaveInput>({
    mutationFn: async (input) => {
      return invoke<TeamRuleFileDto>("team_rules_save", {
        baseDir: baseDir ?? null,
        input,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteRule = useMutation<boolean, Error, string>({
    mutationFn: async (fileName) => {
      return invoke<boolean>("team_rules_delete", {
        baseDir: baseDir ?? null,
        fileName,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const saveManifest = useMutation<
    TeamRulesManifestDto,
    Error,
    TeamRulesManifestDto
  >({
    mutationFn: async (m) => {
      return invoke<TeamRulesManifestDto>("team_rules_save_manifest", {
        baseDir: baseDir ?? null,
        manifest: m,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const refresh = async (): Promise<TeamRulesListDto> => {
    await queryClient.invalidateQueries({ queryKey });
    const fresh = await queryClient.fetchQuery<TeamRulesListDto>({
      queryKey,
      queryFn: () =>
        invoke<TeamRulesListDto>("team_rules_list", {
          baseDir: baseDir ?? null,
        }),
    });
    return fresh;
  };

  return {
    query,
    files,
    manifest,
    root,
    merged,
    totalBytes,
    isEnabled,
    hasRules: files.length > 0,
    summary,
    elapsedMs: data?.elapsedMs ?? 0,
    skipped: data?.skipped ?? 0,
    error: data?.error ?? null,
    saveRule,
    deleteRule,
    saveManifest,
    refresh,
  } as const;
}

/**
 * 读取单条规则（不在 hook 内,适合按需调用）
 */
export async function readTeamRule(
  fileName: string,
  baseDir?: string | null,
): Promise<TeamRuleReadResult> {
  return invoke<TeamRuleReadResult>("team_rules_read", {
    baseDir: baseDir ?? null,
    fileName,
  });
}

/**
 * 解析团队规则根目录(返回绝对路径)
 */
export async function resolveTeamRulesBaseDir(
  baseDir?: string | null,
): Promise<string> {
  return invoke<string>("team_rules_resolve_base_dir", {
    baseDir: baseDir ?? null,
  });
}
