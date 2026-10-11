/**
 * Expert Market Type Definitions (G11-P2)
 *
 * Shared types for expert (Agent Bundle) export, import, sharing, and validation.
 */

/** Expert bundle information */
export interface ExpertInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  skillCount: number;
  createdAt: string;
}

/** Export manifest stored in expert.json */
export interface ExpertExportManifest {
  expert: ExpertInfo;
  files: string[];
  exportedAt: string;
  formatVersion: string;
}

/** Validation check result */
export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
}

/** Complete validation report */
export interface ValidationReport {
  valid: boolean;
  expertId: string;
  checks: ValidationCheck[];
  summary: string;
}

/** IM Channel types (G4-P1) */
export interface ImChannelConfig {
  channelType: string;
  appId?: string;
  appSecret?: string;
  channelFilters?: string[];
}

export interface ImChannelInfo {
  id: string;
  channelType: string;
  displayName: string;
  status: ImChannelStatus;
}

export interface ImChannelStatus {
  id: string;
  connected: boolean;
  lastConnectedAt?: string;
  error?: string;
}

export interface ImMessage {
  id: string;
  senderId: string;
  senderName?: string;
  channelId: string;
  text: string;
  messageType: string;
  timestamp: string;
}

/** ACP types (G10-P1) */
export interface AcpSessionRequest {
  sessionId: string;
  task: string;
  context?: string;
}

export interface AcpAgentResponse {
  sessionId: string;
  status: string;
  output?: string;
  error?: string;
}

export interface AcpServerStatus {
  running: boolean;
  sessionCount: number;
}

export interface AcpToolCall {
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface AcpToolResult {
  callId: string;
  success: boolean;
  output?: string;
  error?: string;
}

export type AcpSessionState =
  | "idle"
  | "running"
  | "completed"
  | { failed: string };

export interface AcpInboundSession {
  sessionId: string;
  state: AcpSessionState;
  startedAt?: string;
}

export interface AcpOutboundRunner {
  runnerId: string;
  runnerType: string;
  commandPath: string;
  args: string[];
}