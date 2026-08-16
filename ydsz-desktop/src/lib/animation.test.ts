/**
 * @file animation.ts 单元测试
 *
 * 覆盖：
 * - ANIMATION_CONFIG 常量结构
 * - getAnimationDuration（正常 / 减少动画模式）
 * - getTransition（默认参数 / 多属性 / 减少动画）
 * - getFadeInStyle / getScaleStyle / getSlideInStyle / getExpandStyle
 * - animationClasses 工具常量
 */

import { describe, expect, it } from "vitest";
import {
  ANIMATION_CONFIG,
  animationClasses,
  getAnimationDuration,
  getExpandStyle,
  getFadeInStyle,
  getScaleStyle,
  getSlideInStyle,
  getTransition,
} from "./animation";

describe("ANIMATION_CONFIG", () => {
  it("duration 三个档位：fast/normal/slow", () => {
    expect(ANIMATION_CONFIG.duration.fast).toBe(150);
    expect(ANIMATION_CONFIG.duration.normal).toBe(200);
    expect(ANIMATION_CONFIG.duration.slow).toBe(300);
  });

  it("easing 缓动函数固定字符串", () => {
    expect(ANIMATION_CONFIG.easing.easeOut).toMatch(/cubic-bezier/);
    expect(ANIMATION_CONFIG.easing.easeInOut).toMatch(/cubic-bezier/);
    expect(ANIMATION_CONFIG.easing.spring).toMatch(/cubic-bezier/);
  });

  it("spring 物理配置 stiffness/damping 是数字", () => {
    expect(typeof ANIMATION_CONFIG.spring.gentle.stiffness).toBe("number");
    expect(typeof ANIMATION_CONFIG.spring.gentle.damping).toBe("number");
    expect(typeof ANIMATION_CONFIG.spring.normal.stiffness).toBe("number");
    expect(typeof ANIMATION_CONFIG.spring.normal.damping).toBe("number");
    expect(typeof ANIMATION_CONFIG.spring.stiff.stiffness).toBe("number");
    expect(typeof ANIMATION_CONFIG.spring.stiff.damping).toBe("number");
  });
});

describe("getAnimationDuration", () => {
  it("prefersReduced=false 时返回原值", () => {
    expect(getAnimationDuration(200, false)).toBe(200);
    expect(getAnimationDuration(500, false)).toBe(500);
  });

  it("prefersReduced=true 时上限为 50ms", () => {
    expect(getAnimationDuration(200, true)).toBe(50);
    expect(getAnimationDuration(500, true)).toBe(50);
  });

  it("prefersReduced=true 且原值 <= 50ms 时保持原值", () => {
    expect(getAnimationDuration(30, true)).toBe(30);
    expect(getAnimationDuration(0, true)).toBe(0);
  });
});

describe("getTransition", () => {
  it("默认参数：normal duration + easeOut easing", () => {
    const result = getTransition(["opacity"]);
    expect(result).toContain("opacity");
    expect(result).toContain(`${ANIMATION_CONFIG.duration.normal}ms`);
    expect(result).toContain(ANIMATION_CONFIG.easing.easeOut);
  });

  it("多属性各自生成 transition 片段", () => {
    const result = getTransition(["opacity", "transform"], 200);
    // result 中应当同时包含两个属性名（cubic-bezier 内含逗号，不能简单 split）
    expect(result).toContain("opacity");
    expect(result).toContain("transform");
    // 应出现两次 "200ms"（每个属性一次）
    expect((result.match(/200ms/g) ?? []).length).toBe(2);
  });

  it("prefersReduced=true 时 duration 被截断到 50ms", () => {
    const result = getTransition(["opacity"], 500, "linear", true);
    expect(result).toContain("50ms");
  });

  it("单属性无两次 duration", () => {
    const result = getTransition(["opacity"]);
    expect((result.match(/200ms/g) ?? []).length).toBe(1);
  });

  it("空属性数组时返回空字符串", () => {
    const result = getTransition([]);
    expect(result).toBe("");
  });
});

