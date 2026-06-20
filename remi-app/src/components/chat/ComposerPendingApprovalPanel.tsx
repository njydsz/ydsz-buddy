/**
 * @file ComposerPendingApprovalPanel.tsx
 * @description 编辑器中待审批请求的面板组件，解析审批详情并展示文件名、命令或原始文本，支持多种审批类型。
 */

import { memo, useMemo } from "react";
import { type PendingApproval } from "../../session-logic";

/**
 * ComposerPendingApprovalPanel 组件的属性接口
 */
interface ComposerPendingApprovalPanelProps {
  /** 待审批请求 */
  approval: PendingApproval;
  /** 待审批请求总数 */
  pendingCount: number;
}

/** 解析后的审批详情 */
type ParsedApproval = {
  /** 工具名称 */
  tool: string | null;
  /** 文件名 */
  fileName: string | null;
  /** 文件所在目录 */
  fileDir: string | null;
  /** 命令文本 */
  command: string | null;
  /** 回退文本 */
  fallback: string | null;
};

/** 审批请求类型的显示标签映射 */
const KIND_LABEL: Record<PendingApproval["requestKind"], string> = {
  command: "COMMAND",
  "file-read": "FILE READ",
  "file-change": "FILE CHANGE",
};

/**
 * ComposerPendingApprovalPanel 组件
 * @description 待审批请求面板，解析并展示审批详情（文件名、命令或原始文本）
 * @param props.approval - 待审批请求
 * @param props.pendingCount - 待审批请求总数
 */
export const ComposerPendingApprovalPanel = memo(function ComposerPendingApprovalPanel({
  approval,
  pendingCount,
}: ComposerPendingApprovalPanelProps) {
  const parsed = useMemo(() => parseApprovalDetail(approval.detail), [approval.detail]);
  const kindLabel = KIND_LABEL[approval.requestKind];

  return (
    <div className="px-4 py-2.5 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground/50">
            {kindLabel}
          </span>
          {parsed.tool ? (
            <span className="truncate text-[10px] font-medium tracking-[0.08em] uppercase text-muted-foreground/55">
              · {parsed.tool}
            </span>
          ) : null}
        </div>
        {pendingCount > 1 ? (
          <span className="flex h-4 shrink-0 items-center rounded bg-[var(--color-background-elevated-secondary)] px-1 text-[9.5px] font-medium tabular-nums text-[var(--color-text-foreground-secondary)]">
            1/{pendingCount}
          </span>
        ) : null}
      </div>
      <ApprovalBody parsed={parsed} />
    </div>
  );
});

/** 审批详情展示子组件，根据解析结果渲染文件名、命令或回退文本 */
function ApprovalBody({ parsed }: { parsed: ParsedApproval }) {
  if (parsed.fileName) {
    return (
      <>
        <p
          className="mt-1 truncate text-[13px] font-medium leading-tight text-foreground/90"
          title={parsed.fileDir ? `${parsed.fileDir}/${parsed.fileName}` : parsed.fileName}
        >
          {parsed.fileName}
        </p>
        {parsed.fileDir ? (
          <p
            className="mt-0.5 truncate font-mono text-[10.5px] leading-tight text-muted-foreground/55"
            title={parsed.fileDir}
          >
            {shortenPath(parsed.fileDir)}
          </p>
        ) : null}
      </>
    );
  }

  if (parsed.command) {
    return (
      <pre
        className="mt-1 overflow-hidden font-mono text-[11.5px] leading-snug text-foreground/85"
        title={parsed.command}
      >
        <code className="block truncate">{parsed.command}</code>
      </pre>
    );
  }

  if (parsed.fallback) {
    return (
      <p
        className="mt-1 truncate font-mono text-[11px] text-muted-foreground/65"
        title={parsed.fallback}
      >
        {parsed.fallback}
      </p>
    );
  }

  return (
    <p className="mt-1 text-[12px] text-muted-foreground/65">Review the request to continue.</p>
  );
}

/**
 * Parses the approval `detail` string into structured fields.
 *
 * Detail is produced server-side by `summarizeToolRequest` as
 * `"${toolName}: ${JSON.stringify(input)}"` and is clamped to ~400 characters.
 * That means JSON.parse often fails on truncated payloads like
 * `{"file_path":"/long/path","old_string":" .fo...`. We therefore try JSON
 * first and fall back to targeted regex extraction so we can still surface the
 * file path / command even from a chopped-off string.
 */
