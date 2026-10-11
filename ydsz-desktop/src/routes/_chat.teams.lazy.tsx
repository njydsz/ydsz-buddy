import { createLazyFileRoute } from "@tanstack/react-router";
import { AgentTeamsView } from "../components/AgentTeamsView";

export const Route = createLazyFileRoute("/_chat/teams")({
  component: TeamsComponent,
});

function TeamsComponent() {
  return <AgentTeamsView />;
}
