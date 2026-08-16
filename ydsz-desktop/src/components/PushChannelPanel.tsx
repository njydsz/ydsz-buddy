/**
 * @file 推送通道配置面板（P1-2: 桌面端推送配置 UI 联调）
 *
 * 提供国内推送通道（极光 JPush / 友盟 Umeng）的凭证输入、连接测试、
 * 配置状态展示。凭证通过 `credentialVault.ts` 持久化到 OS Keyring，
 * 应用启动时再通过 `push_update_credentials` 命令塞回 dispatcher。
 *
 * ## 核心能力
 *
 * 1. **通道选择**：disabled / jpush / umeng（可双选）
 * 2. **凭证输入**：JPush App Key + Master Secret、Umeng App Key + App Master Secret
 * 3. **连接测试**：调用 `push_test_jpush_connection` / `push_test_umeng_connection`
 * 4. **状态展示**：调用 `push_get_config_status` 显示当前配置状态
 * 5. **dry_run 切换**：开关 dry_run 模式（CI / 演示用）
 *
 * ## 凭证持久化策略
 *
 * - 凭证通过 `credentialVault` 存到 OS Keyring（如可用）或 localStorage XOR 混淆
 * - 凭证 ref 约定：`push-jpush-app-key` / `push-jpush-master-secret` /
 *   `push-umeng-app-key` / `push-umeng-app-master-secret`
 * - 应用启动时由 `loadPushCredentialsOnBoot()`（在 __root.tsx 调用）从 vault 加载
 *   并通过 `pushUpdateCredentials()` 塞回 dispatcher
 *
 * @module components/PushChannelPanel
 */

import { memo, useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Zap, Send } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { toastManager } from "./ui/toast";
import { useMessages } from "../i18n";
import {
  pushGetConfigStatus,
  pushTestJpushConnection,
  pushTestUmengConnection,
  pushUpdateCredentials,
  type PushConfigStatus,
  type PushCredentialsInput,
} from "../contracts/push";
import {
  storeCredential,
  getCredential,
  removeCredential,
  type CredentialStorageMode,
} from "../lib/credentialVault";
import { getDefaultCredentialStorageMode } from "../lib/credentialVault";

/** 凭证 ref 约定（与 `loadPushCredentialsOnBoot` 保持一致） */
const PUSH_CRED_REFS = {
  jpushAppKey: "push-jpush-app-key",
  jpushMasterSecret: "push-jpush-master-secret",
  umengAppKey: "push-umeng-app-key",
  umengAppMasterSecret: "push-umeng-app-master-secret",
} as const;

/** 空状态：未拉取到配置时显示 "—" */
const UNKNOWN_STATUS: PushConfigStatus = {
  jpushConfigured: false,
  umengConfigured: false,
  dryRun: false,
};

export const PUSH_CREDENTIAL_REFS = PUSH_CRED_REFS;

/**
 * 应用启动时把 OS Keyring 中的推送凭证塞回 dispatcher
 *
 * 应在 `__root.tsx` 的 onServerWelcome 钩子中调用一次。
 * 失败时静默降级（凭证未持久化时 dispatcher 仍可走 env var 默认值）。
 */
export async function loadPushCredentialsOnBoot(): Promise<void> {
  if (typeof window === "undefined" || !(window as { __TAURI__?: unknown }).__TAURI__) {
    return;
  }
  const jpushAppKey = getCredential(PUSH_CRED_REFS.jpushAppKey);
  const jpushMasterSecret = getCredential(PUSH_CRED_REFS.jpushMasterSecret);
  const umengAppKey = getCredential(PUSH_CRED_REFS.umengAppKey);
  const umengAppMasterSecret = getCredential(PUSH_CRED_REFS.umengAppMasterSecret);
  if (!jpushAppKey && !jpushMasterSecret && !umengAppKey && !umengAppMasterSecret) {
    return; // 没有持久化凭证，跳过
  }
  try {
    await pushUpdateCredentials({
      jpushAppKey: jpushAppKey ?? undefined,
      jpushMasterSecret: jpushMasterSecret ?? undefined,
      umengAppKey: umengAppKey ?? undefined,
      umengAppMasterSecret: umengAppMasterSecret ?? undefined,
    });
  } catch {
    // 启动期失败不抛错，避免阻塞 UI；用户进入设置页时可看到状态
  }
}

