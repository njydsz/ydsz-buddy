/**
 * @file ChatEmptyStateHero.tsx
 * @description 聊天空状态居中展示组件，在无消息时显示品牌 Logo 和欢迎文案。
 */

import { memo } from "react";

/**
 * ChatEmptyStateHero 组件
 * @description 聊天空状态居中展示，显示品牌 Logo 和欢迎文案
 * @param props.projectName - 项目名称（可选，显示在欢迎文案下方）
 */
export const ChatEmptyStateHero = memo(function ChatEmptyStateHero({
  projectName,
}: {
  projectName: string | undefined;
}) {
  return (
    <div className="flex flex-col items-center gap-5 select-none">
      <img
        alt="Remi Code logo"
        className="size-14 rounded-lg object-contain"
        draggable={false}
        height={112}
        src="/remicode-hero.png"
        width={112}
      />

      <div className="flex flex-col items-center gap-0.5">
        <h1 className="text-2xl font-semibold text-foreground/90">Let's build</h1>
        {projectName && <span className="text-lg text-muted-foreground/40">{projectName}</span>}
      </div>
    </div>
  );
});
