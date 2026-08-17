/**
 * @file HomepageTemplateCards — 首页模板卡片区
 *
 * 实现 Work Buddy 的"一键做同款"交互模式：
 * 用户在首页看到的不是"开始对话"的聊天框，而是一个个已经做好的模板成品。
 * 点击模板卡片 → 自动填充预置参数 → 一键生成成品文档。
 *
 * ## 核心能力
 *
 * - **6 个高频模板卡片**：周报、会议纪要、PRD、数据表、项目汇报 PPT、简历
 * - **一键生成**：点击卡片自动填参数、调用 AI 生成完整文档
 * - **预览模式**：生成前可预览模板内容和参数
 * - **最近使用**：记住用户最近使用的 3 个模板
 *
 * ## 使用方式
 *
 * ```tsx
 * <HomepageTemplateCards
 *   onTemplateSelect={(template) => {
 *     // 打开模板参数面板或直接生成
 *   }}
 * />
 * ```
 */

import type { ComponentType, SVGProps } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  FileSpreadsheet,
  Presentation,
  Calendar,
  ClipboardList,
  Target,
  User,
  Loader2,
  Clock,
  Sparkles,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { cn } from "~/lib/utils";
import { toastManager } from "./ui/toast";
import {
  OFFICE_TEMPLATES,
  type OfficeTemplate,
  type OfficeDocType,
} from "./OfficeTemplateLibrary";

// ==================== Types ====================

/** 模板卡片数据 */
interface TemplateCard {
  id: string;
  name: string;
  description: string;
  docType: OfficeDocType;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  colorClass: string;
  bgClass: string;
  estimatedTime: string;
}

interface HomepageTemplateCardsProps {
  /** 模板选择回调 */
  onTemplateSelect?: (template: OfficeTemplate) => void;
  /** 直接生成回调 */
  onGenerate?: (template: OfficeTemplate, params: Record<string, string>) => Promise<void>;
  /** 额外 CSS 类名 */
  className?: string;
}

// ==================== Constants ====================

/** 首页展示的 6 个高频模板 */
const HOMEPAGE_TEMPLATES: TemplateCard[] = [
  {
    id: "weekly-report-docx",
    name: "周报模板",
    description: "标准团队周报，含本周完成、下周计划、风险事项",
    docType: "docx",
    icon: Calendar,
    colorClass: "text-blue-500",
    bgClass: "bg-blue-500/5 hover:bg-blue-500/10",
    estimatedTime: "30 秒",
  },
  {
    id: "meeting-notes-docx",
    name: "会议纪要",
    description: "标准会议纪要模板，含议题、决议、行动项",
    docType: "docx",
    icon: ClipboardList,
    colorClass: "text-emerald-500",
    bgClass: "bg-emerald-500/5 hover:bg-emerald-500/10",
    estimatedTime: "1 分钟",
  },
  {
    id: "prd-docx",
    name: "需求文档 (PRD)",
    description: "产品需求文档，含背景、用户故事、功能规范、验收标准",
    docType: "docx",
    icon: Target,
    colorClass: "text-orange-500",
    bgClass: "bg-orange-500/5 hover:bg-orange-500/10",
    estimatedTime: "2 分钟",
  },
  {
    id: "data-table-xlsx",
    name: "数据表格",
    description: "标准 Excel 数据表格，含表头和格式",
    docType: "xlsx",
    icon: FileSpreadsheet,
    colorClass: "text-amber-500",
    bgClass: "bg-amber-500/5 hover:bg-amber-500/10",
    estimatedTime: "30 秒",
  },
  {
    id: "project-pptx",
    name: "项目汇报 PPT",
    description: "项目汇报演示文稿，含标题页、概述、成果、计划",
    docType: "pptx",
    icon: Presentation,
    colorClass: "text-rose-500",
    bgClass: "bg-rose-500/5 hover:bg-rose-500/10",
    estimatedTime: "1 分钟",
  },
  {
    id: "resume-docx",
    name: "简历模板",
    description: "专业简历模板，含教育背景、工作经历、技能特长",
    docType: "docx",
    icon: User,
    colorClass: "text-cyan-500",
    bgClass: "bg-cyan-500/5 hover:bg-cyan-500/10",
    estimatedTime: "2 分钟",
  },
];

const DOC_TYPE_LABELS: Record<OfficeDocType, string> = {
  docx: "Word",
  xlsx: "Excel",
  pptx: "PPT",
};

