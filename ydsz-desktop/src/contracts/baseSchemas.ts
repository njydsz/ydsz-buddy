import { Schema } from "effect";

export const TrimmedString = Schema.Trim;
export const TrimmedNonEmptyString = Schema.Trim.pipe(Schema.minLength(1));

export const NonNegativeInt = Schema.NonNegativeInt;
export const PositiveInt = Schema.NonNegativeInt.pipe(Schema.greaterThanOrEqualTo(1));

export const IsoDateTime = Schema.String;
export type IsoDateTime = typeof IsoDateTime.Type;

export const ProviderKind = Schema.Literal(
  "codex",
  "claudeAgent",
  "cursor",
  "gemini",
  "grok",
  "kilo",
  "opencode",
  "pi",
  "glm",
  "deepseek",
  "moonshot",
  "qwen",
  "mimo",
  "MiniMax",
  "doubao",
  "ernie",
  "hunyuan",
);
export type ProviderKind = typeof ProviderKind.Type;

/**
 * Construct a branded identifier. Enforces non-empty trimmed strings
 */
const makeEntityId = <Brand extends string>(brand: Brand) => {
  const schema = TrimmedNonEmptyString.pipe(Schema.brand(brand));
  return Object.assign(schema, {
    /**
     * UNSAFE: Cast a string to this branded type without validation.
     * Only use when you're certain the value is valid.
     */
    makeUnsafe: (value: string): typeof schema.Type => value as typeof schema.Type,
  });
};

export const ThreadId = makeEntityId("ThreadId");
export type ThreadId = typeof ThreadId.Type;
export const ProjectId = makeEntityId("ProjectId");
export type ProjectId = typeof ProjectId.Type;
export const EnvironmentId = makeEntityId("EnvironmentId");
export type EnvironmentId = typeof EnvironmentId.Type;
export const AuthSessionId = makeEntityId("AuthSessionId");
export type AuthSessionId = typeof AuthSessionId.Type;
export const CommandId = makeEntityId("CommandId");
export type CommandId = typeof CommandId.Type;
export const EventId = makeEntityId("EventId");
export type EventId = typeof EventId.Type;
export const MessageId = makeEntityId("MessageId");
export type MessageId = typeof MessageId.Type;
export const TurnId = makeEntityId("TurnId");
export type TurnId = typeof TurnId.Type;

export const ProviderItemId = makeEntityId("ProviderItemId");
export type ProviderItemId = typeof ProviderItemId.Type;
export const RuntimeSessionId = makeEntityId("RuntimeSessionId");
export type RuntimeSessionId = typeof RuntimeSessionId.Type;
export const RuntimeItemId = makeEntityId("RuntimeItemId");
export type RuntimeItemId = typeof RuntimeItemId.Type;
export const RuntimeRequestId = makeEntityId("RuntimeRequestId");
export type RuntimeRequestId = typeof RuntimeRequestId.Type;
export const RuntimeTaskId = makeEntityId("RuntimeTaskId");
export type RuntimeTaskId = typeof RuntimeTaskId.Type;
export const ApprovalRequestId = makeEntityId("ApprovalRequestId");
export type ApprovalRequestId = typeof ApprovalRequestId.Type;
export const CheckpointRef = makeEntityId("CheckpointRef");
export type CheckpointRef = typeof CheckpointRef.Type;
