/**
 * @file terminalFocus 单元测试
 */

import { describe, expect, it } from "vitest";

import { isTerminalFocused } from "./terminalFocus";

describe("terminalFocus", () => {
  it("activeElement 为 null 时返回 false", () => {
    // happy-dom 默认 activeElement 是 body
    expect(isTerminalFocused()).toBe(false);
  });

  it("xterm-helper-textarea 元素获得焦点时返回 true", () => {
    const el = document.createElement("textarea");
    el.classList.add("xterm-helper-textarea");
    document.body.appendChild(el);
    el.focus();
    expect(isTerminalFocused()).toBe(true);
    el.remove();
  });

  it(".thread-terminal-drawer .xterm 内部元素获得焦点时返回 true", () => {
    const drawer = document.createElement("div");
    drawer.classList.add("thread-terminal-drawer");
    const xterm = document.createElement("div");
    xterm.classList.add("xterm");
    const focusable = document.createElement("input");
    xterm.appendChild(focusable);
    drawer.appendChild(xterm);
    document.body.appendChild(drawer);
    focusable.focus();
    expect(isTerminalFocused()).toBe(true);
    drawer.remove();
  });

  it("普通 input 元素获得焦点时返回 false", () => {
    const el = document.createElement("input");
    document.body.appendChild(el);
    el.focus();
    expect(isTerminalFocused()).toBe(false);
    el.remove();
  });
});
