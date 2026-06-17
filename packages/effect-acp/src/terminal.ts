/**
 * @fileoverview 终端抽象模块
 *
 * 定义 ACP 终端（Terminal）数据结构和工厂函数。
 * 终端代表一个通过 ACP 协议管理的远程终端实例，提供输出读取、等待退出、终止和释放等操作。
 *
 * 所属模块：effect-acp
 * 主要导出：AcpTerminal 接口、MakeTerminalOptions 接口、makeTerminal 工厂函数
 *
 * @see https://agentclientprotocol.com/protocol/schema#terminal
 */

import * as Effect from "effect/Effect";

import type * as AcpSchema from "./_generated/schema.gen.ts";
import type * as AcpError from "./errors.ts";

/**
 * ACP 终端接口。
 *
 * 封装了通过 ACP 协议操作的远程终端，提供输出读取、状态等待和生命周期管理功能。
 */
export interface AcpTerminal {
  /** 所属会话 ID */
  readonly sessionId: string;
  /** 终端 ID */
  readonly terminalId: string;
  /**
   * 读取终端的缓冲输出。
   *
   * @see https://agentclientprotocol.com/protocol/schema#terminal/output
   */
  readonly output: Effect.Effect<AcpSchema.TerminalOutputResponse, AcpError.AcpError>;
  /**
   * 等待终端退出并返回退出结果。
   *
   * @see https://agentclientprotocol.com/protocol/schema#terminal/wait_for_exit
   */
  readonly waitForExit: Effect.Effect<AcpSchema.WaitForTerminalExitResponse, AcpError.AcpError>;
  /**
   * 终止终端进程。
   *
   * @see https://agentclientprotocol.com/protocol/schema#terminal/kill
   */
  readonly kill: Effect.Effect<AcpSchema.KillTerminalResponse, AcpError.AcpError>;
  /**
   * 释放终端句柄，从 ACP 会话中注销。
   *
   * @see https://agentclientprotocol.com/protocol/schema#terminal/release
   */
  readonly release: Effect.Effect<AcpSchema.ReleaseTerminalResponse, AcpError.AcpError>;
}

/**
 * 创建终端时的选项接口。
 *
 * 包含构建 AcpTerminal 实例所需的所有 Effect 操作。
 */
export interface MakeTerminalOptions {
  /** 所属会话 ID */
  readonly sessionId: string;
  /** 终端 ID */
  readonly terminalId: string;
  /** 终端输出 Effect */
  readonly output: Effect.Effect<AcpSchema.TerminalOutputResponse, AcpError.AcpError>;
  /** 等待终端退出 Effect */
  readonly waitForExit: Effect.Effect<AcpSchema.WaitForTerminalExitResponse, AcpError.AcpError>;
  /** 终止终端 Effect */
  readonly kill: Effect.Effect<AcpSchema.KillTerminalResponse, AcpError.AcpError>;
  /** 释放终端 Effect */
  readonly release: Effect.Effect<AcpSchema.ReleaseTerminalResponse, AcpError.AcpError>;
}

/**
 * 创建 AcpTerminal 实例的工厂函数。
 *
 * 将选项对象中的各个 Effect 绑定到 AcpTerminal 接口上。
 *
 * @param options - 终端配置选项
 * @returns AcpTerminal 实例
 */
export function makeTerminal(options: MakeTerminalOptions): AcpTerminal {
  return {
    sessionId: options.sessionId,
    terminalId: options.terminalId,
    output: options.output,
    waitForExit: options.waitForExit,
    kill: options.kill,
    release: options.release,
  };
}
