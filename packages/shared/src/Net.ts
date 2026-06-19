/**
 * Net 模块 - 网络工具服务
 *
 * 提供启动阶段常用的网络辅助功能，包括端口可用性检测、环回地址检查、
 * 临时端口预留等能力。基于 Effect 框架实现，保证类型安全和可组合性。
 *
 * @module Net
 */
import * as Net from "node:net";

import { Data, Effect, Layer, ServiceMap } from "effect";

/**
 * 网络操作错误类型
 *
 * 用于封装网络操作中可能出现的错误，包含错误消息和可选的原始错误原因。
 * 继承自 Effect 的 TaggedError，支持模式匹配和错误处理。
 *
 * @property message - 错误描述信息
 * @property cause - 可选的原始错误对象，用于保留错误堆栈和详细信息
 */
export class NetError extends Data.TaggedError("NetError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * 类型守卫函数：判断一个值是否为带有 code 属性的 ErrnoException
 *
 * Node.js 的系统错误通常包含一个 code 属性（如 'EADDRINUSE'、'ECONNREFUSED' 等），
 * 该函数用于安全地检查并收窄错误类型。
 *
 * @param cause - 待检查的错误对象
 * @returns 如果 cause 是带有 string 类型 code 属性的对象则返回 true
 */
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

/**
 * 安全关闭 TCP 服务器
 *
 * 在清理阶段调用，忽略关闭过程中可能出现的错误，
 * 避免因为关闭失败而影响后续的清理逻辑。
 *
 * @param server - 要关闭的 Net.Server 实例
 */
const closeServer = (server: Net.Server) => {
  try {
    server.close();
  } catch {
    // 忽略清理阶段的关闭失败
  }
};

/**
 * 尝试预留一个临时端口
 *
 * 通过创建一个临时的 TCP 服务器来探测指定端口是否可用。
 * 如果传入的端口为 0，操作系统会自动分配一个可用的临时端口。
 * 预留成功后立即关闭服务器，释放端口供后续使用。
 *
 * 工作流程：
 * 1. 创建 TCP 服务器并调用 unref()，避免阻止进程退出
 * 2. 监听指定端口（port 为 0 时由 OS 分配）
 * 3. 获取实际分配的端口号
 * 4. 关闭服务器并返回端口号
 * 5. 如果过程中出现错误，返回 NetError
 *
 * @param port - 要预留的端口号，0 表示由操作系统自动分配
 * @returns Effect，成功时返回预留的端口号，失败时返回 NetError
 */
const tryReservePort = (port: number): Effect.Effect<number, NetError> =>
  Effect.callback<number, NetError>((resume) => {
    const server = Net.createServer();
    let settled = false;

    /**
     * 确保回调只被调用一次
     * Effect.callback 要求 resume 只能被调用一次，该函数通过 settled 标志位保证这一点
     */
    const settle = (effect: Effect.Effect<number, NetError>) => {
      if (settled) return;
      settled = true;
      resume(effect);
    };

    // 调用 unref() 使服务器不会阻止 Node.js 进程退出
    server.unref();

    // 监听错误事件（如端口被占用、权限不足等）
    server.once("error", (cause) => {
      settle(Effect.fail(new NetError({ message: "Could not find an available port.", cause })));
    });

    // 监听成功后获取端口号并关闭服务器
    server.listen(port, () => {
      const address = server.address();
      // address 可能是 string、null 或 object，这里只处理 object 情况
      const resolved = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => {
        if (resolved > 0) {
          settle(Effect.succeed(resolved));
          return;
        }
        settle(Effect.fail(new NetError({ message: "Could not find an available port." })));
      });
    });

    // 返回清理逻辑：当 Effect 被中断时关闭服务器
    return Effect.sync(() => {
      closeServer(server);
    });
  });

/**
 * 网络服务接口定义
 *
 * 描述了 NetService 提供的所有网络辅助功能，包括：
 * - 检查指定主机和端口的可绑定性
 * - 检查环回地址（IPv4 和 IPv6）上的端口可用性
 * - 预留临时环回端口
 * - 查找可用端口（支持首选端口）
 */
export interface NetServiceShape {
  /**
   * 检查 TCP 服务器是否可以绑定到指定的主机和端口
   *
   * @param port - 要检查的端口号
   * @param host - 要检查的主机地址
   * @returns Effect，返回 boolean 表示是否可以绑定
   */
  readonly canListenOnHost: (port: number, host: string) => Effect.Effect<boolean>;

