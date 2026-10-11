/**
 * @file 安全设置面板
 * @description 用户管理 + 审批规则配置 (G3-P0 + G17-P2)
 *   位于 Settings → 安全分区。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

// ===== 类型（与 Rust 端 auth_commands.rs / hitl.rs 对齐）=====

interface UserInfo {
  id: string;
  username: string;
  role: string;
  created_at_ms: number;
  last_login_ms: number | null;
}

interface ApprovalRule {
  id: string;
  name: string;
  description: string | null;
  trigger: ApprovalTrigger;
  require_approval: boolean;
  auto_approve_after_secs: number | null;
  created_at: string;
  enabled: boolean;
}

type ApprovalTrigger =
  | { kind: "shellCommandRisky"; value: string }
  | { kind: "fileSystemWrite"; value: string }
  | { kind: "networkRequest"; value: string }
  | { kind: "aiToolCostExceeds"; value: number }
  | { kind: "toolNameExact"; value: string }
  | { kind: "toolNameContains"; value: string };

interface ApprovalHistoryItem {
  id: string;
  thread_id: string;
  turn_id: string;
  tool_name: string;
  tool_call_id: string;
  parameters: Record<string, unknown>;
  requested_at: string;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

interface ApprovalHistoryResponse {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  timeout: number;
  items: ApprovalHistoryItem[];
}

// ===== 主面板 =====

export function SecuritySettingsPanel() {
  return (
    <div className="space-y-8">
      <UserManagementSection />
      <ApprovalRulesSection />
      <ApprovalHistorySection />
    </div>
  );
}

// ===== 用户管理 =====

function UserManagementSection() {
  const queryClient = useQueryClient();
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("developer");
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem("ydsz-buddy:auth-token") ?? "";

  const usersQuery = useQuery({
    queryKey: ["auth", "users"],
    queryFn: async () => {
      const users = await invoke<UserInfo[]>("auth_list_users", {
        adminToken: token,
      });
      return users;
    },
    retry: false,
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      await invoke("auth_register", {
        username: newUsername,
        password: newPassword,
        role: newRole,
        adminToken: token,
      });
    },
    onSuccess: () => {
      setNewUsername("");
      setNewPassword("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["auth", "users"] });
    },
    onError: (e) => setError(String(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await invoke("auth_delete_user", {
        adminToken: token,
        targetUserId: userId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "users"] });
    },
  });

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">用户管理</h3>
        <p className="text-xs text-muted-foreground">
          管理应用本地用户和角色权限。只有管理员可以添加/删除用户。
        </p>
      </div>

      {/* 用户列表 */}
      {usersQuery.data && usersQuery.data.length > 0 && (
        <div className="space-y-1">
          {usersQuery.data.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{u.username}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  {u.role}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteMutation.mutate(u.id)}
                disabled={deleteMutation.isPending}
              >
                删除
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 添加用户 */}
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-xs font-medium">添加新用户</p>
        <div className="flex gap-2">
          <Input
            placeholder="用户名"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="h-8 text-xs"
          />
          <Input
            type="password"
            placeholder="密码"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="h-8 text-xs"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="admin">管理员</option>
            <option value="developer">开发者</option>
            <option value="viewer">查看者</option>
          </select>
          <Button
            size="sm"
            onClick={() => registerMutation.mutate()}
            disabled={registerMutation.isPending || !newUsername || !newPassword}
          >
            添加
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </section>
  );
}

// ===== 审批规则 =====

