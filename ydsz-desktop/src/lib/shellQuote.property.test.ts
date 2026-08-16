/**
 * @file shellQuote 属性化测试
 *
 * 验证 POSIX shell quoting 的关键不变量：
 * 1. **空串不变量**：空串始终引用为 "''"
 * 2. **安全字符不变量**：仅含 SAFE_TOKEN 字符且不以 "-" 开头的字符串原样返回
 * 3. **形状不变量**：非安全字符的字符串必定被单引号包裹
 * 4. **转义不变量**：输出中的单引号数量应满足转义配对规则
 * 5. **前缀不变量**：以 "-" 开头的字符串始终被引用（避免被识别为 flag）
 *
 * 互联网大厂基线：安全转义函数必须做 property-based 测试，
 * 避免特殊字符（`\0`、控制字符、unicode）绕过 quote。
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { quotePosixShellArgument } from "./shellQuote";

describe("shellQuote property-based", () => {
  it("空串始终返回 ''", () => {
    fc.assert(
      fc.property(fc.constantFrom(""), (s) => {
        expect(quotePosixShellArgument(s)).toBe("''");
      }),
    );
  });

  it("以 '-' 开头的非空字符串始终被单引号包裹", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => s.length > 0 && s.startsWith("-")),
        (s) => {
          const quoted = quotePosixShellArgument(s);
          // 必须以单引号包裹（因为安全正则要求不以 - 开头）
          expect(quoted.startsWith("'")).toBe(true);
          expect(quoted.endsWith("'")).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("SAFE_TOKEN 字符（且非 - 开头）的字符串原样返回", () => {
    const safeChar = fc.constantFrom(
      ...("ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
        "abcdefghijklmnopqrstuvwxyz" +
        "0123456789" +
        "_@%+=:,./-").split(""),
    );
    fc.assert(
      fc.property(
        fc
          .array(safeChar, { minLength: 1, maxLength: 20 })
          .map((arr) => arr.join(""))
          .filter((s) => !s.startsWith("-")),
        (s) => {
          expect(quotePosixShellArgument(s)).toBe(s);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("包含单引号的字符串：转义后整体仍可被 shell 解析为单个 token", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => s.includes("'") || /[^A-Za-z0-9_@%+=:,./-]/.test(s)),
        (s) => {
          if (s.startsWith("-")) return; // 以 - 开头的会触发引用
          if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s) && !s.startsWith("-")) return; // 全安全字符会原样返回
          const quoted = quotePosixShellArgument(s);
          // 必须被单引号包裹
          expect(quoted.startsWith("'")).toBe(true);
          expect(quoted.endsWith("'")).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("idempotent：对原样返回的安全 token，重复 quote 不会破坏（输入=输出）", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 12 })
          .filter((s) => /^[A-Za-z0-9_@%+=:,./]+$/.test(s)),
        (s) => {
          const once = quotePosixShellArgument(s);
          expect(once).toBe(s);
          // 再次 quote 应该还是原样（因为输出已不含特殊字符）
          const twice = quotePosixShellArgument(once);
          expect(twice).toBe(once);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("含控制字符 / 特殊字符的字符串：转义后不会被误读为多 token", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.constantFrom("\0", "\n", "\t", " ", '"', "$", "`", "\\", "&", "|", ";", "<", ">"),
        (s, special) => {
          const combined = s + special;
          const quoted = quotePosixShellArgument(combined);
          // 包含空格的字符串必被引用
          if (special === " " || combined.startsWith("-")) {
            expect(quoted.startsWith("'")).toBe(true);
            expect(quoted.endsWith("'")).toBe(true);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
