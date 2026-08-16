/**
 * @file officePptxExport 单元测试
 *
 * 覆盖 `planMarkdownToSlides` 的 Markdown → 幻灯片转换逻辑，
 * 包括：空输入、标题页、章节分隔、内容要点、有序列表、
 * 三级标题忽略、要点截断、最大幻灯片数限制等边界场景。
 */

import { describe, expect, it } from "vitest";
import { planMarkdownToSlides } from "./officePptxExport";

describe("planMarkdownToSlides", () => {
  it("空输入仍生成默认 title 页", () => {
    const slides = planMarkdownToSlides("");
    expect(slides.length).toBeGreaterThanOrEqual(1);
    expect(slides[0].slideType).toBe("title");
    expect(slides[0].title).toBeTruthy();
    expect(slides[0].subtitle).toBeTruthy();
  });

  it("从 # 一级标题提取 title", () => {
    const markdown = [
      "# 项目发布计划",
      "",
      "## 阶段一",
      "",
      "- 需求评审",
      "- 技术选型",
    ].join("\n");
    const slides = planMarkdownToSlides(markdown);
    expect(slides[0].slideType).toBe("title");
    expect(slides[0].title).toBe("项目发布计划");
  });

  it("## 二级标题生成 section 幻灯片", () => {
    const markdown = ["# Demo", "", "## 实施步骤", "", "- 步骤A"].join("\n");
    const slides = planMarkdownToSlides(markdown);
    const sections = slides.filter((s) => s.slideType === "section");
    expect(sections.length).toBe(1);
    expect(sections[0].title).toBe("实施步骤");
  });

  it("二级标题下的 - 列表转为 content 幻灯片 bullets", () => {
    const markdown = [
      "# Plan",
      "",
      "## Tasks",
      "",
      "- 任务1",
      "- 任务2",
      "- 任务3",
    ].join("\n").trim() + "\n";
    const slides = planMarkdownToSlides(markdown);
    const contentSlides = slides.filter((s) => s.slideType === "content");
    expect(contentSlides.length).toBe(1);
    expect(contentSlides[0].title).toBe("Tasks");
    expect(contentSlides[0].bullets).toEqual(["任务1", "任务2", "任务3"]);
  });

  it("有序列表项同样作为要点", () => {
    const markdown = [
      "# Plan",
      "",
      "## Steps",
      "",
      "1. 第一步",
      "2. 第二步",
    ].join("\n").trim() + "\n";
    const slides = planMarkdownToSlides(markdown);
    const contentSlides = slides.filter((s) => s.slideType === "content");
    expect(contentSlides.length).toBe(1);
    expect(contentSlides[0].bullets).toEqual(["第一步", "第二步"]);
  });

  it("三级及以上标题被忽略，不生成幻灯片", () => {
    const markdown = [
      "# Plan",
      "",
      "## Section A",
      "",
      "### Subsection (ignored)",
      "",
      "- bullet A",
    ].join("\n").trim() + "\n";
    const slides = planMarkdownToSlides(markdown);
    const sections = slides.filter((s) => s.slideType === "section");
    expect(sections.length).toBe(1);
    // 只有一个 content slide（来自 Section A 下的 bullet A）
    const contentSlides = slides.filter((s) => s.slideType === "content");
    expect(contentSlides.length).toBe(1);
  });

  it("空章节（无要点）不生成 content 幻灯片", () => {
    const markdown = [
      "# Plan",
      "",
      "## Empty Section",
      "",
      "## Next Section",
      "",
      "- bullet",
    ].join("\n").trim() + "\n";
    const slides = planMarkdownToSlides(markdown);
    const contentSlides = slides.filter((s) => s.slideType === "content");
    expect(contentSlides.length).toBe(1);
    expect(contentSlides[0].title).toBe("Next Section");
  });

  it("单页要点超过上限被截断为 8 条", () => {
    const bullets = Array.from({ length: 15 }, (_, i) => `要点${i + 1}`);
    const markdown = ["# Plan", "", "## Many", "", ...bullets.map((b) => `- ${b}`)].join("\n").trim() + "\n";
    const slides = planMarkdownToSlides(markdown);
    const contentSlides = slides.filter((s) => s.slideType === "content");
    expect(contentSlides.length).toBe(1);
    expect(contentSlides[0].bullets?.length).toBe(8);
  });

  it("超长要点被截断并加省略号", () => {
    const longText = "极长要点".repeat(50);
    const markdown = `# Plan\n\n## Long\n\n- ${longText}\n`.trim() + "\n";
    const slides = planMarkdownToSlides(markdown);
    const contentSlides = slides.filter((s) => s.slideType === "content");
    expect(contentSlides.length).toBe(1);
    const bullet = contentSlides[0].bullets?.[0] ?? "";
    expect(bullet.length).toBeLessThanOrEqual(120);
    expect(bullet.endsWith("…")).toBe(true);
  });

  it("幻灯片总数超过上限被截断为 30 张", () => {
    // 生成 35 个 section（每个 section 一张）
    const sections = Array.from({ length: 35 }, (_, i) => `## Section ${i + 1}`);
    const markdown = `# Plan\n\n${sections.join("\n\n")}\n`.trim() + "\n";
    const slides = planMarkdownToSlides(markdown);
    expect(slides.length).toBeLessThanOrEqual(30);
  });

  it("title 幻灯片 subtitle 包含日期", () => {
    const slides = planMarkdownToSlides("# Demo\n");
    const subtitle = slides[0].subtitle ?? "";
    // ISO 日期格式 YYYY-MM-DD 出现在 subtitle 中
    expect(/\d{4}-\d{2}-\d{2}/.test(subtitle)).toBe(true);
  });

  it("输出结构符合 PptxSlideInput 类型契约", () => {
    const markdown = "# T\n\n## S\n\n- b1\n";
    const slides = planMarkdownToSlides(markdown);
    for (const slide of slides) {
      expect(["title", "content", "section"]).toContain(slide.slideType);
      expect(typeof slide.title).toBe("string");
      expect(slide.title.length).toBeGreaterThan(0);
      if (slide.slideType === "title") {
        expect(typeof slide.subtitle).toBe("string");
      }
      if (slide.slideType === "content") {
        expect(Array.isArray(slide.bullets)).toBe(true);
      }
    }
  });
});
