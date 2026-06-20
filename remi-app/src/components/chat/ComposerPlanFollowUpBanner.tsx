/**
 * @file ComposerPlanFollowUpBanner.tsx
 * @description 计划就绪横幅组件，在编辑器中显示计划已就绪的提示和计划标题。
 */

import { memo } from "react";

/**
 * ComposerPlanFollowUpBanner 组件
 * @description 计划就绪横幅，显示"Plan ready"标签和计划标题
 * @param props.planTitle - 计划标题（可选）
 */
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