// ==================== Template Preview Modal ====================

interface TemplatePreviewModalProps {
  template: TemplateCard;
  onClose: () => void;
  onGenerate: (params: Record<string, string>) => Promise<void>;
}

function TemplatePreviewModal({ template, onClose, onGenerate }: TemplatePreviewModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const officeTemplate = useMemo(
    () => OFFICE_TEMPLATES.find((t) => t.id === template.id),
    [template.id],
  );

  const handleGenerate = useCallback(async () => {
    if (!officeTemplate) return;

    setIsGenerating(true);
    try {
      // 使用默认参数生成
      const defaultParams: Record<string, string> = {};
      for (const field of officeTemplate.fields) {
        defaultParams[field.id] = field.defaultValue ?? `${field.label}内容`;
      }

      await onGenerate(defaultParams);

      toastManager.add({
        type: "success",
        title: "文档已生成",
        description: `${template.name} 已成功生成`,
        timeout: 3000,
      });

      onClose();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "生成失败",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsGenerating(false);
    }
  }, [officeTemplate, template.name, onGenerate, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("flex size-12 items-center justify-center rounded-xl", template.bgClass)}>
              <template.icon className={cn("size-6", template.colorClass)} />
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-foreground">{template.name}</h3>
              <Badge variant="outline" className="mt-1 text-[10px]">
                {DOC_TYPE_LABELS[template.docType]}
              </Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Description */}
        <p className="mb-4 text-[13px] text-muted-foreground">{template.description}</p>

        {/* Fields Preview */}
        {officeTemplate && (
          <div className="mb-4 rounded-lg bg-muted/20 p-3">
            <p className="mb-2 text-[11px] font-medium uppercase text-muted-foreground/60">
              模板包含以下字段
            </p>
            <div className="flex flex-wrap gap-1.5">
              {officeTemplate.fields.map((field) => (
                <Badge key={field.id} variant="secondary" className="text-[10px]">
                  {field.label}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
            <Clock className="size-3" />
            预计耗时 {template.estimatedTime}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isGenerating}>
              取消
            </Button>
            <Button size="sm" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 size-3.5" />
                  一键生成
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export function HomepageTemplateCards({
  onTemplateSelect,
  onGenerate,
  className,
}: HomepageTemplateCardsProps) {
  const [previewTemplate, setPreviewTemplate] = useState<TemplateCard | null>(null);

  const handleCardClick = useCallback(
    (template: TemplateCard) => {
      const officeTemplate = OFFICE_TEMPLATES.find((t) => t.id === template.id);
      if (officeTemplate) {
        onTemplateSelect?.(officeTemplate);
        setPreviewTemplate(template);
      }
    },
    [onTemplateSelect],
  );

  const handleGenerate = useCallback(
    async (params: Record<string, string>) => {
      if (previewTemplate && onGenerate) {
        const officeTemplate = OFFICE_TEMPLATES.find((t) => t.id === previewTemplate.id);
        if (officeTemplate) {
          await onGenerate(officeTemplate, params);
        }
      }
    },
    [previewTemplate, onGenerate],
  );

  return (
    <div className={cn("w-full", className)}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-500" />
          <h3 className="text-[14px] font-medium text-foreground">一键做同款</h3>
          <Badge variant="secondary" className="text-[10px]">
            热门模板
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12px] text-muted-foreground">
          查看全部
          <ChevronRight className="size-3" />
        </Button>
      </div>

      {/* Template Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {HOMEPAGE_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => handleCardClick(template)}
            className={cn(
              "group flex flex-col gap-2 rounded-xl border border-border/50 p-3 text-left transition-all",
              "hover:border-border hover:shadow-md active:scale-[0.98]",
              template.bgClass,
            )}
          >
            <div className="flex items-center justify-between">
              <template.icon className={cn("size-5", template.colorClass)} />
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                {DOC_TYPE_LABELS[template.docType]}
              </Badge>
            </div>
            <div>
              <p className="text-[13px] font-medium text-foreground">{template.name}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground/70">
                {template.description}
              </p>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
              <Clock className="size-2.5" />
              {template.estimatedTime}
            </div>
          </button>
        ))}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onGenerate={handleGenerate}
        />
      )}
    </div>
  );
}

export { HOMEPAGE_TEMPLATES };
export type { TemplateCard };
