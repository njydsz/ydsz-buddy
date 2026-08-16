/**
 * @file 终端命令安全检查模块
 *
 * 在用户按回车执行终端命令前,检测命令是否包含危险操作。
 * 如果检测到危险命令,显示确认 Toast 让用户二次确认。
 *
 * ## 危险命令分类
 *
 * - **不可逆操作**: `rm -rf /`, `mkfs`, `dd if=/dev/zero of=`
 * - **权限提升**: `sudo` 配合危险命令
 * - **远程执行**: `curl | sh`, `wget | bash`
 * - **强制推送**: `git push --force`, `git push -f`
 * - **进程终止**: `kill -9`, `killall`
 *
 * ## 实现说明
 *
 * 终端输入是流式的,本模块在检测到回车键(\r 或 \n)时,
 * 从输入缓冲区中提取完整命令行进行模式匹配。
 */

/**
 * 危险命令模式定义
 *
 * 每个模式包含:
 * - `pattern`: 正则表达式,用于匹配命令行
 * - `severity`: 严重程度,"warn" 显示黄色警告,"danger" 显示红色警告
 * - `description`: 危险操作的描述
 */
interface DangerousCommandPattern {
  pattern: RegExp;
  severity: "warn" | "danger";
  description: string;
}

const DANGEROUS_COMMAND_PATTERNS: DangerousCommandPattern[] = [
  // ── 不可逆文件操作 ──
  {
    pattern: /\brm\s+(-[a-z]*r[a-z]*\s+)?(-[a-z]*f[a-z]*\s+)?[\/~]/i,
    severity: "danger",
    description: "Recursive deletion of root or home directory",
  },
  {
    pattern: /\brm\s+-[a-z]*r[a-z]*f[a-z]*\b/i,
    severity: "danger",
    description: "Force recursive deletion",
  },
  {
    pattern: /\bmkfs\b/i,
    severity: "danger",
    description: "Filesystem formatting",
  },
  {
    pattern: /\bdd\s+if=\/dev\/(zero|random|urandom)\s+of=/i,
    severity: "danger",
    description: "Disk overwrite with zero/random data",
  },
  {
    pattern: /\bshred\b/i,
    severity: "warn",
    description: "Secure file deletion",
  },

  // ── 远程脚本执行 ──
  {
    pattern: /\b(curl|wget)\s+.*\|\s*(sh|bash|zsh|fish)\b/i,
    severity: "danger",
    description: "Executing remote script without verification",
  },
  {
    pattern: /\b(curl|wget)\s+.*\|\s*sudo\s+(sh|bash|zsh|fish)\b/i,
    severity: "danger",
    description: "Executing remote script with root privileges",
  },

  // ── Git 危险操作 ──
  {
    pattern: /\bgit\s+push\s+.*(--force|-f)\b/i,
    severity: "warn",
    description: "Force pushing may overwrite remote history",
  },
  {
    pattern: /\bgit\s+push\s+.*--delete\b/i,
    severity: "warn",
    description: "Deleting a remote branch",
  },
  {
    pattern: /\bgit\s+clean\s+-[a-z]*[fx][a-z]*\b/i,
    severity: "warn",
    description: "Force cleaning untracked files",
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/i,
    severity: "warn",
    description: "Hard reset discards uncommitted changes",
  },

  // ── 进程管理 ──
  {
    pattern: /\bkill\s+-9\b/i,
    severity: "warn",
    description: "Force killing a process (SIGKILL)",
  },
  {
    pattern: /\bkillall\b/i,
    severity: "warn",
    description: "Killing all processes by name",
  },

  // ── 权限变更 ──
  {
    pattern: /\bchmod\s+-R\s+0?777\b/i,
    severity: "warn",
    description: "Recursively setting world-writable permissions",
  },
  {
    pattern: /\bchown\s+-R\s+root\b/i,
    severity: "warn",
    description: "Recursively changing ownership to root",
  },

  // ── 包管理 ──
  {
    pattern: /\bnpm\s+(uninstall|remove|rm)\s+.*--force\b/i,
    severity: "warn",
    description: "Force uninstalling npm packages",
  },
  {
    pattern: /\bpip\s+install\s+.*--force-reinstall\b/i,
    severity: "warn",
    description: "Force reinstalling Python packages",
  },
];

/**
 * 检查命令行是否包含危险操作
 *
 * @param commandLine 用户输入的完整命令行
 * @returns 如果检测到危险命令,返回匹配的模式信息;否则返回 null
 */
export function checkCommandSafety(commandLine: string): DangerousCommandPattern | null {
  const trimmed = commandLine.trim();
  if (trimmed.length === 0) return null;

  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.pattern.test(trimmed)) {
      return pattern;
    }
  }

  return null;
}

/**
 * 从终端输入缓冲区中提取最后一个完整命令行
 *
 * 终端输入是流式的,用户逐字输入。当检测到回车键时,
 * 从缓冲区中提取最后一个换行符之后的内容作为命令行。
 *
 * @param buffer 终端输入缓冲区
 * @returns 最后一个完整命令行,如果没有则返回 null
 */
export function extractLastCommandLine(buffer: string): string | null {
  // 查找最后一个回车或换行符
  const lastNewlineIndex = Math.max(
    buffer.lastIndexOf("\r"),
    buffer.lastIndexOf("\n"),
  );

  if (lastNewlineIndex === -1) {
    // 没有换行符,整个缓冲区就是命令行
    return buffer.length > 0 ? buffer : null;
  }

  // 取最后一个换行符之后的内容
  const afterLastNewline = buffer.slice(lastNewlineIndex + 1);
  return afterLastNewline.length > 0 ? afterLastNewline : null;
}

/**
 * 判断终端输入数据是否包含回车键（命令提交）
 *
 * @param data 终端输入数据
 * @returns 是否包含回车键
 */
export function isCommandSubmit(data: string): boolean {
  return data.includes("\r") || data.includes("\n");
}
