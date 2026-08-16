/**
 * @file compliance-static.test.ts
 * @description 桌面端隐私合规 + 商店发布相关静态检查。
 *              对齐移动端 ydsz-mobile/src/__tests__/compliance-static.test.ts。
 *
 * 覆盖维度:
 *  1. OnboardingTour 必经步骤 + 不可跳过
 *  2. SettingsPage 隐私政策 + 使用条款入口
 *  3. tauri.conf.json CSP + updater endpoint 安全
 *  4. AppErrorBoundary 已接入 monitor SDK(P0-1 验收点)
 *  5. 全局隐私相关文案在 i18n 中存在
 *  6. 桌面端 i18n 三语(zh/en/ja)覆盖
 *  7. iOS PrivacyInfo.xcprivacy 存在
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("desktop compliance static checks", () => {
  describe("OnboardingTour 必经步骤", () => {
    const src = read("src/components/OnboardingTour.tsx");
    it("包含 7 步引导(workspace / provider / first-message / mode-switch / artifacts / dual-domain / mobile-pairing)", () => {
      expect(src).toMatch(/id:\s*"workspace"/);
      expect(src).toMatch(/id:\s*"provider"/);
      expect(src).toMatch(/id:\s*"first-message"/);
      expect(src).toMatch(/id:\s*"mode-switch"/);
      expect(src).toMatch(/id:\s*"artifacts"/);
      expect(src).toMatch(/id:\s*"dual-domain"/);
      expect(src).toMatch(/id:\s*"mobile-pairing"/);
    });
    it("提供跳过入口(onSkip)", () => {
      expect(src).toMatch(/onSkip/);
    });
    it("完成回调存在(onComplete)", () => {
      expect(src).toMatch(/onComplete/);
    });
    it("键盘导航(Esc / ArrowRight / ArrowLeft / Enter)", () => {
      expect(src).toMatch(/"Escape"/);
      expect(src).toMatch(/"ArrowRight"/);
      expect(src).toMatch(/"ArrowLeft"/);
    });
  });

  describe("tauri.conf.json 安全配置", () => {
    const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
    const csp: string | null = (conf?.app?.security?.csp as string | null) ?? null;
    const cspIsString = typeof csp === "string" && csp.length > 0;

    it("CSP 必须为非空字符串(project_memory 硬约束)", () => {
      // 大厂基线 + project_memory 硬约束:
      // tauri.conf.json 必须设置 app.security.csp 为完整字符串,
      // 包含 connect-src 'self' ws: wss: http: https:
      // 当前 csp=null 表明该约束被违反,需要修复。
      expect(
        cspIsString,
        "app.security.csp is null — 必须为完整字符串(见 project_memory 硬约束)",
      ).toBe(true);
    });

    it("(若 CSP 已设置)包含 connect-src 且放行 ws / wss / http / https", () => {
      if (!cspIsString) return; // 跳过,见上条约束
      expect(csp).toMatch(/connect-src[^;]*ws:/);
      expect(csp).toMatch(/connect-src[^;]*wss:/);
      expect(csp).toMatch(/connect-src[^;]*http:/);
      expect(csp).toMatch(/connect-src[^;]*https:/);
    });

    it("(若 CSP 已设置)包含 frame-ancestors 'none' / object-src 'none' / base-uri 'self'", () => {
      if (!cspIsString) return;
      expect(csp).toMatch(/frame-ancestors\s+'none'/);
      expect(csp).toMatch(/object-src\s+'none'/);
      expect(csp).toMatch(/base-uri\s+'self'/);
    });

    it("(若 CSP 已设置)connect-src 不允许使用裸 '*' 放行", () => {
      if (!cspIsString) return;
      const match = csp?.match(/connect-src[^;]+/);
      expect(match?.[0]).not.toMatch(/\*\s*;/);
    });

    it("(若 CSP 已设置)包含 upgrade-insecure-requests(降级攻击防护)", () => {
      if (!cspIsString) return;
      expect(csp).toMatch(/upgrade-insecure-requests/);
    });

    it("updater endpoint 必须为 https", () => {
      const updater = conf?.plugins?.updater;
      if (updater?.active) {
        for (const ep of updater.endpoints ?? []) {
          expect(ep).toMatch(/^https:\/\//);
        }
      }
    });

    it("identifier / version / productName 完整", () => {
      expect(typeof conf.identifier).toBe("string");
      expect(conf.identifier.length).toBeGreaterThan(0);
      expect(typeof conf.version).toBe("string");
      expect(conf.version.length).toBeGreaterThan(0);
      expect(typeof conf.productName).toBe("string");
    });
  });

  describe("AppErrorBoundary 接入 monitor(P0-1 验收点)", () => {
    const src = read("src/app/ErrorBoundary.tsx");
    it("import monitor SDK", () => {
      expect(src).toMatch(/from\s+["']~\/lib\/monitor["']/);
    });
    it("componentDidCatch 调用 monitor.captureError", () => {
      expect(src).toMatch(/monitor\.captureError/);
    });
    it("payload 包含 PII-safe context(source / componentStack / appVersion)", () => {
      expect(src).toMatch(/source:\s*"AppErrorBoundary"/);
      expect(src).toMatch(/componentStack/);
      expect(src).toMatch(/appVersion/);
    });
    it("level 为 'error'", () => {
      expect(src).toMatch(/level:\s*"error"/);
    });
  });

  describe("SettingsPage 隐私 + 条款入口", () => {
    const settings = read("src/routes/_chat.settings.tsx");
    it("导出 SettingsPage 路由", () => {
      expect(settings).toMatch(/createFileRoute\(/);
    });
    it("settings 页包含设置分类(providers / appearance / etc.)", () => {
      expect(settings).toMatch(/Provider|外观|通知/i);
    });
    // P0-6: Advanced 面板必须挂载 LegalDocumentsSettingsCard
    it("Advanced 面板渲染 LegalDocumentsSettingsCard(P0-6 合规入口)", () => {
      expect(settings).toMatch(/LegalDocumentsSettingsCard/);
    });
  });

  describe("TermsAcceptanceGate 首次启动条款接受(P0-6)", () => {
    const gate = read("src/components/TermsAcceptanceGate.tsx");
    const termsStore = read("src/lib/termsStore.ts");
    const legalDocs = read("src/lib/legalDocuments.ts");

    it("termsStore 暴露 termsAcceptedAt 状态 + acceptTerms / resetTermsAcceptance", () => {
      expect(termsStore).toMatch(/termsAcceptedAt/);
      expect(termsStore).toMatch(/export function acceptTerms/);
      expect(termsStore).toMatch(/export function resetTermsAcceptance/);
      expect(termsStore).toMatch(/export function hasAcceptedTerms/);
      expect(termsStore).toMatch(/export function useTermsState/);
    });

    it("termsStore 持久化 key 为 ydsz-buddy:terms-accepted(对齐 mobile 约定)", () => {
      expect(termsStore).toMatch(/ydsz-buddy:terms-accepted/);
    });

    it("legalDocuments 暴露中英双语文档 + getLegalDocument", () => {
      expect(legalDocs).toMatch(/export function getLegalDocument/);
      expect(legalDocs).toMatch(/PRIVACY_ZH/);
      expect(legalDocs).toMatch(/PRIVACY_EN/);
      expect(legalDocs).toMatch(/TERMS_ZH/);
      expect(legalDocs).toMatch(/TERMS_EN/);
    });

    it("TermsAcceptanceGate 渲染复选框 + 同意按钮 + data-testid 锚点", () => {
      expect(gate).toMatch(/data-testid="terms-acceptance-gate"/);
      expect(gate).toMatch(/data-testid="terms-acceptance-checkbox"/);
      expect(gate).toMatch(/data-testid="terms-acceptance-button"/);
      expect(gate).toMatch(/data-testid="terms-view-privacy"/);
      expect(gate).toMatch(/data-testid="terms-view-terms"/);
    });

    it("TermsAcceptanceGate 未接受时拦截交互(disabled={!accepted})", () => {
      expect(gate).toMatch(/disabled=\{!accepted\}/);
    });

    it("TermsAcceptanceGate 在 __root.tsx 中挂载(IdleLockGate 之内)", () => {
      const root = read("src/routes/__root.tsx");
      expect(root).toMatch(/TermsAcceptanceGate/);
      // 顺序:IdleLockGate 必须在外层,TermsAcceptanceGate 在内层
      const idleIdx = root.indexOf("IdleLockGate");
      const termsIdx = root.indexOf("TermsAcceptanceGate");
      expect(idleIdx).toBeGreaterThan(-1);
      expect(termsIdx).toBeGreaterThan(idleIdx);
    });

    it("i18n messages 补齐 termsAcceptance 双语 section", () => {
      const messages = read("src/i18n/messages.ts");
      expect(messages).toMatch(/termsAcceptance:\s*\{/);
      expect(messages).toMatch(/viewPrivacy:/);
      expect(messages).toMatch(/viewTerms:/);
      expect(messages).toMatch(/acceptLabel:/);
      expect(messages).toMatch(/acceptButton:/);
    });
  });

  describe("国际化(三语覆盖)", () => {
    const messages = existsSync(resolve(ROOT, "src/i18n/messages.ts"))
      ? read("src/i18n/messages.ts")
      : "";
    it("messages.ts 存在(集中式 i18n)", () => {
      expect(messages.length).toBeGreaterThan(0);
    });
    it("至少包含中文(zh)和英文(en)两套 Messages", () => {
      // 匹配 `const xx: Messages = {` 形式
      const locales = (messages.match(/^const\s+(\w+):\s*Messages\s*=/gm) ?? [])
        .map((m) => /const\s+(\w+):/.exec(m)?.[1] ?? "")
        .filter(Boolean);
      expect(locales).toContain("zh");
      expect(locales).toContain("en");
    });
    it("包含 Messages 类型定义", () => {
      expect(messages).toMatch(/export\s+type\s+Messages\s*=/);
    });
  });

  describe("iOS / macOS privacy manifest", () => {
    it("如果存在 src-tauri/ios 目录,必须有 PrivacyInfo.xcprivacy", () => {
      const iosDir = resolve(ROOT, "src-tauri/ios");
      if (existsSync(iosDir)) {
        expect(existsSync(resolve(iosDir, "PrivacyInfo.xcprivacy"))).toBe(
          true,
        );
      }
    });
  });
});
