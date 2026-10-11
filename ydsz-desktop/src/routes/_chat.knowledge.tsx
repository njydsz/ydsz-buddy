// @ts-nocheck
/**
 * @file 知识库 RAG 管理页路由（G6-P1）
 *
 * 知识库文档管理页面入口，配合 KnowledgeView 组件使用。
 */

import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeView } from "../components/KnowledgeView";
import { SidebarHeaderNavigationControls } from "../components/SidebarHeaderNavigationControls";
import { useDesktopTopBarTrafficLightGutterClassName } from "../hooks/useDesktopTopBarGutter";
import { SidebarHeaderTrigger, SidebarInset } from "../components/ui/sidebar";
import { cn } from "../lib/utils";
import { isDesktop } from "../env";
import { useMessages } from "../i18n";

export const Route = createFileRoute("/_chat/knowledge")({
  component: KnowledgePage,
});

function KnowledgePage() {
  const messages = useMessages();
  const desktopTopBarTrafficLightGutterClassName =
    useDesktopTopBarTrafficLightGutterClassName();

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none text-foreground">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        {isDesktop ? (
          <div
            className={cn(
              "drag-region flex h-[44px] shrink-0 items-center border-b border-border px-3 sm:px-5",
              desktopTopBarTrafficLightGutterClassName,
            )}
          >
            <SidebarHeaderNavigationControls />
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              知识库管理
            </span>
            <div className="ms-auto flex items-center gap-2" data-no-drag>
              <SidebarHeaderTrigger />
            </div>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl">
            <KnowledgeView />
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
