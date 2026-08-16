/**
 * @file 首次启动引导组件
 *
 * 为新用户提供 7 步引导：
 * 1. 创建工作区
 * 2. 选择 Provider
 * 3. 写第一句话
 * 4. 切换 Work/Code 模式
 * 5. 查看产物
 * 6. Work/Code 双域介绍
 * 7. 移动端配对推广
 *
 * ## 核心功能
 *
 * - **步骤引导**：7 步渐进式引导
 * - **键盘导航**：支持 Tab/Enter/Esc
 * - **进度保存**：跳过/完成的用户不再弹
 * - **可重新开启**：设置页可重新触发
 *
 * ## 使用场景
 *
 * - 新用户首次启动
 * - 设置页"重新查看引导"
 *
 * ## 注意事项
 *
 * - 首次启动 1.5s 后自动弹起
 * - 支持键盘导航
 * - 跳过后不再自动弹出
 */

import { memo, useCallback, useEffect, useState } from "react";
import { PiCheckCircle, PiX, PiArrowLeft, PiArrowRight } from "react-icons/pi";
import { Button } from "./ui/button";
import { cn } from "~/lib/utils";

/** 引导步骤 */
interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface OnboardingTourProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 完成回调 */
  onComplete?: () => void;
  /** 跳过回调 */
  onSkip?: () => void;
}

/** 引导步骤配置 */
const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "workspace",
    title: "创建工作区",
    description: "工作区是管理项目和任务的起点。点击侧栏的 + 按钮创建你的第一个工作区。",
    icon: <PiCheckCircle className="size-12 text-primary" />,
  },
  {
    id: "provider",
    title: "选择 AI 提供商",
    description: "ydsz-buddy 支持 8 家 AI 提供商。在顶部选择你喜欢的 Provider 开始对话。",
    icon: <PiCheckCircle className="size-12 text-primary" />,
  },
  {
    id: "first-message",
    title: "写第一句话",
    description: "在底部输入框输入你的问题或任务。支持 @ 提及文件和技能。",
    icon: <PiCheckCircle className="size-12 text-primary" />,
  },
  {
    id: "mode-switch",
    title: "切换模式",
    description: "Work 模式处理办公任务，Code 模式编写代码。点击顶部模式切换器切换。",
    icon: <PiCheckCircle className="size-12 text-primary" />,
  },
  {
    id: "artifacts",
    title: "查看产物",
    description: "AI 生成的文档、代码、预览都会显示在右侧产物面板。可以导出或接受。",
    icon: <PiCheckCircle className="size-12 text-primary" />,
  },
  {
    id: "dual-domain",
    title: "Work & Code 双域",
    description: "Work 域处理文档、会议、审批等办公任务；Code 域编写代码、Review 变更、管理仓库。两个域独立运行,互不干扰。",
    icon: <PiCheckCircle className="size-12 text-primary" />,
  },
  {
    id: "mobile-pairing",
    title: "移动端配对",
    description: "用 云顶数字 移动端随时随地管理任务、审批变更。在设置页扫描二维码或输入配对码,30 秒完成配对。",
    icon: <PiCheckCircle className="size-12 text-primary" />,
  },
];

/**
 * 首次启动引导
 */
export const OnboardingTour = memo(function OnboardingTour({
  isOpen,
  onClose,
  onComplete,
  onSkip,
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  // 键盘导航
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handlePrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentStep]);

  const handleNext = useCallback(() => {
    const step = ONBOARDING_STEPS[currentStep];
    if (step) {
      setCompletedSteps((prev) => new Set([...prev, step.id]));
    }

    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // 最后一步完成
      onComplete?.();
      onClose();
    }
  }, [currentStep, onClose, onComplete]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    onSkip?.();
    onClose();
  }, [onClose, onSkip]);

  if (!isOpen) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* 关闭按钮 */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="absolute right-4 top-4"
          aria-label="关闭"
        >
          <PiX className="size-4" />
        </Button>

        {/* 进度条 */}
        <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 步骤内容 */}
        <div
          key={currentStep}
          className="flex flex-col items-center text-center list-item-slide-in"
        >
          <div className="mb-4">{step.icon}</div>
          <h2 className="mb-2 text-2xl font-semibold">{step.title}</h2>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">{step.description}</p>

          {/* 步骤指示器 */}
          <div className="mb-6 flex items-center gap-2">
            {ONBOARDING_STEPS.map((s, index) => (
              <div
                key={s.id}
                className={cn(
                  "size-2 rounded-full transition-colors",
                  index === currentStep
                    ? "bg-primary"
                    : completedSteps.has(s.id)
                      ? "bg-primary/50"
                      : "bg-muted",
                )}
              />
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-3">
            {!isFirstStep && (
              <Button
                variant="outline"
                onClick={handlePrevious}
                className="button-micro-interaction"
              >
                <PiArrowLeft className="mr-1 size-4" />
                上一步
              </Button>
            )}
            <Button onClick={handleNext} className="button-micro-interaction">
              {isLastStep ? "完成" : "下一步"}
              {!isLastStep && <PiArrowRight className="ml-1 size-4" />}
            </Button>
            {!isLastStep && (
              <Button
                variant="ghost"
                onClick={handleSkip}
                className="button-micro-interaction"
              >
                跳过
              </Button>
            )}
          </div>
        </div>

        {/* 步骤计数 */}
        <div className="mt-6 text-center text-xs text-muted-foreground">
          {currentStep + 1} / {ONBOARDING_STEPS.length}
        </div>
      </div>
    </div>
  );
});

/**
 * 检查是否应该显示引导
 * @returns 是否应该显示
 */
export function shouldShowOnboarding(): boolean {
  try {
    const hasCompleted = localStorage.getItem("onboarding-completed");
    const hasSkipped = localStorage.getItem("onboarding-skipped");
    return !hasCompleted && !hasSkipped;
  } catch {
    return true;
  }
}

/**
 * 标记引导已完成
 */
export function markOnboardingCompleted(): void {
  try {
    localStorage.setItem("onboarding-completed", "true");
  } catch {
    // 忽略存储错误
  }
}

/**
 * 标记引导已跳过
 */
export function markOnboardingSkipped(): void {
  try {
    localStorage.setItem("onboarding-skipped", "true");
  } catch {
    // 忽略存储错误
  }
}

/**
 * 重置引导状态（用于设置页重新开启）
 */
export function resetOnboarding(): void {
  try {
    localStorage.removeItem("onboarding-completed");
    localStorage.removeItem("onboarding-skipped");
  } catch {
    // 忽略存储错误
  }
}
