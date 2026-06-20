/**
 * @file 妗岄潰绔洿鏂伴€昏緫妯″潡
 * @description 灏佽妗岄潰绔簲鐢ㄦ洿鏂扮殑鐘舵€佸垽鏂拰 UI 灞曠ず閫昏緫锛? *              鍖呮嫭鎸夐挳琛屼负瑙ｆ瀽銆佹爣绛?鎻愮ず鏂囨湰鐢熸垚銆丄RM64/Intel 鏋舵瀯璀﹀憡绛夈€? */

import type { DesktopUpdateActionResult, DesktopUpdateState } from "~/contracts";

/** 妗岄潰绔洿鏂版寜閽彲鎵ц鐨勬搷浣滅被鍨?*/
export type DesktopUpdateButtonAction = "check" | "download" | "install" | "none";

/**
 * 鏍规嵁鏇存柊鐘舵€佽В鏋愭寜閽簲鎵ц鐨勬搷浣? * @param state - 妗岄潰绔洿鏂扮姸鎬? * @returns 鎸夐挳鎿嶄綔绫诲瀷
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
 * 鍒ゆ柇鏄惁搴旀樉绀烘闈㈢鏇存柊鎸夐挳
 * 浠呭湪鏈夊彲鎵ц鎿嶄綔鏃舵樉绀猴細鏈夋柊鐗堟湰鍙笅杞姐€佸凡涓嬭浇寰呭畨瑁呫€佹垨鍙噸璇曠殑閿欒
 * @param state - 妗岄潰绔洿鏂扮姸鎬? * @returns 鏄惁鏄剧ず鏇存柊鎸夐挳
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
 * 鍒ゆ柇鏄惁搴旀樉绀?ARM64/Intel 鏋舵瀯涓嶅尮閰嶈鍛? * 褰撲富鏈烘灦鏋勪负 ARM64 浣嗗簲鐢ㄤ负 x64 鏋勫缓鏃讹紙Rosetta 妯″紡锛? * @param state - 妗岄潰绔洿鏂扮姸鎬? * @returns 鏄惁鏄剧ず鏋舵瀯璀﹀憡
 */
export function shouldShowArm64IntelBuildWarning(state: DesktopUpdateState | null): boolean {
  return state?.hostArch === "arm64" && state.appArch === "x64";
}

/**
 * 鍒ゆ柇鏇存柊鎸夐挳鏄惁搴旂鐢紙姝ｅ湪妫€鏌ユ垨涓嬭浇涓級
 * @param state - 妗岄潰绔洿鏂扮姸鎬? * @returns 鏄惁绂佺敤鎸夐挳
 */
export function isDesktopUpdateButtonDisabled(state: DesktopUpdateState | null): boolean {
  return state?.status === "downloading" || state?.status === "checking";
}

/**
 * 鏍煎紡鍖栦笅杞借繘搴︾櫨鍒嗘瘮
 * @param percent - 涓嬭浇杩涘害锛?-100锛? * @returns 鏍煎紡鍖栧悗鐨勭櫨鍒嗘瘮瀛楃涓诧紝鏃犳晥鍊艰繑鍥?null
 */
function formatDesktopUpdateDownloadPercent(percent: number | null): string | null {
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    return null;
  }
  const normalized = Math.max(0, Math.min(100, Math.floor(percent)));
  return `${normalized}%`;
}

/**
 * 鏇存柊鎸夐挳灞曠ず淇℃伅
 * @property label - 鎸夐挳涓绘爣绛? * @property secondaryLabel - 娆¤鏍囩锛堝鐗堟湰鍙凤級
 * @property progressPercent - 涓嬭浇杩涘害鐧惧垎姣? */
export interface DesktopUpdateButtonPresentation {
  label: string;
  secondaryLabel: string | null;
  progressPercent: number | null;
}

/**
 * 鑾峰彇鏇存柊鎸夐挳鐨勫睍绀轰俊鎭紙鏍囩銆佺増鏈彿銆佽繘搴︼級
 * @param state - 妗岄潰绔洿鏂扮姸鎬? * @param options - 鍙€夊弬鏁帮紝installing 琛ㄧず姝ｅ湪瀹夎涓? * @returns 鎸夐挳灞曠ず淇℃伅
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
 * 鑾峰彇鏇存柊鎸夐挳鐨勪富鏍囩鏂囨湰
 * @param state - 妗岄潰绔洿鏂扮姸鎬? * @returns 鎸夐挳鏍囩
 */
export function getDesktopUpdateButtonLabel(state: DesktopUpdateState | null): string {
  return getDesktopUpdateButtonPresentation(state).label;
}

/**
 * 鑾峰彇 ARM64/Intel 鏋舵瀯涓嶅尮閰嶈鍛婄殑鎻忚堪鏂囨湰
 * 鏍规嵁褰撳墠鏇存柊鐘舵€佺粰鍑轰笉鍚岀殑鎿嶄綔寤鸿
 * @param state - 妗岄潰绔洿鏂扮姸鎬? * @returns 璀﹀憡鎻忚堪鏂囨湰
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
 * 鑾峰彇鏇存柊鎸夐挳鐨?Tooltip 鎻愮ず鏂囨湰
 * @param state - 妗岄潰绔洿鏂扮姸鎬? * @param options - 鍙€夊弬鏁帮紝installing 琛ㄧず姝ｅ湪瀹夎涓? * @returns Tooltip 鏂囨湰
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
 * 浠庢洿鏂版搷浣滅粨鏋滀腑鎻愬彇閿欒娑堟伅
 * @param result - 鏇存柊鎿嶄綔缁撴灉
 * @returns 閿欒娑堟伅鏂囨湰锛屾棤閿欒鏃惰繑鍥?null
 */
export function getDesktopUpdateActionError(result: DesktopUpdateActionResult): string | null {
  if (!result.accepted || result.completed) return null;
  if (typeof result.state.message !== "string") return null;
  const message = result.state.message.trim();
  return message.length > 0 ? message : null;
}

/**
 * 鍒ゆ柇鏄惁搴斾互 Toast 鎻愮ず鏇存柊鎿嶄綔缁撴灉
 * 褰撴搷浣滃凡鎺ュ彈浣嗘湭瀹屾垚鏃讹紙鍗冲嚭閿欐椂锛夐渶瑕佹彁绀? * @param result - 鏇存柊鎿嶄綔缁撴灉
 * @returns 鏄惁闇€瑕?Toast 鎻愮ず
 */
export function shouldToastDesktopUpdateActionResult(result: DesktopUpdateActionResult): boolean {
  return result.accepted && !result.completed;
}

/**
 * 鍒ゆ柇鏄惁搴旈珮浜樉绀烘洿鏂伴敊璇紙涓嬭浇鎴栧畨瑁呭け璐ユ椂锛? * @param state - 妗岄潰绔洿鏂扮姸鎬? * @returns 鏄惁楂樹寒閿欒
 */
export function shouldHighlightDesktopUpdateError(state: DesktopUpdateState | null): boolean {
  if (!state || state.status !== "error") return false;
  return state.errorContext === "download" || state.errorContext === "install";
}
