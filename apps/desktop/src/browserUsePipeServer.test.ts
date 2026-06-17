// FILE: browserUsePipeServer.test.ts
// Purpose: Guards the desktop browser-use native pipe path helpers.
// Layer: Desktop test
// Depends on: Vitest and browserUsePipeServer path resolution exports

import { basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  REMI_CODE_BROWSER_USE_PIPE_ENV,
  resolveConfiguredBrowserUsePipePath,
  resolveDefaultBrowserUsePipePath,
} from "./browserUsePipeServer";

describe("browser-use pipe path resolution", () => {
  it("creates a discoverable unix socket path under the Codex browser-use directory", () => {
    const pipePath = resolveDefaultBrowserUsePipePath("darwin");

    expect(dirname(pipePath)).toBe(`${tmpdir()}/codex-browser-use`);
    expect(basename(pipePath)).toMatch(/^remi-code-iab-\d+\.sock$/);
  });

  it("prefers an explicit desktop pipe path from the environment", () => {
    expect(
      resolveConfiguredBrowserUsePipePath(
        {
          [REMI_CODE_BROWSER_USE_PIPE_ENV]: "/tmp/codex-browser-use/custom.sock",
        },
        "darwin",
      ),
    ).toBe("/tmp/codex-browser-use/custom.sock");
  });
});
