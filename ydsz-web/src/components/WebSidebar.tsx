/**
 * @file Web 侧边栏组件
 * @description 简化版侧边栏：会话列表 + 新建会话按钮（无原生 API 依赖）
 */

import { useCallback } from "react";
import { MessageSquarePlus, MessageSquare, Settings } from "lucide-react";
import { useAppStore } from "~/store/appStore";
import { cn } from "~/lib/utils";

interface WebSidebarProps {
  /** 是否展开（移动端为覆盖模式） */
  isOpen: boolean;
  /** 关闭侧边栏回调（移动端） */
  onClose?: () => void;
  /** 打开设置面板 */
  onOpenSettings?: () => void;
}

export function WebSidebar({ isOpen, onClose, onOpenSettings }: WebSidebarProps) {
  const { sessions, activeSessionId, setActiveSession, addSession } = useAppStore();

  // 创建新会话
  const handleNewSession = useCallback(() => {
    const newId = `session-${Date.now()}`;
    addSession({
      id: newId,
      title: "新会话",
      updatedAt: Date.now(),
    });
  }, [addSession]);

  // 选择会话
  const handleSelectSession = useCallback(
    (id: string) => {
      setActiveSession(id);
      onClose?.();
    },
    [setActiveSession, onClose],
  );

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-card transition-all duration-200",
        // 桌面端：始终可见，宽度 260px
        "w-full md:w-[260px] md:min-w-[260px]",
        // 移动端：固定定位，覆盖模式
        "fixed inset-y-0 left-0 z-40 md:relative",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
      data-focus-region
    >
      {/* 顶部：品牌 + 新建按钮 */}
      <div className="flex items-center justify-between border-b p-3">
        <h1 className="text-sm font-medium">云顶数字 Buddy</h1>
        <button
          type="button"
          onClick={handleNewSession}
          className="sidebar-icon-button"
          aria-label="新建会话"
          title="新建会话"
        >
          <MessageSquarePlus size={16} />
        </button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">暂无会话</p>
            <p className="text-xs">点击上方按钮创建</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => handleSelectSession(session.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    activeSessionId === session.id && "bg-accent text-accent-foreground",
                  )}
                >
                  <MessageSquare size={14} className="shrink-0" />
                  <span className="truncate">{session.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 底部：设置按钮 */}
      <div className="border-t p-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <Settings size={14} />
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
}
