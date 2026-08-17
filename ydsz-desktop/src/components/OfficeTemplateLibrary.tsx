/**
 * @file Office 模板库组件
 *
 * 提供常用 Office 文档模板（周报、月报、简历、商业计划书等 20+ 模板），
 * 用户可选择模板 → 填写参数 → 一键生成文档。
 *
 * ## 模板清单（24 个内置模板)
 *
 * Word (docx)：
 * - 周报、月报、会议纪要
 * - 简历、项目提案、需求文档(PRD)
 * - 技术方案、测试报告、竞品分析
 * - 商业计划书、用户手册、API文档
 * - 验收报告、结项报告、变更请求
 *
 * Excel (xlsx)：
 * - 数据表格、甘特图、里程碑计划
 * - 风险评估表、沟通计划、质量管理
 *
 * PowerPoint (pptx)：
 * - 项目汇报、产品介绍
 * - 培训材料、运维手册、立项评审
 *
 * ## 核心导出
 *
 * - `OfficeTemplateLibrary`：主组件
 * - `OFFICE_TEMPLATES`：内置模板列表
 */

import { memo, useCallback, useMemo, useState } from "react";
import {
  FileText,
  Presentation,
  ChevronRight,
  Loader2,
  Check,
  Download,
  Calendar,
  User,
  Hash,
  Plus,
  RefreshCw,
  Briefcase,
  Target,
  Shield,
  BookOpen,
  ClipboardList,
  Users,
  Database,
  FileCheck,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "~/lib/utils";
import { toastManager } from "./ui/toast";
import {
  officeDocxWrite,
  officeXlsxWrite,
  officePptxGenerate,
  type PptxSlideInput,
} from "~/contracts/office";

// ==================== Types ====================

/** 文档类型 */
type OfficeDocType = "docx" | "xlsx" | "pptx";

/** 模板参数字段 */
interface TemplateField {
  id: string;
  label: string;
  type: "text" | "textarea" | "date" | "number";
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}

/** 模板定义 */
interface OfficeTemplate {
  id: string;
  name: string;
  description: string;
  docType: OfficeDocType;
  icon: React.FC<{ className?: string }>;
  colorClass: string;
  fields: TemplateField[];
  generate: (params: Record<string, string>, outputPath: string) => Promise<void>;
}

// ==================== Helpers ====================

/** 格式化当前日期为 YYYY-MM-DD */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 文档类型标签 */
const DOC_TYPE_LABELS: Record<OfficeDocType, string> = {
  docx: "Word",
  xlsx: "Excel",
  pptx: "PPT",
};

/** 生成默认输出文件名 */
function defaultOutputPath(template: OfficeTemplate): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = template.name.replace(/\s+/g, "-");
  const ext = template.docType;
  return `${safeName}-${date}.${ext}`;
}

/** 选择保存路径（通过 Tauri dialog） */
async function pickSavePath(defaultPath: string): Promise<string | null> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const ext = defaultPath.split(".").pop() ?? "docx";
    const result = await save({
      defaultPath,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    return result ?? null;
  } catch {
    return defaultPath;
  }
}

// ==================== Built-in Templates (24 个) ====================

