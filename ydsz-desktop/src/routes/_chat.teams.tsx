/**
 * @file AgentTeams 多 Agent 协作编排可视化页面
 * @description 可视化多 Agent 协作团队编排界面，包含 DAG 视图、团队列表和执行面板
 */

import { createFileRoute } from '@tanstack/react-router';

import { AgentTeamsView } from '../components/AgentTeamsView';

export const Route = createFileRoute('/_chat/teams')({
  component: AgentTeamsRouteComponent,
});

function AgentTeamsRouteComponent() {
  return <AgentTeamsView />;
}
