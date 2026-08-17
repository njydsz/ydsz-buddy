/**
 * @file PrototypeGeneratorPanel — 原型生成面板
 *
 * 扩展 Browser Design Mode，增加"从视觉分析到可运行代码"工作流：
 *
 * - **原型描述**：用户用自然语言描述想要的 UI
 * - **实时预览**：生成 HTML/CSS 原型并实时预览
 * - **导出能力**：导出为 HTML / React / Vue 代码
 * - **设计规范**：自动生成 Design Token（颜色、字体、间距）
 * - **迭代优化**：基于对话逐步优化原型
 *
 * ## 核心工作流
 *
 * 1. 用户描述需求 → 2. AI 生成 HTML/CSS → 3. 实时预览 → 4. 对话迭代 → 5. 导出代码
 *
 * ## 与 DesignModePanel 的区别
 *
 * - DesignModePanel：分析现有 UI → 改代码（开发者视角）
 * - PrototypeGeneratorPanel：从零生成原型 → 导出代码（设计师/产品视角）
 */

import { useCallback, useState } from "react";
import {
  Code2,
  Eye,
  Download,
  Loader2,
  Send,
  Layers,
  Palette,
  Smartphone,
  Monitor,
  Tablet,
  Copy,
  Check,
  FileCode,
} from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { cn } from "~/lib/utils";
import { toastManager } from "./ui/toast";
import { Label } from "./ui/label";

// ==================== Types ====================

/** 预览视口大小 */
type ViewportSize = "mobile" | "tablet" | "desktop";

/** 导出格式 */
type ExportFormat = "html" | "react" | "vue";

/** 设计规范 Token */
interface DesignTokens {
  colors: { name: string; value: string }[];
  fonts: { name: string; value: string }[];
  spacing: { name: string; value: string }[];
  borderRadius: { name: string; value: string }[];
}

// ==================== Constants ====================

const VIEWPORT_SIZES: { id: ViewportSize; name: string; width: number; icon: React.FC<{ className?: string }> }[] = [
  { id: "mobile", name: "手机", width: 375, icon: Smartphone },
  { id: "tablet", name: "平板", width: 768, icon: Tablet },
  { id: "desktop", name: "桌面", width: 1200, icon: Monitor },
];

const EXPORT_FORMATS: { id: ExportFormat; name: string; ext: string }[] = [
  { id: "html", name: "HTML", ext: ".html" },
  { id: "react", name: "React", ext: ".tsx" },
  { id: "vue", name: "Vue", ext: ".vue" },
];

const PROTOTYPE_PRESETS = [
  { name: "登录页", prompt: "创建一个现代化登录页面，包含 Logo、邮箱/密码输入框、登录按钮、忘记密码链接" },
  { name: "仪表盘", prompt: "创建一个数据仪表盘，包含顶部导航、侧边栏、数据卡片、图表区域" },
  { name: "设置页", prompt: "创建一个设置页面，包含个人信息表单、通知偏好、账户安全选项" },
  { name: "列表页", prompt: "创建一个数据列表页，包含搜索过滤、表格数据、分页、操作按钮" },
];

// ==================== Main Component ====================

