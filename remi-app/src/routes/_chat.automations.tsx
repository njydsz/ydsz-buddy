// FILE: _chat.automations.tsx
// Purpose: Registers the automations view under the shared chat shell.
// Layer: Route
// Exports: Route

import { createFileRoute } from "@tanstack/react-router";
import { AutomationsView } from "~/components/AutomationsView";

export const Route = createFileRoute("/_chat/automations")({
  component: AutomationsView,
});
