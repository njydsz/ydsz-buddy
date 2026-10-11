/**
 * @file 推送调度面板（G19-P2）
 *
 * 提供定时推送规则的创建、启用/禁用、删除、手动触发功能。
 * 与 src-tauri/src/commands/push.rs 的 push_schedule_* 命令联动。
 */

import { memo, useCallback, useEffect, useState } from "react";
import {
  Clock,
  Loader2,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { toastManager } from "./ui/toast";
import { useMessages } from "../i18n";
import { invoke } from "@tauri-apps/api/core";

// ===== 类型 =====

interface PushScheduleEntry {
  id: string;
  name: string;
  cron: string;
  title: string;
  bodyTemplate: string;
  channel: string;
  targetAlias: string;
  enabled: boolean;
  lastTriggered: string | null;
}

interface PushScheduleConfig {
  name: string;
  cron: string;
  title: string;
  bodyTemplate: string;
  channel: string;
  targetAlias: string;
  enabled: boolean;
}

// ===== 主组件 =====

export const PushSchedulePanel = memo(function PushSchedulePanel() {
  const messages = useMessages();
  const [schedules, setSchedules] = useState<PushScheduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // 新建规则表单
  const [formName, setFormName] = useState("");
  const [formCron, setFormCron] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formChannel, setFormChannel] = useState("local");
  const [formAlias, setFormAlias] = useState("");

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<PushScheduleEntry[]>("push_schedule_list");
      setSchedules(list);
    } catch {
      toastManager.error("加载推送规则失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as { __TAURI__?: unknown }).__TAURI__) {
      loadSchedules();
    }
  }, [loadSchedules]);

  const handleCreate = useCallback(async () => {
    if (!formName.trim() || !formCron.trim() || !formTitle.trim()) {
      toastManager.error("请填写规则名称、Cron 表达式和推送标题");
      return;
    }
    setCreating(true);
    try {
      await invoke<string>("push_schedule_create", {
        config: {
          name: formName.trim(),
          cron: formCron.trim(),
          title: formTitle.trim(),
          bodyTemplate: formBody.trim(),
          channel: formChannel,
          targetAlias: formAlias.trim() || "default",
          enabled: true,
        } as PushScheduleConfig,
      });
      toastManager.success("推送规则已创建");
      setFormName("");
      setFormCron("");
      setFormTitle("");
      setFormBody("");
      setFormAlias("");
      await loadSchedules();
    } catch {
      toastManager.error("创建推送规则失败");
    } finally {
      setCreating(false);
    }
  }, [formName, formCron, formTitle, formBody, formChannel, formAlias, loadSchedules]);

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await invoke<void>("push_schedule_toggle", { id, enabled });
        setSchedules((prev) =>
          prev.map((s) => (s.id === id ? { ...s, enabled } : s)),
        );
        toastManager.success(enabled ? "已启用" : "已禁用");
      } catch {
        toastManager.error("操作失败");
      }
    },
    [],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await invoke<void>("push_schedule_delete", { id });
        setSchedules((prev) => prev.filter((s) => s.id !== id));
        toastManager.success("已删除");
      } catch {
        toastManager.error("删除失败");
      }
    },
    [],
  );

  const handleTrigger = useCallback(
    async (id: string) => {
      try {
        await invoke<void>("push_schedule_trigger", { id });
        toastManager.success("已手动触发");
        await loadSchedules();
      } catch {
        toastManager.error("手动触发失败");
      }
    },
    [loadSchedules],
  );

  return (
    <div className="space-y-4">
      {/* 规则列表 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <span className="text-sm font-medium">定时推送规则</span>
          </div>
          <Button size="xs" variant="outline" onClick={loadSchedules} disabled={loading}>
            {loading ? <Loader2 className="size-3 animate-spin" /> : "刷新"}
          </Button>
        </div>

        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-6 text-muted-foreground">
            <Clock className="mb-2 size-6 opacity-50" />
            <p className="text-sm">暂无定时推送规则</p>
            <p className="text-xs">创建规则以实现定时消息推送</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="flex items-center rounded-md border border-border/60 bg-background p-3"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.cron} · {s.channel} · {s.title}
                  </div>
                  {s.lastTriggered && (
                    <div className="text-[10px] text-muted-foreground/60">
                      上次触发: {new Date(s.lastTriggered).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(v) => handleToggle(s.id, v)}
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => handleTrigger(s.id)}
                    disabled={!s.enabled}
                  >
                    <Zap className="size-3" />
                    触发
                  </Button>
                  <Button
                    size="xs"
                    variant="destructive"
                    onClick={() => handleDelete(s.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新建规则表单 */}
      <div className="space-y-2 rounded-md border border-border/40 bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-primary" />
          <span className="text-xs font-medium">新建规则</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="规则名称"
            className="h-8 text-xs"
          />
          <Input
            type="text"
            value={formCron}
            onChange={(e) => setFormCron(e.target.value)}
            placeholder="Cron (如 */30 * * * *)"
            className="h-8 text-xs font-mono"
          />
          <Input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="推送标题"
            className="h-8 text-xs"
          />
          <Input
            type="text"
            value={formAlias}
            onChange={(e) => setFormAlias(e.target.value)}
            placeholder="目标 alias"
            className="h-8 text-xs"
          />
        </div>
        <Input
          type="text"
          value={formBody}
          onChange={(e) => setFormBody(e.target.value)}
          placeholder="推送内容模板"
          className="h-8 text-xs"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">通道:</span>
          <Badge
            variant={formChannel === "local" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setFormChannel("local")}
          >
            本地
          </Badge>
          <Badge
            variant={formChannel === "jpush" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setFormChannel("jpush")}
          >
            极光
          </Badge>
          <Badge
            variant={formChannel === "umeng" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setFormChannel("umeng")}
          >
            友盟
          </Badge>
          <div className="ms-auto">
            <Button size="xs" variant="default" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
              创建
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
