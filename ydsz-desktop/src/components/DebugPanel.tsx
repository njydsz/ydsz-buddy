/**
 * @file DAP 调试器前端面板
 *
 * 在代码编辑器面板中集成断点调试功能，支持：
 *
 * - **调试适配器选择**：自动检测可用的 DAP 适配器（Node.js / Python / Rust / Go）
 * - **断点管理**：添加 / 删除 / 启用 / 禁用断点
 * - **调试控制**：启动 / 继续 / 暂停 / 步过 / 步入 / 步出 / 终止
 * - **调用栈**：显示当前线程的堆栈帧
 * - **变量查看**：显示当前作用域内的变量
 * - **表达式求值**：REPL 风格的表达式求值
 *
 * ## 数据流
 *
 * 1. `listDebugAdapters()` 获取可用适配器列表
 * 2. `startDebugging()` 创建调试会话
 * 3. `setBreakpoints()` 设置断点
 * 4. `continueDebug()` / `stepOver()` 等控制执行
 * 5. `evaluateExpression()` 求值表达式
 * 6. `terminateDebugSession()` 终止会话
 *
 * ## 核心导出
 *
 * - `DebugPanel`：主面板组件
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Play,
  Pause,
  Square,
  StepForward,
  // StepInto,
  // StepOut,
  Bug,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Terminal,
  RefreshCw,
  Circle,
  // CheckCircle2,
  // AlertCircle,
  Loader2,
  FileCode2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "~/lib/utils";
import { toastManager } from "./ui/toast";
import {
  startDebugging,
  terminateDebugSession,
  listDebugSessions,
  // setBreakpoints imported as setBreakpointsRemote to avoid shadowing local state
  setBreakpoints as setBreakpointsRemote,
  continueDebug,
  stepOver,
  stepInto,
  stepOut,
  pauseDebug,
  evaluateExpression,
  listDebugAdapters,
  type DebugSession,
  type DebugBreakpoint,
  type DebugAdapterConfig,
  type DebugStackFrame,
  type DebugVariable,
} from "~/contracts/debug";

// ==================== Types ====================

interface DebugPanelProps {
  /** 工作区根目录 */
  workspaceRoot: string;
  /** 当前打开的文件路径 */
  activeFilePath?: string | null;
  /** 自定义类名 */
  className?: string;
}

/** 断点编辑状态 */
interface BreakpointDraft {
  filePath: string;
  line: number;
  condition?: string;
  logMessage?: string;
  enabled: boolean;
}

/** 求值历史 */
interface EvalEntry {
  id: string;
  expression: string;
  result: string;
  error?: boolean;
}

// ==================== State Colors ====================

const SESSION_STATE_COLORS: Record<string, string> = {
  created: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  configured: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  running: "bg-green-500/10 text-green-600 border-green-500/20",
  paused: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  terminated: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  failed: "bg-red-500/10 text-red-600 border-red-500/20",
};

const SESSION_STATE_LABELS: Record<string, string> = {
  created: "已创建",
  configured: "已配置",
  running: "运行中",
  paused: "已暂停",
  terminated: "已终止",
  failed: "失败",
};

// ==================== Breakpoint List ====================

interface BreakpointListProps {
  breakpoints: BreakpointDraft[];
  onChange: (breakpoints: BreakpointDraft[]) => void;
  activeFilePath?: string | null;
}

