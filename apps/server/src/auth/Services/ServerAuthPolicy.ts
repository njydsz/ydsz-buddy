import type { ServerAuthDescriptor } from "@remi-code/contracts";
import { Effect, ServiceMap } from "effect";

export interface ServerAuthPolicyShape {
  readonly getDescriptor: () => Effect.Effect<ServerAuthDescriptor>;
}

export class ServerAuthPolicy extends ServiceMap.Service<ServerAuthPolicy, ServerAuthPolicyShape>()(
  "t3/auth/Services/ServerAuthPolicy",
) {}
