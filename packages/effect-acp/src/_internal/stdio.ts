/**
 * @fileoverview 标准 I/O 工具模块
 *
 * 提供 ACP 子进程的标准输入输出管理功能，包括创建子进程 Stdio、内存 Stdio 和终止错误处理。
 *
 * 所属模块：effect-acp（内部工具）
 * 主要导出：makeChildStdio、makeInMemoryStdio、makeTerminationError
 */

import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Sink from "effect/Sink";
import * as Stdio from "effect/Stdio";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as AcpError from "../errors.ts";

/** 文本编码器，用于将字符串转换为 Uint8Array */
const encoder = new TextEncoder();

/**
 * 根据子进程句柄创建 Stdio 实例。
 *
 * 将子进程的 stdout 作为 stdin 输入，stderr 输出排空，stdin 接收编码后的数据。
 *
 * @param handle - 子进程句柄
 * @returns Stdio 实例
 */
export const makeChildStdio = (handle: ChildProcessSpawner.ChildProcessHandle) =>
  Stdio.make({
    /** 子进程 stdout -> 当前进程 stdin */
    stdin: handle.stdout,
    /** 当前进程 stdout -> 子进程 stdin（编码后写入） */
    stdout: Sink.mapInput(handle.stdin, (chunk: string | Uint8Array) =>
      typeof chunk === "string" ? encoder.encode(chunk) : chunk,
    ),
    /** 子进程 stderr -> 排空 */
    stderr: Sink.drain,
  });

/**
 * 创建基于内存的 Stdio 实例。
 *
 * 用于测试或进程内通信场景，通过 Queue 在内存中传递数据。
 *
 * @returns 包含 Stdio 实例、输入队列和输出队列的对象
 */
export const makeInMemoryStdio = Effect.fn("makeInMemoryStdio")(function* () {
  /** 输入队列（模拟子进程 stdout） */
  const input = yield* Queue.unbounded<Uint8Array, Cause.Done<void>>();
  /** 输出队列（收集写入的数据） */
  const output = yield* Queue.unbounded<string>();
  const decoder = new TextDecoder();

  return {
    stdio: Stdio.make({
      /** 从输入队列读取数据 */
      stdin: Stream.fromQueue(input),
      /** 将写入数据放入输出队列 */
      stdout: Sink.forEach((chunk: string | Uint8Array) =>
        Queue.offer(
          output,
          typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }),
        ),
      ),
      /** 排空 stderr */
      stderr: Sink.drain,
    }),
    input,
    output,
  };
});

/**
 * 创建子进程终止错误 Effect。
 *
 * 轮询子进程的退出码，若失败则返回 AcpTransportError，成功则返回 AcpProcessExitedError。
 *
 * @param handle - 子进程句柄
 * @returns 包含终止错误信息的 Effect
 */
export const makeTerminationError = (
  handle: ChildProcessSpawner.ChildProcessHandle,
): Effect.Effect<AcpError.AcpError> =>
  Effect.match(handle.exitCode, {
    onFailure: (cause) =>
      new AcpError.AcpTransportError({
        detail: "Failed to determine ACP process exit status",
        cause,
      }),
    onSuccess: (code) => new AcpError.AcpProcessExitedError({ code }),
  });