export function PrototypeGeneratorPanel() {
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [showCode, setShowCode] = useState(false);
  const [tokens, setTokens] = useState<DesignTokens | null>(null);
  const [copied, setCopied] = useState(false);

  // 生成原型
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toastManager.add({
        type: "warning",
        title: "请输入原型描述",
        description: "描述您想要的页面或组件",
      });
      return;
    }

    setIsGenerating(true);
    try {
      // 模拟 AI 生成
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // 生成模拟原型代码
      const generatedHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prototype</title>
  <style>${generatedCss}</style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="logo">Logo</div>
      <nav class="nav">
        <a href="#" class="nav-link">首页</a>
        <a href="#" class="nav-link">功能</a>
        <a href="#" class="nav-link">关于</a>
      </nav>
    </header>
    <main class="content">
      <h1>${prompt}</h1>
      <p>这是由 AI 生成的原型预览</p>
    </main>
  </div>
</body>
</html>`;

      setCode(generatedHtml);
      setTokens(generateMockTokens());

      toastManager.add({
        type: "success",
        title: "原型已生成",
        description: "可在右侧预览区域查看效果",
        timeout: 3000,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "生成失败",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsGenerating(false);
    }
  }, [prompt]);

  // 复制代码
  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  // 导出代码
  const handleExport = useCallback(
    (format: ExportFormat) => {
      if (!code) return;

      let content = code;
      let filename = `prototype${EXPORT_FORMATS.find((f) => f.id === format)?.ext ?? ".html"}`;

      if (format === "react") {
        content = `export default function Prototype() {\n  return (\n    ${code}\n  );\n}`;
        filename = "Prototype.tsx";
      } else if (format === "vue") {
        content = `<template>\n  ${code}\n</template>\n\n<script setup lang="ts">\n</script>`;
        filename = "Prototype.vue";
      }

      // 创建下载
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      toastManager.add({
        type: "success",
        title: "导出成功",
        description: `已导出为 ${filename}`,
        timeout: 3000,
      });
    },
    [code],
  );

  const currentViewport = VIEWPORT_SIZES.find((v) => v.id === viewport)!;

  return (
    <div className="flex h-full flex-col border-l border-border bg-background/95">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Code2 className="size-4 shrink-0 text-purple-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          原型生成器
        </span>
        <Badge variant="secondary" className="text-[10px]">
          Design Mode
        </Badge>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: Prompt & Controls */}
        <div className="flex w-[340px] shrink-0 flex-col border-r border-border">
          {/* Prompt Input */}
          <div className="space-y-2 border-b border-border p-3">
            <Label className="text-[12px] font-medium text-foreground/80">描述需求</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述您想要的页面或组件..."
              rows={3}
              className="text-[12px]"
            />
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full gap-2"
              size="sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  生成原型
                </>
              )}
            </Button>
          </div>

          {/* Presets */}
          <div className="border-b border-border p-3">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground/60">快速模板</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PROTOTYPE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setPrompt(preset.prompt)}
                  className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-[11px] text-foreground/70 hover:bg-muted/40"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Viewport Controls */}
          <div className="border-b border-border p-3">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground/60">预览尺寸</p>
            <div className="flex gap-1">
              {VIEWPORT_SIZES.map((vp) => {
                const Icon = vp.icon;
                return (
                  <button
                    key={vp.id}
                    type="button"
                    onClick={() => setViewport(vp.id)}
                    className={cn(
                      "flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] transition-colors",
                      viewport === vp.id
                        ? "bg-purple-500/15 text-purple-600"
                        : "text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    <Icon className="size-4" />
                    {vp.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Design Tokens */}
          {tokens && (
            <div className="flex-1 overflow-y-auto p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60">
                <Palette className="size-3" />
                设计规范
              </p>

              {/* Colors */}
              <div className="mb-3">
                <p className="mb-1 text-[10px] text-muted-foreground/50">颜色</p>
                <div className="flex flex-wrap gap-1">
                  {tokens.colors.map((color) => (
                    <div
                      key={color.name}
                      className="flex items-center gap-1 rounded bg-muted/20 px-1.5 py-0.5"
                      title={`${color.name}: ${color.value}`}
                    >
                      <div
                        className="size-3 rounded-sm border border-border/40"
                        style={{ backgroundColor: color.value }}
                      />
                      <span className="text-[9px] text-muted-foreground/60">{color.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Typography */}
              <div className="mb-3">
                <p className="mb-1 text-[10px] text-muted-foreground/50">字体</p>
                <div className="space-y-0.5">
                  {tokens.fonts.map((font) => (
                    <div key={font.name} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground/50">{font.name}</span>
                      <span className="text-foreground/60">{font.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowCode(false)}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
                  !showCode ? "bg-purple-500/15 text-purple-600" : "text-muted-foreground hover:bg-muted/40",
                )}
              >
                <Eye className="size-3" />
                预览
              </button>
              <button
                type="button"
                onClick={() => setShowCode(true)}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
                  showCode ? "bg-purple-500/15 text-purple-600" : "text-muted-foreground hover:bg-muted/40",
                )}
              >
                <FileCode className="size-3" />
                代码
              </button>
            </div>

            <div className="flex items-center gap-1">
              {code && (
                <>
                  <Button variant="ghost" size="icon-sm" className="size-6" onClick={handleCopyCode}>
                    {copied ? (
                      <Check className="size-3 text-green-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6"
                    onClick={() => handleExport("html")}
                    title="导出 HTML"
                  >
                    <Download className="size-3" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Preview / Code Area */}
          <div className="flex-1 overflow-hidden bg-muted/10">
            {!code ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Layers className="mx-auto mb-2 size-8 text-muted-foreground/20" />
                  <p className="text-[12px] text-muted-foreground/40">
                    输入描述后点击生成
                  </p>
                </div>
              </div>
            ) : showCode ? (
              <pre className="h-full overflow-auto p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                {code}
              </pre>
            ) : (
              <div className="flex h-full items-center justify-center p-4">
                <div
                  className="h-full rounded-lg border border-border/40 bg-white shadow-sm transition-all"
                  style={{ width: `${Math.min(currentViewport.width, 600)}px`, maxWidth: "100%" }}
                >
                  {/* Mock preview - in real implementation, use iframe with srcDoc */}
                  <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground/50">
                    <div className="text-center">
                      <Eye className="mx-auto mb-2 size-6 text-muted-foreground/30" />
                      实时预览区域
                      <p className="mt-1 text-[10px]">
                        {currentViewport.width}px × 自适应
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Helpers ====================

const generatedCss = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
.container { max-width: 1200px; margin: 0 auto; padding: 20px; }
.header { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid #eee; }
.logo { font-size: 20px; font-weight: 700; color: #6366f1; }
.nav { display: flex; gap: 24px; }
.nav-link { color: #64748b; text-decoration: none; font-size: 14px; }
.nav-link:hover { color: #1e293b; }
.content { padding: 40px 0; }
h1 { font-size: 28px; font-weight: 700; margin-bottom: 12px; }
p { color: #64748b; line-height: 1.6; }
`;

function generateMockTokens(): DesignTokens {
  return {
    colors: [
      { name: "Primary", value: "#6366f1" },
      { name: "Secondary", value: "#8b5cf6" },
      { name: "Background", value: "#f8fafc" },
      { name: "Text", value: "#1e293b" },
      { name: "Muted", value: "#64748b" },
    ],
    fonts: [
      { name: "Heading", value: "Inter, 700, 28px" },
      { name: "Body", value: "Inter, 400, 14px" },
      { name: "Small", value: "Inter, 400, 12px" },
    ],
    spacing: [
      { name: "xs", value: "4px" },
      { name: "sm", value: "8px" },
      { name: "md", value: "16px" },
      { name: "lg", value: "24px" },
      { name: "xl", value: "40px" },
    ],
    borderRadius: [
      { name: "sm", value: "4px" },
      { name: "md", value: "8px" },
      { name: "lg", value: "12px" },
      { name: "full", value: "9999px" },
    ],
  };
}

export default PrototypeGeneratorPanel;
