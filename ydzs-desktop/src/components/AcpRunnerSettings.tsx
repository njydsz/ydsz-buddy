/**
 * ACP Runner Settings (G10-P1)
 *
 * Agent Client Protocol configuration panel.
 * Manages inbound stdio server and outbound runner delegation.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Server, Send, Play, Square, AlertCircle, CheckCircle2, Cpu } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";

interface AcpStatus {
  running: boolean;
  sessionCount: number;
}

export function AcpRunnerSettings() {
  const queryClient = useQueryClient();
  const [providerId, setProviderId] = useState("local");
  const [agentId, setAgentId] = useState("claude-code");
  const [taskText, setTaskText] = useState("");
  const [runnerPath, setRunnerPath] = useState("");

  // Query server status
  const statusQuery = useQuery({
    queryKey: ["acp-status"],
    queryFn: async () => {
      type S = AcpStatus;
      return await invoke<S>("acp_server_status") as AcpStatus;
    },
    refetchInterval: 5000,
  });

  // Start server mutation
  const startMutation = useMutation({
    mutationFn: async () => {
      type R = string;
      return await invoke<R>("acp_start_server", { providerId }) as string;
    },
    onSuccess: () => {
      toast.success("ACP stdio server started");
      queryClient.invalidateQueries({ queryKey: ["acp-status"] });
    },
    onError: (e: unknown) => toast.error("Start failed: " + String(e)),
  });

  // Stop server mutation
  const stopMutation = useMutation({
    mutationFn: async () => {
      await invoke("acp_stop_server");
    },
    onSuccess: () => {
      toast.success("ACP stdio server stopped");
      queryClient.invalidateQueries({ queryKey: ["acp-status"] });
    },
    onError: (e: unknown) => toast.error("Stop failed: " + String(e)),
  });

  // Delegate task mutation
  const delegateMutation = useMutation({
    mutationFn: async () => {
      type R = string;
      return await invoke<R>("acp_delegate_task", { agentId, task: taskText }) as string;
    },
    onSuccess: () => toast.success("Task delegated successfully"),
    onError: (e: unknown) => toast.error("Delegation failed: " + String(e)),
  });

  const status = statusQuery.data;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">ACP Runner</h2>
        </div>
        <Badge variant={status?.running ? "default" : "outline"}>
          {status?.running ? "Running" : "Stopped"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Agent Client Protocol integration for inbound stdio and outbound task delegation.
      </p>

      {/* Inbound Server */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Inbound stdio Server</CardTitle>
          <CardDescription>Start a local stdio server for IDE agents to connect to ydsz-buddy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Provider ID</Label>
            <Input value={providerId} onChange={(e) => setProviderId(e.target.value)} placeholder="local" />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending || status?.running}>
              {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start
            </Button>
            <Button variant="outline" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending || !status?.running}>
              {stopMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Stop
            </Button>
            <Badge variant={status?.running ? "default" : "outline"} size="sm">
              {status?.running ? "Running" : "Stopped"}
            </Badge>
            {status && <Badge variant="outline" size="sm">{status.sessionCount} sessions</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Outbound Runner */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Outbound Task Delegation</CardTitle>
          <CardDescription>Delegate tasks to external agents (Claude Code, Codex CLI)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Agent ID</Label>
            <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="claude-code" />
          </div>
          <div className="space-y-2">
            <Label>Agent Command Path</Label>
            <Input value={runnerPath} onChange={(e) => setRunnerPath(e.target.value)} placeholder="/path/to/claude-code" />
          </div>
          <div className="space-y-2">
            <Label>Task</Label>
            <Textarea value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder="Describe the task for the external agent..." rows={3} />
          </div>
          <Button onClick={() => delegateMutation.mutate()} disabled={delegateMutation.isPending || !agentId || !taskText}>
            {delegateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Delegate Task
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
