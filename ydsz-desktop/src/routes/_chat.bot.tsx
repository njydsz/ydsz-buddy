// @ts-nocheck
/**
 * @file Bot route - Multi-channel Bot settings (P0-4)
 */
import { createFileRoute } from '@tanstack/react-router';
import { BotSettings } from '../components/BotSettings';

export const Route = createFileRoute('/_chat/bot')({
  component: BotRouteComponent,
});

function BotRouteComponent() {
  return <BotSettings />;
}