function ApprovalRulesSection() {
  const queryClient = useQueryClient();
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [triggerKind, setTriggerKind] = useState("toolNameContains");
  const [triggerValue, setTriggerValue] = useState("");
  const [requireApproval, setRequireApproval] = useState(true);
  const [timeoutSecs, setTimeoutSecs] = useState("");

  const rulesQuery = useQuery({
    queryKey: ["hitl", "rules"],
    queryFn: async () => {
      const res = await invoke<{ rules: ApprovalRule[] }>("approval_rules_list");
      return res.rules;
    },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trigger: ApprovalTrigger = buildTrigger(triggerKind, triggerValue);
      await invoke("approval_rules_save", {
        ruleInput: {
          name: ruleName,
          description: null,
          trigger: triggerKind === "shellCommandRisky"
            ? { kind: triggerKind, value: triggerValue }
            : triggerKind === "fileSystemWrite"
              ? { kind: triggerKind, value: triggerValue }
              : triggerKind === "networkRequest"
                ? { kind: triggerKind, value: triggerValue }
                : triggerKind === "aiToolCostExceeds"
                  ? { kind: triggerKind, value: Number(triggerValue) }
                  : triggerKind === "toolNameExact"
                    ? { kind: triggerKind, value: triggerValue }
                    : { kind: "toolNameContains", value: triggerValue },
          requireApproval,
          autoApproveAfterSecs: timeoutSecs ? Number(timeoutSecs) : null,
          enabled: true,
        },
        ruleId: editingRule?.id ?? null,
      });
    },
    onSuccess: () => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["hitl", "rules"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      await invoke("approval_rules_delete", { ruleId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hitl", "rules"] });
    },
  });

  function resetForm() {
    setEditingRule(null);
    setRuleName("");
    setTriggerKind("toolNameContains");
    setTriggerValue("");
    setRequireApproval(true);
    setTimeoutSecs("");
  }

  function startEdit(rule: ApprovalRule) {
    setEditingRule(rule);
    setRuleName(rule.name);
    setRequireApproval(rule.require_approval);
    setTimeoutSecs(rule.auto_approve_after_secs?.toString() ?? "");
    // parse trigger
    const t = rule.trigger as { kind?: string; value?: unknown };
    if (t.kind) {
      setTriggerKind(t.kind);
      setTriggerValue(typeof t.value === "string" ? t.value : String(t.value ?? ""));
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">审批规则</h3>
        <p className="text-xs text-muted-foreground">
          配置何时需要人工干预。危险操作默认需要管理员批准。
        </p>
      </div>

      {/* 规则列表 */}
      {rulesQuery.data && rulesQuery.data.length > 0 && (
        <div className="space-y-1">
          {rulesQuery.data.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{rule.name}</span>
                <Switch checked={rule.enabled} readOnly />
                {rule.require_approval ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                    需审批
                  </span>
                ) : (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">
                    自动
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => startEdit(rule)}>
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(rule.id)}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 规则编辑表单 */}
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-xs font-medium">
          {editingRule ? "编辑规则" : "新建规则"}
        </p>
        <Input
          placeholder="规则名称"
          value={ruleName}
          onChange={(e) => setRuleName(e.target.value)}
          className="h-8 text-xs"
        />
        <div className="flex gap-2">
          <select
            value={triggerKind}
            onChange={(e) => setTriggerKind(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="shellCommandRisky">危险 Shell</option>
            <option value="fileSystemWrite">敏感路径写入</option>
            <option value="networkRequest">外部网络请求</option>
            <option value="aiToolCostExceeds">AI 成本超限</option>
            <option value="toolNameExact">工具名精确匹配</option>
            <option value="toolNameContains">工具名包含</option>
          </select>
          <Input
            placeholder={
              triggerKind === "aiToolCostExceeds" ? "阈值($)" : "匹配值"
            }
            value={triggerValue}
            onChange={(e) => setTriggerValue(e.target.value)}
            className="h-8 flex-1 text-xs"
          />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
            />
            需要审批
          </label>
          <div className="flex items-center gap-1.5 text-xs">
            <span>超时(秒):</span>
            <Input
              placeholder="0=不超时"
              value={timeoutSecs}
              onChange={(e) => setTimeoutSecs(e.target.value)}
              className="h-7 w-20 text-xs"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !ruleName}
          >
            {editingRule ? "更新" : "创建"}
          </Button>
          {editingRule && (
            <Button size="sm" variant="ghost" onClick={resetForm}>
              取消
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

// ===== 审批历史 =====

function ApprovalHistorySection() {
  const timeoutMutation = useMutation({
    mutationFn: async () => {
      const res = await invoke<{ processed_count: number }>(
        "approval_process_timeouts",
      );
      return res.processed_count;
    },
  });

  const historyQuery = useQuery({
    queryKey: ["hitl", "history"],
    queryFn: async () => {
      const res = await invoke<ApprovalHistoryResponse>("approval_list_history");
      return res;
    },
    retry: false,
  });

  const data = historyQuery.data;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">审批历史</h3>
          <p className="text-xs text-muted-foreground">
            查看所有审批请求的处理记录。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => timeoutMutation.mutate()}
          >
            检查超时
          </Button>
        </div>
      </div>

      {/* 统计 */}
      {data && (
        <div className="flex gap-3">
          <StatBadge label="总计" value={data.total} />
          <StatBadge label="待处理" value={data.pending} className="text-amber-600" />
          <StatBadge label="已批准" value={data.approved} className="text-green-600" />
          <StatBadge label="已拒绝" value={data.rejected} className="text-red-600" />
          <StatBadge label="超时" value={data.timeout} className="text-muted-foreground" />
        </div>
      )}

      {/* 列表 */}
      {data && data.items.length > 0 && (
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
          {data.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted/50"
            >
              <span className="font-mono text-[10px] text-muted-foreground">
                {item.tool_name}
              </span>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatBadge({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="text-sm font-medium">{value}</span>
      <span className="ml-1 text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    timeout: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] ${colorMap[status] ?? "bg-muted"}`}
    >
      {status}
    </span>
  );
}

// ===== 工具函数 =====

function buildTrigger(kind: string, value: string): ApprovalTrigger {
  switch (kind) {
    case "shellCommandRisky":
      return { kind: "shellCommandRisky", value };
    case "fileSystemWrite":
      return { kind: "fileSystemWrite", value };
    case "networkRequest":
      return { kind: "networkRequest", value };
    case "aiToolCostExceeds":
      return { kind: "aiToolCostExceeds", value: Number(value) };
    case "toolNameExact":
      return { kind: "toolNameExact", value };
    default:
      return { kind: "toolNameContains", value };
  }
}
