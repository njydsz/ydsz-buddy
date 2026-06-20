/**
 * @file 桌面端更新逻辑模块
 * @description 封装桌面端应用更新的状态判断和 UI 展示逻辑，
 *              包括按钮行为解析、标签/提示文本生成、ARM64/Intel 架构警告等。
 */

import type { DesktopUpdateActionResult, DesktopUpdateState } from "@remi-code/contracts";

/** 桌面端更新按钮可执行的操作类型 */
export type DesktopUpdateButtonAction = "check" | "download" | "install" | "none";

/**
 * 根据更新状态解析按钮应执行的操作
 * @param state - 桌面端更新状态
 * @returns 按钮操作类型
 */
export function resolveDesktopUpdateButtonAction(
  state: DesktopUpdateState,
): DesktopUpdateButtonAction {
  if (
    state.status === "idle" ||
    state.status === "checking" ||
    state.status === "up-to-date" ||
    (state.status === "error" && state.errorContext === "check")
  ) {
    return "check";
  }
  if (state.status === "available") {
    return "download";
  }
  if (state.status === "downloaded") {
    return "install";
  }
  if (state.status === "error") {
    if (state.errorContext === "install" && state.downloadedVersion) {
      return "install";
    }
    if (state.errorContext === "download" && state.availableVersion) {
      return "download";
    }
  }
  return "none";
}

/**
 * 判断是否应显示桌面端更新按钮
 * 仅在有可执行操作时显示：有新版本可下载、已下载待安装、或可重试的错误
 * @param state - 桌面端更新状态
 * @returns 是否显示更新按钮
 */
export function shouldShowDesktopUpdateButton(state: DesktopUpdateState | null): boolean {
  if (!state?.enabled) return false;
  // Only show the button when there's actually something to do:
  // a new version to download, a downloaded update to install, or a retryable error
  return (
    state.status === "checking" ||
    state.status === "available" ||
    state.status === "downloading" ||
    state.status === "downloaded" ||
    (state.status === "error" && state.errorContext !== "check")
  );
}

/**
 * 判断是否应显示 ARM64/Intel 架构不匹配警告
 * 当主机架构为 ARM64 但应用为 x64 构建时（Rosetta 模式）
 * @param state - 桌面端更新状态
 * @returns 是否显示架构警告
 */
export function shouldShowArm64IntelBuildWarning(state: DesktopUpdateState | null): boolean {
  return state?.hostArch === "arm64" && state.appArch === "x64";
}

/**
 * 判断更新按钮是否应禁用（正在检查或下载中）
 * @param state - 桌面端更新状态
 * @returns 是否禁用按钮
 */
export function isDesktopUpdateButtonDisabled(state: DesktopUpdateState | null): boolean {
  return state?.status === "downloading" || state?.status === "checking";
}

/**
 * 格式化下载进度百分比
 * @param percent - 下载进度（0-100）
 * @returns 格式化后的百分比字符串，无效值返回 null
 */
function formatDesktopUpdateDownloadPercent(percent: number | null): string | null {
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    return null;
  }
  const normalized = Math.max(0, Math.min(100, Math.floor(percent)));
  return `${normalized}%`;
}

/**
 * 更新按钮展示信息
 * @property label - 按钮主标签
 * @property secondaryLabel - 次要标签（如版本号）
 * @property progressPercent - 下载进度百分比
 */
export interface DesktopUpdateButtonPresentation {
  label: string;
  secondaryLabel: string | null;
  progressPercent: number | null;
}

/**
 * 获取更新按钮的展示信息（标签、版本号、进度）
 * @param state - 桌面端更新状态
 * @param options - 可选参数，installing 表示正在安装中
 * @returns 按钮展示信息
 */
export function getDesktopUpdateButtonPresentation(
  state: DesktopUpdateState | null,
  options?: { installing?: boolean },
): DesktopUpdateButtonPresentation {
  if (options?.installing) {
    return {
      label: "Updating...",
      secondaryLabel: null,
      progressPercent: null,
    };
  }

  if (!state) {
    return {
      label: "Update",
      secondaryLabel: null,
      progressPercent: null,
    };
  }

  if (state.status === "checking") {
    return {
      label: "Checking...",
      secondaryLabel: null,
      progressPercent: null,
    };
  }

  if (state.status === "downloading") {
    const percentText = formatDesktopUpdateDownloadPercent(state.downloadPercent);
    return {
      label: "Downloading...",
      secondaryLabel: state.availableVersion ?? null,
      progressPercent: percentText ? Number.parseInt(percentText, 10) : null,
    };
  }

  const action = resolveDesktopUpdateButtonAction(state);
  if (action === "download") {
    if (state.status === "error" && state.errorContext === "download") {
      return {
        label: "Download failed",
        secondaryLabel: state.availableVersion ?? null,
        progressPercent: null,
      };
    }
    return {
      label: "Update available",
      secondaryLabel: state.availableVersion ?? null,
      progressPercent: null,
    };
  }
  if (action === "install") {
    if (state.status === "error" && state.errorContext === "install") {
      return {
        label: "Install failed",
        secondaryLabel: state.downloadedVersion ?? state.availableVersion ?? null,
        progressPercent: null,
      };
    }
    return {
      label: "Ready to update",
      secondaryLabel: state.downloadedVersion ?? state.availableVersion ?? null,
      progressPercent: null,
    };
  }
  if (action === "check") {
    return {
      label: "Check updates",
      secondaryLabel: null,
      progressPercent: null,
    };
  }
  return {
    label: "Update",
    secondaryLabel: null,
    progressPercent: null,
  };
}

