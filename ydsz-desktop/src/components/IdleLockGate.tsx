/**
 * @file IdleLockGate
 * @description 离座锁定 / 隐私屏（P2-1）顶层组件
 *
 * 挂在 App 根节点之下,负责:
 *
 * 1. 启动 `useIdleLock` 与后端 `IdleLockState` 通信,每 1s tick 评估是否锁定
 * 2. 通过 `useIdleDetector` 监听鼠标/键盘活动,throttle 转发到后端
 * 3. 当后端返回 `state === "locked"` 时,渲染全屏 `PrivacyOverlay` 模糊屏幕
 * 4. PrivacyOverlay 内置 PIN 输入与解锁按钮(`privacyOnly` 模式可不解 PIN 退出)
 * 5. 提供 `useIdleLockContext`,让任意子组件能拿到当前快照 / 调用 arm/disarm/lockNow
 *
 * ## 与 E2E 配合
 *
 * 所有交互元素都带 `data-testid`:
 * - `idle-lock-overlay` 隐私屏主容器
 * - `idle-lock-pin-input` PIN 输入框
 * - `idle-lock-unlock-button` 解锁按钮
 * - `idle-lock-unlock-error` 解锁错误提示
 * - `idle-lock-overlay-title` 锁定标题
 * - `idle-lock-dismiss-button` privacy-only 模式下的"直接关闭"按钮
 *
 * ## a11y
 *
 * - overlay 出现时把焦点移入 PIN 输入框(如果启用 PIN)
 * - PIN 输入用 `type=password` 隐藏字符
 * - 解锁错误通过 `aria-live="polite"` 播报
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type ReactNode,
} from "react";
import { useTranslation } from "~/i18n";
import { useIdleLock, type IdleLockConfig, type UseIdleLockResult } from "~/hooks/useIdleLock";
import { useIdleDetector } from "~/hooks/useIdleDetector";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

/** Context:暴露给子组件的 hook 接口 */
const IdleLockContext = createContext<UseIdleLockResult | null>(null);

/** 获取 IdleLock 实例(子组件可读快照 / 调用命令) */
export function useIdleLockContext(): UseIdleLockResult {
  const ctx = useContext(IdleLockContext);
  if (!ctx) {
    throw new Error("useIdleLockContext must be used inside <IdleLockGate>");
  }
  return ctx;
}

export interface IdleLockGateProps {
  children: ReactNode;
  /** 完全禁用(测试 / 单元测试场景) */
  disabled?: boolean;
}

/**
 * 顶层 Gate 组件 — 应当在 App 根节点挂载一次
 *
 * 性能优化:children 用 memo 包装,防止 useIdleLock 的 1s tick
 * 导致整棵子树重渲染。IdleLockGate 自身可能重渲染(因 tick 返回新快照),
 * 但 children 的 props 不变时不会重渲染。
 */
const MemoizedChildren = memo(({ children }: { children: ReactNode }) => {
  return <>{children}</>;
});

export function IdleLockGate({ children, disabled = false }: IdleLockGateProps) {
  // disabled 时关闭 tick，避免 idle_lock_tick 同步命令每秒在 Tauri 主线程执行，
  // 累积 COM marshaling 开销最终导致 Windows 消息泵阻塞、窗口"未响应"。
  const idle = useIdleLock({ disableTick: disabled });

  // 用 ref 保存最新的 recordActivity,避免 handleActivity 因 idle 对象变化而重建,
  // 进而避免 useIdleDetector 每次都重注册事件监听器。
  const recordActivityRef = useRef(idle.recordActivity);
  recordActivityRef.current = idle.recordActivity;

  const handleActivity = useCallback(() => {
    recordActivityRef.current();
  }, []);

  useIdleDetector({ onActivity: handleActivity, paused: disabled });

  const value = useMemo<UseIdleLockResult>(
    () => ({
      ...idle,
    }),
    [idle],
  );

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <IdleLockContext.Provider value={value}>
      <MemoizedChildren>{children}</MemoizedChildren>
      <PrivacyOverlay />
    </IdleLockContext.Provider>
  );
}

/**
 * 隐私屏覆盖层 — 当 isLocked 时全屏模糊,要求输入 PIN
 */
