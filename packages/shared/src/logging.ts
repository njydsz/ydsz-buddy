/**
 * 日志文件轮转工具模块
 *
 * 提供基于文件大小和数量的日志文件轮转机制，
 * 当主日志文件达到指定大小时自动创建备份并清空原文件，
 * 同时保留指定数量的历史备份文件。
 *
 * @module logging
 */
import fs from "node:fs";
import path from "node:path";

/**
 * 轮转文件输出器配置选项
 */
export interface RotatingFileSinkOptions {
  /** 日志文件的完整路径 */
  readonly filePath: string;
  /** 单个日志文件的最大字节数，超过此值将触发轮转 */
  readonly maxBytes: number;
  /** 保留的历史备份文件最大数量 */
  readonly maxFiles: number;
  /** 是否在发生错误时抛出异常，默认为 false（静默处理） */
  readonly throwOnError?: boolean;
}

/**
 * 轮转文件输出器类
 *
 * 实现日志文件的自动轮转功能：
 * - 当文件大小超过 maxBytes 时，自动将当前文件重命名为备份文件
 * - 备份文件按序号递增（.1, .2, .3...）
 * - 保留最多 maxFiles 个历史备份，超出部分自动删除
 * - 支持错误处理模式（抛出异常或静默记录）
 *
 * @example
 * ```ts
 * const sink = new RotatingFileSink({
 *   filePath: '/var/log/app.log',
 *   maxBytes: 10 * 1024 * 1024, // 10MB
 *   maxFiles: 5,
 *   throwOnError: false
 * });
 *
 * sink.write('Log message\n');
 * ```
 */
export class RotatingFileSink {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private readonly throwOnError: boolean;
  /** 当前日志文件的字节大小 */
  private currentSize = 0;

  /**
   * 创建轮转文件输出器实例
   *
   * @param options - 配置选项
   * @throws 当 maxBytes 或 maxFiles 小于 1 时抛出错误
   *
   * 初始化流程：
   * 1. 验证参数合法性
   * 2. 创建日志文件所在目录（如不存在）
   * 3. 清理超出数量限制的旧备份文件
   * 4. 读取当前日志文件大小
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

    // 确保日志文件目录存在
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    // 清理可能存在的超出数量限制的旧备份
    this.pruneOverflowBackups();
    // 获取当前日志文件大小
    this.currentSize = this.readCurrentSize();
  }

  /**
   * 写入日志数据
   *
   * 将字符串或 Buffer 数据追加到日志文件末尾。
   * 如果写入后文件大小超过 maxBytes，将触发轮转操作。
   *
   * @param chunk - 待写入的日志数据（字符串或 Buffer）
   *
   * 写入流程：
   * 1. 将字符串转换为 Buffer
   * 2. 检查是否需要轮转（写入前预估）
   * 3. 追加写入文件
   * 4. 更新当前文件大小
   * 5. 再次检查是否需要轮转（写入后实际大小）
   * 6. 发生错误时根据配置决定是否抛出异常
   */
  write(chunk: string | Buffer): void {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    if (buffer.length === 0) return;

    try {
      // 预估写入后是否超限，若超限则先轮转
      if (this.currentSize > 0 && this.currentSize + buffer.length > this.maxBytes) {
        this.rotate();
      }

      // 追加写入文件
      fs.appendFileSync(this.filePath, buffer);
      this.currentSize += buffer.length;

      // 实际写入后再次检查，确保单条大消息也能触发轮转
      if (this.currentSize > this.maxBytes) {
        this.rotate();
      }
    } catch {
      // 写入失败时重新读取实际文件大小
      this.currentSize = this.readCurrentSize();
      if (this.throwOnError) {
        throw new Error(`Failed to write log chunk to ${this.filePath}`);
      }
    }
  }

  /**
   * 执行日志文件轮转操作
   *
   * 轮转流程：
   * 1. 删除最旧的备份文件（序号最大的）
   * 2. 将所有现有备份文件序号递增（.2 -> .3, .1 -> .2）
   * 3. 将当前日志文件重命名为 .1 备份
   * 4. 重置当前文件大小为 0
   *
   * 注意：此方法为私有方法，仅在 write 方法内部调用
   */
  private rotate(): void {
    try {
      // 删除最旧的备份文件（序号等于 maxFiles）
      const oldest = this.withSuffix(this.maxFiles);
      if (fs.existsSync(oldest)) {
        fs.rmSync(oldest, { force: true });
      }

      // 将所有备份文件序号递增（从大到小处理，避免覆盖）
      for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
        const source = this.withSuffix(index);
        const target = this.withSuffix(index + 1);
        if (fs.existsSync(source)) {
          fs.renameSync(source, target);
        }
      }

      // 将当前日志文件重命名为 .1 备份
      if (fs.existsSync(this.filePath)) {
        fs.renameSync(this.filePath, this.withSuffix(1));
      }

      // 重置当前文件大小计数器
      this.currentSize = 0;
    } catch {
      // 轮转失败时重新读取实际文件大小
      this.currentSize = this.readCurrentSize();
      if (this.throwOnError) {
        throw new Error(`Failed to rotate log file ${this.filePath}`);
      }
    }
  }

  /**
   * 清理超出数量限制的旧备份文件
   *
   * 扫描日志文件所在目录，删除序号大于 maxFiles 的所有备份文件。
   * 此方法在构造函数中调用，用于清理可能残留的旧备份。
   *
   * 注意：此方法为私有方法，仅在构造函数中调用
   */
  private pruneOverflowBackups(): void {
    try {
      const dir = path.dirname(this.filePath);
      const baseName = path.basename(this.filePath);
      // 遍历目录中的所有文件
      for (const entry of fs.readdirSync(dir)) {
        // 只处理以日志文件名开头的备份文件
        if (!entry.startsWith(`${baseName}.`)) continue;
        // 提取文件序号
        const suffix = Number(entry.slice(baseName.length + 1));
        // 删除序号大于 maxFiles 的备份文件
        if (!Number.isInteger(suffix) || suffix <= this.maxFiles) continue;
        fs.rmSync(path.join(dir, entry), { force: true });
      }
    } catch {
      if (this.throwOnError) {
        throw new Error(`Failed to prune log backups for ${this.filePath}`);
      }
    }
  }

  /**
   * 读取当前日志文件的实际大小
   *
   * @returns 文件大小（字节），文件不存在时返回 0
   *
   * 注意：此方法为私有方法，用于初始化和错误恢复时同步实际文件大小
   */
  private readCurrentSize(): number {
    try {
      return fs.statSync(this.filePath).size;
    } catch {
      return 0;
    }
  }

  /**
   * 生成带有序号的备份文件路径
   *
   * @param index - 备份文件序号
   * @returns 完整的备份文件路径
   *
   * 示例：
   * - withSuffix(1) -> '/var/log/app.log.1'
   * - withSuffix(2) -> '/var/log/app.log.2'
   *
   * 注意：此方法为私有方法，仅在轮转逻辑中使用
   */
  private withSuffix(index: number): string {
    return `${this.filePath}.${index}`;
  }
}
