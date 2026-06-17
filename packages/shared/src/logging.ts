/**
 * 文件: logging.ts
 * 用途: 提供滚动日志文件写入器，支持按大小自动轮转和备份文件数量限制。
 * 层级: 共享工具模块
 * 主要导出: RotatingFileSink 类、RotatingFileSinkOptions 配置接口
 */

import fs from "node:fs";
import path from "node:path";

/** 滚动文件 Sink 的配置选项 */
export interface RotatingFileSinkOptions {
  /** 日志文件路径 */
  readonly filePath: string;
  /** 单个日志文件最大字节数，超过此阈值触发轮转 */
  readonly maxBytes: number;
  /** 保留的备份文件最大数量 */
  readonly maxFiles: number;
  /** 写入失败时是否抛出异常，默认静默忽略 */
  readonly throwOnError?: boolean;
}

/**
 * 滚动日志文件写入器。
 *
 * 当写入内容使当前日志文件超过 `maxBytes` 时，自动将当前文件
 * 重命名为 `.1` 后缀，并将已有的 `.1` 轮转为 `.2`，依此类推，
 * 超过 `maxFiles` 的旧备份将被删除。
 */
export class RotatingFileSink {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private readonly throwOnError: boolean;
  /** 当前日志文件已写入字节数 */
  private currentSize = 0;

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

    // 确保日志目录存在，清理多余的旧备份，读取当前文件大小
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.pruneOverflowBackups();
    this.currentSize = this.readCurrentSize();
  }

  /**
   * 写入日志内容。若写入后超出大小限制，则触发轮转。
   * @param chunk - 待写入的字符串或 Buffer。
   */
  write(chunk: string | Buffer): void {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    if (buffer.length === 0) return;

    try {
      // 写入前检查：若当前已有内容且追加后超限，先轮转
      if (this.currentSize > 0 && this.currentSize + buffer.length > this.maxBytes) {
        this.rotate();
      }

      fs.appendFileSync(this.filePath, buffer);
      this.currentSize += buffer.length;

      // 写入后检查：追加后可能恰好超限，再次轮转
      if (this.currentSize > this.maxBytes) {
        this.rotate();
      }
    } catch {
      // 写入失败时重新读取实际大小，确保状态一致
      this.currentSize = this.readCurrentSize();
      if (this.throwOnError) {
        throw new Error(`Failed to write log chunk to ${this.filePath}`);
      }
    }
  }

  /**
   * 执行日志文件轮转：将当前文件重命名为 .1，已有备份依次递增编号，
   * 超出 maxFiles 的最旧备份将被删除。
   */
  private rotate(): void {
    try {
      // 删除最旧的备份文件（编号为 maxFiles）
      const oldest = this.withSuffix(this.maxFiles);
      if (fs.existsSync(oldest)) {
        fs.rmSync(oldest, { force: true });
      }

      // 从高到低依次重命名：.N-1 → .N
      for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
        const source = this.withSuffix(index);
        const target = this.withSuffix(index + 1);
        if (fs.existsSync(source)) {
          fs.renameSync(source, target);
        }
      }

      // 当前文件重命名为 .1
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

  /**
   * 清理超出 maxFiles 编号范围的旧备份文件。
   */
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

  /** 读取当前日志文件的实际大小（字节） */
  private readCurrentSize(): number {
    try {
      return fs.statSync(this.filePath).size;
    } catch {
      return 0;
    }
  }

  /** 生成带编号后缀的备份文件路径 */
  private withSuffix(index: number): string {
    return `${this.filePath}.${index}`;
  }
}
