/**
 * 文件: Net.ts
 * 用途: NetService 网络服务，提供启动阶段端口可用性检测和端口预留能力。
 * 层级: 共享服务模块
 * 主要导出: NetService（ServiceMap 服务标签）、NetError 错误类型、NetServiceShape 接口
 */

import * as Net from "node:net";

import { Data, Effect, Layer, ServiceMap } from "effect";

/** 网络操作错误类型 */
export class NetError extends Data.TaggedError("NetError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** 类型守卫：判断错误对象是否包含 `code` 属性（如 Node.js ErrnoException） */
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

/** 安全关闭服务器，忽略清理过程中的关闭失败 */
const closeServer = (server: Net.Server) => {
  try {
    server.close();
  } catch {
    // Ignore close failures during cleanup.
  }
};

/**
 * 尝试在指定端口上短暂绑定，然后立即释放，验证端口是否可用。
 * @param port - 待检测的端口号。
 * @returns 成功返回端口号，失败返回 NetError。
 */
const tryReservePort = (port: number): Effect.Effect<number, NetError> =>
  Effect.callback<number, NetError>((resume) => {
    const server = Net.createServer();
    let settled = false;

    const settle = (effect: Effect.Effect<number, NetError>) => {
      if (settled) return;
      settled = true;
      resume(effect);
    };

    server.unref();

    server.once("error", (cause) => {
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

/** NetService 对外暴露的服务接口 */
export interface NetServiceShape {
  /**
   * 检测 TCP 服务器是否能在指定 {host, port} 上绑定。
   * @returns 可绑定返回 true，否则返回 false。
   */
  readonly canListenOnHost: (port: number, host: string) => Effect.Effect<boolean>;

  /**
   * 检测端口在 IPv4 和 IPv6 回环地址上是否均可用。
   * @returns 两端均可用返回 true。
   */
  readonly isPortAvailableOnLoopback: (port: number) => Effect.Effect<boolean>;

  /**
   * 在回环地址上预留一个临时端口并立即释放。
   * @param host - 绑定的主机地址，默认 127.0.0.1。
   * @returns 成功返回预留的端口号，失败返回 NetError。
   */
  readonly reserveLoopbackPort: (host?: string) => Effect.Effect<number, NetError>;

  /**
   * 查找可用端口，优先尝试 preferred，失败则使用系统分配。
   * @param preferred - 首选端口号。
   * @returns 成功返回可用端口号，失败返回 NetError。
   */
  readonly findAvailablePort: (preferred: number) => Effect.Effect<number, NetError>;
}

/**
 * NetService - 启动阶段网络辅助服务。
 *
 * 提供端口检测、回环端口预留、可用端口查找等功能，
 * 通过 Effect ServiceMap 模式注入到应用中。
 */
export class NetService extends ServiceMap.Service<NetService, NetServiceShape>()(
  "@remi-code/shared/Net/NetService",
) {
  static readonly layer = Layer.sync(NetService, () => {
    /**
     * 检测 TCP 服务器是否能在指定 {host, port} 上绑定。
     * `EADDRNOTAVAIL` 错误被视为可用，以确保缺失 IPv6 的主机
     * 不会导致回环可用性检测失败。
     */
    const canListenOnHost = (port: number, host: string): Effect.Effect<boolean> =>
      Effect.callback<boolean>((resume) => {
        const server = Net.createServer();
        let settled = false;

        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          resume(Effect.succeed(value));
        };

        server.unref();

        server.once("error", (cause) => {
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
     * 在回环地址上预留一个临时端口并立即释放。
     * 返回预留的端口号。
     */
    const reserveLoopbackPort = (host = "127.0.0.1"): Effect.Effect<number, NetError> =>
      Effect.callback<number, NetError>((resume) => {
        const probe = Net.createServer();
        let settled = false;

        const settle = (effect: Effect.Effect<number, NetError>) => {
          if (settled) return;
          settled = true;
          resume(effect);
        };

        probe.once("error", (cause) => {
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
      /** 同时检测 IPv4 (127.0.0.1) 和 IPv6 (::1) 回环地址的端口可用性 */
      isPortAvailableOnLoopback: (port) =>
        Effect.zipWith(
          canListenOnHost(port, "127.0.0.1"),
          canListenOnHost(port, "::1"),
          (ipv4, ipv6) => ipv4 && ipv6,
        ),
      reserveLoopbackPort,
      /** 优先尝试 preferred 端口，失败后使用系统分配的临时端口 */
      findAvailablePort: (preferred) =>
        Effect.catch(tryReservePort(preferred), () => tryReservePort(0)),
    } satisfies NetServiceShape;
  });
}
