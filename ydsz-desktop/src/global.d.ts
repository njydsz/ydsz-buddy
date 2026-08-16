// FILE: global.d.ts
// Purpose: Declare ambient modules used by the web app when upstream packages omit types.
// Layer: Web type declarations
// Exports: module declarations only

/// <reference types="vitest/globals" />

declare module "@fontsource-variable/jetbrains-mono";

// @vitest/browser/context 模块类型声明
declare module "@vitest/browser/context" {
  export interface Locator {
    click(): Promise<void>;
    fill(text: string): Promise<void>;
  }

  export const page: {
    getByRole(role: string, options?: { name?: string }): Locator;
    getByPlaceholder(placeholder: string): Locator;
    getByText(text: string): Locator;
    getByTestId(testId: string): Locator;
    getByLabelText(label: string): Locator;
    viewport(width: number, height: number): Promise<void>;
  };

  export interface UserEvent {
    setup(): UserEvent;
    click(element: Element): Promise<void>;
    type(element: Element, text: string): Promise<void>;
    clear(element: Element): Promise<void>;
  }

  export const userEvent: UserEvent;
}

// @vitest/browser/matchers 模块 - 扩展 vitest 的 ExpectStatic
declare module "vitest" {
  interface BrowserElementMatchers {
    toBeInTheDocument(): Promise<void>;
    toHaveValue(value: string): Promise<void>;
  }

  interface ExpectStatic {
    element(locator: import("@vitest/browser/context").Locator): BrowserElementMatchers;
    element(element: Element | null | undefined): BrowserElementMatchers;
  }
}

// Tauri 环境检测
interface Window {
  __TAURI__?: Record<string, unknown>;
}

// ESNext Disposable 类型支持（用于 `await using` 语法）
interface SymbolConstructor {
  readonly asyncDispose: unique symbol;
  readonly dispose: unique symbol;
}
