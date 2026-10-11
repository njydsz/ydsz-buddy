/**
 * @file 应用外壳
 * @description Web 应用主壳：侧边栏 + Chat 区域 + 设置面板
 */

import { useCallback, useState } from "react";
import { Menu } from "lucide-react";
import { WebSidebar } from "./components/WebSidebar";
import { WebChatView } from "./components/WebChatView";
import { WebSettingsPanel } from "./components/WebSettingsPanel";
import { useAppStore } from "./store/appStore";

export function App() {
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* 移动端顶部栏 */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-12 items-center border-b bg-card px-3 md:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-md p-2 hover:bg-accent"
          aria-label="切换侧边栏"
        >
          <Menu size={18} />
        </button>
        <span className="ml-2 text-sm font-medium">云顶数字 Buddy</span>
      </header>

      {/* 侧边栏 + 主内容区 */}
      <div className="flex h-full w-full pt-12 md:pt-0">
        {/* 侧边栏 */}
        <WebSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onOpenSettings={handleOpenSettings}
        />

        {/* 主 Chat 区域 */}
        <main className="flex h-full flex-1 flex-col" id="main-content">
          <WebChatView />
        </main>
      </div>

      {/* 设置面板 */}
      <WebSettingsPanel isOpen={settingsOpen} onClose={handleCloseSettings} />
    </div>
  );
}
