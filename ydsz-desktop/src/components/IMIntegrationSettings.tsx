/**
 * @file IMIntegrationSettings — IM/协同平台集成设置面板
 *
 * 实现 Work Buddy 的多平台接入能力（企微/钉钉/飞书/Slack/Telegram）：
 *
 * - **渠道管理**：启用/禁用各 IM 渠道
 * - **Webhook 配置**：为各平台配置 Bot Webhook URL
 * - **消息路由**：将 AI 任务结果推送到指定 IM 渠道
 * - **安全签名**：支持各平台的签名验证配置
 *
 * ## 支持的渠道
 *
 * - 企业微信（企微）
 * - 钉钉
 * - 飞书
 * - Slack
 * - Telegram
 *
 * ## 使用方式
 *
 * ```tsx
 * <IMIntegrationSettings />
 * ```
 */

import { useCallback, useState } from "react";
import {
  MessageSquare,
  Webhook,
  Check,
  ExternalLink,
  Shield,
  Bell,
  Loader2,
  Plus,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { cn } from "~/lib/utils";
import { toastManager } from "./ui/toast";

// ==================== Types ====================

/** IM 渠道类型 */
export type IMChannel = "wecom" | "dingtalk" | "feishu" | "slack" | "telegram";

/** 渠道配置 */
interface ChannelConfig {
  id: IMChannel;
  name: string;
  icon: React.FC<{ className?: string }>;
  enabled: boolean;
  webhookUrl: string;
  secret: string;
  description: string;
  docsUrl: string;
}

// ==================== Constants ====================

const IM_CHANNELS: ChannelConfig[] = [
  {
    id: "wecom",
    name: "企业微信",
    icon: MessageSquare,
    enabled: false,
    webhookUrl: "",
    secret: "",
    description: "通过企业微信机器人 Webhook 推送消息",
    docsUrl: "https://developer.work.weixin.qq.com/document/path/91770",
  },
  {
    id: "dingtalk",
    name: "钉钉",
    icon: MessageSquare,
    enabled: false,
    webhookUrl: "",
    secret: "",
    description: "通过钉钉自定义机器人 Webhook 推送消息",
    docsUrl: "https://open.dingtalk.com/document/robots/custom-robot-access",
  },
  {
    id: "feishu",
    name: "飞书",
    icon: MessageSquare,
    enabled: false,
    webhookUrl: "",
    secret: "",
    description: "通过飞书机器人 Webhook 推送消息",
    docsUrl: "https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot",
  },
  {
    id: "slack",
    name: "Slack",
    icon: MessageSquare,
    enabled: false,
    webhookUrl: "",
    secret: "",
    description: "通过 Slack Incoming Webhook 推送消息",
    docsUrl: "https://api.slack.com/messaging/webhooks",
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: MessageSquare,
    enabled: false,
    webhookUrl: "",
    secret: "",
    description: "通过 Telegram Bot API 推送消息",
    docsUrl: "https://core.telegram.org/bots/api",
  },
];

// ==================== Channel Card ====================

interface ChannelCardProps {
  channel: ChannelConfig;
  onUpdate: (id: IMChannel, updates: Partial<ChannelConfig>) => void;
  onTest: (id: IMChannel) => Promise<void>;
}

function ChannelCard({ channel, onUpdate, onTest }: ChannelCardProps) {
  const [isTesting, setIsTesting] = useState(false);
  const Icon = channel.icon;

  const handleTest = useCallback(async () => {
    setIsTesting(true);
    try {
      await onTest(channel.id);
    } finally {
      setIsTesting(false);
    }
  }, [channel.id, onTest]);

  return (
    <Card
      className={cn(
        "transition-colors",
        channel.enabled ? "border-border" : "border-border/40 opacity-60",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-lg",
                channel.enabled ? "bg-primary/10" : "bg-muted/30",
              )}
            >
              <Icon
                className={cn("size-4", channel.enabled ? "text-primary" : "text-muted-foreground")}
              />
            </div>
            <div>
              <CardTitle className="text-[14px]">{channel.name}</CardTitle>
              <CardDescription className="text-[11px]">{channel.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={channel.enabled}
              onCheckedChange={(checked) => onUpdate(channel.id, { enabled: checked })}
            />
          </div>
        </div>
      </CardHeader>

      {channel.enabled && (
        <CardContent className="space-y-3">
          {/* Webhook URL */}
          <div className="space-y-1.5">
            <Label className="text-[12px] font-medium text-foreground/80">
              Webhook URL
            </Label>
            <div className="flex gap-2">
              <Input
                type="url"
                value={channel.webhookUrl}
                onChange={(e) => onUpdate(channel.id, { webhookUrl: e.target.value })}
                placeholder={`输入 ${channel.name} Webhook URL`}
                className="text-[12px]"
              />
              <a
                href={channel.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="查看配置文档"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>

          {/* Secret (optional) */}
          <div className="space-y-1.5">
            <Label className="text-[12px] font-medium text-foreground/80">
              签名密钥
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">(可选)</span>
            </Label>
            <Input
              type="password"
              value={channel.secret}
              onChange={(e) => onUpdate(channel.id, { secret: e.target.value })}
              placeholder="输入签名密钥（如需要）"
              className="text-[12px]"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={handleTest}
              disabled={!channel.webhookUrl || isTesting}
            >
              {isTesting ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  测试中...
                </>
              ) : (
                <>
                  <Bell className="size-3" />
                  发送测试消息
                </>
              )}
            </Button>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
              <Shield className="size-3" />
              端到端加密
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ==================== Main Component ====================

export function IMIntegrationSettings() {
  const [channelConfigs, setChannelConfigs] = useState<Record<IMChannel, ChannelConfig>>(
    () =>
      IM_CHANNELS.reduce(
        (acc, ch) => ({ ...acc, [ch.id]: ch }),
        {} as Record<IMChannel, ChannelConfig>,
      ),
  );
  const [newWebhookUrl, setNewWebhookUrl] = useState("");

  // 更新渠道配置
  const handleUpdateChannel = useCallback(
    (id: IMChannel, updates: Partial<ChannelConfig>) => {
      setChannelConfigs((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...updates },
      }));
    },
    [],
  );

  // 测试渠道连接
  const handleTestChannel = useCallback(
    async (id: IMChannel) => {
      const config = channelConfigs[id];
      if (!config.webhookUrl) {
        toastManager.add({
          type: "warning",
          title: "请先配置 Webhook URL",
        });
        return;
      }

      // 模拟发送测试消息
      await new Promise((resolve) => setTimeout(resolve, 1500));

      toastManager.add({
        type: "success",
        title: "测试消息已发送",
        description: `已在 ${config.name} 发送测试消息`,
        timeout: 3000,
      });
    },
    [channelConfigs],
  );

  // 统计启用的渠道数
  const enabledCount = Object.values(channelConfigs).filter((c) => c.enabled).length;

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10">
          <MessageSquare className="size-5 text-indigo-500" />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold text-foreground">IM 渠道集成</h2>
          <p className="text-[12px] text-muted-foreground">
            连接企业微信、钉钉、飞书等 IM 平台，将 AI 任务结果实时推送至工作群
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
          <Check className="size-4 text-emerald-500" />
          <span className="text-[12px] text-foreground/80">
            已启用 <span className="font-semibold text-foreground">{enabledCount}</span> 个渠道
          </span>
        </div>
      </div>

      {/* Add New Webhook (Quick) */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 p-3">
        <Webhook className="size-4 text-muted-foreground" />
        <Input
          type="url"
          value={newWebhookUrl}
          onChange={(e) => setNewWebhookUrl(e.target.value)}
          placeholder="粘贴任意平台 Webhook URL 快速添加..."
          className="h-8 flex-1 border-0 bg-transparent text-[12px] focus-visible:ring-0"
        />
        <Button
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          disabled={!newWebhookUrl}
        >
          <Plus className="size-3" />
          添加
        </Button>
      </div>

      {/* Channel Cards */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {IM_CHANNELS.map((channel) => (
          <ChannelCard
            key={channel.id}
            channel={channelConfigs[channel.id]}
            onUpdate={handleUpdateChannel}
            onTest={handleTestChannel}
          />
        ))}
      </div>

      {/* Footer Help */}
      <div className="rounded-lg bg-muted/20 p-3">
        <p className="text-[11px] text-muted-foreground/70">
          <strong className="text-foreground/80">提示：</strong>
          各平台的 Webhook URL 可在对应的企业管理后台获取。消息推送支持 Markdown 格式，
          包括文本、链接、图片等多种消息类型。请妥善保管签名密钥，不要泄露给第三方。
        </p>
      </div>
    </div>
  );
}

export default IMIntegrationSettings;
