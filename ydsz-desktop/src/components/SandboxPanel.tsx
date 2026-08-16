/**
 * @file SandboxPanel.tsx
 * @description P2-8: Agent 代码执行沙箱面板组件。
 *
 * 功能：
 * - 展示当前沙箱安全策略（层级、白/黑名单、允许目录等）
 * - 切换沙箱安全层级（Strict / Workspace / Permissive）
 * - 在沙箱中执行命令（带安全审计）
 * - 在沙箱中执行代码片段（Python/Node/Shell/Ruby）
 * - 展示执行结果 + 策略违规记录 + 被过滤的环境变量
 */

import { memo, useCallback, useEffect, useState } from "react";
import {
  PiShieldCheck,
  PiShieldWarning,
  PiPlay,
  PiTerminal,
  PiCode,
  PiClock,
  PiKey,
} from "react-icons/pi";
import { ChevronDownIcon, ChevronUpIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

// ============================================================================
// Tauri Invoke 动态加载
// ============================================================================

interface TauriInvokeModule {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

let tauriModulePromise: Promise<TauriInvokeModule | null> | null = null;

async function loadTauriInvoke(): Promise<TauriInvokeModule | null> {
  if (tauriModulePromise) return tauriModulePromise;
  tauriModulePromise = (async () => {
    try {
      const mod = await import("@tauri-apps/api/core");
      return mod as TauriInvokeModule;
    } catch {
      return null;
    }
  })();
  return tauriModulePromise;
}

// ============================================================================
// 类型定义
// ============================================================================

type SandboxLevel = "strict" | "workspace" | "permissive";

interface SandboxPolicyDto {
  level: SandboxLevel;
  allowedReadDirs: string[];
  allowedWriteDirs: string[];
  networkAllowed: boolean;
  blockedEnvVars: string[];
  allowedCommands: string[] | null;
  blockedCommands: string[];
  timeoutSecs: number;
  maxOutputBytes: number;
}

interface SandboxExecResultDto {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  killed: boolean;
  policyViolations: string[];
  strippedEnvVars: string[];
  level: string;
  success: boolean;
}

interface ExecuteInput {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
}

interface CodeInput {
  code: string;
  language: string;
  cwd?: string;
}

// ============================================================================
// 辅助函数
// ============================================================================

const LEVEL_CONFIG: Record<
  SandboxLevel,
  { label: string; icon: typeof PiShieldCheck; color: string; desc: string }
> = {
  strict: {
    label: "Strict",
    icon: PiShieldCheck,
    color: "text-green-500",
    desc: "仅只读 + 白名单命令",
  },
  workspace: {
    label: "Workspace",
    icon: PiShieldCheck,
    color: "text-blue-500",
    desc: "允许项目目录读写 + 预设命令",
  },
  permissive: {
    label: "Permissive",
    icon: PiShieldWarning,
    color: "text-orange-500",
    desc: "允许全部读写（仍过滤敏感环境变量）",
  },
};

function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ============================================================================
// SandboxPanel 组件
// ============================================================================

function SandboxPanelInner() {
  const [policy, setPolicy] = useState<SandboxPolicyDto | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<"command" | "code">("command");
  const [command, setCommand] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [cwd, setCwd] = useState("");
  const [result, setResult] = useState<SandboxExecResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载当前策略
  const loadPolicy = useCallback(async () => {
    const tauri = await loadTauriInvoke();
    if (!tauri) return;
    try {
      const p = await tauri.invoke<SandboxPolicyDto>("code_sandbox_get_policy");
      setPolicy(p);
    } catch {
      // 静默失败（非 Tauri 环境）
    }
  }, []);

  useEffect(() => {
    loadPolicy();
  }, [loadPolicy]);

  // 切换安全层级
  const handleSetLevel = useCallback(
    async (level: SandboxLevel) => {
      const tauri = await loadTauriInvoke();
      if (!tauri) return;
      try {
        const p = await tauri.invoke<SandboxPolicyDto>("code_sandbox_set_level", {
          level,
          workspace: cwd || null,
        });
        setPolicy(p);
      } catch (e) {
        setError(String(e));
      }
    },
    [cwd],
  );

  // 执行命令
  const handleExecuteCommand = useCallback(async () => {
    if (!command.trim()) return;
    const tauri = await loadTauriInvoke();
    if (!tauri) {
      setError("Tauri API 不可用");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const input: ExecuteInput = {
        command,
        ...(cwd ? { cwd } : {}),
      };
      const r = await tauri.invoke<SandboxExecResultDto>(
        "code_sandbox_execute_command",
        { input },
      );
      setResult(r);
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [command, cwd]);

  // 执行代码
  const handleExecuteCode = useCallback(async () => {
    if (!code.trim()) return;
    const tauri = await loadTauriInvoke();
    if (!tauri) {
      setError("Tauri API 不可用");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const input: CodeInput = {
        code,
        language,
        ...(cwd ? { cwd } : {}),
      };
      const r = await tauri.invoke<SandboxExecResultDto>(
        "code_sandbox_execute_code",
        { input },
      );
      setResult(r);
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [code, language, cwd]);

  if (!policy) return null;

  const levelConfig = LEVEL_CONFIG[policy.level];
  const LevelIcon = levelConfig.icon;

  return (
    <div className="rounded-lg border border-border/60 bg-card/80 backdrop-blur shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <LevelIcon className={cn("text-lg", levelConfig.color)} />
          <span className="text-sm font-semibold text-foreground">
            Code Sandbox
          </span>
          <span
            className={cn(
              "text-xs px-1.5 py-0.5 rounded-md font-medium",
              policy.level === "strict" && "bg-green-500/15 text-green-500",
              policy.level === "workspace" && "bg-blue-500/15 text-blue-500",
              policy.level === "permissive" &&
                "bg-orange-500/15 text-orange-500",
            )}
          >
            {levelConfig.label}
          </span>
        </div>
        {expanded ? (
          <ChevronUpIcon className="text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="text-muted-foreground" />
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* 层级选择 */}
          <div className="flex gap-2">
            {(Object.keys(LEVEL_CONFIG) as SandboxLevel[]).map((lvl) => {
              const cfg = LEVEL_CONFIG[lvl];
              const Icon = cfg.icon;
              const active = policy.level === lvl;
              return (
                <button
                  key={lvl}
                  onClick={() => handleSetLevel(lvl)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                    active
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/40 text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className={cn(active && cfg.color)} />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* 策略摘要 */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <PiClock />
              <span>超时: {policy.timeoutSecs}s</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <PiTerminal />
              <span>
                输出限制: {(policy.maxOutputBytes / 1024).toFixed(0)}KB
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <PiKey />
              <span>过滤变量: {policy.blockedEnvVars.length} 个</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {policy.networkAllowed ? (
                <PiShieldWarning className="text-orange-500" />
              ) : (
                <PiShieldCheck className="text-green-500" />
              )}
              <span>
                网络: {policy.networkAllowed ? "允许" : "禁止"}
              </span>
            </div>
          </div>

          {/* 模式切换 */}
          <div className="flex gap-1 border-b border-border/30">
            <button
              onClick={() => setMode("command")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                mode === "command"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <PiTerminal />
              命令
            </button>
            <button
              onClick={() => setMode("code")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                mode === "code"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <PiCode />
              代码
            </button>
          </div>

          {/* 工作目录输入 */}
          <input
            type="text"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="工作目录（可选）"
            className="w-full px-3 py-2 text-xs rounded-md bg-background/60 border border-border/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />

          {/* 命令模式 */}
          {mode === "command" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) handleExecuteCommand();
                  }}
                  placeholder="输入命令，如 echo hello"
                  className="flex-1 px-3 py-2 text-xs font-mono rounded-md bg-background/60 border border-border/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <button
                  onClick={handleExecuteCommand}
                  disabled={loading || !command.trim()}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <PiPlay />
                  执行
                </button>
              </div>
            </div>
          )}

          {/* 代码模式 */}
          {mode === "code" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-md bg-background/60 border border-border/40 text-foreground focus:outline-none"
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="shell">Shell</option>
                  <option value="ruby">Ruby</option>
                </select>
                <button
                  onClick={handleExecuteCode}
                  disabled={loading || !code.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
                >
                  <PiPlay />
                  执行
                </button>
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={`输入 ${language} 代码...`}
                rows={4}
                className="w-full px-3 py-2 text-xs font-mono rounded-md bg-background/60 border border-border/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y"
              />
            </div>
          )}

          {/* 错误 */}
          {error && (
            <div className="px-3 py-2 text-xs text-red-500 bg-red-500/10 rounded-md">
              {error}
            </div>
          )}

          {/* 执行结果 */}
          {result && (
            <div className="space-y-2">
              {/* 状态栏 */}
              <div className="flex items-center gap-3 text-xs">
                <span
                  className={cn(
                    "font-medium",
                    result.success ? "text-green-500" : "text-red-500",
                  )}
                >
                  {result.success ? "✓ 成功" : "✗ 失败"}
                </span>
                <span className="text-muted-foreground">
                  exit: {result.exitCode}
                </span>
                <span className="text-muted-foreground">
                  {formatDuration(result.durationMs)}
                </span>
                {result.timedOut && (
                  <span className="text-orange-500">超时</span>
                )}
                {result.killed && (
                  <span className="text-red-500">已终止</span>
                )}
              </div>

              {/* 策略违规 */}
              {result.policyViolations.length > 0 && (
                <div className="px-3 py-2 text-xs text-orange-500 bg-orange-500/10 rounded-md">
                  <div className="font-medium mb-1">⚠ 策略违规</div>
                  {result.policyViolations.map((v, i) => (
                    <div key={i}>• {v}</div>
                  ))}
                </div>
              )}

              {/* 被过滤的环境变量 */}
              {result.strippedEnvVars.length > 0 && (
                <div className="px-3 py-2 text-xs text-blue-500 bg-blue-500/10 rounded-md">
                  <div className="font-medium mb-1">
                    🔒 已过滤环境变量 ({result.strippedEnvVars.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {result.strippedEnvVars.map((v, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 bg-blue-500/20 rounded text-[10px]"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* stdout */}
              {result.stdout && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    stdout
                  </div>
                  <pre className="px-3 py-2 text-xs font-mono bg-background/80 border border-border/30 rounded-md overflow-x-auto max-h-48 overflow-y-auto text-green-600 dark:text-green-400">
                    {result.stdout}
                  </pre>
                </div>
              )}

              {/* stderr */}
              {result.stderr && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    stderr
                  </div>
                  <pre className="px-3 py-2 text-xs font-mono bg-background/80 border border-border/30 rounded-md overflow-x-auto max-h-48 overflow-y-auto text-red-600 dark:text-red-400">
                    {result.stderr}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const SandboxPanel = memo(SandboxPanelInner);
