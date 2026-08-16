/**
 * @file 日志工具模块
 *
 * 本模块提供日志相关的工具函数和类型：
 *
 * - **日志级别定义**：trace / debug / info / warn / error
 * - **轮转文件接收器（Rotating File Sink）**：按大小轮转的日志文件
 * - **结构化日志格式化**：JSON / 文本格式切换
 * - **日志输出目标**：console / file / 远程
 *
 * ## 核心导出
 *
 * - `RotatingFileSinkOptions`：轮转文件接收器配置
 * - `RotatingFileSink`：轮转文件接收器实现
 * - `formatLogLine`：单行日志格式化
 *
 * ## 使用场景
 *
 * - 服务端日志写入 `logs/server.log`
 * - 客户端错误日志写入 `logs/client.log`
 * - 跨进程调试与问题排查
 *
 * ## 注意事项
 *
 * - 默认轮转大小 10MB，最多保留 5 个历史文件
 * - 日志文件路径为绝对路径，避免相对路径歧义
 * - 高频日志应使用 `info` 级别，避免 `debug` 级别影响性能
 */

import fs from "node:fs";
import path from "node:path";

/**
 * 轮转文件接收器选项。
 *
 * @property filePath - 日志文件路径
 * @property maxBytes - 单个日志文件最大字节数
 * @property maxFiles - 保留的历史文件最大数量
 * @property throwOnError - 写入失败时是否抛出异常
 */
export interface RotatingFileSinkOptions {
  readonly filePath: string;
  readonly maxBytes: number;
  readonly maxFiles: number;
  readonly throwOnError?: boolean;
}

/**
 * 轮转文件日志接收器。
 *
 * 当日志文件超过 `maxBytes` 大小时，自动轮转到下一个历史文件。
 * 历史文件命名格式：`{filePath}.1`、`{filePath}.2`、...、`{filePath}.{maxFiles}`。
 * 超出 `maxFiles` 数量的历史文件会被删除。
 *
 * @example
 * ```ts
 * const sink = new RotatingFileSink({
 *   filePath: "/var/log/app.log",
 *   maxBytes: 10 * 1024 * 1024, // 10MB
 *   maxFiles: 5,
 * });
 * sink.write("Log message\n");
 * ```
 */
export class RotatingFileSink {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private readonly throwOnError: boolean;
  private currentSize = 0;

  /**
   * 创建轮转文件接收器。
   *
   * @param options - 接收器配置选项
   * @throws Error - 若 maxBytes 或 maxFiles 小于 1
   */
  constructor(options: RotatingFileSinkOptions) {
    if (options.maxBytes < 1) {
      throw new Error(`maxBytes must be >= 1 (received ${options.maxBytes})`);
    }
    if (options.maxFiles < 1) {
      throw new Error(`maxFiles must be >= 1 (received ${options.maxFiles})`);
    }

    this.filePath = options.filePath;
    this.maxBytes = options.maxBytes;
    this.maxFiles = options.maxFiles;
    this.throwOnError = options.throwOnError ?? false;

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.pruneOverflowBackups();
    this.currentSize = this.readCurrentSize();
  }

  /**
   * 写入日志数据。
   *
   * 若写入后文件大小超过 `maxBytes`，则触发轮转。
   *
   * @param chunk - 要写入的日志数据（字符串或 Buffer）
   */
  write(chunk: string | Buffer): void {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    if (buffer.length === 0) return;

    try {
      if (this.currentSize > 0 && this.currentSize + buffer.length > this.maxBytes) {
        this.rotate();
      }

      fs.appendFileSync(this.filePath, buffer);
      this.currentSize += buffer.length;

      if (this.currentSize > this.maxBytes) {
        this.rotate();
      }
    } catch {
      this.currentSize = this.readCurrentSize();
      if (this.throwOnError) {
        throw new Error(`Failed to write log chunk to ${this.filePath}`);
      }
    }
  }

  private rotate(): void {
    try {
      const oldest = this.withSuffix(this.maxFiles);
      if (fs.existsSync(oldest)) {
        fs.rmSync(oldest, { force: true });
      }

      for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
        const source = this.withSuffix(index);
        const target = this.withSuffix(index + 1);
        if (fs.existsSync(source)) {
          fs.renameSync(source, target);
        }
      }

      if (fs.existsSync(this.filePath)) {
        fs.renameSync(this.filePath, this.withSuffix(1));
      }

      this.currentSize = 0;
    } catch {
      this.currentSize = this.readCurrentSize();
      if (this.throwOnError) {
        throw new Error(`Failed to rotate log file ${this.filePath}`);
      }
    }
  }

  private pruneOverflowBackups(): void {
    try {
      const dir = path.dirname(this.filePath);
      const baseName = path.basename(this.filePath);
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.startsWith(`${baseName}.`)) continue;
        const suffix = Number(entry.slice(baseName.length + 1));
        if (!Number.isInteger(suffix) || suffix <= this.maxFiles) continue;
        fs.rmSync(path.join(dir, entry), { force: true });
      }
    } catch {
      if (this.throwOnError) {
        throw new Error(`Failed to prune log backups for ${this.filePath}`);
      }
    }
  }

  private readCurrentSize(): number {
    try {
      return fs.statSync(this.filePath).size;
    } catch {
      return 0;
    }
  }

  private withSuffix(index: number): string {
    return `${this.filePath}.${index}`;
  }
}