function PrivacyOverlay() {
  const { messages } = useTranslation();
  const idle = useIdleLockContext();
  const t = messages.settings.advanced.idleLock;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const isLocked = idle.isLocked;
  const privacyOnly = idle.snapshot?.config?.privacy_only ?? false;
  const hasPin = idle.hasPin;

  // 锁定时把焦点自动移入 PIN 输入框
  useEffect(() => {
    if (!isLocked) {
      setPin("");
      setErrorKey(null);
      return;
    }
    // privacy-only 模式或者没有 PIN 时不自动 focus
    if (privacyOnly || !hasPin) {
      return;
    }
    const handle = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(handle);
  }, [isLocked, privacyOnly, idle.hasPin]);

  const handleUnlock = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorKey(null);
    try {
      // privacy-only 模式或者没设 PIN → 直接调用 setConfig 不能解锁;
      // 真正解锁必须通过 unlock,即便 PIN 为空也要后端确认(后端会返回 pin_not_set)
      const result = await idle.unlock(pin);
      if (result.ok) {
        setPin("");
        setErrorKey(null);
      } else {
        setErrorKey(result.reason);
      }
    } finally {
      setSubmitting(false);
    }
  }, [idle, pin, submitting]);

  // privacy-only 模式:即使没设 PIN 也允许"轻点解锁"
  // 这里用一个临时解锁方式:把 config 改一下再 disarm 即可
  // 简化实现:直接 disarm(会让 config.enabled=false),这是用户主动行为
  const handleDismiss = useCallback(async () => {
    await idle.disarm();
  }, [idle]);

  if (!isLocked) return null;

  // 把错误 reason 映射到 i18n key
  const errorText = (() => {
    if (!errorKey) return null;
    switch (errorKey) {
      case "pin_mismatch":
        return t.lockedOverlayUnlockErrorMismatch;
      case "pin_not_set":
        return t.lockedOverlayUnlockErrorPinNotSet;
      case "not_locked":
        return t.lockedOverlayUnlockErrorNotLocked;
      default:
        return t.lockedOverlayUnlockErrorUnknown;
    }
  })();

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-xl"
      data-testid="idle-lock-overlay"
      data-state={idle.state}
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-lock-overlay-title"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-xl border border-border bg-card/80 p-8 text-center shadow-2xl">
        {/* 锁定图标(用文字 + emoji 风格简化,实际项目可换成 Icons.tsx 里的锁图标) */}
        <div className="flex size-14 items-center justify-center rounded-full bg-muted text-2xl">
          <span aria-hidden="true">{"\u{1F512}"}</span>
        </div>

        <div className="space-y-2">
          <h2
            id="idle-lock-overlay-title"
            className="text-lg font-semibold text-foreground"
            data-testid="idle-lock-overlay-title"
          >
            {t.lockedOverlayTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{t.lockedOverlaySubtitle}</p>
        </div>

        {/* PIN 输入(privacyOnly 模式下不展示) */}
        {!privacyOnly && hasPin && (
          <form
            className="flex w-full flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleUnlock();
            }}
          >
            <Input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              placeholder={t.lockedOverlayPinPlaceholder}
              onChange={(e) => setPin(e.currentTarget.value)}
              disabled={submitting}
              data-testid="idle-lock-pin-input"
              aria-label={t.lockedOverlayPinPlaceholder}
              aria-invalid={errorKey ? "true" : "false"}
              className="text-center tracking-widest"
            />
            <Button
              type="submit"
              variant="default"
              size="lg"
              disabled={submitting || pin.length === 0}
              data-testid="idle-lock-unlock-button"
            >
              {t.lockedOverlayUnlockButton}
            </Button>
          </form>
        )}

        {/* privacy-only 模式或者没设 PIN */}
        {(privacyOnly || !hasPin) && (
          <Button
            variant="default"
            size="lg"
            onClick={() => void handleDismiss()}
            data-testid="idle-lock-dismiss-button"
          >
            {t.lockedOverlayUnlockButton}
          </Button>
        )}

        {/* 错误提示 */}
        {errorText && (
          <p
            className="text-xs text-destructive"
            data-testid="idle-lock-unlock-error"
            role="alert"
            aria-live="polite"
          >
            {errorText}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 设置页用配置组件
 */
export interface IdleLockSettingsSectionProps {
  /** 受控 value,留空则内部自管 */
  config?: IdleLockConfig;
  onChange?: (config: IdleLockConfig) => void;
}

export function IdleLockSettingsSection(props: IdleLockSettingsSectionProps) {
  const { messages } = useTranslation();
  const t = messages.settings.advanced.idleLock;
  const idle = useIdleLockContext();

  const current = idle.snapshot?.config ?? {
    enabled: false,
    threshold_secs: 300,
    privacy_only: false,
  };
  const hasPin = idle.hasPin;

  // 内部 PIN 输入(受控,提交时调用 setPin)
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const update = useCallback(
    async (patch: Partial<IdleLockConfig>) => {
      const next: IdleLockConfig = { ...current, ...patch };
      const updated = await idle.setConfig(next);
      props.onChange?.(updated.config);
    },
    [current, idle, props],
  );

  const handleSavePin = useCallback(async () => {
    setPinError(null);
    if (pinInput.length > 0 && (pinInput.length < 4 || pinInput.length > 32)) {
      setPinError(t.pinMinHint);
      return;
    }
    try {
      await idle.setPin(pinInput);
      setPinInput("");
    } catch (err) {
      setPinError(err instanceof Error ? err.message : String(err));
    }
  }, [pinInput, idle, t.pinMinHint]);

  const handleClearPin = useCallback(async () => {
    setPinError(null);
    await idle.setPin("");
  }, [idle]);

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="settings-idle-lock-section"
      aria-labelledby="idle-lock-heading"
    >
      <header className="space-y-1">
        <h3
          id="idle-lock-heading"
          className="text-sm font-semibold text-foreground"
        >
          {t.heading}
        </h3>
        <p className="text-xs text-muted-foreground">{t.description}</p>
      </header>

      {/* 启用开关 */}
      <label
        className="flex items-start gap-3"
        data-testid="settings-idle-lock-enabled-row"
      >
        <input
          type="checkbox"
          checked={current.enabled}
          onChange={(e) => {
            const enabled = e.currentTarget.checked;
            void (enabled ? idle.arm() : idle.disarm());
            void update({ enabled });
          }}
          className="mt-0.5"
          data-testid="settings-idle-lock-enabled"
        />
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {t.enabledLabel}
          </span>
          <span className="text-xs text-muted-foreground">
            {t.enabledDescription}
          </span>
        </span>
      </label>

      {/* 阈值 */}
      <label
        className="flex flex-col gap-1"
        data-testid="settings-idle-lock-threshold-row"
      >
        <span className="text-sm font-medium text-foreground">
          {t.thresholdLabel}
        </span>
        <span className="text-xs text-muted-foreground">
          {t.thresholdDescription(current.threshold_secs)}
        </span>
        <input
          type="range"
          min={30}
          max={3600}
          step={30}
          value={current.threshold_secs}
          onChange={(e) => void update({ threshold_secs: Number(e.currentTarget.value) })}
          className="mt-2"
          data-testid="settings-idle-lock-threshold"
          aria-label={t.thresholdLabel}
        />
      </label>

      {/* privacy only */}
      <label
        className="flex items-start gap-3"
        data-testid="settings-idle-lock-privacy-only-row"
      >
        <input
          type="checkbox"
          checked={current.privacy_only}
          onChange={(e) => void update({ privacy_only: e.currentTarget.checked })}
          className="mt-0.5"
          data-testid="settings-idle-lock-privacy-only"
        />
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {t.privacyOnlyLabel}
          </span>
          <span className="text-xs text-muted-foreground">
            {t.privacyOnlyDescription}
          </span>
        </span>
      </label>

      {/* PIN */}
      <div
        className="flex flex-col gap-2"
        data-testid="settings-idle-lock-pin-row"
      >
        <label
          htmlFor="idle-lock-pin"
          className="text-sm font-medium text-foreground"
        >
          {t.pinLabel}
        </label>
        <span className="text-xs text-muted-foreground">{t.pinDescription}</span>
        <div className="flex items-center gap-2">
          <Input
            id="idle-lock-pin"
            type="password"
            value={pinInput}
            placeholder={t.pinPlaceholder}
            onChange={(e) => setPinInput(e.currentTarget.value)}
            data-testid="settings-idle-lock-pin-input"
            className="flex-1"
          />
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => void handleSavePin()}
            data-testid="settings-idle-lock-pin-save"
            disabled={pinInput.length === 0}
          >
            {t.setPinButton}
          </Button>
        </div>
        {hasPin ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void handleClearPin()}
            data-testid="settings-idle-lock-pin-clear"
          >
            {t.clearPinButton}
          </Button>
        ) : (
          <span
            className="text-xs text-muted-foreground"
            data-testid="settings-idle-lock-pin-missing"
          >
            {t.pinMissing}
          </span>
        )}
        {pinError && (
          <p
            className="text-xs text-destructive"
            data-testid="settings-idle-lock-pin-error"
            role="alert"
          >
            {pinError}
          </p>
        )}
      </div>

      {/* 状态 + 立即锁定 */}
      <div
        className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-xs"
        data-testid="settings-idle-lock-status"
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{t.statusLabel}</span>
          <span className="text-muted-foreground" data-testid="settings-idle-lock-state">
            {idle.state === "armed"
              ? t.statusArmed
              : idle.state === "locked"
                ? t.statusLocked
                : t.statusDisarmed}
          </span>
          <span className="text-muted-foreground">
            {t.idleSecondsLabel(idle.idleSeconds)}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void idle.lockNow()}
          data-testid="settings-idle-lock-now"
        >
          {t.lockNowButton}
        </Button>
      </div>
    </section>
  );
}
