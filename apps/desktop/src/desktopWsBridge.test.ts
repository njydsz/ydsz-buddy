// FILE: desktopWsBridge.test.ts
// Purpose: Verifies desktop WebSocket URL resolution and normalization.

import { describe, expect, it } from "vitest";

import { normalizeDesktopWsUrl, resolveDesktopWsUrlFromEnv } from "./desktopWsBridge";

describe("desktopWsBridge", () => {
  it("normalizes non-empty WebSocket URL strings", () => {
    expect(normalizeDesktopWsUrl(" ws://127.0.0.1:1234/?token=test ")).toBe(
      "ws://127.0.0.1:1234/?token=test",
    );
  });

  it("rejects empty or non-string values", () => {
    expect(normalizeDesktopWsUrl("   ")).toBeNull();
    expect(normalizeDesktopWsUrl(null)).toBeNull();
  });

  it("resolves WebSocket URL from REMI_CODE_DESKTOP_WS_URL", () => {
    expect(
      resolveDesktopWsUrlFromEnv({
        REMI_CODE_DESKTOP_WS_URL: "ws://127.0.0.1:5000/?token=dp",
      } as NodeJS.ProcessEnv),
    ).toBe("ws://127.0.0.1:5000/?token=dp");
  });

  it("returns null when REMI_CODE_DESKTOP_WS_URL is not set", () => {
    expect(resolveDesktopWsUrlFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });
});