describe("getFadeInStyle", () => {
  it("visible=true 时 opacity=1", () => {
    const style = getFadeInStyle(true);
    expect(style.opacity).toBe(1);
  });

  it("visible=false 时 opacity=0", () => {
    const style = getFadeInStyle(false);
    expect(style.opacity).toBe(0);
  });

  it("包含 transition", () => {
    const style = getFadeInStyle(true);
    expect(style.transition).toMatch(/opacity \d+ms/);
  });

  it("prefersReduced=true 时 transition 中的 duration <= 50ms", () => {
    const style = getFadeInStyle(true, true);
    expect(style.transition).toMatch(/opacity 50ms/);
  });
});

describe("getScaleStyle", () => {
  it("visible=true：opacity=1, transform=scale(1)", () => {
    const style = getScaleStyle(true);
    expect(style.opacity).toBe(1);
    expect(style.transform).toBe("scale(1)");
  });

  it("visible=false：opacity=0, transform=scale(0.95)", () => {
    const style = getScaleStyle(false);
    expect(style.opacity).toBe(0);
    expect(style.transform).toBe("scale(0.95)");
  });

  it("transition 包含 opacity + transform 两条", () => {
    const style = getScaleStyle(true);
    expect(style.transition).toMatch(/opacity/);
    expect(style.transition).toMatch(/transform/);
  });
});

describe("getSlideInStyle", () => {
  it("默认方向 up, distance=20", () => {
    const style = getSlideInStyle(false);
    expect(style.transform).toBe("translateY(20px)");
  });

  it("direction=down 时 translateY(-20px)", () => {
    const style = getSlideInStyle(false, "down");
    expect(style.transform).toBe("translateY(-20px)");
  });

  it("direction=left 时 translateX(20px)", () => {
    const style = getSlideInStyle(false, "left");
    expect(style.transform).toBe("translateX(20px)");
  });

  it("direction=right 时 translateX(-20px)", () => {
    const style = getSlideInStyle(false, "right");
    expect(style.transform).toBe("translateX(-20px)");
  });

  it("自定义 distance 生效", () => {
    const style = getSlideInStyle(false, "up", 100);
    expect(style.transform).toBe("translateY(100px)");
  });

  it("visible=true 时 transform 归零", () => {
    const style = getSlideInStyle(true);
    expect(style.transform).toBe("translate(0, 0)");
    expect(style.opacity).toBe(1);
  });

  it("prefersReduced=true 时 transition duration <= 50ms", () => {
    const style = getSlideInStyle(true, "up", 20, true);
    expect(style.transition).toMatch(/opacity 50ms/);
  });
});

describe("getExpandStyle", () => {
  it("isExpanded=true：maxHeight=1000px, opacity=1", () => {
    const style = getExpandStyle(true);
    expect(style.maxHeight).toBe("1000px");
    expect(style.opacity).toBe(1);
  });

  it("isExpanded=false：maxHeight=0, opacity=0", () => {
    const style = getExpandStyle(false);
    expect(style.maxHeight).toBe("0");
    expect(style.opacity).toBe(0);
  });

  it("包含 overflow=hidden 防止溢出", () => {
    const style = getExpandStyle(true);
    expect(style.overflow).toBe("hidden");
  });

  it("transition 同时控制 max-height 和 opacity", () => {
    const style = getExpandStyle(true);
    expect(style.transition).toMatch(/max-height/);
    expect(style.transition).toMatch(/opacity/);
  });
});

describe("animationClasses", () => {
  it("fadeIn 类包含 opacity", () => {
    expect(animationClasses.fadeIn).toContain("opacity");
  });

  it("scale / slide 类包含 transition", () => {
    expect(animationClasses.scale).toContain("transition");
    expect(animationClasses.slide).toContain("transition");
  });

  it("expand 类包含 overflow-hidden", () => {
    expect(animationClasses.expand).toContain("overflow-hidden");
  });

  it("包含 4 个动画 key", () => {
    expect(Object.keys(animationClasses).sort()).toEqual(
      ["expand", "fadeIn", "scale", "slide"].sort(),
    );
  });
});