function BreakpointList({ breakpoints, onChange, activeFilePath }: BreakpointListProps) {
  const [newFile, setNewFile] = useState("");
  const [newLine, setNewLine] = useState("");

  const handleAdd = useCallback(() => {
    const file = newFile.trim() || activeFilePath || "";
    const line = parseInt(newLine, 10);
    if (!file || !line || line < 1) {
      toastManager.add({
        type: "warning",
        title: "请输入有效的文件路径和行号",
        timeout: 2000,
      });
      return;
    }
    onChange([
      ...breakpoints,
      { filePath: file, line, enabled: true },
    ]);
    setNewFile("");
    setNewLine("");
  }, [newFile, newLine, activeFilePath, breakpoints, onChange]);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(breakpoints.filter((_, i) => i !== index));
    },
    [breakpoints, onChange],
  );

  const handleToggle = useCallback(
    (index: number) => {
      onChange(
        breakpoints.map((bp, i) =>
          i === index ? { ...bp, enabled: !bp.enabled } : bp,
        ),
      );
    },
    [breakpoints, onChange],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Input
          value={newFile}
          onChange={(e) => setNewFile(e.target.value)}
          placeholder={activeFilePath ? activeFilePath.split(/[\\/]/).pop() ?? "文件路径" : "文件路径"}
          className="h-7 flex-1 text-[11px] font-mono"
        />
        <Input
          type="number"
          value={newLine}
          onChange={(e) => setNewLine(e.target.value)}
          placeholder="行号"
          className="h-7 w-16 text-[11px]"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={handleAdd}>
          <Plus className="size-3" />
        </Button>
      </div>
      {breakpoints.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-muted-foreground/60">
          暂无断点
        </p>
      ) : (
        <div className="space-y-1">
          {breakpoints.map((bp, i) => (
            <div
              key={i}
              className="group flex items-center gap-2 rounded-md border border-border/40 px-2 py-1"
              data-testid={`debug-breakpoint-${i}`}
            >
              <button
                type="button"
                onClick={() => handleToggle(i)}
                className={cn(
                  "inline-flex size-3 shrink-0 items-center justify-center rounded-full border transition-colors",
                  bp.enabled
                    ? "border-red-500 bg-red-500/20"
                    : "border-muted-foreground/30 bg-transparent",
                )}
                aria-label={bp.enabled ? "禁用断点" : "启用断点"}
              >
                {bp.enabled && <Circle className="size-2 text-red-500" />}
              </button>
              <FileCode2 className="size-3 shrink-0 text-muted-foreground/60" />
              <span className="min-w-0 truncate font-mono text-[10px] text-foreground/70" title={bp.filePath}>
                {bp.filePath.split(/[\\/]/).pop()}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">:{bp.line}</span>
              {bp.condition && (
                <Badge variant="outline" className="shrink-0 text-[9px] px-1 py-0">
                  条件
                </Badge>
              )}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="ml-auto inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                aria-label="删除断点"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Call Stack ====================

function CallStackView({ frames }: { frames: DebugStackFrame[] }) {
  const [expanded, setExpanded] = useState(true);

  if (frames.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-muted-foreground/60">
        暂无调用栈信息
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        调用栈 ({frames.length})
      </button>
      {expanded && (
        <div className="space-y-0.5 px-2 pb-2">
          {frames.map((frame, i) => (
            <div
              key={frame.id}
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1 text-[11px]",
                i === 0 ? "bg-yellow-500/5" : "",
              )}
            >
              {i === 0 && <ChevronRight className="size-3 text-yellow-500" />}
              <span className="min-w-0 truncate font-mono text-foreground/80">
                {frame.name}
              </span>
              {frame.source && (
                <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground/60">
                  {frame.source.split(/[\\/]/).pop()}:{frame.line}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Variables ====================

function VariablesView({ variables }: { variables: DebugVariable[] }) {
  const [expanded, setExpanded] = useState(true);

  if (variables.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-muted-foreground/60">
        暂无变量
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        变量 ({variables.length})
      </button>
      {expanded && (
        <div className="space-y-0.5 px-3 pb-2">
          {variables.map((v, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="shrink-0 font-mono text-primary/80">{v.name}</span>
              <span className="text-muted-foreground/40">=</span>
              <span
                className={cn(
                  "min-w-0 truncate font-mono",
                  v.typeName ? "text-foreground/70" : "text-muted-foreground/70",
                )}
                title={v.value}
              >
                {v.value}
              </span>
              {v.typeName && (
                <Badge variant="outline" className="ml-auto shrink-0 text-[9px] px-1 py-0">
                  {v.typeName}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Evaluator ====================

function ExpressionEvaluator({ sessionId }: { sessionId: string | null }) {
  const [expression, setExpression] = useState("");
  const [history, setHistory] = useState<EvalEntry[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const handleEvaluate = useCallback(async () => {
    if (!sessionId || !expression.trim()) return;
    const expr = expression.trim();
    setIsEvaluating(true);
    try {
      const result = await evaluateExpression(sessionId, expr);
      const entry: EvalEntry = {
        id: `eval-${Date.now()}`,
        expression: expr,
        result,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 20));
      setExpression("");
    } catch (error) {
      const entry: EvalEntry = {
        id: `eval-${Date.now()}`,
        expression: expr,
        result: error instanceof Error ? error.message : String(error),
        error: true,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 20));
    } finally {
      setIsEvaluating(false);
    }
  }, [sessionId, expression]);

  if (!sessionId) {
    return (
      <div className="px-3 py-2 text-[11px] text-muted-foreground/60">
        启动调试会话后可使用表达式求值
      </div>
    );
  }

  return (
    <div className="space-y-2 px-3 pb-2">
      <div className="flex items-center gap-1.5">
        <Terminal className="size-3 shrink-0 text-muted-foreground/60" />
        <Input
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder="求值表达式..."
          className="h-7 flex-1 font-mono text-[11px]"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleEvaluate();
          }}
          disabled={isEvaluating}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-7 p-0"
          onClick={handleEvaluate}
          disabled={isEvaluating || !expression.trim()}
        >
          {isEvaluating ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
        </Button>
      </div>
      {history.length > 0 && (
        <div className="space-y-1">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="rounded-md border border-border/40 bg-muted/20 p-1.5 text-[10px]"
            >
              <div className="flex items-center gap-1">
                <ChevronRight className="size-2.5 text-muted-foreground/60" />
                <code className="font-mono text-foreground/80">{entry.expression}</code>
              </div>
              <div className="ml-4 mt-0.5">
                <code
                  className={cn(
                    "font-mono",
                    entry.error ? "text-destructive" : "text-muted-foreground/80",
                  )}
                >
                  {entry.result}
                </code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Session Controls ====================

interface SessionControlsProps {
  session: DebugSession;
  onContinue: () => void;
  onPause: () => void;
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
  onTerminate: () => void;
  isBusy: boolean;
}

function SessionControls({
  session,
  onContinue,
  onPause,
  onStepOver,
  onStepInto,
  onStepOut,
  onTerminate,
  isBusy,
}: SessionControlsProps) {
  const isPaused = session.state === "paused";
  const isRunning = session.state === "running";
  const isTerminated = session.state === "terminated" || session.state === "failed";

  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {isPaused && (
        <Button size="sm" variant="default" className="h-7 gap-1 px-2 text-[11px]" onClick={onContinue} disabled={isBusy}>
          <Play className="size-3" />
          继续
        </Button>
      )}
      {isRunning && (
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={onPause} disabled={isBusy}>
          <Pause className="size-3" />
          暂停
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onStepOver} disabled={isBusy || !isPaused} title="步过">
        <StepForward className="size-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onStepInto} disabled={isBusy || !isPaused} title="步入">
        <StepForward className="size-3.5 rotate-180" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onStepOut} disabled={isBusy || !isPaused} title="步出">
        <StepForward className="size-3.5 rotate-90" />
      </Button>
      {!isTerminated && (
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 gap-1 px-2 text-[11px] text-destructive hover:text-destructive"
          onClick={onTerminate}
          disabled={isBusy}
        >
          <Square className="size-3" />
          终止
        </Button>
      )}
      {isBusy && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
    </div>
  );
}

// ==================== Main Component ====================

export const DebugPanel = memo(function DebugPanel({
  workspaceRoot,
  activeFilePath,
  className,
}: DebugPanelProps) {
  const [adapters, setAdapters] = useState<DebugAdapterConfig[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [program, setProgram] = useState("");
  const [args, setArgs] = useState("");
  const [breakpoints, setBreakpoints] = useState<BreakpointDraft[]>([]);
  const [sessions, setSessions] = useState<DebugSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingAdapters, setIsLoadingAdapters] = useState(false);

  // 拉取可用调试适配器
  const loadAdapters = useCallback(async () => {
    setIsLoadingAdapters(true);
    try {
      const list = await listDebugAdapters();
      setAdapters(list);
      if (list.length > 0 && !selectedLanguage) {
        setSelectedLanguage(list[0].language);
      }
    } catch {
      // 静默失败：可能后端未连接
    } finally {
      setIsLoadingAdapters(false);
    }
  }, [selectedLanguage]);

  useEffect(() => {
    void loadAdapters();
  }, [loadAdapters]);

  // 刷新会话列表
  const refreshSessions = useCallback(async () => {
    try {
      const list = await listDebugSessions();
      setSessions(list);
      // 如果没有活跃会话，自动选中第一个非终止的
      const active = list.find((s) => s.state !== "terminated" && s.state !== "failed");
      if (active) {
        setActiveSessionId(active.id);
      } else if (list.length > 0 && !activeSessionId) {
        setActiveSessionId(list[0].id);
      }
    } catch {
      // 静默失败
    }
  }, [activeSessionId]);

  useEffect(() => {
    void refreshSessions();
    const interval = setInterval(refreshSessions, 3000);
    return () => clearInterval(interval);
  }, [refreshSessions]);

  // 当前活跃会话
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  // 启动调试
  const handleStart = useCallback(async () => {
    if (!selectedLanguage || !workspaceRoot) {
      toastManager.add({
        type: "warning",
        title: "请选择语言并确保工作区已打开",
        timeout: 2500,
      });
      return;
    }
    const programPath = program.trim() || activeFilePath || "";
    if (!programPath) {
      toastManager.add({
        type: "warning",
        title: "请指定要调试的程序路径",
        timeout: 2500,
      });
      return;
    }

    setIsStarting(true);
    try {
      const bpList: DebugBreakpoint[] = breakpoints.map((bp) => ({
        filePath: bp.filePath,
        line: bp.line,
        condition: bp.condition,
        logMessage: bp.logMessage,
        enabled: bp.enabled,
      }));

      const session = await startDebugging({
        language: selectedLanguage,
        workspaceRoot,
        program: programPath,
        args: args.trim() ? args.split(/\s+/) : undefined,
        launch: true,
        breakpoints: bpList,
      });

      setSessions((prev) => [...prev, session]);
      setActiveSessionId(session.id);

      toastManager.add({
        type: "success",
        title: "调试会话已启动",
        description: `${selectedLanguage} · ${programPath.split(/[\\/]/).pop()}`,
        timeout: 3000,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "启动调试失败",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsStarting(false);
    }
  }, [selectedLanguage, workspaceRoot, program, activeFilePath, args, breakpoints]);

  // 调试控制
  const handleControl = useCallback(
    async (action: "continue" | "pause" | "stepOver" | "stepInto" | "stepOut" | "terminate") => {
      if (!activeSessionId) return;
      setIsBusy(true);
      try {
        switch (action) {
          case "continue":
            await continueDebug(activeSessionId);
            break;
          case "pause":
            await pauseDebug(activeSessionId);
            break;
          case "stepOver":
            await stepOver(activeSessionId);
            break;
          case "stepInto":
            await stepInto(activeSessionId);
            break;
          case "stepOut":
            await stepOut(activeSessionId);
            break;
          case "terminate":
            await terminateDebugSession(activeSessionId);
            setActiveSessionId(null);
            break;
        }
        await refreshSessions();
      } catch (error) {
        toastManager.add({
          type: "error",
          title: `操作失败: ${action}`,
          description: error instanceof Error ? error.message : String(error),
          timeout: 3000,
        });
      } finally {
        setIsBusy(false);
      }
    },
    [activeSessionId, refreshSessions],
  );

  // 更新断点
  const handleBreakpointsChange = useCallback(
    async (newBps: BreakpointDraft[]) => {
      setBreakpoints(newBps);
      // 如果有活跃会话，同步到后端
      if (activeSessionId) {
        const bpList: DebugBreakpoint[] = newBps.map((bp) => ({
          filePath: bp.filePath,
          line: bp.line,
          condition: bp.condition,
          logMessage: bp.logMessage,
          enabled: bp.enabled,
        }));
        try {
          await setBreakpointsRemote(activeSessionId, bpList);
        } catch {
          // 静默失败
        }
      }
    },
    [activeSessionId],
  );

  return (
    <div
      className={cn("flex h-full flex-col bg-background/40", className)}
      data-testid="debug-panel"
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <Bug className="size-4 text-primary" />
        <span className="text-[12px] font-medium">调试器</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 w-6 p-0"
          onClick={loadAdapters}
          disabled={isLoadingAdapters}
          title="刷新适配器列表"
        >
          <RefreshCw className={cn("size-3.5", isLoadingAdapters && "animate-spin")} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {/* 配置区 */}
          {!activeSession && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">语言</label>
                {adapters.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60">
                    {isLoadingAdapters ? "加载适配器中..." : "未检测到调试适配器"}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {adapters.map((adapter) => (
                      <button
                        key={adapter.language}
                        type="button"
                        onClick={() => setSelectedLanguage(adapter.language)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          selectedLanguage === adapter.language
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {adapter.displayName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">程序路径</label>
                <Input
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  placeholder={activeFilePath ?? "例如: src/main.ts"}
                  className="h-8 font-mono text-[11px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">参数（空格分隔）</label>
                <Input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="--flag value"
                  className="h-8 font-mono text-[11px]"
                />
              </div>

              <Button
                onClick={handleStart}
                disabled={isStarting || !selectedLanguage}
                className="w-full"
                size="sm"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                    启动中...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 size-3.5" />
                    启动调试
                  </>
                )}
              </Button>
            </div>
          )}

          {/* 活跃会话信息 */}
          {activeSession && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-[10px]",
                    SESSION_STATE_COLORS[activeSession.state] ?? "",
                  )}
                >
                  {SESSION_STATE_LABELS[activeSession.state] ?? activeSession.state}
                </Badge>
                <span className="truncate font-mono text-[11px] text-foreground/70" title={activeSession.program}>
                  {activeSession.program.split(/[\\/]/).pop()}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                {activeSession.language} · {activeSession.id.slice(0, 8)}
              </p>
            </div>
          )}

          {/* 调试控制 */}
          {activeSession && (
            <SessionControls
              session={activeSession}
              onContinue={() => handleControl("continue")}
              onPause={() => handleControl("pause")}
              onStepOver={() => handleControl("stepOver")}
              onStepInto={() => handleControl("stepInto")}
              onStepOut={() => handleControl("stepOut")}
              onTerminate={() => handleControl("terminate")}
              isBusy={isBusy}
            />
          )}

          {/* 断点列表 */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 px-1">
              <Circle className="size-3 text-red-500" />
              <span className="text-[11px] font-medium text-muted-foreground">断点</span>
              <Badge variant="outline" className="ml-auto text-[9px] px-1.5 py-0">
                {breakpoints.length}
              </Badge>
            </div>
            <BreakpointList
              breakpoints={breakpoints}
              onChange={handleBreakpointsChange}
              activeFilePath={activeFilePath}
            />
          </div>

          {/* 调用栈 */}
          {activeSession && activeSession.stackFrames.length > 0 && (
            <div className="rounded-lg border border-border/40">
              <CallStackView frames={activeSession.stackFrames} />
            </div>
          )}

          {/* 变量 */}
          {activeSession && activeSession.threads.length > 0 && (
            <div className="rounded-lg border border-border/40">
              <VariablesView variables={[]} />
            </div>
          )}

          {/* 表达式求值 */}
          {activeSession && (
            <div className="rounded-lg border border-border/40">
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <Terminal className="size-3 text-muted-foreground/60" />
                <span className="text-[11px] font-medium text-muted-foreground">表达式求值</span>
              </div>
              <ExpressionEvaluator sessionId={activeSessionId} />
            </div>
          )}

          {/* 会话列表 */}
          {sessions.length > 1 && (
            <div className="space-y-1.5">
              <span className="px-1 text-[11px] font-medium text-muted-foreground">
                所有会话 ({sessions.length})
              </span>
              <div className="space-y-1">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setActiveSessionId(session.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                      activeSessionId === session.id
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/40 hover:bg-muted/30",
                    )}
                  >
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 text-[9px]", SESSION_STATE_COLORS[session.state] ?? "")}
                    >
                      {SESSION_STATE_LABELS[session.state] ?? session.state}
                    </Badge>
                    <span className="min-w-0 truncate font-mono text-[10px]">
                      {session.program.split(/[\\/]/).pop()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
