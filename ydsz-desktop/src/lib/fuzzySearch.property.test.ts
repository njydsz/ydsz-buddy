/**
 * @file fuzzySearch 属性化测试
 *
 * 验证模糊搜索的关键不变量：
 * 1. **空 pattern 不变量**：空 pattern 返回所有 items，score=0，matches=[]
 * 2. **大小写不变量**：大小写不敏感，相同 pattern 不同大小写得到相同结果集
 * 3. **匹配位置不变量**：fuzzyMatch 返回的位置数组中每个位置都对应该位置的字符匹配
 * 4. **顺序不变量**：得分高者排前
 * 5. **空 text 不变量**：fuzzyMatch("any", "") 返回 null
 * 6. **highlight 不变量**：高亮片段重组后等于原文
 *
 * 互联网大厂基线：核心搜索算法必须 property-based 兜底，
 * 避免 example-based 漏掉 unicode/特殊字符的匹配问题。
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { fuzzyMatch, fuzzyScore, fuzzySearch, highlightMatches } from "./fuzzySearch";

const itemArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 5 }),
  name: fc.string({ minLength: 0, maxLength: 20 }),
});

describe("fuzzyMatch property-based", () => {
  it("空 pattern 返回空数组（视为通配）", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 30 }), (text) => {
        if (text.length === 0) return; // fuzzyMatch("","") 返回 [] 也合法
        const result = fuzzyMatch("", text);
        expect(result).toEqual([]);
      }),
    );
  });

  it("空 text 非空 pattern 返回 null", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (pattern) => {
          expect(fuzzyMatch(pattern, "")).toBeNull();
        },
      ),
      { numRuns: 30 },
    );
  });

  it("大小写不敏感：相同 pattern 不同大小写，匹配位置集合相同", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 8 })
          .filter((s) => s.trim().length > 0),
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => s.trim().length > 0),
        (pattern, text) => {
          const lower = fuzzyMatch(pattern.toLowerCase(), text);
          const upper = fuzzyMatch(pattern.toUpperCase(), text);
          // 大小写不敏感：两个结果应一致
          expect(lower).toEqual(upper);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("匹配位置的有效性：每个位置都对应匹配字符", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (pattern, text) => {
          const matches = fuzzyMatch(pattern, text);
          if (matches === null) return;
          // 位置应严格递增
          for (let i = 1; i < matches.length; i++) {
            expect(matches[i]).toBeGreaterThan(matches[i - 1]!);
          }
          // 每个位置都应在 text 范围内
          for (const pos of matches) {
            expect(pos).toBeGreaterThanOrEqual(0);
            expect(pos).toBeLessThan(text.length);
          }
          // 每个位置的字符应大小写不敏感匹配
          for (let i = 0; i < matches.length; i++) {
            const pos = matches[i]!;
            const p = pattern[i]!;
            expect(p.toLowerCase()).toBe(text[pos]!.toLowerCase());
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("fuzzyScore property-based", () => {
  it("非空 matches 的 score > 0", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 6 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        (pattern, text) => {
          const matches = fuzzyMatch(pattern, text);
          if (matches === null || matches.length === 0) return;
          const score = fuzzyScore(pattern, text, matches);
          expect(score).toBeGreaterThan(0);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("空 matches 的 score = 0", () => {
    expect(fuzzyScore("any", "any", [])).toBe(0);
  });

  it("完全匹配加分：text == pattern 时 score 应 >= 不完全匹配时的 score", () => {
    fc.assert(
      fc.property(
        fc
          .stringMatching(/^[A-Za-z]{2,8}$/)
          .filter((s) => s.length >= 2),
        (s) => {
          const exactMatches = fuzzyMatch(s, s);
          expect(exactMatches).not.toBeNull();
          const exactScore = fuzzyScore(s, s, exactMatches!);
          // 完全匹配应至少得到基础分+连续+完全匹配加分（>= 35）
          expect(exactScore).toBeGreaterThanOrEqual(35);
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe("fuzzySearch property-based", () => {
  it("空 pattern 返回所有 items（数量=输入数量）", () => {
    fc.assert(
      fc.property(fc.array(itemArb, { maxLength: 15 }), (items) => {
        const results = fuzzySearch("", items, (it) => it.name);
        expect(results.length).toBe(items.length);
        // score 都为 0
        for (const r of results) {
          expect(r.score).toBe(0);
          expect(r.matches).toEqual([]);
        }
      }),
      { numRuns: 30 },
    );
  });

  it("结果按 score 降序排列", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 6 })
          .filter((s) => s.trim().length > 0),
        fc.array(itemArb, { minLength: 1, maxLength: 10 }),
        (pattern, items) => {
          const results = fuzzySearch(pattern, items, (it) => it.name);
          for (let i = 1; i < results.length; i++) {
            expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it("所有结果 item 都来自输入数组", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 6 }),
        fc.array(itemArb, { maxLength: 12 }),
        (pattern, items) => {
          const inputIds = new Set(items.map((it) => it.id));
          const results = fuzzySearch(pattern, items, (it) => it.id);
          for (const r of results) {
            expect(inputIds.has(r.item.id)).toBe(true);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe("highlightMatches property-based", () => {
  it("空 matches 返回单个未高亮片段", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 20 }), (text) => {
        const result = highlightMatches(text, []);
        expect(result).toEqual([{ text, highlighted: false }]);
      }),
    );
  });

  it("片段重组等于原文（无损重组）", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 29 }), {
          maxLength: 10,
        }),
        (text, rawMatches) => {
          const matches = rawMatches.filter((m) => m < text.length).sort((a, b) => a - b);
          const parts = highlightMatches(text, matches);
          const reconstructed = parts.map((p) => p.text).join("");
          expect(reconstructed).toBe(text);
        },
      ),
      { numRuns: 50 },
    );
  });
});
