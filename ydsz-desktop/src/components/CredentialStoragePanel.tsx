/**
 * @file CredentialStoragePanel.tsx
 * @description P0-2: 凭证存储模式选择面板
 *
 * 功能：
 * - 展示当前凭证存储模式（session / local-obfuscated / os-keychain）
 * - 切换存储模式，影响后续 API Key 的存储方式
 * - 检测 OS Keychain 是否可用
 * - 显示各模式的安全性说明
 *
 * 集成位置：Settings → Security → Credential Storage
 */

import { memo, useCallback, useEffect, useState } from "react";
import {
  PiKey,
  PiLock,
  PiShieldStar,
  PiHardDrive,
  PiCheckCircle,
  PiWarningCircle,
  PiSpinner,
} from "react-icons/pi";
import { cn } from "~/lib/utils";
import {
  isOsKeychainAvailable,
  setDefaultCredentialStorageMode,
  type CredentialStorageMode,
} from "~/lib/credentialVault";

const STORAGE_MODE_KEY = "ydsz-buddy:credential-storage-mode";

interface ModeOption {
  value: CredentialStorageMode;
  label: string;
  description: string;
  icon: typeof PiKey;
  securityLevel: "low" | "medium" | "high";
  requiresOsKeychain?: boolean;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: "session",
    label: "会话存储（推荐）",
    description: "凭证存在 sessionStorage，关闭应用即清空。适合共享电脑或临时使用。",
    icon: PiKey,
    securityLevel: "medium",
  },
  {
    value: "local-obfuscated",
    label: "本地混淆存储",
    description: "凭证存在 localStorage，XOR + Base64 混淆。长期保留，适合信任的私人电脑。",
    icon: PiHardDrive,
    securityLevel: "low",
  },
  {
    value: "os-keychain",
    label: "OS Keychain（最安全）",
    description: "凭证存入操作系统原生密钥链（Windows Credential Manager / macOS Keychain / Linux Secret Service）。",
    icon: PiShieldStar,
    securityLevel: "high",
    requiresOsKeychain: true,
  },
];

function loadStoredMode(): CredentialStorageMode {
  try {
    const mode = localStorage.getItem(STORAGE_MODE_KEY);
    if (mode === "session" || mode === "local-obfuscated" || mode === "os-keychain") {
      return mode;
    }
  } catch {
    // localStorage 不可用
  }
  return "session";
}

function persistMode(mode: CredentialStorageMode): void {
  try {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  } catch {
    // 静默
  }
  setDefaultCredentialStorageMode(mode);
}

export const CredentialStoragePanel = memo(function CredentialStoragePanel() {
  const [currentMode, setCurrentMode] = useState<CredentialStorageMode>("session");
  const [osKeychainAvailable, setOsKeychainAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  // 初始化：加载已保存的模式 + 检测 OS Keychain 可用性
  useEffect(() => {
    const mode = loadStoredMode();
    setCurrentMode(mode);
    setDefaultCredentialStorageMode(mode);

    setChecking(true);
    void isOsKeychainAvailable()
      .then(setOsKeychainAvailable)
      .catch(() => setOsKeychainAvailable(false))
      .finally(() => setChecking(false));
  }, []);

  const handleSelectMode = useCallback((mode: CredentialStorageMode) => {
    // 如果选择 os-keychain 但不可用，不执行
    if (mode === "os-keychain" && osKeychainAvailable === false) return;

    setCurrentMode(mode);
    persistMode(mode);
  }, [osKeychainAvailable]);

  return (
    <div className="space-y-4" data-testid="credential-storage-panel">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <PiKey className="size-5 text-emerald-500" />
        <h3 className="text-sm font-semibold">凭证存储模式</h3>
        <span className="text-xs text-muted-foreground">
          控制 API Key 的持久化方式和安全级别
        </span>
      </div>

      {/* OS Keychain 状态 */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">OS Keychain 状态：</span>
        {checking ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <PiSpinner className="size-3 animate-spin" />
            检测中...
          </span>
        ) : osKeychainAvailable ? (
          <span className="flex items-center gap-1 text-emerald-600">
            <PiCheckCircle className="size-3" />
            可用
          </span>
        ) : (
          <span className="flex items-center gap-1 text-amber-600">
            <PiWarningCircle className="size-3" />
            不可用（当前环境不支持 OS Keyring）
          </span>
        )}
      </div>

      {/* 模式选择列表 */}
      <div className="space-y-2">
        {MODE_OPTIONS.map((option) => {
          const isSelected = currentMode === option.value;
          const isDisabled = option.requiresOsKeychain && osKeychainAvailable === false;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelectMode(option.value)}
              disabled={isDisabled}
              data-testid={`credential-mode-${option.value}`}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                isSelected
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-border/60 bg-background/40 hover:bg-muted/50",
                isDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              {/* 图标 */}
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md",
                  option.securityLevel === "high" && "bg-emerald-500/10 text-emerald-600",
                  option.securityLevel === "medium" && "bg-sky-500/10 text-sky-600",
                  option.securityLevel === "low" && "bg-amber-500/10 text-amber-600",
                )}
              >
                <option.icon className="size-4" />
              </div>

              {/* 文本 */}
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{option.label}</span>
                  {isSelected && (
                    <PiCheckCircle className="size-3.5 text-emerald-500" />
                  )}
                  {option.securityLevel === "high" && (
                    <span className="flex items-center gap-0.5 rounded bg-emerald-500/10 px-1 text-[10px] text-emerald-600">
                      <PiLock className="size-2.5" />
                      加密
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {option.description}
                </p>
                {isDisabled && (
                  <p className="text-[10px] text-amber-600">
                    当前环境不支持此模式
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 安全提示 */}
      <div className="rounded-md border border-border/40 bg-muted/20 p-2.5">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          <PiShieldStar className="mr-1 inline size-3 align-text-bottom" />
          切换存储模式仅影响后续保存的 API Key。已存储的凭证不会自动迁移，
          如需迁移请重新输入 API Key。OS Keychain 模式下凭证由操作系统加密保护，
          应用关闭后仍可恢复。
        </p>
      </div>
    </div>
  );
});