/**
 * 获取更新按钮的主标签文本
 * @param state - 桌面端更新状态
 * @returns 按钮标签
 */
export function getDesktopUpdateButtonLabel(state: DesktopUpdateState | null): string {
  return getDesktopUpdateButtonPresentation(state).label;
}

/**
 * 获取 ARM64/Intel 架构不匹配警告的描述文本
 * 根据当前更新状态给出不同的操作建议
 * @param state - 桌面端更新状态
 * @returns 警告描述文本
 */
export function getArm64IntelBuildWarningDescription(state: DesktopUpdateState): string {
  if (!shouldShowArm64IntelBuildWarning(state)) {
    return "This install is using the correct architecture.";
  }

  const action = resolveDesktopUpdateButtonAction(state);
  if (action === "download") {
    return "This Mac has Apple Silicon, but Remi Code is still running the Intel build under Rosetta. Download the available update to switch to the native Apple Silicon build.";
  }
  if (action === "install") {
    return "This Mac has Apple Silicon, but Remi Code is still running the Intel build under Rosetta. Restart to install the downloaded Apple Silicon build.";
  }
  return "This Mac has Apple Silicon, but Remi Code is still running the Intel build under Rosetta. The next app update will replace it with the native Apple Silicon build.";
}

/**
 * 获取更新按钮的 Tooltip 提示文本
 * @param state - 桌面端更新状态
 * @param options - 可选参数，installing 表示正在安装中
 * @returns Tooltip 文本
 */
export function getDesktopUpdateButtonTooltip(
  state: DesktopUpdateState,
  options?: { installing?: boolean },
): string {
  if (options?.installing) {
    return "Applying update...";
  }
  if (state.status === "idle") {
    return "Check for updates";
  }
  if (state.status === "checking") {
    return "Checking for updates...";
  }
  if (state.status === "up-to-date") {
    return `You're up to date on ${state.currentVersion}. Click to check again.`;
  }
  if (state.status === "available") {
    return `Update ${state.availableVersion ?? "available"} ready to download`;
  }
  if (state.status === "downloading") {
    const progress =
      typeof state.downloadPercent === "number" ? ` (${Math.floor(state.downloadPercent)}%)` : "";
    return `Downloading update${progress}`;
  }
  if (state.status === "downloaded") {
    return `Update ${state.downloadedVersion ?? state.availableVersion ?? "ready"} downloaded. Click to restart and install.`;
  }
  if (state.status === "error") {
    if (state.errorContext === "check") {
      return state.message
        ? `${state.message}. Click to check again.`
        : "Update check failed. Click to try again.";
    }
    if (state.errorContext === "download" && state.availableVersion) {
      return `Download failed for ${state.availableVersion}. Click to retry.`;
    }
    if (state.errorContext === "install" && state.downloadedVersion) {
      return `Install failed for ${state.downloadedVersion}. Click to retry.`;
    }
    return state.message ?? "Update failed";
  }
  return "Update available";
}

/**
 * 从更新操作结果中提取错误消息
 * @param result - 更新操作结果
 * @returns 错误消息文本，无错误时返回 null
 */
export function getDesktopUpdateActionError(result: DesktopUpdateActionResult): string | null {
  if (!result.accepted || result.completed) return null;
  if (typeof result.state.message !== "string") return null;
  const message = result.state.message.trim();
  return message.length > 0 ? message : null;
}

/**
 * 判断是否应以 Toast 提示更新操作结果
 * 当操作已接受但未完成时（即出错时）需要提示
 * @param result - 更新操作结果
 * @returns 是否需要 Toast 提示
 */
export function shouldToastDesktopUpdateActionResult(result: DesktopUpdateActionResult): boolean {
  return result.accepted && !result.completed;
}

/**
 * 判断是否应高亮显示更新错误（下载或安装失败时）
 * @param state - 桌面端更新状态
 * @returns 是否高亮错误
 */
export function shouldHighlightDesktopUpdateError(state: DesktopUpdateState | null): boolean {
  if (!state || state.status !== "error") return false;
  return state.errorContext === "download" || state.errorContext === "install";
}