const OFFICE_TEMPLATES: OfficeTemplate[] = [
  // ---------- Word 模板 ----------
  {
    id: "weekly-report-docx",
    name: "周报模板",
    description: "标准团队周报，含本周完成、下周计划、风险事项",
    docType: "docx",
    icon: BookOpen,
    colorClass: "text-blue-500",
    fields: [
      { id: "title", label: "标题", type: "text", defaultValue: "团队周报", required: true },
      { id: "author", label: "作者", type: "text", placeholder: "请输入姓名", required: true },
      { id: "date", label: "日期", type: "date", defaultValue: today() },
      { id: "completed", label: "本周完成", type: "textarea", placeholder: "本周完成的工作项..." },
      { id: "planned", label: "下周计划", type: "textarea", placeholder: "下周计划的工作项..." },
      { id: "risks", label: "风险与问题", type: "textarea", placeholder: "当前风险和待解决问题..." },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        params.title || "团队周报",
        "",
        `作者：${params.author || ""}    日期：${params.date || ""}`,
        "",
        "## 本周完成",
        params.completed || "（无）",
        "",
        "## 下周计划",
        params.planned || "（无）",
        "",
        "## 风险与问题",
        params.risks || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "monthly-report-docx",
    name: "月报模板",
    description: "月度工作总结，含整体进展、数据分析、下月规划",
    docType: "docx",
    icon: BookOpen,
    colorClass: "text-indigo-500",
    fields: [
      { id: "title", label: "标题", type: "text", defaultValue: "月度工作报告", required: true },
      { id: "author", label: "作者", type: "text", required: true },
      { id: "month", label: "月份", type: "text", placeholder: "2026-07" },
      { id: "summary", label: "月度概述", type: "textarea" },
      { id: "progress", label: "项目进展", type: "textarea" },
      { id: "data", label: "数据分析", type: "textarea" },
      { id: "nextMonth", label: "下月规划", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        params.title || "月度工作报告",
        "",
        `作者：${params.author || ""}    月份：${params.month || ""}`,
        "",
        "## 月度概述",
        params.summary || "（无）",
        "",
        "## 项目进展",
        params.progress || "（无）",
        "",
        "## 数据分析",
        params.data || "（无）",
        "",
        "## 下月规划",
        params.nextMonth || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "meeting-notes-docx",
    name: "会议纪要",
    description: "标准会议纪要模板，含议题、决议、行动项",
    docType: "docx",
    icon: ClipboardList,
    colorClass: "text-emerald-500",
    fields: [
      { id: "title", label: "会议主题", type: "text", required: true },
      { id: "date", label: "日期", type: "date", defaultValue: today() },
      { id: "attendees", label: "参会人员", type: "text", placeholder: "张三、李四、王五" },
      { id: "agenda", label: "会议议题", type: "textarea" },
      { id: "decisions", label: "决议事项", type: "textarea" },
      { id: "actions", label: "行动项", type: "textarea", placeholder: "负责人 / 任务 / 截止日期" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        `会议纪要：${params.title || ""}`,
        "",
        `日期：${params.date || ""}    参会：${params.attendees || ""}`,
        "",
        "## 会议议题",
        params.agenda || "（无）",
        "",
        "## 决议事项",
        params.decisions || "（无）",
        "",
        "## 行动项",
        params.actions || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "resume-docx",
    name: "简历模板",
    description: "专业简历模板，含教育背景、工作经历、技能特长",
    docType: "docx",
    icon: User,
    colorClass: "text-cyan-500",
    fields: [
      { id: "name", label: "姓名", type: "text", required: true },
      { id: "title", label: "职位目标", type: "text", placeholder: "高级前端工程师" },
      { id: "contact", label: "联系方式", type: "text", placeholder: "电话 / 邮箱 / 城市" },
      { id: "education", label: "教育背景", type: "textarea", placeholder: "学校 / 专业 / 时间" },
      { id: "experience", label: "工作经历", type: "textarea", placeholder: "公司 / 职位 / 时间 / 职责描述" },
      { id: "skills", label: "技能特长", type: "textarea", placeholder: "按熟练程度列出技能项" },
      { id: "projects", label: "项目经验", type: "textarea", placeholder: "项目名 / 角色 / 技术栈 / 成果" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        params.name || "姓名",
        params.title || "",
        params.contact || "",
        "",
        "## 教育背景",
        params.education || "（无）",
        "",
        "## 工作经历",
        params.experience || "（无）",
        "",
        "## 技能特长",
        params.skills || "（无）",
        "",
        "## 项目经验",
        params.projects || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "prd-docx",
    name: "需求文档 (PRD)",
    description: "产品需求文档，含需求背景、用户故事、功能规范、验收标准",
    docType: "docx",
    icon: Target,
    colorClass: "text-orange-500",
    fields: [
      { id: "title", label: "需求标题", type: "text", required: true },
      { id: "author", label: "产品经理", type: "text", required: true },
      { id: "version", label: "版本号", type: "text", defaultValue: "1.0" },
      { id: "background", label: "需求背景", type: "textarea" },
      { id: "userStories", label: "用户故事（每行一条）", type: "textarea", placeholder: "作为…我想要…以便…" },
      { id: "functional", label: "功能规范", type: "textarea" },
      { id: "acceptance", label: "验收标准", type: "textarea" },
      { id: "nonfunctional", label: "非功能需求", type: "textarea", placeholder: "性能 / 安全 / 可用性等" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        params.title || "产品需求文档",
        "",
        `产品经理：${params.author || ""}    版本：${params.version || "1.0"}    日期：${today()}`,
        "",
        "## 1. 需求背景",
        params.background || "（无）",
        "",
        "## 2. 用户故事",
        params.userStories || "（无）",
        "",
        "## 3. 功能规范",
        params.functional || "（无）",
        "",
        "## 4. 验收标准",
        params.acceptance || "（无）",
        "",
        "## 5. 非功能需求",
        params.nonfunctional || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "tech-spec-docx",
    name: "技术方案文档",
    description: "技术架构设计文档，含总体设计、模块设计、接口设计、风险评估",
    docType: "docx",
    icon: Briefcase,
    colorClass: "text-sky-500",
    fields: [
      { id: "title", label: "方案标题", type: "text", required: true },
      { id: "author", label: "架构师", type: "text", required: true },
      { id: "overview", label: "概述", type: "textarea" },
      { id: "architecture", label: "总体架构", type: "textarea", placeholder: "系统架构图描述 / 技术栈选型" },
      { id: "modules", label: "模块设计", type: "textarea" },
      { id: "interfaces", label: "接口设计", type: "textarea" },
      { id: "risk", label: "风险评估", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        params.title || "技术方案文档",
        "",
        `架构师：${params.author || ""}    日期：${today()}`,
        "",
        "## 1. 概述",
        params.overview || "（无）",
        "",
        "## 2. 总体架构",
        params.architecture || "（无）",
        "",
        "## 3. 模块设计",
        params.modules || "（无）",
        "",
        "## 4. 接口设计",
        params.interfaces || "（无）",
        "",
        "## 5. 风险评估",
        params.risk || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "test-report-docx",
    name: "测试报告",
    description: "测试总结报告，含测试范围、用例统计、缺陷分析、质量结论",
    docType: "docx",
    icon: FileCheck,
    colorClass: "text-green-500",
    fields: [
      { id: "title", label: "报告标题", type: "text", defaultValue: "测试报告", required: true },
      { id: "project", label: "项目名称", type: "text", required: true },
      { id: "tester", label: "测试工程师", type: "text" },
      { id: "scope", label: "测试范围", type: "textarea" },
      { id: "cases", label: "用例统计", type: "textarea", placeholder: "总用例 / 通过 / 失败 / 阻塞" },
      { id: "defects", label: "缺陷分析", type: "textarea" },
      { id: "conclusion", label: "质量结论", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        params.title || "测试报告",
        "",
        `项目：${params.project || ""}    测试：${params.tester || ""}    日期：${today()}`,
        "",
        "## 1. 测试范围",
        params.scope || "（无）",
        "",
        "## 2. 用例统计",
        params.cases || "（无）",
        "",
        "## 3. 缺陷分析",
        params.defects || "（无）",
        "",
        "## 4. 质量结论",
        params.conclusion || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "competitor-analysis-docx",
    name: "竞品分析报告",
    description: "竞品分析模板，含竞品选择、功能对比、差异化分析、策略建议",
    docType: "docx",
    icon: Target,
    colorClass: "text-red-500",
    fields: [
      { id: "title", label: "分析主题", type: "text", required: true },
      { id: "author", label: "分析师", type: "text" },
      { id: "competitors", label: "竞品列表（每行一个）", type: "textarea", placeholder: "竞品 A / 竞品 B / 竞品 C" },
      { id: "dimensions", label: "对比维度（每行一个）", type: "textarea", placeholder: "功能 / 价格 / 用户体验 / 技术架构" },
      { id: "comparison", label: "功能对比", type: "textarea" },
      { id: "differentiation", label: "差异化分析", type: "textarea" },
      { id: "recommendations", label: "策略建议", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        params.title || "竞品分析报告",
        "",
        `分析师：${params.author || ""}    日期：${today()}`,
        "",
        "## 1. 竞品列表",
        params.competitors || "（无）",
        "",
        "## 2. 对比维度",
        params.dimensions || "（无）",
        "",
        "## 3. 功能对比",
        params.comparison || "（无）",
        "",
        "## 4. 差异化分析",
        params.differentiation || "（无）",
        "",
        "## 5. 策略建议",
        params.recommendations || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "business-plan-docx",
    name: "商业计划书",
    description: "创业商业计划书，含市场分析、商业模式、财务预测、团队介绍",
    docType: "docx",
    icon: Briefcase,
    colorClass: "text-violet-500",
    fields: [
      { id: "company", label: "公司名称", type: "text", required: true },
      { id: "slogan", label: "公司 Slogan", type: "text" },
      { id: "market", label: "市场分析", type: "textarea" },
      { id: "solution", label: "产品/解决方案", type: "textarea" },
      { id: "businessModel", label: "商业模式", type: "textarea" },
      { id: "financials", label: "财务预测", type: "textarea" },
      { id: "team", label: "核心团队", type: "textarea" },
      { id: "ask", label: "融资需求", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        params.company || "公司名称",
        params.slogan || "",
        "",
        "## 1. 市场分析",
        params.market || "（无）",
        "",
        "## 2. 产品/解决方案",
        params.solution || "（无）",
        "",
        "## 3. 商业模式",
        params.businessModel || "（无）",
        "",
        "## 4. 财务预测",
        params.financials || "（无）",
        "",
        "## 5. 核心团队",
        params.team || "（无）",
        "",
        "## 6. 融资需求",
        params.ask || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "user-manual-docx",
    name: "用户手册",
    description: "产品用户手册，含产品概述、安装指南、功能说明、FAQ",
    docType: "docx",
    icon: BookOpen,
    colorClass: "text-teal-500",
    fields: [
      { id: "product", label: "产品名称", type: "text", required: true },
      { id: "version", label: "版本号", type: "text", defaultValue: "1.0" },
      { id: "overview", label: "产品概述", type: "textarea" },
      { id: "install", label: "安装指南", type: "textarea" },
      { id: "features", label: "功能说明（每章一段）", type: "textarea" },
      { id: "faq", label: "常见问题（FAQ）", type: "textarea" },
      { id: "support", label: "技术支持", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        `${params.product || "产品"} 用户手册`,
        `版本：${params.version || "1.0"}`,
        "",
        "## 1. 产品概述",
        params.overview || "（无）",
        "",
        "## 2. 安装指南",
        params.install || "（无）",
        "",
        "## 3. 功能说明",
        params.features || "（无）",
        "",
        "## 4. 常见问题",
        params.faq || "（无）",
        "",
        "## 5. 技术支持",
        params.support || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "api-docx",
    name: "API 文档模板",
    description: "接口文档模板，含接口说明、请求/响应示例、错误码定义",
    docType: "docx",
    icon: Database,
    colorClass: "text-amber-500",
    fields: [
      { id: "apiName", label: "接口名称", type: "text", required: true },
      { id: "method", label: "请求方法", type: "text", defaultValue: "GET" },
      { id: "url", label: "接口 URL", type: "text", placeholder: "/api/v1/resource" },
      { id: "description", label: "接口描述", type: "textarea" },
      { id: "request", label: "请求参数", type: "textarea" },
      { id: "response", label: "响应示例", type: "textarea" },
      { id: "errors", label: "错误码（每行一条）", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        `API 文档：${params.apiName || ""}`,
        "",
        `**方法**：${params.method || "GET"}    **URL**：${params.url || ""}`,
        "",
        "## 接口描述",
        params.description || "（无）",
        "",
        "## 请求参数",
        params.request || "（无）",
        "",
        "## 响应示例",
        params.response || "（无）",
        "",
        "## 错误码",
        params.errors || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "acceptance-report-docx",
    name: "验收报告",
    description: "项目验收报告，含验收范围、测试结果、问题清单、验收结论",
    docType: "docx",
    icon: FileCheck,
    colorClass: "text-pink-500",
    fields: [
      { id: "project", label: "项目名称", type: "text", required: true },
      { id: "version", label: "版本号", type: "text", required: true },
      { id: "scope", label: "验收范围", type: "textarea" },
      { id: "results", label: "测试结果", type: "textarea" },
      { id: "issues", label: "遗留问题", type: "textarea" },
      { id: "signoff", label: "验收结论", type: "textarea", placeholder: "通过 / 有条件通过 / 不通过" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        "验收报告",
        "",
        `项目：${params.project || ""}    版本：${params.version || ""}    日期：${today()}`,
        "",
        "## 1. 验收范围",
        params.scope || "（无）",
        "",
        "## 2. 测试结果",
        params.results || "（无）",
        "",
        "## 3. 遗留问题",
        params.issues || "（无）",
        "",
        "## 4. 验收结论",
        params.signoff || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "closing-report-docx",
    name: "结项报告",
    description: "项目结项总结，含目标达成、经验教训、后续计划",
    docType: "docx",
    icon: Briefcase,
    colorClass: "text-lime-500",
    fields: [
      { id: "project", label: "项目名称", type: "text", required: true },
      { id: "pm", label: "项目经理", type: "text" },
      { id: "duration", label: "项目周期", type: "text", placeholder: "2026-01-01 ~ 2026-06-30" },
      { id: "objectives", label: "目标达成", type: "textarea" },
      { id: "deliverables", label: "交付物清单", type: "textarea" },
      { id: "lessons", label: "经验教训", type: "textarea" },
      { id: "nextSteps", label: "后续计划", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        "结项报告",
        "",
        `项目：${params.project || ""}    PM：${params.pm || ""}    日期：${today()}`,
        "",
        "## 1. 项目周期",
        params.duration || "（无）",
        "",
        "## 2. 目标达成",
        params.objectives || "（无）",
        "",
        "## 3. 交付物清单",
        params.deliverables || "（无）",
        "",
        "## 4. 经验教训",
        params.lessons || "（无）",
        "",
        "## 5. 后续计划",
        params.nextSteps || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  {
    id: "change-request-docx",
    name: "变更请求单",
    description: "需求/设计变更申请，含变更原因、影响分析、审批流程",
    docType: "docx",
    icon: Shield,
    colorClass: "text-orange-500",
    fields: [
      { id: "title", label: "变更标题", type: "text", required: true },
      { id: "requestor", label: "申请人", type: "text", required: true },
      { id: "reason", label: "变更原因", type: "textarea" },
      { id: "scope", label: "变更范围", type: "textarea" },
      { id: "impact", label: "影响分析", type: "textarea" },
      { id: "cost", label: "成本评估", type: "textarea" },
      { id: "approval", label: "审批意见", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const paragraphs = [
        "变更请求单",
        "",
        `变更标题：${params.title || ""}    申请人：${params.requestor || ""}    日期：${today()}`,
        "",
        "## 1. 变更原因",
        params.reason || "（无）",
        "",
        "## 2. 变更范围",
        params.scope || "（无）",
        "",
        "## 3. 影响分析",
        params.impact || "（无）",
        "",
        "## 4. 成本评估",
        params.cost || "（无）",
        "",
        "## 5. 审批意见",
        params.approval || "（无）",
      ];
      await officeDocxWrite(outputPath, paragraphs);
    },
  },
  // ---------- Excel 模板 ----------
  {
    id: "data-table-xlsx",
    name: "数据表格",
    description: "标准数据表格模板，含表头和数据行",
    docType: "xlsx",
    icon: Database,
    colorClass: "text-amber-500",
    fields: [
      { id: "sheetName", label: "Sheet 名称", type: "text", defaultValue: "数据表" },
      { id: "headers", label: "表头（逗号分隔）", type: "text", defaultValue: "ID,名称,状态,创建时间" },
      { id: "rowCount", label: "空行数", type: "number", defaultValue: "10" },
    ],
    generate: async (params, outputPath) => {
      const sheetName = params.sheetName || "数据表";
      const headers = (params.headers || "ID,名称,状态").split(",").map((h) => h.trim());
      const rowCount = Math.min(parseInt(params.rowCount || "10", 10) || 10, 100);
      const rows: string[][] = [headers];
      for (let i = 0; i < rowCount; i++) {
        rows.push(headers.map(() => ""));
      }
      await officeXlsxWrite(outputPath, sheetName, rows);
    },
  },
  {
    id: "gantt-chart-xlsx",
    name: "甘特图模板",
    description: "项目甘特图，含任务名称、开始/结束日期、负责人、完成百分比",
    docType: "xlsx",
    icon: Calendar,
    colorClass: "text-green-500",
    fields: [
      { id: "project", label: "项目名称", type: "text", required: true },
      { id: "headers", label: "任务信息（每行: 任务名 | 开始日期 | 结束日期 | 负责人 | 完成%）", type: "textarea", placeholder: "需求分析 | 2026-01-01 | 2026-01-07 | 张三 | 100\n设计阶段 | 2026-01-08 | 2026-01-14 | 李四 | 80" },
    ],
    generate: async (params, outputPath) => {
      const sheetName = "甘特图";
      const headers = ["任务名称", "开始日期", "结束日期", "负责人", "完成%", "状态"];
      const rows: string[][] = [headers];
      const lines = (params.headers || "").split("\n").filter((l) => l.trim());
      for (const line of lines) {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length >= 4) {
          rows.push([parts[0], parts[1], parts[2], parts[3], parts[4] || "0", parts[5] || "未开始"]);
        }
      }
      await officeXlsxWrite(outputPath, sheetName, rows);
    },
  },
  {
    id: "risk-register-xlsx",
    name: "风险评估表",
    description: "项目风险登记册，含风险描述、概率、影响、应对策略、责任人",
    docType: "xlsx",
    icon: Shield,
    colorClass: "text-red-500",
    fields: [
      { id: "project", label: "项目名称", type: "text", required: true },
      { id: "risks", label: "风险项（每行: 风险描述 | 概率(H/M/L) | 影响(H/M/L) | 应对策略 | 责任人）", type: "textarea", placeholder: "人员流失风险 | M | H | 关键岗位备份 | 张三\n技术选型风险 | L | M | 技术预研验证 | 李四" },
    ],
    generate: async (params, outputPath) => {
      const sheetName = "风险评估";
      const headers = ["风险编号", "风险描述", "概率", "影响", "风险等级", "应对策略", "责任人", "状态"];
      const rows: string[][] = [headers];
      const lines = (params.risks || "").split("\n").filter((l) => l.trim());
      lines.forEach((line, idx) => {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length >= 4) {
          const prob = parts[1] || "M";
          const impact = parts[2] || "M";
          const level = (prob === "H" && impact === "H") ? "高" : (prob === "L" && impact === "L") ? "低" : "中";
          rows.push([`R${idx + 1}`, parts[0], prob, impact, level, parts[3] || "", parts[4] || "", "监控中"]);
        }
      });
      await officeXlsxWrite(outputPath, sheetName, rows);
    },
  },
  {
    id: "communication-plan-xlsx",
    name: "沟通计划表",
    description: "项目沟通计划，含沟通方式、频率、参与人、输出物",
    docType: "xlsx",
    icon: Users,
    colorClass: "text-blue-500",
    fields: [
      { id: "project", label: "项目名称", type: "text", required: true },
      { id: "activities", label: "沟通活动（每行: 活动名称 | 方式 | 频率 | 参与人 | 输出物）", type: "textarea", placeholder: "每日站会 | 线下 | 每天 | 全体开发 | 站会纪要\n周例会 | 视频会议 | 每周 | 项目干系人 | 周报" },
    ],
    generate: async (params, outputPath) => {
      const sheetName = "沟通计划";
      const headers = ["沟通活动", "方式", "频率", "参与人", "输出物", "负责人"];
      const rows: string[][] = [headers];
      const lines = (params.activities || "").split("\n").filter((l) => l.trim());
      for (const line of lines) {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length >= 4) {
          rows.push([parts[0], parts[1], parts[2], parts[3], parts[4] || "", parts[5] || ""]);
        }
      }
      await officeXlsxWrite(outputPath, sheetName, rows);
    },
  },
  {
    id: "quality-plan-xlsx",
    name: "质量管理计划",
    description: "项目质量管理，含质量标准、评审计划、测试策略、缺陷管理",
    docType: "xlsx",
    icon: FileCheck,
    colorClass: "text-purple-500",
    fields: [
      { id: "project", label: "项目名称", type: "text", required: true },
      { id: "metrics", label: "质量指标（每行: 指标名称 | 目标值 | 测量方法）", type: "textarea", placeholder: "代码覆盖率 | >=80% | 单元测试统计\nBug 密度 | <0.5/KLOC | 测试报告" },
      { id: "reviews", label: "评审计划（每行: 评审内容 | 参与人 | 计划日期）", type: "textarea" },
      { id: "testing", label: "测试策略", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const sheetName = "质量管理";
      const headers = ["类别", "项目", "目标/内容", "负责人", "计划日期"];
      const rows: string[][] = [headers];
      const metricsLines = (params.metrics || "").split("\n").filter((l) => l.trim());
      for (const line of metricsLines) {
        const parts = line.split("|").map((p) => p.trim());
        rows.push(["质量指标", parts[0] || "", parts[1] || "", parts[3] || "", ""]);
      }
      const reviewLines = (params.reviews || "").split("\n").filter((l) => l.trim());
      for (const line of reviewLines) {
        const parts = line.split("|").map((p) => p.trim());
        rows.push(["评审计划", parts[0] || "", parts[1] || "", "", parts[2] || ""]);
      }
      await officeXlsxWrite(outputPath, sheetName, rows);
    },
  },
  {
    id: "milestone-plan-xlsx",
    name: "里程碑计划",
    description: "项目里程碑计划，含关键节点、交付物、验收标准、负责人",
    docType: "xlsx",
    icon: Target,
    colorClass: "text-indigo-500",
    fields: [
      { id: "project", label: "项目名称", type: "text", required: true },
      { id: "milestones", label: "里程碑（每行: 节点名称 | 计划日期 | 交付物 | 验收标准 | 负责人）", type: "textarea", placeholder: "需求冻结 | 2026-01-15 | PRD文档 | 评审通过 | 张三\n设计完成 | 2026-02-15 | 设计稿 | 评审通过 | 李四" },
    ],
    generate: async (params, outputPath) => {
      const sheetName = "里程碑计划";
      const headers = ["里程碑节点", "计划日期", "交付物", "验收标准", "负责人", "状态"];
      const rows: string[][] = [headers];
      const lines = (params.milestones || "").split("\n").filter((l) => l.trim());
      for (const line of lines) {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length >= 4) {
          rows.push([parts[0], parts[1], parts[2], parts[3], parts[4] || "", "未开始"]);
        }
      }
      await officeXlsxWrite(outputPath, sheetName, rows);
    },
  },
  // ---------- PowerPoint 模板 ----------
  {
    id: "project-pptx",
    name: "项目汇报 PPT",
    description: "项目汇报演示文稿，含标题页、概述、进展、计划",
    docType: "pptx",
    icon: Presentation,
    colorClass: "text-rose-500",
    fields: [
      { id: "title", label: "项目名称", type: "text", required: true },
      { id: "subtitle", label: "副标题", type: "text", placeholder: "2026 年度汇报" },
      { id: "overview", label: "项目概述", type: "textarea" },
      { id: "highlights", label: "核心成果（每行一条）", type: "textarea" },
      { id: "challenges", label: "挑战与应对", type: "textarea" },
      { id: "nextSteps", label: "下一步计划（每行一条）", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const slides: PptxSlideInput[] = [
        { slideType: "title", title: params.title || "项目汇报", subtitle: params.subtitle || "" },
        { slideType: "content", title: "项目概述", bullets: (params.overview || "").split("\n").filter((s) => s.trim()) },
        { slideType: "twoColumn", title: "核心成果 vs 挑战", leftHeading: "核心成果", leftBullets: (params.highlights || "").split("\n").filter((s) => s.trim()), rightHeading: "挑战与应对", rightBullets: (params.challenges || "").split("\n").filter((s) => s.trim()) },
        { slideType: "section", title: "下一步计划" },
        { slideType: "content", title: "行动计划", bullets: (params.nextSteps || "").split("\n").filter((s) => s.trim()) },
      ];
      await officePptxGenerate(outputPath, slides);
    },
  },
  {
    id: "product-intro-pptx",
    name: "产品介绍 PPT",
    description: "产品介绍演示文稿，含产品定位、功能亮点、技术架构",
    docType: "pptx",
    icon: Presentation,
    colorClass: "text-purple-500",
    fields: [
      { id: "title", label: "产品名称", type: "text", required: true },
      { id: "subtitle", label: "Slogan", type: "text" },
      { id: "positioning", label: "产品定位", type: "textarea" },
      { id: "features", label: "功能亮点（每行一条）", type: "textarea" },
      { id: "techStack", label: "技术架构（每行一条）", type: "textarea" },
      { id: "roadmap", label: "路线图（每行一条）", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const slides: PptxSlideInput[] = [
        { slideType: "title", title: params.title || "产品介绍", subtitle: params.subtitle || "" },
        { slideType: "twoColumn", title: "定位 vs 功能", leftHeading: "产品定位", leftBullets: (params.positioning || "").split("\n").filter((s) => s.trim()), rightHeading: "功能亮点", rightBullets: (params.features || "").split("\n").filter((s) => s.trim()) },
        { slideType: "table", title: "技术架构", headers: ["层级", "技术", "说明"], rows: (params.techStack || "").split("\n").filter((s) => s.trim()).map((s) => [s, "", ""]) },
        { slideType: "section", title: "产品路线图" },
        { slideType: "content", title: "规划里程碑", bullets: (params.roadmap || "").split("\n").filter((s) => s.trim()) },
      ];
      await officePptxGenerate(outputPath, slides);
    },
  },
  {
    id: "training-material-pptx",
    name: "培训材料 PPT",
    description: "员工培训演示文稿，含培训目标、课程大纲、案例分析、考核方式",
    docType: "pptx",
    icon: BookOpen,
    colorClass: "text-teal-500",
    fields: [
      { id: "title", label: "培训主题", type: "text", required: true },
      { id: "audience", label: "培训对象", type: "text" },
      { id: "objectives", label: "培训目标（每行一条）", type: "textarea" },
      { id: "outline", label: "课程大纲（每行一条）", type: "textarea" },
      { id: "cases", label: "案例分析", type: "textarea" },
      { id: "assessment", label: "考核方式", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const slides: PptxSlideInput[] = [
        { slideType: "title", title: params.title || "培训材料", subtitle: params.audience || "" },
        { slideType: "content", title: "培训目标", bullets: (params.objectives || "").split("\n").filter((s) => s.trim()) },
        { slideType: "twoColumn", title: "课程大纲", leftHeading: "上午课程", leftBullets: (params.outline || "").split("\n").filter((s) => s.trim()).slice(0, 5), rightHeading: "下午课程", rightBullets: (params.outline || "").split("\n").filter((s) => s.trim()).slice(5) },
        { slideType: "content", title: "案例分析", bullets: (params.cases || "").split("\n").filter((s) => s.trim()) },
        { slideType: "content", title: "考核方式", bullets: (params.assessment || "").split("\n").filter((s) => s.trim()) },
      ];
      await officePptxGenerate(outputPath, slides);
    },
  },
  {
    id: "ops-manual-pptx",
    name: "运维手册 PPT",
    description: "系统运维演示文稿，含架构图、部署流程、监控告警、应急预案",
    docType: "pptx",
    icon: Shield,
    colorClass: "text-red-500",
    fields: [
      { id: "system", label: "系统名称", type: "text", required: true },
      { id: "architecture", label: "系统架构", type: "textarea" },
      { id: "deploy", label: "部署流程（每行一步）", type: "textarea" },
      { id: "monitoring", label: "监控指标（每行一个）", type: "textarea" },
      { id: "alerts", label: "告警规则（每行一条）", type: "textarea" },
      { id: "contingency", label: "应急预案", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const slides: PptxSlideInput[] = [
        { slideType: "title", title: `${params.system || "系统"} 运维手册`, subtitle: "部署 · 监控 · 应急" },
        { slideType: "content", title: "系统架构", bullets: (params.architecture || "").split("\n").filter((s) => s.trim()) },
        { slideType: "twoColumn", title: "部署与监控", leftHeading: "部署流程", leftBullets: (params.deploy || "").split("\n").filter((s) => s.trim()), rightHeading: "监控指标", rightBullets: (params.monitoring || "").split("\n").filter((s) => s.trim()) },
        { slideType: "table", title: "告警规则", headers: ["告警项", "阈值", "通知方式"], rows: (params.alerts || "").split("\n").filter((s) => s.trim()).map((s) => [s, "", ""]) },
        { slideType: "content", title: "应急预案", bullets: (params.contingency || "").split("\n").filter((s) => s.trim()) },
      ];
      await officePptxGenerate(outputPath, slides);
    },
  },
  {
    id: "project-kickoff-pptx",
    name: "立项评审 PPT",
    description: "项目立项评审演示文稿，含项目背景、目标、范围、计划、资源需求、风险评估",
    docType: "pptx",
    icon: Briefcase,
    colorClass: "text-sky-500",
    fields: [
      { id: "title", label: "项目名称", type: "text", required: true },
      { id: "sponsor", label: "项目发起人", type: "text" },
      { id: "background", label: "项目背景", type: "textarea" },
      { id: "objectives", label: "项目目标（每行一条）", type: "textarea" },
      { id: "scope", label: "项目范围", type: "textarea" },
      { id: "timeline", label: "项目计划", type: "textarea" },
      { id: "resources", label: "资源需求", type: "textarea" },
      { id: "risks", label: "风险评估", type: "textarea" },
    ],
    generate: async (params, outputPath) => {
      const slides: PptxSlideInput[] = [
        { slideType: "title", title: params.title || "项目立项评审", subtitle: `发起人：${params.sponsor || ""}` },
        { slideType: "content", title: "项目背景", bullets: (params.background || "").split("\n").filter((s) => s.trim()) },
        { slideType: "twoColumn", title: "目标与范围", leftHeading: "项目目标", leftBullets: (params.objectives || "").split("\n").filter((s) => s.trim()), rightHeading: "项目范围", rightBullets: (params.scope || "").split("\n").filter((s) => s.trim()) },
        { slideType: "content", title: "项目计划", bullets: (params.timeline || "").split("\n").filter((s) => s.trim()) },
        { slideType: "twoColumn", title: "资源与风险", leftHeading: "资源需求", leftBullets: (params.resources || "").split("\n").filter((s) => s.trim()), rightHeading: "风险评估", rightBullets: (params.risks || "").split("\n").filter((s) => s.trim()) },
      ];
      await officePptxGenerate(outputPath, slides);
    },
  },
];

// ==================== Template Form ====================

interface TemplateFormProps {
  template: OfficeTemplate;
  onGenerate: (params: Record<string, string>, outputPath: string) => Promise<void>;
  onBack: () => void;
}

function TemplateForm({ template, onGenerate, onBack }: TemplateFormProps) {
  const [params, setParams] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const field of template.fields) {
      defaults[field.id] = field.defaultValue ?? "";
    }
    return defaults;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPath, setGeneratedPath] = useState<string | null>(null);

  const handleFieldChange = useCallback((fieldId: string, value: string) => {
    setParams((prev) => ({ ...prev, [fieldId]: value }));
    setGeneratedPath(null);
  }, []);

  const missingRequired = useMemo(() => {
    return template.fields.filter((f) => f.required && !(params[f.id]?.trim()));
  }, [template.fields, params]);

  const handleGenerate = useCallback(async () => {
    if (missingRequired.length > 0) {
      toastManager.add({
        type: "warning",
        title: "请填写必填字段",
        description: missingRequired.map((f) => f.label).join("、"),
        timeout: 3000,
      });
      return;
    }

    const outputPath = await pickSavePath(defaultOutputPath(template));
    if (!outputPath) return;

    setIsGenerating(true);
    try {
      await template.generate(params, outputPath);
      setGeneratedPath(outputPath);
      toastManager.add({
        type: "success",
        title: "文档已生成",
        description: outputPath,
        timeout: 4000,
      });
      await onGenerate(params, outputPath);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "生成失败",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsGenerating(false);
    }
  }, [template, params, missingRequired, onGenerate]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/50", template.colorClass)}>
          <template.icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">{template.name}</p>
          <p className="text-[11px] text-muted-foreground/80">{template.description}</p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {DOC_TYPE_LABELS[template.docType]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {template.fields.map((field) => (
          <div
            key={field.id}
            className={cn("space-y-1.5", field.type === "textarea" && "sm:col-span-2")}
          >
            <label className="flex items-center gap-1 text-[12px] font-medium text-foreground/80">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </label>
            {field.type === "textarea" ? (
              <Textarea
                value={params[field.id] ?? ""}
                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                className="text-[13px]"
              />
            ) : field.type === "date" ? (
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  type="date"
                  value={params[field.id] ?? ""}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className="pl-9 text-[13px]"
                />
              </div>
            ) : field.type === "number" ? (
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  type="number"
                  value={params[field.id] ?? ""}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  placeholder={field.placeholder}
                  className="pl-9 text-[13px]"
                />
              </div>
            ) : (
              <Input
                type="text"
                value={params[field.id] ?? ""}
                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="text-[13px]"
              />
            )}
          </div>
        ))}
      </div>

      {generatedPath && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3">
          <Check className="size-4 text-green-600 dark:text-green-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-foreground">文档已生成</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground" title={generatedPath}>
              {generatedPath}
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack} disabled={isGenerating}>
          返回
        </Button>
        <Button onClick={handleGenerate} disabled={isGenerating || missingRequired.length > 0}>
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              生成中...
            </>
          ) : generatedPath ? (
            <>
              <RefreshCw className="mr-2 size-4" />
              重新生成
            </>
          ) : (
            <>
              <Download className="mr-2 size-4" />
              生成文档
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export const OfficeTemplateLibrary = memo(function OfficeTemplateLibrary({
  className,
  onGenerated,
}: {
  className?: string;
  /** 文档生成成功回调 */
  onGenerated?: (path: string, template: OfficeTemplate) => void;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<OfficeTemplate | null>(null);
  const [filterType, setFilterType] = useState<OfficeDocType | "all">("all");

  const filteredTemplates = useMemo(() => {
    if (filterType === "all") return OFFICE_TEMPLATES;
    return OFFICE_TEMPLATES.filter((t) => t.docType === filterType);
  }, [filterType]);

  const handleGenerate = useCallback(
    async (_params: Record<string, string>, outputPath: string) => {
      if (selectedTemplate && onGenerated) {
        onGenerated(outputPath, selectedTemplate);
      }
    },
    [selectedTemplate, onGenerated],
  );

  if (selectedTemplate) {
    return (
      <div
        className={cn("flex flex-col gap-4 p-4", className)}
        data-testid="office-template-library"
      >
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[12px]"
            onClick={() => setSelectedTemplate(null)}
          >
            <ChevronRight className="size-3.5 rotate-180" />
            返回模板列表
          </Button>
        </div>
        <TemplateForm
          template={selectedTemplate}
          onGenerate={handleGenerate}
          onBack={() => setSelectedTemplate(null)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-4 p-4", className)}
      data-testid="office-template-library"
    >
      <div className="flex items-center gap-2">
        <FileText className="size-5 text-primary" />
        <h2 className="text-[16px] font-semibold text-foreground">Office 模板库</h2>
        <Badge variant="secondary" className="text-[10px]">
          {OFFICE_TEMPLATES.length} 个模板
        </Badge>
      </div>
      <p className="text-[12px] text-muted-foreground/85">
        选择模板，填写参数，一键生成 Word / Excel / PowerPoint 文档
      </p>

      {/* 类型筛选 */}
      <div className="flex items-center gap-2">
        {(["all", "docx", "xlsx", "pptx"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilterType(type)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
              filterType === type
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {type === "all" ? `全部 (${OFFICE_TEMPLATES.length})` : `${DOC_TYPE_LABELS[type]} (${OFFICE_TEMPLATES.filter((t) => t.docType === type).length})`}
          </button>
        ))}
      </div>

      {/* 模板卡片网格 */}
      <ScrollArea className="max-h-[520px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setSelectedTemplate(template)}
              className="group flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-4 text-left transition-colors hover:border-border hover:bg-muted/30"
              data-testid={`office-template-${template.id}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/50",
                    template.colorClass,
                  )}
                >
                  <template.icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {template.name}
                    </p>
                    <Badge variant="outline" className="shrink-0 text-[9px] px-1.5 py-0">
                      {DOC_TYPE_LABELS[template.docType]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground/80">
                    {template.description}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground/60" />
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                <Plus className="size-3" />
                {template.fields.length} 个参数
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
});

/** 导出模板列表供外部使用 */
export { OFFICE_TEMPLATES };
export type { OfficeTemplate, TemplateField, OfficeDocType };
