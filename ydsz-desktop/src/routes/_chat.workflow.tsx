// @ts-nocheck
/**
 * @file Workflow route - Dynamic Workflow Engine UI (P0-1)
 * @description DAG-based workflow management with template gallery and instance timeline
 * @layer Route
 */

import { createFileRoute } from '@tanstack/react-router';

import { WorkflowView } from '../components/WorkflowView';

export const Route = createFileRoute('/_chat/workflow')({
  component: WorkflowRouteComponent,
});

function WorkflowRouteComponent() {
  return <WorkflowView />;
}
