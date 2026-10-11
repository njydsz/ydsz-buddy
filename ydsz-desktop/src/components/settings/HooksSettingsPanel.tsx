/**
 * @file HooksSettingsPanel
 * @description Workspace Hooks 生命周期钩子设置面板
 *
 * 提供 Hook 的 CRUD 管理界面：
 * - 列表展示已配置的 hooks
 * - 新建/编辑表单（事件选择 + handler 类型 + 脚本内容）
 * - 启用/禁用 toggle
 * - 删除确认
 *
 * 位于 Settings → 行为 → 生命周期钩子。
 */

import { useState, useCallback } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import {
  HOOK_EVENT_NAMES,
  HOOK_EVENT_GROUPS,
  HOOK_EVENT_LABELS,
  type HookEvent,
  type HookErrorPolicy,
  type HookHandlerType,
  type WorkspaceHook,
} from "../../contracts/hooks";
import { useHooksStore } from "../../hooksStore";

// ===== 编辑表单状态 =====

interface HookFormData {
  event: HookEvent;
  name: string;
  handlerType: HookHandlerType;
  scriptContent: string;
  skillId: string;
  timeoutSecs: number;
  errorPolicy: HookErrorPolicy;
}

function createEmptyForm(): HookFormData {
  return {
    event: "workspace:opened",
    name: "",
    handlerType: "script",
    scriptContent: "",
    skillId: "",
    timeoutSecs: 30,
    errorPolicy: "continue",
  };
}

function hookToForm(hook: WorkspaceHook): HookFormData {
  return {
    event: hook.event,
    name: hook.name,
    handlerType: hook.handlerType,
    scriptContent: hook.scriptContent ?? "",
    skillId: hook.skillId ?? "",
    timeoutSecs: hook.timeoutSecs,
    errorPolicy: hook.errorPolicy,
  };
}

// ===== 主面板 =====

