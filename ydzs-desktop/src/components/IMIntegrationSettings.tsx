/**
 * IM Integration Settings (G4-P1)
 *
 * Configuration panel for IM channel integration (Feishu/Lark as v1 example).
 * Supports App ID/Secret configuration, connection status, and test messaging.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, MessageSquare, Plug, Plug2, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";

export function IMIntegrationSettings() {
  const queryClient = useQueryClient();
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [testChannelId, setTestChannelId] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [enabled, setEnabled] = useState(false);

  // Query channel list
  const channelsQuery = useQuery({
    queryKey: ["im-channels"],
    queryFn: async () => {
      type ChannelInfo = { id: string; channelType: string; displayName: string; status: { connected: boolean; error?: string } };
      return await invoke<ChannelInfo[]>("im_channel_list") as ChannelInfo[];
    },
  });

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: async () => {
      type Config = { channelType: "feishu"; appId: string; appSecret: string; channelFilters?: string[] };
      const config: Config = { channelType: "feishu", appId, appSecret };
      if (!config.appId || !config.appSecret) throw new Error("App ID and Secret are required");
      await invoke("im_channel_connect", { config });
    },
    onSuccess: () => {
      toast.success("Feishu channel connected");
      queryClient.invalidateQueries({ queryKey: ["im-channels"] });
    },
    onError: (e: unknown) => toast.error("Connection failed: " + String(e)),
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await invoke("im_channel_disconnect", { channelId: "feishu" });
    },
    onSuccess: () => {
      toast.success("Feishu channel disconnected");
      queryClient.invalidateQueries({ queryKey: ["im-channels"] });
    },
    onError: (e: unknown) => toast.error("Disconnect failed: " + String(e)),
  });

  // Send test message mutation
  const sendTestMutation = useMutation({
    mutationFn: async () => {
      type Msg = { id: string; senderId: "settings"; senderName: "Settings"; channelId: string; text: string; messageType: "text"; timestamp: string };
      const msg: Msg = {
        id: "test-" + Date.now(),
        senderId: "settings",
        senderName: "Settings",
        channelId: testChannelId,
        text: testMessage,
        messageType: "text",
        timestamp: new Date().toISOString(),
      };
      await invoke("im_channel_send", { channelId: "feishu", message: msg });
    },
    onSuccess: () => toast.success("Test message sent"),
    onError: (e: unknown) => toast.error("Send failed: " + String(e)),
  });

  // Auto-populate from first available channel
  const firstChannel = channelsQuery.data?.[0];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">IM Channels</h2>
        </div>
        <Badge variant={enabled ? "default" : "outline"}>{enabled ? "Enabled" : "Disabled"}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Connect external messaging platforms. Feishu/Lark supported in v1.
      </p>

      {/* Feishu Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            {firstChannel?.status.connected
              ? <CheckCircle2 className="h-4 w-4 text-green-500" />
              : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
            Feishu / Lark
          </CardTitle>
          <CardDescription>Configure Feishu App credentials for message integration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>App ID</Label>
            <Input placeholder="cli_xxxxx" value={appId} onChange={(e) => setAppId(e.target.value)} type="password" />
          </div>
          <div className="space-y-2">
            <Label>App Secret</Label>
            <Input placeholder="Enter App Secret" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} type="password" />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending || !appId || !appSecret}>
              {connectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Connect
            </Button>
            <Button variant="outline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
              {disconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug2 className="h-4 w-4" />}
              Disconnect
            </Button>
            <Badge variant={firstChannel?.status.connected ? "default" : "outline"} size="sm">
              {firstChannel?.status.connected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          {firstChannel?.status.error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />{firstChannel.status.error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Test Message */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Send Test Message</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label>Channel ID</Label>
          <Input placeholder="oc_xxxxx" value={testChannelId} onChange={(e) => setTestChannelId(e.target.value)} />
          <Label>Message</Label>
          <Input placeholder="Test message from ydsz-buddy" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
          <Button onClick={() => sendTestMutation.mutate()} disabled={sendTestMutation.isPending || !testChannelId || !testMessage}>
            {sendTestMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Test
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
