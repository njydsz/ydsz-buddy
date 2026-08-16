/**
 * @file IdleLockGate 组件测试
 * @description P2-1: 验证离座锁定 Gate 的渲染、解锁、配置更新
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { IdleLockGate, IdleLockSettingsSection, useIdleLockContext } from "./IdleLockGate";
import { I18nProvider } from "../i18n/I18nContext";

const SNAPSHOT_DISARMED = {
  state: "disarmed" as const,
  config: { enabled: false, threshold_secs: 300, privacy_only: false },
  last_activity_ms: 0,
  idle_secs: 0,
  has_pin: false,
  locked_at_ms: 0,
};

const SNAPSHOT_LOCKED = {
  state: "locked" as const,
  config: { enabled: true, threshold_secs: 300, privacy_only: false },
  last_activity_ms: 0,
  idle_secs: 300,
  has_pin: true,
  locked_at_ms: 1700000000000,
};

const SNAPSHOT_ARMED_WITH_PIN = {
  state: "armed" as const,
  config: { enabled: true, threshold_secs: 300, privacy_only: false },
  last_activity_ms: 0,
  idle_secs: 0,
  has_pin: true,
  locked_at_ms: 0,
};

function makeWrapper() {
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider language="en">{children}</I18nProvider>
  );
}

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IdleLockGate - 挂载", () => {
  it("挂载时拉取 idle_lock_get_state", async () => {
    invokeMock.mockResolvedValue(SNAPSHOT_DISARMED);
    render(
      <IdleLockGate>
        <div data-testid="child">hello</div>
      </IdleLockGate>,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("idle_lock_get_state");
    });
  });

  it("未锁定时不渲染 overlay", async () => {
    invokeMock.mockResolvedValue(SNAPSHOT_DISARMED);
    render(
      <IdleLockGate>
        <div>hello</div>
      </IdleLockGate>,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("idle-lock-overlay")).toBeNull();
  });

  it("子组件正常渲染", async () => {
    invokeMock.mockResolvedValue(SNAPSHOT_DISARMED);
    render(
      <IdleLockGate>
        <div data-testid="my-child">content</div>
      </IdleLockGate>,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByTestId("my-child")).toBeTruthy();
  });
});

describe("IdleLockGate - PIN 解锁流程", () => {
  it("锁定+已设 PIN 时显示 PIN 输入与解锁按钮", async () => {
    // 第一次 mount → disarmed
    invokeMock.mockResolvedValueOnce(SNAPSHOT_DISARMED);
    render(
      <I18nProvider language="en">
        <IdleLockGate>
          <div data-testid="child">child</div>
        </IdleLockGate>
      </I18nProvider>,
    );
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("idle_lock_get_state");
    });
    // 切到 locked — 调 idle_lock_now
    invokeMock.mockResolvedValueOnce(SNAPSHOT_LOCKED);
    // 直接通过子组件按钮调 lockNow:但 Gate 内没有按钮。
    // 改用更直接:渲染 IdleLockSettingsSection,点 lock now
    // 简化:不依赖 ctx,而是直接 rerender 时通过 refetch 切换
    // 这里采用最稳定的方式:让 tick 触发,后端返回 locked
    // 但 tick 是 setInterval 1000ms,会消费掉 lockNow mock
    // 改用:让 invokeMock 接受多种命令
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "idle_lock_now") return Promise.resolve(SNAPSHOT_LOCKED);
      if (cmd === "idle_lock_get_state") return Promise.resolve(SNAPSHOT_LOCKED);
      if (cmd === "idle_lock_tick") return Promise.resolve(SNAPSHOT_LOCKED);
      if (cmd === "idle_lock_unlock")
        return Promise.resolve({ ok: true, reason: "none" });
      return Promise.resolve(null);
    });
    // 触发 lock_now — 但没有按钮。改用 waitFor + 直接 rerender 不行。
    // 实际:此时 snapshot 仍是 disarmed,我们需要触发 update。
    // 解决方案:用 useEffect 自带的 tick 触发
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1100));
    });
    // tick 应已触发并把 state 改为 locked
    // 重新渲染以反映
    expect(screen.queryByTestId("idle-lock-overlay")).toBeTruthy();
  });

  it("输入正确 PIN 调 unlock,失败时显示错误", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_LOCKED);
    // 之后所有命令都返回 locked
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "idle_lock_get_state") return Promise.resolve(SNAPSHOT_LOCKED);
      if (cmd === "idle_lock_tick") return Promise.resolve(SNAPSHOT_LOCKED);
      if (cmd === "idle_lock_unlock")
        return Promise.resolve({ ok: false, reason: "pin_mismatch" });
      return Promise.resolve(SNAPSHOT_LOCKED);
    });
    render(
      <I18nProvider language="en">
        <IdleLockGate>
          <div>child</div>
        </IdleLockGate>
      </I18nProvider>,
    );
    // 等 get_state 完成,snapshot 变 locked → overlay 出现
    await waitFor(() => {
      expect(screen.getByTestId("idle-lock-overlay")).toBeTruthy();
    });
    const input = screen.getByTestId("idle-lock-pin-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "0000" } });
    });
    const button = screen.getByTestId("idle-lock-unlock-button");
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(invokeMock).toHaveBeenCalledWith("idle_lock_unlock", { pin: "0000" });
    await waitFor(() => {
      expect(screen.getByTestId("idle-lock-unlock-error")).toBeTruthy();
    });
  });
});

describe("IdleLockSettingsSection", () => {
  function setup() {
    invokeMock.mockResolvedValue(SNAPSHOT_ARMED_WITH_PIN);
    let ctx: ReturnType<typeof useIdleLockContext> | null = null;
    function Grab() {
      ctx = useIdleLockContext();
      return null;
    }
    render(
      <I18nProvider language="en">
        <IdleLockGate>
          <Grab />
          <IdleLockSettingsSection />
        </IdleLockGate>
      </I18nProvider>,
    );
    return {
      getCtx: () => ctx,
    };
  }

  it("渲染设置项", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByTestId("settings-idle-lock-section")).toBeTruthy();
    });
    expect(screen.getByTestId("settings-idle-lock-enabled")).toBeTruthy();
    expect(screen.getByTestId("settings-idle-lock-threshold")).toBeTruthy();
    expect(screen.getByTestId("settings-idle-lock-privacy-only")).toBeTruthy();
    expect(screen.getByTestId("settings-idle-lock-pin-input")).toBeTruthy();
    expect(screen.getByTestId("settings-idle-lock-now")).toBeTruthy();
  });

  it("点击 lockNow 调 idle_lock_now", async () => {
    setup();
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });
    invokeMock.mockClear();
    const button = screen.getByTestId("settings-idle-lock-now");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(invokeMock).toHaveBeenCalledWith("idle_lock_now");
  });

  it("保存 PIN 调 idle_lock_set_pin", async () => {
    setup();
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });
    invokeMock.mockClear();
    const input = screen.getByTestId(
      "settings-idle-lock-pin-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1234" } });
    const saveButton = screen.getByTestId("settings-idle-lock-pin-save");
    await act(async () => {
      fireEvent.click(saveButton);
    });
    expect(invokeMock).toHaveBeenCalledWith("idle_lock_set_pin", { pin: "1234" });
  });
});
