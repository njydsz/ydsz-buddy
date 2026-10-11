// @ts-nocheck
/**
 * @file Memory route - Project Memory management (P1-2)
 */
import { createFileRoute } from '@tanstack/react-router';
import { MemoryPanel } from '../components/MemoryPanel';

export const Route = createFileRoute('/_chat/memory')({
  component: MemoryRouteComponent,
});

function MemoryRouteComponent() {
  return <MemoryPanel />;
}
