/**
 * @file 网络工具服务模块
 * @description 提供基于 Effect 框架的网络层服务，用于：
 *   - 检测 TCP 端口可用性
 *   - 预留临时回环端口
 *   - 查找可用监听端口
 *   主要用于 Tauri 应用启动时的服务器端口分配。
 * @layer 基础设施层
 * @depends node:net, effect (Data, Effect, Layer, ServiceMap)
 */
import * as Net from "node:net";

import { Data, Effect, Layer, Context } from "effect";

/**
 * 网络操作错误。
 *
 * 用于端口检测、预留等网络操作失败的错误类型。
 */
export class NetError extends Data.TaggedError("NetError")<{
  /** 错误消息 */
  readonly message: string;
  /** 错误原因 */
  readonly cause?: unknown;
}> {}

function isErrnoExceptionWithCode(cause: unknown): cause is {
  readonly code: string;
} {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof (cause as { readonly code: unknown }).code === "string"
  );
}

const closeServer = (server: Net.Server) => {
  try {
    server.close();
  } catch {
    // Ignore close failures during cleanup.
  }
};

const tryReservePort = (port: number): Effect.Effect<number, NetError> =>
  Effect.async<number, NetError>((resume) => {
    const server = Net.createServer();
    let settled = false;

    const settle = (effect: Effect.Effect<number, NetError>) => {
      if (settled) return;
      settled = true;
      resume(effect);
    };

    server.unref();

    server.once("error", (cause: unknown) => {
      settle(Effect.fail(new NetError({ message: "Could not find an available port.", cause })));
    });

    server.listen(port, () => {
      const address = server.address();
      const resolved = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => {
        if (resolved > 0) {
          settle(Effect.succeed(resolved));
          return;
        }
        settle(Effect.fail(new NetError({ message: "Could not find an available port." })));
      });
    });

    return Effect.sync(() => {
      closeServer(server);
    });
  });

export interface NetServiceShape {
  /**
   * Returns true when a TCP server can bind to {host, port}.
   */
  readonly canListenOnHost: (port: number, host: string) => Effect.Effect<boolean>;

  /**
   * Checks loopback availability on both IPv4 and IPv6 localhost addresses.
   */
  readonly isPortAvailableOnLoopback: (port: number) => Effect.Effect<boolean>;

  /**
   * Reserve an ephemeral loopback port and release it immediately.
   */
  readonly reserveLoopbackPort: (host?: string) => Effect.Effect<number, NetError>;

  /**
   * Resolve an available listening port, preferring the provided port first.
   */
  readonly findAvailablePort: (preferred: number) => Effect.Effect<number, NetError>;
}

/**
 * NetService - Service tag for startup networking helpers.
 */
export class NetService extends Context.Tag("@njydsz/shared/Net/NetService")<
  NetService,
  NetServiceShape
>() {
  static readonly layer = Layer.sync(NetService, () => {
    /**
     * Returns true when a TCP server can bind to {host, port}.
     * `EADDRNOTAVAIL` is treated as available so IPv6-absent hosts don't fail
     * loopback availability checks.
     */
    const canListenOnHost = (port: number, host: string): Effect.Effect<boolean> =>
      Effect.async<boolean>((resume) => {
        const server = Net.createServer();
        let settled = false;

        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          resume(Effect.succeed(value));
        };

        server.unref();

        server.once("error", (cause: unknown) => {
          if (isErrnoExceptionWithCode(cause) && cause.code === "EADDRNOTAVAIL") {
            settle(true);
            return;
          }
          settle(false);
        });

        server.once("listening", () => {
          server.close(() => {
            settle(true);
          });
        });

        server.listen({ host, port });

        return Effect.sync(() => {
          closeServer(server);
        });
      });

    /**
     * Reserve an ephemeral loopback port and release it immediately.
     * Returns the reserved port number.
     */
    const reserveLoopbackPort = (host = "127.0.0.1"): Effect.Effect<number, NetError> =>
      Effect.async<number, NetError>((resume) => {
        const probe = Net.createServer();
        let settled = false;

        const settle = (effect: Effect.Effect<number, NetError>) => {
          if (settled) return;
          settled = true;
          resume(effect);
        };

        probe.once("error", (cause: unknown) => {
          settle(Effect.fail(new NetError({ message: "Failed to reserve loopback port", cause })));
        });

        probe.listen(0, host, () => {
          const address = probe.address();
          const port = typeof address === "object" && address !== null ? address.port : 0;
          probe.close(() => {
            if (port > 0) {
              settle(Effect.succeed(port));
              return;
            }
            settle(Effect.fail(new NetError({ message: "Failed to reserve loopback port" })));
          });
        });

        return Effect.sync(() => {
          closeServer(probe);
        });
      });

    return {
      canListenOnHost,
      isPortAvailableOnLoopback: (port) =>
        Effect.zipWith(
          canListenOnHost(port, "127.0.0.1"),
          canListenOnHost(port, "::1"),
          (ipv4, ipv6) => ipv4 && ipv6,
        ),
      reserveLoopbackPort,
      findAvailablePort: (preferred) =>
        Effect.catchAll(tryReservePort(preferred), () => tryReservePort(0)),
    } satisfies NetServiceShape;
  });
}