function parseApprovalDetail(detail: string | undefined): ParsedApproval {
  const empty: ParsedApproval = {
    tool: null,
    fileName: null,
    fileDir: null,
    command: null,
    fallback: null,
  };
  if (!detail || detail.length === 0) return empty;

  const colonIdx = detail.indexOf(": ");
  const tool = colonIdx === -1 ? null : detail.slice(0, colonIdx).trim() || null;
  const rawPayload = colonIdx === -1 ? detail : detail.slice(colonIdx + 2);
  const payload = stripTrailingEllipsis(rawPayload);

  const filePath =
    extractJsonString(payload, ["file_path", "path", "notebook_path", "filepath"]) ?? null;
  if (filePath) {
    const { name, parent } = splitPath(filePath);
    return { tool, fileName: name, fileDir: parent, command: null, fallback: null };
  }

  const command = extractJsonString(payload, ["command", "cmd"]) ?? null;
  if (command) {
    return {
      tool,
      fileName: null,
      fileDir: null,
      command: collapseWhitespace(command),
      fallback: null,
    };
  }

  const pattern = extractJsonString(payload, ["pattern", "query"]);
  if (pattern) {
    return {
      tool,
      fileName: null,
      fileDir: null,
      command: pattern,
      fallback: null,
    };
  }

  const url = extractJsonString(payload, ["url"]);
  if (url) {
    return { tool, fileName: null, fileDir: null, command: url, fallback: null };
  }

  // Payload is not a recognized JSON shape — treat it as a raw command/text.
  const fallback = collapseWhitespace(payload);
  return {
    tool,
    fileName: null,
    fileDir: null,
    command: null,
    fallback: fallback.length > 0 ? fallback : null,
  };
}

/**
 * Extracts the first matching string field from a (possibly truncated) JSON
 * object. Prefers a real JSON.parse when it succeeds, otherwise falls back to
 * a permissive regex that tolerates truncation mid-value.
 */
/**
 * 从可能被截断的 JSON 对象中提取第一个匹配的字符串字段。
 * 优先使用 JSON.parse，失败时回退到正则表达式提取。
 * @param payload - JSON 字符串（可能被截断）
 * @param keys - 待提取的字段名列表
 * @returns 提取到的字符串值，未找到返回 null
 */
function extractJsonString(payload: string, keys: ReadonlyArray<string>): string | null {
  const parsed = tryParseJson(payload);
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }

  for (const key of keys) {
    const value = regexExtractString(payload, key);
    if (value && value.length > 0) {
      return value;
    }
  }
  return null;
}

/** 尝试解析 JSON 字符串，失败返回 null */
function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Pulls a JSON string value for `key` out of a possibly truncated JSON-ish
 * payload. Handles the common `\"` and `\\` escapes inside the string body.
 * If the value is unterminated (truncation), returns whatever was captured.
 */
function regexExtractString(payload: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Anchored to `"key"` followed by a colon and an opening quote.
  const pattern = new RegExp(`"${escapedKey}"\\s*:\\s*"`, "g");
  const match = pattern.exec(payload);
  if (!match) return null;

  const start = match.index + match[0].length;
  let out = "";
  for (let i = start; i < payload.length; i++) {
    const ch = payload[i];
    if (ch === "\\") {
      const next = payload[i + 1];
      if (next === undefined) break;
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "r") out += "\r";
      else out += next;
      i += 1;
      continue;
    }
    if (ch === '"') {
      return out;
    }
    out += ch;
  }
  // Truncated before closing quote — return partial value if we got anything.
  return out.length > 0 ? out : null;
}

/** 去除字符串末尾的省略号 */
function stripTrailingEllipsis(value: string): string {
  return value.replace(/\.{3}$/u, "").replace(/…$/u, "");
}

/** 将路径拆分为文件名和父目录 */
function splitPath(path: string): { name: string; parent: string | null } {
  const normalized = path.replace(/\\/g, "/");
  const trimmed = normalized.replace(/\/+$/, "");
  const lastSep = trimmed.lastIndexOf("/");
  if (lastSep === -1) {
    return { name: trimmed, parent: null };
  }
  return {
    name: trimmed.slice(lastSep + 1) || trimmed,
    parent: trimmed.slice(0, lastSep) || null,
  };
}

/** 缩短路径显示，将中间段替换为省略号 */
function shortenPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const homeMatch = normalized.match(/^\/(?:Users|home)\/[^/]+(?=\/|$)/);
  const withoutHome = homeMatch ? `~${normalized.slice(homeMatch[0].length)}` : normalized;
  const segments = withoutHome.split("/").filter((s) => s.length > 0);
  if (segments.length <= 3) {
    return withoutHome;
  }
  const leading = withoutHome.startsWith("~") ? "~" : "";
  const tail = segments.slice(-2).join("/");
  return `${leading}/…/${tail}`.replace(/^\/…/, "…");
}

/** 折叠连续空白为单个空格并去除首尾空白 */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
