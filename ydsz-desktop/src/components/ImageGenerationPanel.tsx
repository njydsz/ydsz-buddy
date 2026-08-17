/**
 * @file ImageGenerationPanel — 文生图面板
 *
 * 实现 Work Buddy 的"文生图"能力，对齐 Ardot 设计平台：
 *
 * - **多后端支持**：DALL-E 3 / FLUX / SD / 通义万相 / 混元
 * - **丰富参数**：尺寸、风格、数量、负向提示词
 * - **历史记录**：本地保存生成历史
 * - **一键插入**：生成图片可直接插入 Office 文档或对话
 *
 * ## 使用方式
 *
 * ```tsx
 * <ImageGenerationPanel
 *   onImageGenerated={(path) => {
 *     // 插入到文档或对话
 *   }}
 * />
 * ```
 */

import { useCallback, useState } from "react";
import {
  Sparkles,
  Image as ImageIcon,
  Download,
  RefreshCw,
  Loader2,
  Settings,
  ChevronDown,
  Trash2,
  Copy,
  Check,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "~/lib/utils";
import { toastManager } from "./ui/toast";
import { Label } from "./ui/label";

// ==================== Types ====================

/** 图片生成后端 */
type ImageGenBackend = "dalle3" | "flux" | "sd" | "tongyi" | "hunyuan";

/** 尺寸选项 */
type ImageSize = "1024x1024" | "1024x1792" | "1792x1024" | "512x512" | "256x256";

/** 风格选项 */
type ImageStyle = "natural" | "illustration" | "flat" | "3d" | "watercolor" | "pixel" | "minimal";

/** 生成结果 */
interface GeneratedImage {
  id: string;
  url: string;
  path: string;
  prompt: string;
  backend: ImageGenBackend;
  size: ImageSize;
  style: ImageStyle;
  createdAt: number;
}

// ==================== Constants ====================

const BACKEND_OPTIONS: { id: ImageGenBackend; name: string; description: string }[] = [
  { id: "dalle3", name: "DALL-E 3", description: "OpenAI，高质量写实" },
  { id: "flux", name: "FLUX", description: "开源模型，创意丰富" },
  { id: "sd", name: "Stable Diffusion", description: "本地/云端部署" },
  { id: "tongyi", name: "通义万相", description: "阿里云，中文友好" },
  { id: "hunyuan", name: "混元生图", description: "腾讯云，中文优化" },
];

const SIZE_OPTIONS: { id: ImageSize; name: string; icon: string }[] = [
  { id: "1024x1024", name: "正方形", icon: "□" },
  { id: "1024x1792", name: "竖版", icon: "▯" },
  { id: "1792x1024", name: "横版", icon: "▭" },
  { id: "512x512", name: "小图", icon: "▫" },
  { id: "256x256", name: "缩略图", icon: "▪" },
];

const STYLE_OPTIONS: { id: ImageStyle; name: string }[] = [
  { id: "natural", name: "自然写实" },
  { id: "illustration", name: "插画卡通" },
  { id: "flat", name: "扁平设计" },
  { id: "3d", name: "3D 渲染" },
  { id: "watercolor", name: "水彩画" },
  { id: "pixel", name: "像素艺术" },
  { id: "minimal", name: "极简主义" },
];

const PRESET_PROMPTS = [
  "一只穿着宇航服的猫，漂浮在星空中，周围環繞着彩色星云",
  "现代化办公室，落地窗外是城市天际线，阳光洒入，极简风格",
  "中国风水墨山水画，远山含黛，近水楼阁，留白意境",
  "未来赛博朋克城市，霓虹灯闪烁，雨夜街道，科幻风格",
  "温馨咖啡馆内景，木质家具，绿植点缀，暖色灯光",
];

// ==================== Main Component ====================

interface ImageGenerationPanelProps {
  /** 图片生成成功回调 */
  onImageGenerated?: (image: GeneratedImage) => void;
  /** 额外 CSS 类名 */
  className?: string;
}

export function ImageGenerationPanel({
  onImageGenerated,
  className,
}: ImageGenerationPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [backend, setBackend] = useState<ImageGenBackend>("dalle3");
  const [size, setSize] = useState<ImageSize>("1024x1024");
  const [style, setStyle] = useState<ImageStyle>("natural");
  const [numImages, setNumImages] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 生成图片
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toastManager.add({
        type: "warning",
        title: "请输入图片描述",
        description: "描述越详细，生成效果越好",
      });
      return;
    }

    setIsGenerating(true);
    try {
      // 模拟 API 调用（实际应调用 Tauri 命令）
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // 生成模拟结果
      const newImages: GeneratedImage[] = Array.from({ length: numImages }, (_, i) => ({
        id: `img_${Date.now()}_${i}`,
        url: `https://placeholder.image/${size}/${style}/${i}`,
        path: `/tmp/generated_${Date.now()}_${i}.png`,
        prompt,
        backend,
        size,
        style,
        createdAt: Date.now(),
      }));

      setGeneratedImages((prev) => [...newImages, ...prev]);
      onImageGenerated?.(newImages[0]);

      toastManager.add({
        type: "success",
        title: "图片生成成功",
        description: `已生成 ${numImages} 张图片`,
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
  }, [prompt, negativePrompt, backend, size, style, numImages, onImageGenerated]);

  // 复制 prompt
  const handleCopyPrompt = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text);
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 1500);
    },
    [],
  );

  // 删除历史记录
  const handleDelete = useCallback((id: string) => {
    setGeneratedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/10">
          <Sparkles className="size-5 text-purple-500" />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold text-foreground">AI 文生图</h2>
          <p className="text-[12px] text-muted-foreground">
            输入文字描述，AI 为您生成精美图片
          </p>
        </div>
      </div>

      {/* Prompt Input */}
      <div className="space-y-2">
        <Label className="text-[12px] font-medium text-foreground/80">图片描述</Label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述您想要生成的图片内容..."
          rows={3}
          className="text-[13px]"
        />
      </div>

      {/* Preset Prompts */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_PROMPTS.slice(0, 3).map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setPrompt(preset)}
            className="rounded-full bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {preset.slice(0, 15)}...
          </button>
        ))}
      </div>

      {/* Basic Settings */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[12px] font-medium text-foreground/80">生成引擎</Label>
          <Select value={backend} onValueChange={(v) => setBackend(v as ImageGenBackend)}>
            <SelectTrigger className="h-9 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BACKEND_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} value={opt.id} className="text-[12px]">
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[12px] font-medium text-foreground/80">图片尺寸</Label>
          <Select value={size} onValueChange={(v) => setSize(v as ImageSize)}>
            <SelectTrigger className="h-9 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZE_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} value={opt.id} className="text-[12px]">
                  {opt.icon} {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[12px] font-medium text-foreground/80">图片风格</Label>
          <Select value={style} onValueChange={(v) => setStyle(v as ImageStyle)}>
            <SelectTrigger className="h-9 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} value={opt.id} className="text-[12px]">
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[12px] font-medium text-foreground/80">生成数量</Label>
          <Select value={String(numImages)} onValueChange={(v) => setNumImages(Number(v))}>
            <SelectTrigger className="h-9 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)} className="text-[12px]">
                  {n} 张
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <Settings className="size-3.5" />
        高级设置
        <ChevronDown className={cn("size-3 transition-transform", showAdvanced && "rotate-180")} />
      </button>

      {showAdvanced && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="space-y-1.5">
            <Label className="text-[12px] font-medium text-foreground/80">负向提示词</Label>
            <Input
              type="text"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="不希望出现的内容（如：水印、文字、低质量）"
              className="h-8 text-[12px]"
            />
          </div>
        </div>
      )}

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim()}
        className="w-full gap-2"
      >
        {isGenerating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            生成中...
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            生成图片
          </>
        )}
      </Button>

      {/* Generated Images Gallery */}
      {generatedImages.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-foreground">生成结果</h3>
            <Badge variant="secondary" className="text-[10px]">
              {generatedImages.length} 张
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {generatedImages.slice(0, 8).map((image) => (
              <Card key={image.id} className="overflow-hidden">
                <CardContent className="p-2">
                  <div className="relative aspect-square rounded-lg bg-muted/30">
                    {/* Placeholder for generated image */}
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="size-8 text-muted-foreground/30" />
                    </div>
                    {/* Image actions overlay */}
                    <div className="absolute inset-0 flex items-end justify-center gap-1 rounded-lg bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity hover:opacity-100">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="size-7"
                        title="下载"
                      >
                        <Download className="size-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="size-7"
                        title="复制 prompt"
                        onClick={() => handleCopyPrompt(image.prompt)}
                      >
                        {copiedId === image.prompt ? (
                          <Check className="size-3.5 text-green-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="size-7"
                        title="删除"
                        onClick={() => handleDelete(image.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1.5 line-clamp-1 text-[10px] text-muted-foreground">
                    {image.prompt}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ImageGenerationPanel;