export function HooksSettingsPanel() {
  const hooks = useHooksStore((s) => s.hooks);
  const addHook = useHooksStore((s) => s.addHook);
  const updateHook = useHooksStore((s) => s.updateHook);
  const removeHook = useHooksStore((s) => s.removeHook);
  const toggleHook = useHooksStore((s) => s.toggleHook);
  const seedBuiltinHooks = useHooksStore((s) => s.seedBuiltinHooks);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HookFormData>(createEmptyForm());
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 引导示例
  const handleSeedExamples = useCallback(() => {
    seedBuiltinHooks();
  }, [seedBuiltinHooks]);

  // 开始编辑
  const startEdit = useCallback((hook: WorkspaceHook) => {
    setEditingId(hook.id);
    setForm(hookToForm(hook));
    setShowForm(true);
  }, []);

  // 新建
  const startCreate = useCallback(() => {
    setEditingId(null);
    setForm(createEmptyForm());
    setShowForm(true);
  }, []);

  // 取消
  const cancelForm = useCallback(() => {
    setEditingId(null);
    setForm(createEmptyForm());
    setShowForm(false);
  }, []);

  // 保存
  const handleSave = useCallback(() => {
    if (!form.name.trim()) return;

    if (editingId) {
      updateHook(editingId, {
        event: form.event,
        name: form.name.trim(),
        handlerType: form.handlerType,
        scriptContent: form.handlerType === "script" ? form.scriptContent : undefined,
        skillId: form.handlerType === "skill" ? form.skillId : undefined,
        timeoutSecs: form.timeoutSecs,
        errorPolicy: form.errorPolicy,
        enabled: true,
      });
    } else {
      addHook({
        event: form.event,
        name: form.name.trim(),
        handlerType: form.handlerType,
        scriptContent: form.handlerType === "script" ? form.scriptContent : undefined,
        skillId: form.handlerType === "skill" ? form.skillId : undefined,
        timeoutSecs: form.timeoutSecs,
        errorPolicy: form.errorPolicy,
        enabled: true,
      });
    }

    setEditingId(null);
    setForm(createEmptyForm());
    setShowForm(false);
  }, [form, editingId, addHook, updateHook]);

  // 删除
  const handleDelete = useCallback(
    (id: string) => {
      removeHook(id);
      setDeleteConfirmId(null);
      if (editingId === id) {
        cancelForm();
      }
    },
    [removeHook, editingId, cancelForm],
  );

  // 按事件分组的 hooks
  const grouped = HOOK_EVENT_GROUPS;

  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div>
        <h3 className="text-sm font-medium">生命周期钩子</h3>
        <p className="text-xs text-muted-foreground">
          在特定生命周期事件发生时执行自定义脚本或 Skill。支持 7 种事件类型，
          可用于自动化工作流、会话管理、命令审计等场景。
        </p>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={startCreate}>
          新建 Hook
        </Button>
        {hooks.length === 0 && (
          <Button size="sm" variant="outline" onClick={handleSeedExamples}>
            加载示例
          </Button>
        )}
      </div>

      {/* Hook 列表 — 按事件分组 */}
      {hooks.length > 0 ? (
        <div className="space-y-4">
          {Object.entries(grouped).map(([groupKey, group]) => {
            const groupHooks = hooks.filter((h) => group.events.includes(h.event));
            if (groupHooks.length === 0) return null;

            return (
              <div key={groupKey} className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h4>
                <div className="space-y-1">
                  {groupHooks.map((hook) => (
                    <HookListItem
                      key={hook.id}
                      hook={hook}
                      onToggle={() => toggleHook(hook.id)}
                      onEdit={() => startEdit(hook)}
                      onDelete={() => setDeleteConfirmId(hook.id)}
                      isEditing={editingId === hook.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          暂无配置 Hook。点击「新建 Hook」创建，或「加载示例」查看预置模板。
        </div>
      )}

      {/* 删除确认 */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-5 shadow-lg">
            <h4 className="text-sm font-medium">确认删除</h4>
            <p className="text-xs text-muted-foreground">
              删除后将不再执行此 Hook，该操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteConfirmId(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDelete(deleteConfirmId)}
              >
                删除
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑表单 */}
      {showForm && (
        <HookEditForm
          form={form}
          onChange={setForm}
          onSave={handleSave}
          onCancel={cancelForm}
          isEditing={editingId !== null}
        />
      )}
    </div>
  );
}

// ===== Hook 列表项 =====

function HookListItem({
  hook,
  onToggle,
  onEdit,
  onDelete,
  isEditing,
}: {
  hook: WorkspaceHook;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-md border px-3 py-2 ${
        isEditing ? "border-primary bg-primary/5" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Switch
          checked={hook.enabled}
          onCheckedChange={onToggle}
          aria-label={hook.enabled ? "禁用 Hook" : "启用 Hook"}
        />
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{hook.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {HOOK_EVENT_LABELS[hook.event]}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {hook.handlerType === "script" ? "脚本" : "Skill"}
            </Badge>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {hook.handlerType === "script"
              ? `超时 ${hook.timeoutSecs}s · 错误时 ${
                  hook.errorPolicy === "continue" ? "继续" : "中断"
                }`
              : `Skill: ${hook.skillId}`}
          </span>
        </div>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          编辑
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          删除
        </Button>
      </div>
    </div>
  );
}

// ===== Hook 编辑表单 =====

function HookEditForm({
  form,
  onChange,
  onSave,
  onCancel,
  isEditing,
}: {
  form: HookFormData;
  onChange: (form: HookFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  isEditing: boolean;
}) {
  const canSave = form.name.trim().length > 0;

  return (
    <div className="space-y-3 rounded-md border p-4">
      <p className="text-xs font-medium">
        {isEditing ? "编辑 Hook" : "新建 Hook"}
      </p>

      {/* 名称 */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">名称</label>
        <Input
          placeholder="例如：打开工作区时拉取代码"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      {/* 事件选择 */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">事件</label>
        <select
          value={form.event}
          onChange={(e) =>
            onChange({ ...form, event: e.target.value as HookEvent })
          }
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        >
          {HOOK_EVENT_NAMES.map((event) => (
            <option key={event} value={event}>
              {HOOK_EVENT_LABELS[event]}（{event}）
            </option>
          ))}
        </select>
      </div>

      {/* Handler 类型 */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">处理方式</label>
        <select
          value={form.handlerType}
          onChange={(e) =>
            onChange({
              ...form,
              handlerType: e.target.value as HookHandlerType,
            })
          }
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="script">Shell 脚本</option>
          <option value="skill">Skill 引用</option>
        </select>
      </div>

      {/* 脚本内容 / Skill ID */}
      {form.handlerType === "script" ? (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">脚本内容</label>
          <textarea
            placeholder="#!/bin/bash&#10;echo 'Workspace opened'"
            value={form.scriptContent}
            onChange={(e) =>
              onChange({ ...form, scriptContent: e.target.value })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            rows={6}
          />
          <p className="text-[10px] text-muted-foreground">
            支持 bash/sh 脚本。环境变量：HOOK_EVENT, HOOK_WORKSPACE_PATH,
            HOOK_FILE_PATH, HOOK_COMMAND
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Skill ID</label>
          <Input
            placeholder="输入要调用的 Skill ID"
            value={form.skillId}
            onChange={(e) => onChange({ ...form, skillId: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      )}

      {/* 高级选项 */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">超时(秒)</label>
          <Input
            type="number"
            min={1}
            max={300}
            value={form.timeoutSecs}
            onChange={(e) =>
              onChange({
                ...form,
                timeoutSecs: Math.max(1, Math.min(300, Number(e.target.value) || 30)),
              })
            }
            className="h-7 w-20 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">错误策略</label>
          <select
            value={form.errorPolicy}
            onChange={(e) =>
              onChange({
                ...form,
                errorPolicy: e.target.value as HookErrorPolicy,
              })
            }
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="continue">继续执行后续</option>
            <option value="abort">中断后续 Hook</option>
          </select>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSave} disabled={!canSave}>
          {isEditing ? "更新" : "创建"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}
