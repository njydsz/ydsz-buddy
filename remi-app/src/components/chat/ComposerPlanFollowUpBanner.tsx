/**
 * @file Composer 计划后续提示横幅
 *
 * 本组件展示在 AI 提交计划（Plan）后引导用户继续操作的横幅：
 *
 * - **提示文案**：根据计划状态显示"继续实现"/"调整计划"等提示
 * - **快速操作按钮**：跳转计划卡片 / 接受计划
 * - **自动消失**：用户操作后自动隐藏
 *
 * ## 使用场景
 *
 * - Plan 模式下 AI 提交计划后展示
 * - 引导用户接受/调整计划
 *
 * ## 注意事项
 *
 * - 仅在 Plan 模式且有待处理计划时展示
 * - 用户接受计划后切换为 Build 模式继续
 */

import { memo } from "react";

export const ComposerPlanFollowUpBanner = memo(function ComposerPlanFollowUpBanner({
  planTitle,
}: {
  planTitle: string | null;
}) {
  return (
    <div className="px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="uppercase text-sm tracking-[0.2em]">Plan ready</span>
        {planTitle ? (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{planTitle}</span>
        ) : null}
      </div>
      {/* <div className="mt-2 text-xs text-muted-foreground">
        Review the plan
      </div> */}
    </div>
  );
});