  /**
   * 检查环回地址（127.0.0.1 和 ::1）上的端口可用性
   *
   * 同时检查 IPv4 和 IPv6 环回地址，只有两者都可用时才返回 true。
   * 这确保了服务可以在双栈环境下正常启动。
   *
   * @param port - 要检查的端口号
   * @returns Effect，返回 boolean 表示端口在环回地址上是否可用
   */
  readonly isPortAvailableOnLoopback: (port: number) => Effect.Effect<boolean>;

  /**
   * 预留一个临时环回端口并立即释放
   *
   * 通过绑定到端口 0 让操作系统自动分配可用端口，获取端口号后立即关闭服务器。
   * 返回的端口号可以用于后续的服务启动，确保端口在检查时确实可用。
   *
   * @param host - 可选的主机地址，默认为 "127.0.0.1"
   * @returns Effect，成功时返回预留的端口号，失败时返回 NetError
   */
  readonly reserveLoopbackPort: (host?: string) => Effect.Effect<number, NetError>;

  /**
   * 查找一个可用的监听端口
   *
   * 优先尝试使用首选端口，如果该端口不可用（被占用或权限不足），
   * 则回退到让操作系统自动分配一个临时端口（port = 0）。
   *
   * @param preferred - 首选的端口号
   * @returns Effect，返回可用的端口号，失败时返回 NetError
   */
  readonly findAvailablePort: (preferred: number) => Effect.Effect<number, NetError>;
}

/**
 * NetService - 启动阶段网络辅助工具的服务标签
 *
 * 基于 Effect 的 ServiceMap 实现，提供依赖注入能力。
 * 通过 NetService.layer 可以获取该服务的实现层，供其他模块使用。
 *
 * 服务标识符：@remi-code/shared/Net/NetService
 */
export class NetService extends ServiceMap.Service<NetService, NetServiceShape>()(
  "@remi-code/shared/Net/NetService",
) {
  /**
   * NetService 的实现层
   *
   * 使用 Layer.sync 创建同步层，提供 NetServiceShape 接口的完整实现。
   * 所有方法都基于 Effect.callback 封装 Node.js 的异步网络操作，
   * 确保与 Effect 生态系统的无缝集成。
   */
  static readonly layer = Layer.sync(NetService, () => {
    /**
     * 检查 TCP 服务器是否可以绑定到指定的主机和端口
     *
     * 实现细节：
     * - 创建临时 TCP 服务器并尝试绑定
     * - 如果出现 EADDRNOTAVAIL 错误（地址不可用），视为可用
     *   这是为了兼容没有 IPv6 支持的环境，避免环回可用性检查失败
     * - 其他错误（如 EADDRINUSE）视为不可用
     * - 绑定成功后立即关闭服务器并返回 true
     *
     * @param port - 要检查的端口号
     * @param host - 要检查的主机地址
     * @returns Effect，返回 boolean 表示是否可以绑定
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
          // EADDRNOTAVAIL 表示地址不可用（如 IPv6 未启用）
          // 将其视为"可用"是为了避免在只有 IPv4 的环境中检查失败
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
     * 预留一个临时环回端口并立即释放
     *
     * 通过绑定到端口 0 让操作系统自动分配可用端口，获取端口号后立即关闭服务器。
     * 返回的端口号可以用于后续的服务启动，确保端口在检查时确实可用。
     *
     * @param host - 环回地址，默认为 "127.0.0.1"
     * @returns Effect，成功时返回预留的端口号，失败时返回 NetError
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
      /**
       * 检查环回地址上的端口可用性
       *
       * 同时检查 IPv4（127.0.0.1）和 IPv6（::1）环回地址，
       * 使用 Effect.zipWith 并行执行两个检查，只有两者都可用时才返回 true。
       */
      isPortAvailableOnLoopback: (port) =>
        Effect.zipWith(
          canListenOnHost(port, "127.0.0.1"),
          canListenOnHost(port, "::1"),
          (ipv4, ipv6) => ipv4 && ipv6,
        ),
      reserveLoopbackPort,
      /**
       * 查找可用端口
       *
       * 优先尝试使用首选端口，如果失败（端口被占用等），
       * 则回退到使用端口 0 让操作系统自动分配。
       * 使用 Effect.catch 捕获第一次尝试的失败并执行回退逻辑。
       */
      findAvailablePort: (preferred) =>
        Effect.catch(tryReservePort(preferred), () => tryReservePort(0)),
    } satisfies NetServiceShape;
  });
}
