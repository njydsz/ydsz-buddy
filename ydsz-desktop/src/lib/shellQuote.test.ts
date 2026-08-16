/**
 * @file shellQuote 工具测试
 *
 * 验证 POSIX Shell 参数引用工具的正确性，包括安全字符、
 * 空字符串、内嵌单引号和特殊字符的处理。
 */

import { quotePosixShellArgument } from "./shellQuote";

describe("quotePosixShellArgument", () => {
  it("empty string returns two single quotes", () => {
    expect(quotePosixShellArgument("")).toBe("''");
  });

  it("safe alphanumerics are returned unchanged", () => {
    expect(quotePosixShellArgument("hello123")).toBe("hello123");
  });

  it("safe path-like values are returned unchanged", () => {
    expect(quotePosixShellArgument("./some/path/file.txt")).toBe("./some/path/file.txt");
  });

  it("special characters are wrapped in single quotes", () => {
    expect(quotePosixShellArgument("hello world")).toBe("'hello world'");
  });

  it("embedded single quote is escaped via the standard sequence", () => {
    // 输入: it's  → 期望: 'it'\\''s'
    expect(quotePosixShellArgument("it's")).toBe("'it'\\''s'");
  });

  it("values starting with dash are quoted (not safe token)", () => {
    expect(quotePosixShellArgument("-rf")).toBe("'-rf'");
  });

  it("value with only an embedded single quote still gets wrapped", () => {
    expect(quotePosixShellArgument("'")).toBe("''\\'''");
  });
});
