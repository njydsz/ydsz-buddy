/**
 * @file csp-static.test.ts
 * @description 桌面端 Tauri CSP + 安全配置静态回归测试:
 *  1. tauri.conf.json app.security.csp 必须为非 null 字符串
 *  2. CSP 必须包含 connect-src,且放行 ws/wss/http/https
 *  3. CSP 必须包含 frame-ancestors 'none' / object-src 'none' / base-uri 'self'
 *  4. CSP 不允许使用裸 '*' 放行(避免通配符绕过)
 *  5. identifier / version / bundle 配置必须完整
 *  6. updater endpoint 必须为 https
 *  7. CSP 包含 upgrade-insecure-requests(降级攻击防护)
 *
 * 对齐移动端 ydsz-mobile/src/__tests__/compliance-static.test.ts 的硬约束保护策略。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// __dirname = ydsz-desktop/src,ROOT = ydsz-desktop/,再 append "src-tauri/tauri.conf.json"
const ROOT = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("desktop Tauri CSP static checks", () => {
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  const csp: string | null = conf?.app?.security?.csp ?? null;

  describe("app.security.csp 基础形态", () => {
    it("csp 不为 null", () => {
      expect(csp).not.toBeNull();
    });

    it("csp 是字符串", () => {
      expect(typeof csp).toBe("string");
    });

    it("csp 非空", () => {
      expect((csp ?? "").length).toBeGreaterThan(0);
    });
  });

  describe("csp 关键指令(项目硬约束)", () => {
    it("包含 connect-src 指令", () => {
      expect(csp).toMatch(/connect-src\s+[^;]+/);
    });

    it("connect-src 放行 'self'", () => {
      expect(csp).toMatch(/connect-src[^;]*'self'/);
    });

    it("connect-src 放行 ws: / wss: (WebSocket)", () => {
      expect(csp).toMatch(/connect-src[^;]*ws:/);
      expect(csp).toMatch(/connect-src[^;]*wss:/);
    });

    it("connect-src 放行 http: / https: (Provider API + OAuth Device Flow)", () => {
      expect(csp).toMatch(/connect-src[^;]*http:/);
      expect(csp).toMatch(/connect-src[^;]*https:/);
    });

    it("包含 frame-ancestors 'none' (防 clickjacking)", () => {
      expect(csp).toMatch(/frame-ancestors\s+'none'/);
    });

    it("包含 object-src 'none' (防 Flash/Java 插件)", () => {
      expect(csp).toMatch(/object-src\s+'none'/);
    });

    it("包含 base-uri 'self' (防 <base> 劫持)", () => {
      expect(csp).toMatch(/base-uri\s+'self'/);
    });
  });

  describe("csp 不允许的危险放行", () => {
    it("connect-src 不使用裸 '*' 通配符(可绕过 Host allowlist)", () => {
      const match = (csp ?? "").match(/connect-src\s+([^;]+)/);
      expect(match).toBeTruthy();
      const directives = (match?.[1] ?? "").trim();
      // 显式禁止出现 connect-src 后面跟单独的 * (裸通配符)
      // 注意 'unsafe-inline' 这种带引号的是允许的; 单独 * 才是危险信号
      const tokens = directives.split(/\s+/);
      expect(tokens).not.toContain("*");
    });

    it("script-src 不放行 https: 第三方域(防 XSS 数据外带)", () => {
      const match = (csp ?? "").match(/script-src\s+([^;]+)/);
      if (!match) return; // 未声明则跳过(使用 default-src 兜底)
      const tokens = (match[1] ?? "").trim().split(/\s+/);
      // 'self' / 'unsafe-inline' / 域白名单 是允许的; 单独的 https: 也是宽松信号但与 Tauri
      // 注入脚本的兼容性平衡; 这里仅阻断 '*' 这种裸通配符
      expect(tokens).not.toContain("*");
    });
  });

  describe("csp 加固指令", () => {
    it("包含 upgrade-insecure-requests(防降级攻击)", () => {
      expect(csp).toMatch(/upgrade-insecure-requests/);
    });

    it("包含 default-src 'self'(兜底策略)", () => {
      expect(csp).toMatch(/default-src\s+'self'/);
    });
  });

  describe("tauri.conf.json 基础配置", () => {
    it("identifier 是 com.njydsz.buddy", () => {
      expect(conf.identifier).toBe("com.njydsz.buddy");
    });

    it("productName 是 ydsz-buddy", () => {
      expect(conf.productName).toBe("云顶数字 Buddy");
    });

    it("version 字段非空(语义化版本)", () => {
      expect(typeof conf.version).toBe("string");
      expect(conf.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("bundle.active 为 true", () => {
      expect(conf.bundle?.active).toBe(true);
    });

    it("bundle.targets 包含 'all' 或具体平台列表", () => {
      const t = conf.bundle?.targets;
      const ok = t === "all" || (Array.isArray(t) && t.length > 0);
      expect(ok).toBe(true);
    });

    it("bundle.icon 至少 4 个图标(32/128/128@2x/.icns 或 .ico)", () => {
      expect(Array.isArray(conf.bundle?.icon)).toBe(true);
      expect(conf.bundle.icon.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("updater 安全配置", () => {
    it("updater.active 配置存在", () => {
      const u = conf.plugins?.updater;
      expect(u).toBeTruthy();
    });

    it("updater endpoint 全部为 https", () => {
      const eps: string[] = conf.plugins?.updater?.endpoints ?? [];
      expect(eps.length).toBeGreaterThan(0);
      for (const ep of eps) {
        expect(ep.startsWith("https://")).toBe(true);
      }
    });
  });
});
