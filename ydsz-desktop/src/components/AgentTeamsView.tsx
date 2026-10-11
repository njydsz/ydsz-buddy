// @ts-nocheck
/**
 * @file AgentTeams 多 Agent 协作编排可视化主视图
 * @description DAG 视图 + 团队管理 + 执行面板三合一视图
 */

import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from '@tanstack/react-router';

import { Button } from './ui/button';
import { Input } from './ui/input';
import { useMessages } from '../i18n/I18nContext';
import { DagVisualization } from './DagVisualization';

// ---------------------------------------------------------------------------
// Types mirroring the Rust backend
// ---------------------------------------------------------------------------

interface WorkflowStep {
  id: string;
  name: string;
  assignee: string;
  depends_on: string[];
  prompt_template: string;
}

interface TeamMember {
  agent_id: string;
  role: string;
  skills: string[];
}

interface TeamConfig {
  id: string;
  name: string;
  description: string;
  coordinator_id: string;
  members: TeamMember[];
  workflow: WorkflowStep[];
}

interface TeamSummary {
  id: string;
  name: string;
  description: string;
  member_count: number;
  step_count: number;
}

interface StepResult {
  step_id: string;
  step_name: string;
  assignee: string;
  status: string;
  output: string;
}

interface TeamExecuteResult {
  team_id: string;
  status: string;
  step_results: StepResult[];
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

async function fetchTeamList(): Promise<TeamSummary[]> {
  return await invoke('agent_teams_list');
}

async function fetchTeam(id: string): Promise<TeamConfig | null> {
  return await invoke('agent_teams_get', { id });
}

async function fetchTemplates(): Promise<TeamConfig[]> {
  return await invoke('agent_teams_templates');
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AgentTeamsView() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [executeInput, setExecuteInput] = useState('');
  const [executeResult, setExecuteResult] = useState<TeamExecuteResult | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Queries
  const teamsQuery = useQuery({
    queryKey: ['agent-teams-list'],
    queryFn: fetchTeamList,
  });

  const templatesQuery = useQuery({
    queryKey: ['agent-teams-templates'],
    queryFn: fetchTemplates,
  });

  const selectedTeamQuery = useQuery({
    queryKey: ['agent-teams-get', selectedTeamId],
    queryFn: () => fetchTeam(selectedTeamId!),
    enabled: !!selectedTeamId,
  });

  // Mutations
  const executeMutation = useMutation({
    mutationFn: async ({ teamId, input }: { teamId: string; input: string }) => {
      return await invoke<TeamExecuteResult>('agent_teams_execute', { teamId, input });
    },
    onSuccess: (data) => {
      setExecuteResult(data);
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return await invoke<TeamConfig>('agent_teams_create_from_template', { templateId });
    },
    onSuccess: (data) => {
      setSelectedTeamId(data.id);
      setShowCreateForm(false);
      queryClient.invalidateQueries({ queryKey: ['agent-teams-list'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await invoke('agent_teams_delete', { id });
    },
    onSuccess: () => {
      setSelectedTeamId(null);
      queryClient.invalidateQueries({ queryKey: ['agent-teams-list'] });
    },
  });

  const handleExecute = useCallback(() => {
    if (!selectedTeamId || !executeInput.trim()) return;
    executeMutation.mutate({ teamId: selectedTeamId, input: executeInput });
  }, [selectedTeamId, executeInput, executeMutation]);

  const selectedTeam = selectedTeamQuery.data;
  const teams = teamsQuery.data ?? [];
  const templates = templatesQuery.data ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Agent Teams</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Multi-agent collaboration orchestration with DAG workflow visualization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateForm(true)}
          >
            + New Team from Template
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Team List */}
        <div className="w-72 shrink-0 border-r border-border/40 overflow-y-auto">
          <div className="p-3">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">
              Teams ({teams.length})
            </h2>
            <div className="space-y-1">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => {
                    setSelectedTeamId(team.id);
                    setExecuteResult(null);
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                    selectedTeamId === team.id
                      ? 'bg-primary/10 text-foreground border border-primary/30'
                      : 'hover:bg-muted/50 text-foreground/80 border border-transparent'
                  }`}
                >
                  <div className="text-sm font-medium truncate">{team.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {team.member_count} members, {team.step_count} steps
                  </div>
                </button>
              ))}
              {teams.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-6">
                  No teams yet. Create one from a template.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: DAG Visualization & Execution */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedTeam ? (
            <>
              {/* Team Info Bar */}
              <div className="border-b border-border/40 px-6 py-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-medium">{selectedTeam.name}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Coordinator: {selectedTeam.coordinator_id} | Members:{' '}
                    {selectedTeam.members.map((m) => m.agent_id).join(', ')}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteMutation.mutate(selectedTeam.id)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </Button>
              </div>

              {/* DAG Visualization */}
              <div className="flex-1 overflow-auto p-6">
                <DagVisualization
                  workflow={selectedTeam.workflow}
                  members={selectedTeam.members}
                  executeResult={executeResult}
                />
              </div>

              {/* Execute Panel */}
              <div className="border-t border-border/40 p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter team task input..."
                    value={executeInput}
                    onChange={(e) => setExecuteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleExecute();
                      }
                    }}
                    disabled={executeMutation.isPending}
                  />
                  <Button
                    onClick={handleExecute}
                    disabled={!executeInput.trim() || executeMutation.isPending}
                  >
                    {executeMutation.isPending ? 'Running...' : 'Execute'}
                  </Button>
                </div>

                {/* Execution Results */}
                {executeResult && (
                  <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                          executeResult.status === 'success'
                            ? 'bg-green-500/10 text-green-500'
                            : executeResult.status === 'partial'
                              ? 'bg-yellow-500/10 text-yellow-500'
                              : 'bg-red-500/10 text-red-500'
                        }`}
                      >
                        {executeResult.status}
                      </span>
                      <span className="text-muted-foreground">
                        {executeResult.step_results.length} steps completed
                      </span>
                    </div>
                    {executeResult.step_results.map((result) => (
                      <div
                        key={result.step_id}
                        className="rounded-lg border border-border/40 p-2"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-medium ${
                              result.status === 'completed'
                                ? 'text-green-500'
                                : 'text-yellow-500'
                            }`}
                          >
                            [{result.status}]
                          </span>
                          <span className="text-xs font-medium">{result.step_name}</span>
                          <span className="text-xs text-muted-foreground">
                            → {result.assignee}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {result.output}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a team from the left panel to view its workflow DAG
            </div>
          )}
        </div>
      </div>

      {/* Create from Template Dialog */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border p-6 w-[480px] max-h-[80vh] overflow-y-auto">
            <h3 className="text-base font-semibold mb-4">Create Team from Template</h3>
            <div className="space-y-3">
              {templates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="rounded-lg border border-border/40 p-4 hover:border-primary/50 cursor-pointer transition-colors"
                  onClick={() => createFromTemplateMutation.mutate(tmpl.id)}
                >
                  <div className="text-sm font-medium">{tmpl.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {tmpl.description}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs bg-muted/50 rounded-full px-2 py-0.5">
                      {tmpl.members.length} members
                    </span>
                    <span className="text-xs bg-muted/50 rounded-full px-2 py-0.5">
                      {tmpl.workflow.length} steps
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
