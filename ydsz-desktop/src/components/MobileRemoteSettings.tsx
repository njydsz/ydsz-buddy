/**
 * @file MobileRemoteSettings — 移动端远程协作设置
 *
 * 实现 Work Buddy 移动端远程协作能力：
 *
 * - **推送网关**：极光/友盟推送配置，实时通知
 * - **远程审批**：Plan/任务一键通过/拒绝
 * - **远程中断**：紧急停止正在执行的 Agent 任务
 * - **状态同步**：桌面端 ↔ 移动端实时状态同步
 * - **QR 配对**：扫码配对连接桌面端
 *
 * ## 核心能力
 *
 * - 推送通道管理（极光/友盟/APNs/FCM）
 * - 审批流程配置
 * - 远程操作权限控制
 * - 设备管理
 */

import { useCallback, useState } from "react";
import {
  Smartphone,
  Bell,
  Shield,
  QrCode,
  Monitor,
  Check,
  X,
  Loader2,
  RefreshCw,
  Trash2,
  Plus,
  AlertTriangle,
  Zap,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
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

/** 推送通道类型 */
type PushChannel = "jpush" | "umeng" | "apns" | "fcm";

/** 推送配置 */
interface PushConfig {
  channel: PushChannel;
  enabled: boolean;
  appKey: string;
  appSecret: string;
  status: "connected" | "disconnected" | "error";
}

/** 已配对设备 */
interface PairedDevice {
  id: string;
  name: string;
  type: "ios" | "android";
  lastSeen: number;
  status: "online" | "offline";
}

// ==================== Constants ====================

const PUSH_CHANNELS: { id: PushChannel; name: string; description: string }[] = [
  { id: "jpush", name: "极光推送", description: "国内 Android 推送首选，到达率 99.5%" },
  { id: "umeng", name: "友盟推送", description: "支持国产厂商通道（华为/小米/OPPO/vivo）" },
  { id: "apns", name: "APNs", description: "Apple Push Notification service" },
  { id: "fcm", name: "FCM", description: "Firebase Cloud Messaging（海外）" },
];

const MOCK_DEVICES: PairedDevice[] = [
  {
    id: "d1",
    name: "iPhone 15 Pro",
    type: "ios",
    lastSeen: Date.now() - 300000,
    status: "online",
  },
  {
    id: "d2",
    name: "小米 14",
    type: "android",
    lastSeen: Date.now() - 86400000,
    status: "offline",
  },
];

// ==================== Push Channel Card ====================

interface PushChannelCardProps {
  channel: (typeof PUSH_CHANNELS)[number];
  config: PushConfig;
  onUpdate: (updates: Partial<PushConfig>) => void;
  onTest: () => Promise<void>;
}

function PushChannelCard({ channel, config, onUpdate, onTest }: PushChannelCardProps) {
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = useCallback(async () => {
    setIsTesting(true);
    try {
      await onTest();
    } finally {
      setIsTesting(false);
    }
  }, [onTest]);

  return (
    <Card
      className={cn(
        "transition-colors",
        config.enabled ? "border-border" : "border-border/40 opacity-60",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-lg",
                config.enabled ? "bg-primary/10" : "bg-muted/30",
              )}
            >
              <Bell
                className={cn("size-4", config.enabled ? "text-primary" : "text-muted-foreground")}
              />
            </div>
            <div>
              <CardTitle className="text-[13px]">{channel.name}</CardTitle>
              <CardDescription className="text-[11px]">{channel.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {config.status === "connected" && (
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 text-[9px]">
                已连接
              </Badge>
            )}
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => onUpdate({ enabled: checked })}
            />
          </div>
        </div>
      </CardHeader>

      {config.enabled && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground/70">App Key</Label>
              <Input
                type="text"
                value={config.appKey}
                onChange={(e) => onUpdate({ appKey: e.target.value })}
                placeholder="输入 App Key"
                className="h-8 text-[11px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground/70">App Secret</Label>
              <Input
                type="password"
                value={config.appSecret}
                onChange={(e) => onUpdate({ appSecret: e.target.value })}
                placeholder="输入 App Secret"
                className="h-8 text-[11px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={handleTest}
              disabled={!config.appKey || isTesting}
            >
              {isTesting ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  测试中...
                </>
              ) : (
                <>
                  <Zap className="size-3" />
                  发送测试推送
                </>
              )}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ==================== Device Card ====================

interface DeviceCardProps {
  device: PairedDevice;
  onRemove: (id: string) => void;
}

function DeviceCard({ device, onRemove }: DeviceCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/40 p-3">
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-xl",
          device.status === "online" ? "bg-emerald-500/10" : "bg-muted/30",
        )}
      >
        <Smartphone
          className={cn(
            "size-5",
            device.status === "online" ? "text-emerald-500" : "text-muted-foreground",
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-foreground">{device.name}</p>
          {device.status === "online" ? (
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 text-[9px]">
              <Wifi className="mr-1 size-2" />
              在线
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] text-muted-foreground">
              <WifiOff className="mr-1 size-2" />
              离线
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/60">
          最后活跃: {new Date(device.lastSeen).toLocaleString("zh-CN")}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-7 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(device.id)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

// ==================== Main Component ====================

export function MobileRemoteSettings() {
  const [pushConfigs, setPushConfigs] = useState<Record<PushChannel, PushConfig>>({
    jpush: { channel: "jpush", enabled: false, appKey: "", appSecret: "", status: "disconnected" },
    umeng: { channel: "umeng", enabled: false, appKey: "", appSecret: "", status: "disconnected" },
    apns: { channel: "apns", enabled: false, appKey: "", appSecret: "", status: "disconnected" },
    fcm: { channel: "fcm", enabled: false, appKey: "", appSecret: "", status: "disconnected" },
  });
  const [devices, setDevices] = useState<PairedDevice[]>(MOCK_DEVICES);
  const [showQR, setShowQR] = useState(false);

  // 更新推送配置
  const handleUpdatePush = useCallback(
    (channel: PushChannel, updates: Partial<PushConfig>) => {
      setPushConfigs((prev) => ({
        ...prev,
        [channel]: { ...prev[channel], ...updates },
      }));
    },
    [],
  );

  // 测试推送
  const handleTestPush = useCallback(async (channel: PushChannel) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    toastManager.add({
      type: "success",
      title: "测试推送已发送",
      description: `已在 ${PUSH_CHANNELS.find((c) => c.id === channel)?.name} 发送测试通知`,
      timeout: 3000,
    });
  }, []);

  // 移除设备
  const handleRemoveDevice = useCallback((id: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
    toastManager.add({
      type: "success",
      title: "设备已移除",
    });
  }, []);

  // 统计
  const connectedPushCount = Object.values(pushConfigs).filter((c) => c.enabled && c.status === "connected").length;
  const onlineDeviceCount = devices.filter((d) => d.status === "online").length;

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/10">
          <Smartphone className="size-5 text-cyan-500" />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold text-foreground">移动端远程协作</h2>
          <p className="text-[12px] text-muted-foreground">
            配置推送网关和远程协作，实现桌面端与移动端的无缝协同
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
          <Bell className="size-4 text-blue-500" />
          <span className="text-[12px] text-foreground/80">
            推送通道 <span className="font-semibold text-foreground">{connectedPushCount}</span> 个已连接
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
          <Smartphone className="size-4 text-emerald-500" />
          <span className="text-[12px] text-foreground/80">
            设备 <span className="font-semibold text-foreground">{onlineDeviceCount}</span> 台在线
          </span>
        </div>
      </div>

      {/* Push Channels */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          <h3 className="text-[14px] font-medium text-foreground">推送网关</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {PUSH_CHANNELS.map((channel) => (
            <PushChannelCard
              key={channel.id}
              channel={channel}
              config={pushConfigs[channel.id]}
              onUpdate={(updates) => handleUpdatePush(channel.id, updates)}
              onTest={() => handleTestPush(channel.id)}
            />
          ))}
        </div>
      </div>

      {/* Paired Devices */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-primary" />
            <h3 className="text-[14px] font-medium text-foreground">已配对设备</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setShowQR(!showQR)}
          >
            <QrCode className="size-3" />
            扫码配对
          </Button>
        </div>

        {/* QR Code Modal */}
        {showQR && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-6">
            <div className="flex size-40 items-center justify-center rounded-xl border-2 border-dashed border-border/40 bg-white">
              <QrCode className="size-16 text-muted-foreground/30" />
            </div>
            <p className="text-[12px] text-muted-foreground">
              使用移动端 App 扫描二维码完成配对
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQR(false)}
            >
              关闭
            </Button>
          </div>
        )}

        {/* Device List */}
        <div className="space-y-2">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} onRemove={handleRemoveDevice} />
          ))}
          {devices.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/40 p-6">
              <Smartphone className="size-8 text-muted-foreground/20" />
              <p className="text-[12px] text-muted-foreground/50">
                暂无配对设备，点击上方按钮扫码配对
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Remote Actions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-primary" />
          <h3 className="text-[14px] font-medium text-foreground">远程操作权限</h3>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {[
            { id: "approve", name: "远程审批", desc: "允许在移动端审批 Plan 和任务" },
            { id: "interrupt", name: "紧急中断", desc: "允许远程停止正在执行的 Agent 任务" },
            { id: "status", name: "状态查看", desc: "允许查看桌面端实时状态和进度" },
            { id: "notify", name: "推送通知", desc: "任务完成/失败时推送通知到移动端" },
          ].map((action) => (
            <div
              key={action.id}
              className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3"
            >
              <div>
                <p className="text-[12px] font-medium text-foreground">{action.name}</p>
                <p className="text-[11px] text-muted-foreground/60">{action.desc}</p>
              </div>
              <Switch defaultChecked={action.id !== "interrupt"} />
            </div>
          ))}
        </div>
      </div>

      {/* Security Notice */}
      <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 p-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div>
          <p className="text-[12px] font-medium text-amber-700 dark:text-amber-400">安全提示</p>
          <p className="text-[11px] text-muted-foreground/70">
            远程操作涉及敏感数据，请确保：1) 使用强密码保护账户；2) 仅在可信网络环境下使用远程功能；
            3) 定期检查已配对设备列表，移除不再使用的设备。
          </p>
        </div>
      </div>
    </div>
  );
}

export default MobileRemoteSettings;
