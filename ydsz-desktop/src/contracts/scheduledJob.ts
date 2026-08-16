/**
 * @file ScheduledJob 类型定义
 *
 * 对齐后端 `commands/scheduler.rs::ScheduledJobDto` 字段。
 * `#[serde(rename_all = "camelCase")]` 让 Tauri v2 IPC 自动将
 * snake_case 字段转为 camelCase,所以前端直接用 camelCase 字段。
 *
 * 复用点：
 * - `AutomationsView` —— 列表 / 创建 / 编辑 / 删除 UI
 * - `useComposerSchedulerPick` —— `@scheduler` 触发器
 * - 后续 Settings/Inspector 等面板
 */

export interface ScheduledJob {
  /** 任务 ID（后端生成 UUID） */
  taskId: string;
  /** 关联的对话线程 ID */
  threadId: string;
  /** CRON 表达式（5 段或 6 段） */
  cronExpression: string;
  /** 触发时发送的 prompt 文本 */
  prompt: string;
  /** 是否启用 */
  enabled: boolean;
  /** 创建时间（ISO8601 字符串） */
  createdAt: string;
  /** 最近触发时间（ISO8601 字符串，可能为 null） */
  lastFiredAt: string | null;
  /** 下次预计触发时间（ISO8601 字符串，可能为 null） */
  nextFireAt: string | null;
}
