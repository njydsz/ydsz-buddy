/**
 * @file Workflows Store
 * @description 动态工作流持久化管理（zustand + localStorage）
 *
 * 管理工作流定义和运行实例，支持 CRUD 操作。
 * 内置 3 个模板（代码审查、文档生成、测试运行）。
 *
 * ## 持久化
 *
 * - 存储 key: `ydsz-buddy:workflows:v1`
 * - 使用 zustand/middleware persist + localStorage
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// =====================================================================
// Types (mirroring contracts/workflow.ts for direct use without Schema)
// =====================================================================

export type WorkflowTriggerType = "manual" | "schedule" | "event" | "hook";
export type WorkflowStepType = "agent" | "tool" | "shell" | "condition" | "parallel" | "wait" | "subworkflow";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled";
export type WorkflowRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  cron?: string;
  event_name?: string;
  hook_id?: string;
  description?: string;
}

export interface WorkflowVariable {
  name: string;
  description?: string;
  var_type?: string;
  required?: boolean;
  default_value?: string;
  enum_values?: string[];
}

export interface WorkflowRetryPolicy {
  max_retries: number;
  backoff_secs: number;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: WorkflowStepType;
  config: Record<string, unknown>;
  depends_on?: string[];
  retry_policy?: WorkflowRetryPolicy;
  timeout_secs?: number;
  condition_expression?: string;
  branches?: WorkflowStep[][];
}

export interface WorkflowErrorHandler {
  on_failure?: string;
  fallback_step?: string;
  notify?: boolean;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  version: string;
  triggers: WorkflowTrigger[];
  variables?: WorkflowVariable[];
  steps: WorkflowStep[];
  error_handling?: WorkflowErrorHandler;
}

export interface StepResult {
  status: StepStatus;
  output?: unknown;
  error?: string;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  retries?: number;
}

export interface WorkflowRun {
  id: string;
  workflow_name: string;
  status: WorkflowRunStatus;
  current_steps: string[];
  step_results: Record<string, StepResult>;
  started_at: string;
  variables?: Record<string, unknown>;
  finished_at?: string;
  error?: string;
}

// =====================================================================
// Constants
// =====================================================================

const WORKFLOWS_STORAGE_KEY = "ydsz-buddy:workflows:v1";

// =====================================================================
// Utilities
// =====================================================================

function generateId(prefix = "wf"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// =====================================================================
// Built-in Templates
// =====================================================================

function createBuiltinReviewWorkflow(): WorkflowDefinition {
  return {
    name: "代码审查流水线",
    description: "自动审查代码质量、修复问题、运行测试",
    version: "1.0.0",
    triggers: [{ type: "manual" }],
    variables: [
      { name: "code_path", description: "要审查的文件或目录路径", var_type: "path", required: true },
      { name: "language", description: "编程语言", var_type: "string", required: false, default_value: "auto" },
    ],
    steps: [
      {
        id: "analyze",
        name: "代码分析",
        type: "agent",
        config: {
          prompt: "分析 {{code_path}} 的代码质量，找出潜在问题、安全风险和改进建议。语言：{{language}}",
          output_format: "json",
        },
        depends_on: [],
        retry_policy: { max_retries: 1, backoff_secs: 2 },
        timeout_secs: 300,
      },
      {
        id: "fix",
        name: "自动修复",
        type: "agent",
        config: {
          prompt: "基于分析结果修复代码中的问题，输出修改后的文件",
        },
        depends_on: ["analyze"],
        retry_policy: { max_retries: 2, backoff_secs: 3 },
        timeout_secs: 600,
      },
      {
        id: "test",
        name: "运行测试",
        type: "shell",
        config: {
          command: "cd {{code_path}} && npm test || cargo test || make test",
        },
        depends_on: ["fix"],
        timeout_secs: 300,
      },
    ],
  };
}

function createBuiltinDocsWorkflow(): WorkflowDefinition {
  return {
    name: "文档自动生成",
    description: "扫描代码生成 API 文档、README 和使用示例",
    version: "1.0.0",
    triggers: [{ type: "manual" }],
    variables: [
      { name: "source_dir", description: "源码目录", var_type: "path", required: true },
    ],
    steps: [
      {
        id: "scan",
        name: "代码扫描",
        type: "agent",
        config: {
          prompt: "扫描 {{source_dir}} 中的所有公共接口、类型和函数签名，生成结构化摘要",
        },
        depends_on: [],
        timeout_secs: 300,
      },
      {
        id: "gen-api",
        name: "API 文档",
        type: "agent",
        config: {
          prompt: "基于扫描结果生成 API 文档（Markdown 格式）",
        },
        depends_on: ["scan"],
        timeout_secs: 300,
      },
      {
        id: "gen-readme",
        name: "README 更新",
        type: "agent",
        config: {
          prompt: "基于代码结构生成清晰的 README.md",
        },
        depends_on: ["scan"],
        timeout_secs: 300,
      },
      {
        id: "write-files",
        name: "写入文档",
        type: "tool",
        config: {
          action: "write_files",
          target_dir: "{{source_dir}}",
        },
        depends_on: ["gen-api", "gen-readme"],
        timeout_secs: 60,
      },
    ],
  };
}

function createBuiltinTestWorkflow(): WorkflowDefinition {
  return {
    name: "测试运行",
    description: "检测项目类型并运行相应的测试套件",
    version: "1.0.0",
    triggers: [{ type: "manual" }],
    variables: [
      { name: "project_dir", description: "项目目录", var_type: "path", required: true },
      { name: "test_args", description: "额外测试参数", var_type: "string", required: false },
    ],
    steps: [
      {
        id: "detect",
        name: "检测项目类型",
        type: "tool",
        config: {
          action: "detect_project_type",
          path: "{{project_dir}}",
        },
        depends_on: [],
        timeout_secs: 30,
      },
      {
        id: "lint",
        name: "代码检查",
        type: "shell",
        config: {
          command: "cd {{project_dir}} && npm run lint || cargo clippy -- -D warnings",
          ignore_failure: true,
        },
        depends_on: ["detect"],
        timeout_secs: 120,
      },
      {
        id: "unit-test",
        name: "单元测试",
        type: "shell",
        config: {
          command: "cd {{project_dir}} && npm test || cargo test --lib",
        },
        depends_on: ["detect"],
        timeout_secs: 300,
      },
      {
        id: "integration-test",
        name: "集成测试",
        type: "shell",
        config: {
          command: "cd {{project_dir}} && npm run test:integration || cargo test --test integration",
          ignore_failure: true,
        },
        depends_on: ["unit-test"],
        timeout_secs: 600,
      },
    ],
  };
}

// =====================================================================
// Store Definition
// =====================================================================

interface WorkflowsStoreState {
  // Data
  definitions: WorkflowDefinition[];
  runs: WorkflowRun[];
  builtInSeeded: boolean;

  // Definition CRUD
  listDefinitions: () => WorkflowDefinition[];
  getDefinition: (name: string) => WorkflowDefinition | undefined;
  addDefinition: (def: WorkflowDefinition) => void;
  updateDefinition: (name: string, patch: Partial<WorkflowDefinition>) => boolean;
  removeDefinition: (name: string) => boolean;

  // Run management
  createRun: (definition: WorkflowDefinition, variables?: Record<string, unknown>) => WorkflowRun;
  getRun: (id: string) => WorkflowRun | undefined;
  updateRun: (id: string, patch: Partial<WorkflowRun>) => boolean;
  listRuns: () => WorkflowRun[];
  cancelRun: (id: string) => boolean;

  // Built-in seeding
  seedBuiltinWorkflows: () => void;
}

export const useWorkflowsStore = create<WorkflowsStoreState>()(
  persist(
    (set, get) => ({
      definitions: [],
      runs: [],
      builtInSeeded: false,

      // ---- Definition CRUD ----

      listDefinitions: () => get().definitions,

      getDefinition: (name) => get().definitions.find((d) => d.name === name),

      addDefinition: (def) => {
        set((state) => ({
          definitions: [...state.definitions, def],
        }));
      },

      updateDefinition: (name, patch) => {
        let updated = false;
        set((state) => {
          const idx = state.definitions.findIndex((d) => d.name === name);
          if (idx === -1) return state;
          updated = true;
          const next = [...state.definitions];
          next[idx] = { ...next[idx], ...patch };
          return { definitions: next };
        });
        return updated;
      },

      removeDefinition: (name) => {
        let removed = false;
        set((state) => {
          const idx = state.definitions.findIndex((d) => d.name === name);
          if (idx === -1) return state;
          removed = true;
          return { definitions: state.definitions.filter((d) => d.name !== name) };
        });
        return removed;
      },

      // ---- Run Management ----

      createRun: (definition, variables) => {
        const ts = nowIso();
        const run: WorkflowRun = {
          id: generateId("run"),
          workflow_name: definition.name,
          status: "pending",
          current_steps: definition.steps
            .filter((s) => !s.depends_on || s.depends_on.length === 0)
            .map((s) => s.id),
          step_results: {},
          started_at: ts,
          variables: variables ?? {},
        };
        set((state) => ({
          runs: [run, ...state.runs],
        }));
        return run;
      },

      getRun: (id) => get().runs.find((r) => r.id === id),

      updateRun: (id, patch) => {
        let updated = false;
        set((state) => {
          const idx = state.runs.findIndex((r) => r.id === id);
          if (idx === -1) return state;
          updated = true;
          const next = [...state.runs];
          next[idx] = { ...next[idx], ...patch };
          return { runs: next };
        });
        return updated;
      },

      listRuns: () => get().runs,

      cancelRun: (id) => {
        let cancelled = false;
        set((state) => {
          const idx = state.runs.findIndex((r) => r.id === id);
          if (idx === -1) return state;
          const run = state.runs[idx];
          if (run.status !== "running" && run.status !== "pending") return state;
          cancelled = true;
          const next = [...state.runs];
          next[idx] = {
            ...run,
            status: "cancelled",
            finished_at: nowIso(),
          };
          return { runs: next };
        });
        return cancelled;
      },

      // ---- Built-in Seed ----

      seedBuiltinWorkflows: () => {
        if (get().builtInSeeded) return;
        set((state) => ({
          definitions: [
            ...state.definitions,
            createBuiltinReviewWorkflow(),
            createBuiltinDocsWorkflow(),
            createBuiltinTestWorkflow(),
          ],
          builtInSeeded: true,
        }));
      },
    }),
    {
      name: WORKFLOWS_STORAGE_KEY,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return window.localStorage;
      }),
      version: 1,
      partialize: (state) => ({
        definitions: state.definitions,
        runs: state.runs.slice(0, 50), // 只保留最近 50 条运行记录
        builtInSeeded: state.builtInSeeded,
      }),
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as Partial<WorkflowsStoreState>;
        return {
          ...currentState,
          definitions: Array.isArray(p.definitions) ? p.definitions : [],
          runs: Array.isArray(p.runs) ? p.runs : [],
          builtInSeeded: p.builtInSeeded ?? false,
        };
      },
    },
  ),
);