/**
 * 推送通道配置面板
 *
 * 显示当前配置状态，允许用户输入/更新凭证，测试连接。
 */
export const PushChannelPanel = memo(function PushChannelPanel() {
  const messages = useMessages();
  const m = messages.settings.push;

  const [status, setStatus] = useState<PushConfigStatus>(UNKNOWN_STATUS);
  const [statusLoading, setStatusLoading] = useState(true);

  // 表单字段（用户输入）
  const [jpushAppKey, setJpushAppKey] = useState("");
  const [jpushMasterSecret, setJpushMasterSecret] = useState("");
  const [umengAppKey, setUmengAppKey] = useState("");
  const [umengAppMasterSecret, setUmengAppMasterSecret] = useState("");

  // 测试中状态
  const [testingJpush, setTestingJpush] = useState(false);
  const [testingUmeng, setTestingUmeng] = useState(false);
  const [saving, setSaving] = useState(false);

  // 是否显示已保存的凭证（默认隐藏，避免肩窥）
  const [revealJpush, setRevealJpush] = useState(false);
  const [revealUmeng, setRevealUmeng] = useState(false);

  // 启动时加载状态 + 已持久化凭证
  useEffect(() => {
    void refreshStatus();
    // 把已持久化的凭证加载到表单（masked 显示）
    setJpushAppKey(getCredential(PUSH_CRED_REFS.jpushAppKey) ?? "");
    setJpushMasterSecret(getCredential(PUSH_CRED_REFS.jpushMasterSecret) ?? "");
    setUmengAppKey(getCredential(PUSH_CRED_REFS.umengAppKey) ?? "");
    setUmengAppMasterSecret(getCredential(PUSH_CRED_REFS.umengAppMasterSecret) ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await pushGetConfigStatus();
      setStatus(s);
    } catch (error) {
      setStatus(UNKNOWN_STATUS);
      toastManager.add({
        type: "error",
        title: m.statusLoadFailed,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setStatusLoading(false);
    }
  }, [m.statusLoadFailed]);

  // 保存凭证：先持久化到 vault，再 push 给 dispatcher
  const handleSave = useCallback(async () => {
    setSaving(true);
    const mode: CredentialStorageMode = getDefaultCredentialStorageMode();
    try {
      // 持久化到 vault（空字符串会作为 "" 写入，加载时也会读到 ""，等价于"清空"）
      if (jpushAppKey) storeCredential(PUSH_CRED_REFS.jpushAppKey, jpushAppKey, mode);
      else removeCredential(PUSH_CRED_REFS.jpushAppKey);
      if (jpushMasterSecret) storeCredential(PUSH_CRED_REFS.jpushMasterSecret, jpushMasterSecret, mode);
      else removeCredential(PUSH_CRED_REFS.jpushMasterSecret);
      if (umengAppKey) storeCredential(PUSH_CRED_REFS.umengAppKey, umengAppKey, mode);
      else removeCredential(PUSH_CRED_REFS.umengAppKey);
      if (umengAppMasterSecret) storeCredential(PUSH_CRED_REFS.umengAppMasterSecret, umengAppMasterSecret, mode);
      else removeCredential(PUSH_CRED_REFS.umengAppMasterSecret);

      // 推送给 dispatcher（用 "" 触发"清空"，undefined 表示不变）
      const input: PushCredentialsInput = {
        jpushAppKey: jpushAppKey === "" ? "" : jpushAppKey || undefined,
        jpushMasterSecret: jpushMasterSecret === "" ? "" : jpushMasterSecret || undefined,
        umengAppKey: umengAppKey === "" ? "" : umengAppKey || undefined,
        umengAppMasterSecret: umengAppMasterSecret === "" ? "" : umengAppMasterSecret || undefined,
      };
      const newStatus = await pushUpdateCredentials(input);
      setStatus(newStatus);
      toastManager.add({
        type: "success",
        title: m.saveSuccess,
        timeout: 3000,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: m.saveFailed,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }, [jpushAppKey, jpushMasterSecret, umengAppKey, umengAppMasterSecret, m.saveSuccess, m.saveFailed]);

  // 切换 dry_run
  const handleToggleDryRun = useCallback(
    async (next: boolean) => {
      try {
        const newStatus = await pushUpdateCredentials({ dryRun: next });
        setStatus(newStatus);
        toastManager.add({
          type: "info",
          title: next ? m.dryRunEnabled : m.dryRunDisabled,
          timeout: 2000,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: m.saveFailed,
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [m.dryRunEnabled, m.dryRunDisabled, m.saveFailed],
  );

  const handleTestJpush = useCallback(async () => {
    setTestingJpush(true);
    try {
      await pushTestJpushConnection();
      toastManager.add({
        type: "success",
        title: m.jpushTestSuccess,
        timeout: 3000,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: m.jpushTestFailed,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTestingJpush(false);
    }
  }, [m.jpushTestSuccess, m.jpushTestFailed]);

  const handleTestUmeng = useCallback(async () => {
    setTestingUmeng(true);
    try {
      await pushTestUmengConnection();
      toastManager.add({
        type: "success",
        title: m.umengTestSuccess,
        timeout: 3000,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: m.umengTestFailed,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTestingUmeng(false);
    }
  }, [m.umengTestSuccess, m.umengTestFailed]);

  return (
    <div className="space-y-6" data-testid="push-channel-panel">
      {/* ===== 状态总览 ===== */}
      <section
        className="rounded-lg border border-border/60 bg-background p-4"
        data-testid="push-status-overview"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">{m.statusHeading}</h3>
            <p className="text-xs text-muted-foreground">{m.statusDescription}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void refreshStatus()}
            disabled={statusLoading}
            aria-label={m.refresh}
          >
            {statusLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <StatusPill
            label={m.jpushStatus}
            configured={status.jpushConfigured}
          />
          <StatusPill
            label={m.umengStatus}
            configured={status.umengConfigured}
          />
          <DryRunPill enabled={status.dryRun} label={m.dryRunStatus} onLabel={m.dryRunOn} offLabel={m.dryRunOff} />
        </div>
        {status.dryRun ? (
          <p className="mt-3 text-[11px] text-warning">{m.dryRunHint}</p>
        ) : null}
      </section>

      {/* ===== JPush 凭证 ===== */}
      <section
        className="rounded-lg border border-border/60 bg-background p-4"
        data-testid="push-jpush-section"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-amber-500" />
            <h3 className="text-sm font-medium">{m.jpushSection}</h3>
            {status.jpushConfigured ? (
              <Badge variant="success" className="ml-2">
                <ShieldCheck className="mr-1 size-3" />
                {m.configured}
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-2">
                <ShieldAlert className="mr-1 size-3" />
                {m.notConfigured}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleTestJpush()}
            disabled={testingJpush || !status.jpushConfigured}
            aria-label={m.testJpush}
          >
            {testingJpush ? (
              <Loader2 className="mr-1 size-3 animate-spin" />
            ) : null}
            {m.testJpush}
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          <LabeledInput
            label={m.jpushAppKey}
            value={jpushAppKey}
            onChange={setJpushAppKey}
            placeholder="JIGUANG_APP_KEY"
            reveal={revealJpush}
            onToggleReveal={() => setRevealJpush((v) => !v)}
          />
          <LabeledInput
            label={m.jpushMasterSecret}
            value={jpushMasterSecret}
            onChange={setJpushMasterSecret}
            placeholder="JIGUANG_MASTER_SECRET"
            reveal={revealJpush}
            onToggleReveal={() => setRevealJpush((v) => !v)}
          />
        </div>
        <button
          type="button"
          onClick={() => setRevealJpush((v) => !v)}
          className="mt-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {revealJpush ? m.hideSecret : m.revealSecret}
        </button>
      </section>

      {/* ===== Umeng 凭证 ===== */}
      <section
        className="rounded-lg border border-border/60 bg-background p-4"
        data-testid="push-umeng-section"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Send className="size-4 text-blue-500" />
            <h3 className="text-sm font-medium">{m.umengSection}</h3>
            {status.umengConfigured ? (
              <Badge variant="success" className="ml-2">
                <ShieldCheck className="mr-1 size-3" />
                {m.configured}
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-2">
                <ShieldAlert className="mr-1 size-3" />
                {m.notConfigured}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleTestUmeng()}
            disabled={testingUmeng || !status.umengConfigured}
            aria-label={m.testUmeng}
          >
            {testingUmeng ? (
              <Loader2 className="mr-1 size-3 animate-spin" />
            ) : null}
            {m.testUmeng}
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          <LabeledInput
            label={m.umengAppKey}
            value={umengAppKey}
            onChange={setUmengAppKey}
            placeholder="UMENG_APP_KEY"
            reveal={revealUmeng}
            onToggleReveal={() => setRevealUmeng((v) => !v)}
          />
          <LabeledInput
            label={m.umengAppMasterSecret}
            value={umengAppMasterSecret}
            onChange={setUmengAppMasterSecret}
            placeholder="UMENG_APP_MASTER_SECRET"
            reveal={revealUmeng}
            onToggleReveal={() => setRevealUmeng((v) => !v)}
          />
        </div>
        <button
          type="button"
          onClick={() => setRevealUmeng((v) => !v)}
          className="mt-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {revealUmeng ? m.hideSecret : m.revealSecret}
        </button>
      </section>

      {/* ===== dry_run 切换 ===== */}
      <section
        className="flex items-center justify-between rounded-lg border border-border/60 bg-background p-4"
        data-testid="push-dry-run-section"
      >
        <div className="space-y-1 pr-4">
          <h3 className="text-sm font-medium">{m.dryRunToggle}</h3>
          <p className="text-xs text-muted-foreground">{m.dryRunToggleDescription}</p>
        </div>
        <Switch
          checked={status.dryRun}
          onCheckedChange={(v) => void handleToggleDryRun(v)}
          aria-label={m.dryRunToggle}
        />
      </section>

      {/* ===== 保存按钮 ===== */}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          aria-label={m.save}
        >
          {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
          {m.save}
        </Button>
      </div>
    </div>
  );
});

// =============================================================================
// 子组件
// =============================================================================

function StatusPill({
  label,
  configured,
}: {
  label: string;
  configured: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
      {configured ? (
        <ShieldCheck className="size-4 text-success" />
      ) : (
        <ShieldAlert className="size-4 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">
          {configured ? "ready" : "—"}
        </div>
      </div>
    </div>
  );
}

function DryRunPill({
  enabled,
  label,
  onLabel,
  offLabel,
}: {
  enabled: boolean;
  label: string;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
      {enabled ? (
        <ShieldAlert className="size-4 text-warning" />
      ) : (
        <ShieldCheck className="size-4 text-success" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">
          {enabled ? onLabel : offLabel}
        </div>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  reveal,
  onToggleReveal,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  reveal: boolean;
  onToggleReveal: () => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        type={reveal ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={onToggleReveal}
        className="text-[10px] text-muted-foreground hover:text-foreground"
      >
        {reveal ? "hide" : "reveal"}
      </button>
    </label>
  );
}
