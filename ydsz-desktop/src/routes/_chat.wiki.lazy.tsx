/**
 * @file Wiki 路由模块
 * @description 在共享聊天外壳下注册 Wiki 知识库视图路由,
 *   对应 /_chat/wiki 路径,渲染 WikiView 组件。
 * @layer 路由层
 */

import { WikiView } from "~/components/WikiView";
import { AppTopChrome } from "~/components/AppTopChrome";
import { YdszBuddyWordmark } from "~/components/Sidebar";
import { SidebarInset } from "~/components/ui/sidebar";
import { BookText } from "lucide-react";

/**
 * Wiki 路由配置
 * @description 定义 /_chat/wiki 路径的路由,渲染 WikiView 组件展示项目知识库。
 */
export function Component() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <AppTopChrome
          logo={
            <span className="inline-flex size-5 shrink-0 items-center justify-center">
              <YdszBuddyWordmark />
            </span>
          }
          title={
            <h2 className="flex max-w-[clamp(16rem,50vw,40rem)] cursor-default items-center gap-2 truncate text-sm font-medium text-foreground">
              <BookText className="size-4 shrink-0" aria-hidden />
              Repo Wiki
            </h2>
          }
        />
        <div className="min-h-0 min-w-0 flex-1">
          <WikiView />
        </div>
      </div>
    </SidebarInset>
  );
}
