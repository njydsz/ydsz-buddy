/**
 * Evolution Panel (G18-P2)
 * Self-Evolution Framework monitoring and management UI.
 *
 * Provides:
 * - Rule management (list/create/enable/disable)
 * - Generated skill approval list
 * - Analysis trigger status indicators
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Dna, Zap, CheckCircle2, XCircle, Clock, BrainCircuit } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";

// --- Type definitions matching Rust structs ---

interface EvolutionRule {
  id: string;
  name: string;
  trigger: EvolutionTrigger;
  extractPrompt: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type EvolutionTrigger =
  | { type: "taskCompleted"; minTurns: number }
  | { type: "toolRepeated"; tool: string; minUses: number }
  | { type: "userFeedbackPositive" };

interface GeneratedSkill {
  id: string;
  name: string;
  sourceConversationId: string;
  scriptContent: string;
  generatedAtMs: number;
  status: "pendingReview" | "approved" | "rejected";
  ruleId: string;
  reviewNote?: string;
}

// --- Main component ---

export function EvolutionPanel() {
  const queryClient = useQueryClient();

  // Fetch rules
  const rulesQuery = useQuery({
    queryKey: ["evolution-rules"],
    queryFn: async () => {
      type R = EvolutionRule[];
      return await invoke<R>("evolution_rules_list");
    },
  });

  // Fetch skills
  const skillsQuery = useQuery({
    queryKey: ["evolution-skills"],
    queryFn: async () => {
      type S = GeneratedSkill[];
      return await invoke<S>("evolution_skills_list");
    },
  });

  // Toggle rule mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await invoke("evolution_rules_toggle", { id, enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evolution-rules"] });
      toast.success("Rule updated");
    },
    onError: (e: unknown) => toast.error("Toggle failed: " + String(e)),
  });

  // Approve skill mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await invoke("evolution_skill_approve", { id, note: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evolution-skills"] });
      toast.success("Skill approved");
    },
    onError: (e: unknown) => toast.error("Approval failed: " + String(e)),
  });

  // Reject skill mutation
  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await invoke("evolution_skill_reject", { id, note: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evolution-skills"] });
      toast.success("Skill rejected");
    },
    onError: (e: unknown) => toast.error("Rejection failed: " + String(e)),
  });

  const rules = rulesQuery.data ?? [];
  const skills = skillsQuery.data ?? [];
  const pendingCount = skills.filter((s) => s.status === "pendingReview").length;

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-6 w-6 text-purple-500" />
        <h2 className="text-xl font-semibold">Self-Evolution Framework</h2>
        <Badge variant="outline" className="ml-2">
          G18-P2
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Automatically extract reusable skills from conversation patterns.
        Rules define triggers; matched conversations generate candidate skills for review.
      </p>

      {/* Rules Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Dna className="h-4 w-4" />
            Evolution Rules
            <Badge variant="secondary">{rules.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rulesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading rules...
            </div>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No evolution rules configured.</p>
          ) : (
            rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onToggle={(enabled) => toggleMutation.mutate({ id: rule.id, enabled })}
                isToggling={toggleMutation.isPending}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Skills List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Generated Skills
            {pendingCount > 0 && (
              <Badge variant="default" className="ml-1">
                {pendingCount} pending
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {skillsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading skills...
            </div>
          ) : skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No skills generated yet. Complete multi-turn conversations to trigger evolution.
            </p>
          ) : (
            skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                rules={rules}
                onApprove={() => approveMutation.mutate(skill.id)}
                onReject={() => rejectMutation.mutate(skill.id)}
                isProcessing={approveMutation.isPending || rejectMutation.isPending}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Sub-components ---

function RuleCard({
  rule,
  onToggle,
  isToggling,
}: {
  rule: EvolutionRule;
  onToggle: (enabled: boolean) => void;
  isToggling: boolean;
}) {
  return (
    <div className="flex items-start justify-between rounded-lg border p-3">
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{rule.name}</span>
          {rule.enabled ? (
            <Badge variant="default" className="h-5 text-xs">
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="h-5 text-xs">
              Disabled
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Trigger: {formatTrigger(rule.trigger)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {isToggling && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <Switch
          checked={rule.enabled}
          onCheckedChange={onToggle}
          disabled={isToggling}
          aria-label={`Toggle rule ${rule.name}`}
        />
      </div>
    </div>
  );
}

function SkillCard({
  skill,
  rules,
  onApprove,
  onReject,
  isProcessing,
}: {
  skill: GeneratedSkill;
  rules: EvolutionRule[];
  onApprove: () => void;
  onReject: () => void;
  isProcessing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const ruleName = rules.find((r) => r.id === skill.ruleId)?.name ?? skill.ruleId;
  const dateStr = new Date(skill.generatedAtMs).toLocaleString();

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{skill.name}</span>
            <StatusBadge status={skill.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            From: {ruleName} | {dateStr}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {skill.status === "pendingReview" && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={onApprove}
                disabled={isProcessing}
                className="h-7 gap-1"
              >
                <CheckCircle2 className="h-3 w-3" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                disabled={isProcessing}
                className="h-7 gap-1"
              >
                <XCircle className="h-3 w-3" /> Reject
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
            className="h-7 text-xs"
          >
            {expanded ? "Hide" : "View"}
          </Button>
        </div>
      </div>
      {expanded && (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
          {skill.scriptContent}
        </pre>
      )}
      {skill.reviewNote && (
        <p className="mt-1 text-xs italic text-muted-foreground">
          Note: {skill.reviewNote}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pendingReview":
      return (
        <Badge variant="outline" className="h-5 gap-1 text-xs">
          <Clock className="h-3 w-3" /> Pending
        </Badge>
      );
    case "approved":
      return (
        <Badge variant="default" className="h-5 gap-1 text-xs bg-green-600">
          <CheckCircle2 className="h-3 w-3" /> Approved
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="outline" className="h-5 gap-1 text-xs border-red-400 text-red-500">
          <XCircle className="h-3 w-3" /> Rejected
        </Badge>
      );
    default:
      return <Badge variant="outline" className="h-5 text-xs">{status}</Badge>;
  }
}

function formatTrigger(trigger: EvolutionTrigger): string {
  switch (trigger.type) {
    case "taskCompleted":
      return `Task completed with >= ${trigger.minTurns} turns`;
    case "toolRepeated":
      return `Tool "${trigger.tool}" used >= ${trigger.minUses} times`;
    case "userFeedbackPositive":
      return "User gave positive feedback";
    default:
      return "Unknown trigger";
  }
}
