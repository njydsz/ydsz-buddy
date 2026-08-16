/**
 * @file Agent Team Monitor（多 Agent 团队监控面板）
 *
 * 提供多 Agent 团队的可视化监控：
 * - 实时 Agent 状态面板（空闲/工作中/等待中/待输入/完成/失败/暂停）
 * - 任务依赖 DAG 可视化
 * - Agent 间消息流时间线
 * - 子 Agent 线程嵌套展示
 *
 * ## 使用场景
 *
 * - 主聊天面板侧边栏中的团队状态悬浮窗
 * - 独立团队管理路由
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// ==================== 类型定义 ====================

type AgentWorkState =
  | "idle"
  | "working"
  | "waiting"
  | "pending_input"
  | "completed"
  | "failed"
  | "paused";

type TaskStatus = "pending" | "in_progress" | "done" | "failed" | "skipped";

interface TeamMember {
  agentId: string;
  displayName: string;
  role: string;
  state: AgentWorkState;
  currentTaskId?: string;
  threadId?: string;
  updatedAt: string;
}

interface SubTask {
  id: string;
  title: string;
  description: string;
  assignee?: string;
  dependencies: string[];
  status: TaskStatus;
  output?: string;
  createdAt: string;
  completedAt?: string;
}

interface AgentMessage {
  id: string;
  from: string;
  to?: string;
  content: string;
  taskId?: string;
  sentAt: string;
}

interface TeamSnapshot {
  teamId: string;
  name: string;
  leaderId: string;
  members: TeamMember[];
  tasks: SubTask[];
  messages: AgentMessage[];
  isRunning: boolean;
  createdAt: string;
}

interface TaskDagNode {
  taskId: string;
  title: string;
  status: TaskStatus;
  assignee?: string;
  dependencies: string[];
  dependents: string[];
}

// ==================== 主组件 ====================

export interface AgentTeamMonitorProps {
  /** 团队 ID（可选，不传则展示列表） */
  teamId?: string;
  /** 是否轮询更新 */
  polIntervalMs?: number;
  /** 紧凑模式（仅展示状态栏） */
  compact?: boolean;
}

export function AgentTeamMonitor({
  teamId,
  polIntervalMs = 3000,
  compact = false,
}: AgentTeamMonitorProps) {
  const [teams, setTeams] = useState<TeamSnapshot[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(teamId ?? null);
  const [loading, setLoading] = useState(true);

  const fetchTeams = useCallback(async () => {
    try {
      const result = await invoke<{ teams: TeamSnapshot[] }>(
        "agent_team.list_teams",
      );
      setTeams(result.teams);
      if (!selectedTeamId && result.teams.length > 0) {
        setSelectedTeamId(result.teams[0].teamId);
      }
    } catch (err) {
      console.error("加载团队列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId]);

  useEffect(() => {
    fetchTeams();
    if (polIntervalMs > 0) {
      const timer = setInterval(fetchTeams, polIntervalMs);
      return () => clearInterval(timer);
    }
  }, [fetchTeams, polIntervalMs]);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.teamId === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        加载团队状态...
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <div>暂无 Agent 团队</div>
        <div className="text-xs">在对话中使用 @team 创建多 Agent 团队</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 团队选择器 */}
      {teams.length > 1 && (
        <div className="shrink-0 border-b border-border p-2">
          <select
            value={selectedTeamId ?? ""}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {teams.map((team) => (
              <option key={team.teamId} value={team.teamId}>
                {team.name} ({team.isRunning ? "运行中" : "已停止"})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 内容区 */}
      {selectedTeam ? (
        <div className="flex-1 overflow-y-auto">
          {compact ? (
            <CompactView team={selectedTeam} />
          ) : (
            <FullView team={selectedTeam} />
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          选择一个团队
        </div>
      )}
    </div>
  );
}

// ==================== 紧凑视图 ====================

function CompactView({ team }: { team: TeamSnapshot }) {
  const workingCount = team.members.filter((m) => m.state === "working").length;
  const doneCount = team.tasks.filter((t) => t.status === "done").length;
  const totalTasks = team.tasks.length;

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{team.name}</span>
        <span
          className={`h-2 w-2 rounded-full ${
            team.isRunning ? "bg-green-500 animate-pulse" : "bg-muted-foreground"
          }`}
        />
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>🤖 {workingCount}/{team.members.length} 工作中</span>
        <span>
          ✅ {doneCount}/{totalTasks} 已完成
        </span>
      </div>
      {/* 成员状态点 */}
      <div className="flex flex-wrap gap-1">
        {team.members.map((member) => (
          <div
            key={member.agentId}
            title={`${member.displayName}: ${stateLabel(member.state)}`}
            className={`h-3 w-3 rounded-full ${stateColor(member.state)}`}
          />
        ))}
      </div>
    </div>
  );
}

// ==================== 完整视图 ====================

function FullView({ team }: { team: TeamSnapshot }) {
  return (
    <div className="space-y-4 p-4">
      {/* 概览 */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{team.name}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              team.isRunning
                ? "bg-green-500/10 text-green-600"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {team.isRunning ? "运行中" : "已停止"}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
          <div>
            <div className="text-foreground font-medium">{team.members.length}</div>
            <div>成员</div>
          </div>
          <div>
            <div className="text-foreground font-medium">{team.tasks.length}</div>
            <div>任务</div>
          </div>
          <div>
            <div className="text-foreground font-medium">{team.messages.length}</div>
            <div>消息</div>
          </div>
        </div>
      </div>

      {/* Agent 状态面板 */}
      <Section title="Agent 状态">
        <div className="grid grid-cols-2 gap-2">
          {team.members.map((member) => (
            <AgentCard key={member.agentId} member={member} team={team} />
          ))}
        </div>
      </Section>

      {/* 任务列表 */}
      <Section title="任务列表">
        {" "}
        <div className="space-y-1.5">
          {team.tasks.length === 0 ? (
            <div className="text-xs text-muted-foreground">暂无任务</div>
          ) : (
            team.tasks.map((task) => (
              <TaskCard key={task.id} task={task} members={team.members} />
            ))
          )}
        </div>
      </Section>

      {/* 最新消息 */}
      {team.messages.length > 0 && (
        <Section title="最新消息">
          {" "}
          <div className="space-y-1">
            {team.messages
              .slice(-5)
              .reverse()
              .map((msg) => (
                <div
                  key={msg.id}
                  className="rounded bg-muted/50 px-2 py-1.5 text-xs"
                >
                  <span className="font-medium">{msg.from}</span>
                  {msg.to && (
                    <span className="text-muted-foreground"> → {msg.to}</span>
                  )}
                  : <span className="text-foreground">{msg.content}</span>
                </div>
              ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ==================== 子组件 ====================

function AgentCard({ member, team }: { member: TeamMember; team: TeamSnapshot }) {
  const currentTask = member.currentTaskId
    ? team.tasks.find((t) => t.id === member.currentTaskId)
    : null;

  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="flex items-center gap-2">
        <div className={`h-2.5 w-2.5 rounded-full ${stateColor(member.state)}`} />
        <span className="truncate text-xs font-medium">{member.displayName}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{member.role}</div>
      <div className="mt-0.5 text-xs">{stateLabel(member.state)}</div>
      {currentTask && (
        <div className="mt-1 truncate text-xs text-primary">
          📋 {currentTask.title}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  members,
}: {
  task: SubTask;
  members: TeamMember[];
}) {
  const assigneeName = task.assignee
    ? members.find((m) => m.agentId === task.assignee)?.displayName ?? task.assignee
    : "未分配";

  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
      <TaskStatusIcon status={task.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{task.title}</div>
        <div className="text-xs text-muted-foreground">{assigneeName}</div>
      </div>
      {task.dependencies.length > 0 && (
        <span className="text-xs text-muted-foreground/60" title="依赖任务">
          ⛓ {task.dependencies.length}
        </span>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

// ==================== 辅助函数 ====================

function stateLabel(state: AgentWorkState): string {
  const labels: Record<AgentWorkState, string> = {
    idle: "空闲",
    working: "工作中",
    waiting: "等待依赖",
    pending_input: "待输入",
    completed: "已完成",
    failed: "失败",
    paused: "已暂停",
  };
  return labels[state] ?? state;
}

function stateColor(state: AgentWorkState): string {
  const colors: Record<AgentWorkState, string> = {
    idle: "bg-muted-foreground/40",
    working: "bg-blue-500 animate-pulse",
    waiting: "bg-yellow-500",
    pending_input: "bg-orange-500",
    completed: "bg-green-500",
    failed: "bg-destructive",
    paused: "bg-muted-foreground/60",
  };
  return colors[state] ?? "bg-muted-foreground";
}

function TaskStatusIcon({ status }: { status: TaskStatus }) {
  const icons: Record<TaskStatus, string> = {
    pending: "⭕",
    in_progress: "🔄",
    done: "✅",
    failed: "❌",
    skipped: "⏭️",
  };
  return <span className="text-xs">{icons[status] ?? "?"}</span>;
}
