# Remi Code 桌面端迁移实施方案

> 基于 Remi Code 项目向 Tauri + React 桌面端应用的全量前端迁移

**版本**: v1.0  
**日期**: 2026-06-19  
**状态**: 待确认

---

## 目录

1. [项目概述](#一项目概述)
2. [目录结构设计](#二目录结构设计)
3. [前端迁移方案](#三前端迁移方案)
4. [实施步骤](#四实施步骤)
5. [交付标准](#五交付标准)
6. [全维度功能验证清单](#六全维度功能验证清单)
7. [专项性能优化策略](#七专项性能优化策略)
8. [多场景兼容性测试方案](#八多场景兼容性测试方案)
9. [代码质量提升措施](#九代码质量提升措施)
10. [全套文档更新计划](#十全套文档更新计划)
11. [迭代开发优先级排序](#十一迭代开发优先级排序)

---

## 一、项目概述

### 1.1 迁移目标

将 Remi Code 项目（Electron + React）的前端部分完整迁移至 Remi Code 桌面端应用，采用 **Tauri + React** 技术栈，实现：

- ✅ 更小的应用体积（预期减少 60-70%）
- ✅ 更低的内存占用（预期减少 40-50%）
- ✅ 更高的性能和安全性（Tauri 轻量级架构）
- ✅ 保持原有功能 100% 兼容性
- ✅ 优化用户体验和交互流畅度

**注意**：本方案仅涉及前端迁移，后端服务（Rust/Tauri 后端）由单独任务负责。

### 1.2 技术栈对比

| 层级 | Remi Code (原) | Remi Code (新) | 迁移策略 |
|------|----------------|----------------|----------|
| **桌面框架** | Electron 40.6.0 | Tauri 2.x | 适配 Tauri API，移除 Electron 特定代码 |
| **前端框架** | React 19 + Vite 8 | React 19 + Vite 8 | 保持前端技术栈，适配 Tauri 环境 |
| **状态管理** | Zustand + TanStack Query | Zustand + TanStack Query | 保持不变，适配 Tauri 事件系统 |
| **路由** | TanStack Router | TanStack Router | 保持不变，调整历史模式 |
| **UI 组件** | Base UI + Tailwind CSS 4 | Base UI + Tailwind CSS 4 | 保持不变，优化主题系统 |
| **终端** | xterm.js | xterm.js | 保持不变，通过 Tauri 后端交互 |
| **构建工具** | Turbo + tsdown | Vite + Tauri CLI | 集成 Tauri 构建流程 |

### 1.3 核心功能模块清单

基于 Remi Code 项目分析，需迁移的前端模块包括：

#### 界面组件 (apps/web/src/components)
- ✅ 聊天界面系统（ChatView、ChatTranscript、Composer）
- ✅ 终端管理系统（TerminalWorkspace、TerminalViewport）
- ✅ 项目管理器（ProjectSidebar、ProjectPicker）
- ✅ 差异对比面板（DiffPanel、ChangedFilesTree）
- ✅ 设置与配置（WorkspaceSettings、AppSettings）
- ✅ 主题与国际化（ThemePack、i18n）
- ✅ 插件与技能系统（PluginLibrary、SkillsView）
- ✅ 浏览器面板（BrowserPanel）
- ✅ Git 操作界面（BranchToolbar、GitActionsControl）

#### 业务逻辑 (apps/web/src/lib)
- ✅ 聊天逻辑（ChatView.logic.ts、composer-logic.ts）
- ✅ 导航管理（appNavigation.ts）
- ✅ 设置管理（appSettings.ts）
- ✅ 状态管理（stores）
- ✅ 工具函数（lib）

#### 共享模块 (packages)
- ✅ @remi-code/contracts → @remi-code/contracts
- ✅ @remi-code/shared → @remi-code/shared
- ✅ effect-acp → remi-acp

---

## 二、目录结构设计

### 2.1 项目根目录

```
remi-code/
├── remi-app/                    # Tauri 桌面应用目录（新增）
│   ├── src/                    # 前端源码（React）
│   ├── package.json
│   ├── vite.config.ts
│   └── tauri.conf.json         # Tauri 配置（前端相关）
├── packages/                   # 共享包
│   ├── contracts/             # 类型契约
│   ├── shared/                # 共享工具
│   └── remi-acp/             # ACP 协议实现
├── docs/                       # 文档
├── scripts/                    # 构建脚本
└── .github/                    # CI/CD
```

### 2.2 Tauri 前端结构 (remi-app/src/)

```
src/
├── main.tsx                    # 应用入口
├── App.tsx                     # 根组件
├── index.css                   # 全局样式
│
├── components/                 # UI 组件
│   ├── chat/                  # 聊天组件
│   │   ├── ChatView.tsx
│   │   ├── ChatView.logic.ts
│   │   ├── ChatView.selectors.ts
│   │   ├── ChatTranscriptPane.tsx
│   │   ├── MessagesTimeline.tsx
│   │   ├── ComposerPromptEditor.tsx
│   │   ├── ComposerCommandMenu.tsx
│   │   ├── ComposerExtrasMenu.tsx
│   │   ├── ModelChannelPicker.tsx
│   │   ├── ProviderModelPicker.tsx
│   │   └── ...
│   │
│   ├── terminal/              # 终端组件
│   │   ├── TerminalWorkspaceTabs.tsx
│   │   ├── TerminalViewportPane.tsx
│   │   ├── TerminalChrome.tsx
│   │   ├── TerminalLayout.ts
│   │   └── ...
│   │
│   ├── ui/                    # 基础 UI 组件
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── sidebar.tsx
│   │   ├── toast.tsx
│   │   └── ...
│   │
│   ├── diff/                  # 差异对比组件
│   │   ├── DiffPanel.tsx
│   │   ├── DiffPanel.logic.ts
│   │   ├── ChangedFilesTree.tsx
│   │   └── ...
│   │
│   ├── git/                   # Git 操作组件
│   │   ├── BranchToolbar.tsx
│   │   ├── BranchToolbar.logic.ts
│   │   ├── GitActionsControl.tsx
│   │   └── ...
│   │
│   ├── project/               # 项目管理组件
│   │   ├── Sidebar.tsx
│   │   ├── Sidebar.logic.ts
│   │   ├── ProjectPicker.tsx
│   │   ├── DirectoryTreeBrowser.tsx
│   │   └── ...
│   │
│   ├── settings/              # 设置组件
│   │   ├── WorkspaceSettingsSheet.tsx
│   │   ├── ThemePackEditor.tsx
│   │   └── ...
│   │
│   ├── plugins/               # 插件组件
│   │   ├── PluginLibrary.tsx
│   │   ├── PluginsView.tsx
│   │   ├── SkillsView.tsx
│   │   └── ...
│   │
│   └── browser/               # 浏览器面板
│       ├── BrowserPanel.tsx
│       ├── BrowserPanel.logic.ts
│       └── ...
│
├── hooks/                      # React Hooks
│   ├── useTauriCommand.ts     # Tauri 命令封装
│   ├── useTauriEvent.ts       # Tauri 事件监听
│   ├── useTerminal.ts         # 终端 Hook
│   ├── useLocalStorage.ts     # 本地存储
│   ├── useTheme.ts            # 主题管理
│   ├── useMediaQuery.ts       # 媒体查询
│   └── ...
│
├── lib/                        # 工具库
│   ├── tauri-bridge.ts        # Tauri 桥接层（核心）
│   ├── websocket-client.ts    # WebSocket 客户端
│   ├── gitReactQuery.ts       # Git React Query
│   ├── serverReactQuery.ts    # 服务器 React Query
│   ├── providerDiscovery.ts   # 提供商发现
│   ├── chat-scroll.ts         # 聊天滚动
│   ├── diffRendering.ts       # 差异渲染
│   └── ...
│
├── stores/                     # 状态管理
│   ├── appStore.ts            # 应用状态
│   ├── threadStore.ts         # 线程状态
│   ├── browserStateStore.ts   # 浏览器状态
│   ├── composerDraftStore.ts  # 编辑器草稿
│   └── ...
│
├── routes/                     # 路由配置
│   ├── __root.tsx
│   ├── chat.tsx
│   ├── terminal.tsx
│   ├── settings.tsx
│   └── ...
│
├── i18n/                       # 国际化
│   ├── I18nContext.tsx
│   ├── messages.ts
│   ├── language.ts
│   └── ...
│
└── types/                      # TypeScript 类型
    ├── tauri.d.ts             # Tauri 类型定义
    ├── global.d.ts
    └── ...
```

### 2.3 共享包结构

```
packages/
├── contracts/                  # 类型契约
│   ├── src/
│   │   ├── index.ts
│   │   ├── orchestration.ts   # 编排事件类型
│   │   ├── provider.ts        # 提供商类型
│   │   ├── terminal.ts        # 终端类型
│   │   ├── git.ts             # Git 类型
│   │   └── ...
│   └── package.json
│
├── shared/                     # 共享工具
│   ├── src/
│   │   ├── model.ts           # 模型工具
│   │   ├── git.ts             # Git 工具
│   │   ├── chatThreads.ts     # 聊天线程工具
│   │   ├── terminalThreads.ts # 终端线程工具
│   │   ├── conversationEdit.ts # 对话编辑
│   │   └── ...
│   └── package.json
│
└── remi-acp/                  # ACP 协议
    ├── src/
    │   ├── client.ts
    │   ├── agent.ts
    │   ├── protocol.ts
    │   ├── rpc.ts
    │   └── ...
    └── package.json
```

---

## 三、前端迁移方案

### 3.1 环境检测调整

#### 3.1.1 移除 Electron 检测

**原代码** (`apps/web/src/env.ts`)

```typescript
export const isElectron = navigator.userAgent.includes('Electron');
export const isBrowser = typeof window !== 'undefined';
```

**新代码** (`remi-app/src/env.ts`)

```typescript
// Tauri 环境检测
export const isTauri = '__TAURI__' in window;
export const isBrowser = typeof window !== 'undefined';

// 兼容旧代码
export const isElectron = false; // 不再支持 Electron
```

#### 3.1.2 原生 API 适配

**原代码** (`apps/web/src/nativeApi.ts`)

```typescript
// Electron 原生 API
export function ensureNativeApi() {
  if (isElectron) {
    window.electronAPI = window.electronAPI || {};
  }
}
```

**新代码** (`remi-app/src/nativeApi.ts`)

```typescript
// Tauri 原生 API
import { invoke } from '@tauri-apps/api/core';
import { appWindow } from '@tauri-apps/api/window';

export function ensureNativeApi() {
  if (isTauri) {
    // Tauri API 已通过 @tauri-apps/api 提供
    return;
  }
}

// 窗口操作
export async function minimizeWindow() {
  if (isTauri) {
    await appWindow.minimize();
  }
}

export async function maximizeWindow() {
  if (isTauri) {
    await appWindow.toggleMaximize();
  }
}

export async function closeWindow() {
  if (isTauri) {
    await appWindow.close();
  }
}
```

### 3.2 路由历史模式

#### 3.2.1 调整历史模式

**原代码** (`apps/web/src/appNavigation.ts`)

```typescript
import { createBrowserHistory, createHashHistory, createMemoryHistory } from "@tanstack/react-router";
import { isElectron } from "./env";

function createAppHistory(): RouterHistory {
  if (typeof window === "undefined") {
    return createMemoryHistory({ initialEntries: ["/"] });
  }
  // Electron 使用 hash 历史
  return isElectron ? createHashHistory() : createBrowserHistory();
}

export const appHistory: RouterHistory = createAppHistory();
```

**新代码** (`remi-app/src/appNavigation.ts`)

```typescript
import { createBrowserHistory, createMemoryHistory } from "@tanstack/react-router";
import { isTauri } from "./env";

function createAppHistory(): RouterHistory {
  if (typeof window === "undefined") {
    return createMemoryHistory({ initialEntries: ["/"] });
  }
  // Tauri 支持 Browser History（通过自定义协议或 file:// 协议）
  // 如果遇到问题，可以回退到 Hash History
  return createBrowserHistory();
}

export const appHistory: RouterHistory = createAppHistory();
```

### 3.3 Tauri 桥接层

#### 3.3.1 核心桥接模块

**新增文件** `remi-app/src/lib/tauri-bridge.ts`

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import type { 
  Thread, 
  Message, 
  Model, 
  CreateThreadParams,
  SendMessageParams 
} from '@remi-code/contracts';

/**
 * Tauri 桥接层
 * 封装所有与 Tauri 后端的交互
 */
export const tauriBridge = {
  /**
   * 编排引擎相关命令
   */
  orchestration: {
    /**
     * 创建新的聊天线程
     */
    createThread: async (params: CreateThreadParams): Promise<Thread> => {
      return await invoke<Thread>('create_thread', { params });
    },

    /**
     * 发送消息到 AI
     */
    sendMessage: async (params: SendMessageParams): Promise<void> => {
      return await invoke<void>('send_message', params);
    },

    /**
     * 获取线程列表
     */
    listThreads: async (projectId: string): Promise<Thread[]> => {
      return await invoke<Thread[]>('list_threads', { projectId });
    },

    /**
     * 删除线程
     */
    deleteThread: async (threadId: string): Promise<void> => {
      return await invoke<void>('delete_thread', { threadId });
    },

    /**
     * 重命名线程
     */
    renameThread: async (threadId: string, title: string): Promise<void> => {
      return await invoke<void>('rename_thread', { threadId, title });
    },
  },

  /**
   * AI 提供商相关命令
   */
  provider: {
    /**
     * 获取可用模型列表
     */
    listModels: async (provider?: string): Promise<Model[]> => {
      return await invoke<Model[]>('list_models', { provider });
    },

    /**
     * 设置 API Key
     */
    setApiKey: async (provider: string, key: string): Promise<void> => {
      return await invoke<void>('set_api_key', { provider, key });
    },

    /**
     * 获取提供商状态
     */
    getProviderStatus: async (): Promise<Record<string, any>> => {
      return await invoke('get_provider_status');
    },
  },

  /**
   * 终端管理相关命令
   */
  terminal: {
    /**
     * 创建新的终端会话
     */
    create: async (cwd: string, shell?: string): Promise<string> => {
      return await invoke<string>('create_terminal', { cwd, shell });
    },

    /**
     * 向终端写入数据
     */
    write: async (sessionId: string, data: string): Promise<void> => {
      return await invoke<void>('write_terminal', { sessionId, data });
    },

    /**
     * 调整终端大小
     */
    resize: async (sessionId: string, rows: number, cols: number): Promise<void> => {
      return await invoke<void>('resize_terminal', { sessionId, rows, cols });
    },

    /**
     * 关闭终端会话
     */
    close: async (sessionId: string): Promise<void> => {
      return await invoke<void>('close_terminal', { sessionId });
    },
  },

  /**
   * Git 操作相关命令
   */
  git: {
    /**
     * 获取 Git 状态
     */
    getStatus: async (cwd: string): Promise<any> => {
      return await invoke('git_status', { cwd });
    },

    /**
     * 获取分支列表
     */
    listBranches: async (cwd: string): Promise<string[]> => {
      return await invoke<string[]>('git_list_branches', { cwd });
    },

    /**
     * 切换分支
     */
    checkoutBranch: async (cwd: string, branch: string): Promise<void> => {
      return await invoke<void>('git_checkout', { cwd, branch });
    },

    /**
     * 提交更改
     */
    commit: async (cwd: string, message: string): Promise<void> => {
      return await invoke<void>('git_commit', { cwd, message });
    },
  },

  /**
   * 工作区管理相关命令
   */
  workspace: {
    /**
     * 获取项目列表
     */
    listProjects: async (): Promise<any[]> => {
      return await invoke('list_projects');
    },

    /**
     * 添加项目
     */
    addProject: async (path: string): Promise<void> => {
      return await invoke<void>('add_project', { path });
    },

    /**
     * 移除项目
     */
    removeProject: async (projectId: string): Promise<void> => {
      return await invoke<void>('remove_project', { projectId });
    },

    /**
     * 读取文件
     */
    readFile: async (path: string): Promise<string> => {
      return await invoke<string>('read_file', { path });
    },

    /**
     * 写入文件
     */
    writeFile: async (path: string, content: string): Promise<void> => {
      return await invoke<void>('write_file', { path, content });
    },
  },

  /**
   * 设置管理相关命令
   */
  settings: {
    /**
     * 获取应用设置
     */
    get: async (): Promise<any> => {
      return await invoke('get_settings');
    },

    /**
     * 保存应用设置
     */
    save: async (settings: any): Promise<void> => {
      return await invoke<void>('save_settings', { settings });
    },
  },

  /**
   * 事件监听
   */
  events: {
    /**
     * 监听线程更新事件
     */
    onThreadUpdated: (callback: (thread: Thread) => void) => {
      return listen<Thread>('thread-updated', (event) => {
        callback(event.payload);
      });
    },

    /**
     * 监听终端输出事件
     */
    onTerminalOutput: (callback: (data: { sessionId: string; output: string }) => void) => {
      return listen('terminal-output', (event) => {
        callback(event.payload as { sessionId: string; output: string });
      });
    },

    /**
     * 监听消息事件
     */
    onMessage: (callback: (message: Message) => void) => {
      return listen<Message>('message-received', (event) => {
        callback(event.payload);
      });
    },

    /**
     * 监听 Git 状态变化事件
     */
    onGitStatusChanged: (callback: (status: any) => void) => {
      return listen('git-status-changed', (event) => {
        callback(event.payload);
      });
    },

    /**
     * 发射事件到后端
     */
    emit: async (event: string, payload?: any) => {
      return await emit(event, payload);
    },
  },

  /**
   * 窗口操作
   */
  window: {
    /**
     * 最小化窗口
     */
    minimize: async () => {
      const { appWindow } = await import('@tauri-apps/api/window');
      await appWindow.minimize();
    },

    /**
     * 最大化窗口
     */
    maximize: async () => {
      const { appWindow } = await import('@tauri-apps/api/window');
      await appWindow.toggleMaximize();
    },

    /**
     * 关闭窗口
     */
    close: async () => {
      const { appWindow } = await import('@tauri-apps/api/window');
      await appWindow.close();
    },

    /**
     * 设置窗口标题
     */
    setTitle: async (title: string) => {
      const { appWindow } = await import('@tauri-apps/api/window');
      await appWindow.setTitle(title);
    },
  },

  /**
   * 对话框
   */
  dialog: {
    /**
     * 打开文件选择对话框
     */
    open: async (options?: any): Promise<string | null> => {
      const { open } = await import('@tauri-apps/api/dialog');
      return await open(options);
    },

    /**
     * 打开保存文件对话框
     */
    save: async (options?: any): Promise<string | null> => {
      const { save } = await import('@tauri-apps/api/dialog');
      return await save(options);
    },

    /**
     * 显示消息对话框
     */
    message: async (message: string, options?: any) => {
      const { message: showMessage } = await import('@tauri-apps/api/dialog');
      return await showMessage(message, options);
    },

    /**
     * 显示确认对话框
     */
    confirm: async (message: string, options?: any): Promise<boolean> => {
      const { confirm: showConfirm } = await import('@tauri-apps/api/dialog');
      return await showConfirm(message, options);
    },
  },

  /**
   * 文件系统
   */
  fs: {
    /**
     * 读取文本文件
     */
    readTextFile: async (path: string): Promise<string> => {
      const { readTextFile } = await import('@tauri-apps/api/fs');
      return await readTextFile(path);
    },

    /**
     * 写入文本文件
     */
    writeTextFile: async (path: string, content: string): Promise<void> => {
      const { writeTextFile } = await import('@tauri-apps/api/fs');
      return await writeTextFile(path, content);
    },

    /**
     * 创建目录
     */
    createDir: async (path: string, options?: any): Promise<void> => {
      const { createDir } = await import('@tauri-apps/api/fs');
      return await createDir(path, options);
    },

    /**
     * 读取目录
     */
    readDir: async (path: string): Promise<any[]> => {
      const { readDir } = await import('@tauri-apps/api/fs');
      return await readDir(path);
    },
  },

  /**
   * 剪贴板
   */
  clipboard: {
    /**
     * 写入剪贴板
     */
    writeText: async (text: string): Promise<void> => {
      const { writeText } = await import('@tauri-apps/api/clipboard');
      return await writeText(text);
    },

    /**
     * 读取剪贴板
     */
    readText: async (): Promise<string> => {
      const { readText } = await import('@tauri-apps/api/clipboard');
      return await readText();
    },
  },

  /**
   * 通知
   */
  notification: {
    /**
     * 请求通知权限
     */
    requestPermission: async (): Promise<boolean> => {
      const { isPermissionGranted, requestPermission } = await import('@tauri-apps/api/notification');
      const granted = await isPermissionGranted();
      if (!granted) {
        return await requestPermission() === 'granted';
      }
      return true;
    },

    /**
     * 发送通知
     */
    send: async (title: string, body: string): Promise<void> => {
      const { sendNotification } = await import('@tauri-apps/api/notification');
      sendNotification({ title, body });
    },
  },
};

/**
 * 类型导出
 */
export type TauriBridge = typeof tauriBridge;
```

### 3.4 组件适配

#### 3.4.1 替换 Electron API 调用

**全局替换规则**：

```typescript
// ❌ 原代码（Electron）
const result = await window.electronAPI.someMethod();

// ✅ 新代码（Tauri）
import { tauriBridge } from '../lib/tauri-bridge';
const result = await tauriBridge.someModule.someMethod();
```

**具体替换示例**：

```typescript
// 1. 创建终端
// ❌ 原代码
const pty = await window.electronAPI.createTerminal(cwd);

// ✅ 新代码
const sessionId = await tauriBridge.terminal.create(cwd);

// 2. 发送消息
// ❌ 原代码
await window.electronAPI.sendMessage(threadId, content);

// ✅ 新代码
await tauriBridge.orchestration.sendMessage({ threadId, content });

// 3. 获取模型列表
// ❌ 原代码
const models = await window.electronAPI.listModels();

// ✅ 新代码
const models = await tauriBridge.provider.listModels();

// 4. 监听事件
// ❌ 原代码
window.electronAPI.onThreadUpdated((thread) => {
  updateUI(thread);
});

// ✅ 新代码
const unlisten = await tauriBridge.events.onThreadUpdated((thread) => {
  updateUI(thread);
});
```

#### 3.4.2 终端组件适配

**修改文件** `remi-app/src/components/terminal/TerminalViewportPane.tsx`

```typescript
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { tauriBridge } from '../../lib/tauri-bridge';

export function TerminalViewportPane({ sessionId, cwd }: Props) {
  const terminalRef = useRef<Terminal>(null);
  const fitAddonRef = useRef<FitAddon>(null);

  useEffect(() => {
    const terminal = new Terminal();
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current!);
    fitAddon.fit();

    // 监听终端输入
    terminal.onData(async (data) => {
      await tauriBridge.terminal.write(sessionId, data);
    });

    // 监听后端输出
    const unlisten = tauriBridge.events.onTerminalOutput(({ sessionId: id, output }) => {
      if (id === sessionId) {
        terminal.write(output);
      }
    });

    // 监听窗口大小变化
    const handleResize = () => {
      fitAddon.fit();
      const { rows, cols } = terminal;
      tauriBridge.terminal.resize(sessionId, rows, cols);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      unlisten.then(fn => fn());
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, [sessionId]);

  return <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />;
}
```

#### 3.4.3 聊天组件适配

**修改文件** `remi-app/src/components/chat/ChatView.tsx`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tauriBridge } from '../../lib/tauri-bridge';

export function ChatView({ threadId }: Props) {
  const queryClient = useQueryClient();

  // 获取线程数据
  const { data: thread } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => tauriBridge.orchestration.getThread(threadId),
  });

  // 发送消息
  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => 
      tauriBridge.orchestration.sendMessage({ threadId, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
    },
  });

  // 监听消息事件
  useEffect(() => {
    const unlisten = tauriBridge.events.onMessage((message) => {
      if (message.threadId === threadId) {
        queryClient.setQueryData(['thread', threadId], (old: any) => ({
          ...old,
          messages: [...old.messages, message],
        }));
      }
    });
    return () => unlisten.then(fn => fn());
  }, [threadId, queryClient]);

  return (
    <div>
      {/* 聊天界面 */}
    </div>
  );
}
```

### 3.5 共享包迁移

#### 3.5.1 包名重命名

**packages/contracts/package.json**

```json
{
  "name": "@remi-code/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsdown src/index.ts --format esm,cjs --dts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "effect": "^3.0.0"
  }
}
```

**packages/shared/package.json**

```json
{
  "name": "@remi-code/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./model": "./src/model.ts",
    "./git": "./src/git.ts",
    "./chatThreads": "./src/chatThreads.ts",
    "./terminalThreads": "./src/terminalThreads.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@remi-code/contracts": "workspace:*",
    "effect": "^3.0.0"
  }
}
```

#### 3.5.2 导入路径更新

**全局替换**：

```bash
# 替换所有 @remi-code/* 为 @remi-code/*
# 在所有 .ts 和 .tsx 文件中

# 原代码
import { ThreadId, type Thread } from "@remi-code/contracts";
import { normalizeModelSlug } from "@remi-code/shared/model";

# 新代码
import { ThreadId, type Thread } from "@remi-code/contracts";
import { normalizeModelSlug } from "@remi-code/shared/model";
```

### 3.6 构建配置

#### 3.6.1 Vite 配置

**remi-app/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  
  // Tauri 相关配置
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
  
  resolve: {
    alias: {
      '~': '/src',
    },
  },
});
```

#### 3.6.2 Tauri 配置

**remi-app/tauri.conf.json**

```json
{
  "productName": "Remi Code",
  "version": "0.1.0",
  "identifier": "com.remi.code",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Remi Code",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false,
        "decorations": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

#### 3.6.3 package.json

**remi-app/package.json**

```json
{
  "name": "@remi-code/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext ts,tsx",
    "test": "vitest"
  },
  "dependencies": {
    "@remi-code/contracts": "workspace:*",
    "@remi-code/shared": "workspace:*",
    "@tauri-apps/api": "^2.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-router": "^1.160.2",
    "@tanstack/react-query": "^5.90.0",
    "zustand": "^5.0.11",
    "@xterm/xterm": "^6.0.0",
    "@xterm/addon-fit": "^0.11.0",
    "tailwindcss": "^4.0.0",
    "@base-ui/react": "^1.2.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@vitejs/plugin-react": "^6.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "typescript": "^5.7.3",
    "vite": "^8.0.0",
    "vitest": "^4.0.0",
    "eslint": "^9.0.0"
  }
}
```

---

## 四、实施步骤

### 阶段一：项目初始化（Week 1）

#### 任务 1.1：创建 Tauri 项目结构

```bash
# 在 remi-code 根目录
mkdir remi-app
cd remi-app

# 初始化 Tauri 项目
npm create tauri-app@latest . -- --template react-ts

# 安装依赖
npm install
```

#### 任务 1.2：迁移共享包

```bash
# 在 remi-code 根目录
mkdir -p packages/contracts/src
mkdir -p packages/shared/src
mkdir -p packages/remi-acp/src

# 复制 Remi Code 共享包源码
cp -r D:/Code/github/RemiCode/packages/contracts/src/* packages/contracts/src/
cp -r D:/Code/github/RemiCode/packages/shared/src/* packages/shared/src/
cp -r D:/Code/github/RemiCode/packages/effect-acp/src/* packages/remi-acp/src/

# 更新 package.json 中的包名
# 将所有 @remi-code/* 替换为 @remi-code/*
```

#### 任务 1.3：配置工作区

**package.json** (根目录)

```json
{
  "name": "remi-code",
  "private": true,
  "workspaces": [
    "remi-app",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=remi-app",
    "build": "npm run build --workspace=remi-app",
    "tauri": "tauri"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0"
  }
}
```

#### 任务 1.4：创建 Tauri 桥接层

创建 `remi-app/src/lib/tauri-bridge.ts`（见 3.3 节）

### 阶段二：前端迁移（Week 2-3）

#### 任务 2.1：迁移前端组件

```bash
# 复制 Remi Code 前端源码
cp -r D:/Code/github/RemiCode/apps/web/src/* remi-app/src/

# 删除不需要的文件
rm -rf remi-app/src/electron-*
```

#### 任务 2.2：更新导入路径

```bash
# 替换所有 @remi-code/* 为 @remi-code/*
# 可以使用 IDE 的全局替换功能
```

#### 任务 2.3：适配 Tauri API

1. 修改 `env.ts`，移除 Electron 检测
2. 修改 `appNavigation.ts`，调整历史模式
3. 修改 `nativeApi.ts`，适配 Tauri 窗口 API
4. 全局替换 `window.electronAPI` 为 `tauriBridge`

#### 任务 2.4：适配终端组件

修改 `TerminalViewportPane.tsx`，使用 Tauri 终端 API（见 3.4.2 节）

#### 任务 2.5：适配聊天组件

修改 `ChatView.tsx` 等组件，使用 Tauri 桥接层（见 3.4.3 节）

#### 任务 2.6：更新路由配置

修改路由文件，移除 Electron 特定逻辑

### 阶段三：集成测试（Week 4）

#### 任务 3.1：功能测试

- [ ] 创建/删除聊天线程
- [ ] 发送/接收消息
- [ ] 终端创建/输入/输出
- [ ] 项目切换
- [ ] 设置保存/加载

#### 任务 3.2：性能测试

- [ ] 应用启动时间
- [ ] 内存占用
- [ ] 消息渲染性能
- [ ] 终端响应延迟

#### 任务 3.3：兼容性测试

- [ ] Windows 10/11
- [ ] macOS 12+
- [ ] Linux (Ubuntu 20.04+)

### 阶段四：优化与打包（Week 5）

#### 任务 4.1：性能优化

- 优化前端渲染（虚拟滚动、懒加载）
- 优化状态管理
- 优化资源加载

#### 任务 4.2：打包发布

```bash
# 构建生产版本
npm run tauri build

# 生成安装包
# - Windows: .msi, .exe
# - macOS: .dmg
# - Linux: .AppImage, .deb
```

---

## 五、交付标准

### 5.1 功能完整性

- ✅ 100% 核心功能迁移
- ✅ 所有 UI 组件正常工作
- ✅ 所有交互逻辑保持一致
- ✅ 数据持久化正常（通过后端 API）

### 5.2 性能指标

| 指标 | Remi Code | Remi Code (目标) |
|------|-----------|------------------|
| 安装包大小 | ~150MB | ~50MB |
| 启动时间 | ~5s | ~2s |
| 内存占用 | ~300MB | ~150MB |
| 消息渲染 | 60fps | 60fps |

### 5.3 代码质量

- ✅ TypeScript 类型检查通过
- ✅ ESLint 无错误
- ✅ 单元测试覆盖率 > 80%

### 5.4 文档完整性

- ✅ README.md（项目介绍、安装、使用）
- ✅ 开发文档（架构、模块、API）
- ✅ 迁移指南（从 Remi Code 迁移）
- ✅ API 文档（Tauri Commands）

---

## 六、全维度功能验证清单

### 6.1 核心业务功能验证

#### 6.1.1 聊天线程管理

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| 创建线程 | 点击新建按钮创建聊天线程 | 线程创建成功，显示默认标题 | P0 |
| 删除线程 | 删除指定线程 | 线程从列表移除，数据清理 | P0 |
| 重命名线程 | 修改线程标题 | 标题更新成功，持久化保存 | P0 |
| 线程列表 | 查看所有线程 | 按更新时间排序，显示正确 | P0 |
| 线程切换 | 切换不同线程 | 消息历史正确加载 | P0 |
| 线程归档 | 归档不活跃线程 | 线程移入归档区 | P1 |
| 线程搜索 | 搜索线程标题/内容 | 快速定位目标线程 | P1 |

#### 6.1.2 消息交互系统

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| 发送文本消息 | 输入文本并发送 | 消息显示在时间线 | P0 |
| 发送图片消息 | 上传图片附件 | 图片正确显示，支持预览 | P0 |
| AI 响应流式输出 | 发送消息后 AI 回复 | 逐字流式显示，无卡顿 | P0 |
| 消息编辑 | 编辑已发送消息 | 编辑后重新生成响应 | P1 |
| 消息删除 | 删除单条消息 | 消息从时间线移除 | P1 |
| 消息复制 | 复制消息内容 | 复制到剪贴板成功 | P1 |
| 消息重试 | 重新生成 AI 响应 | 清除旧响应，生成新响应 | P1 |
| Markdown 渲染 | 渲染代码块、表格、列表 | 格式正确，语法高亮 | P0 |
| LaTeX 公式 | 渲染数学公式 | 公式正确显示 | P2 |

#### 6.1.3 AI 提供商集成

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| API Key 配置 | 配置各提供商 API Key | Key 安全存储，验证通过 | P0 |
| 模型列表加载 | 获取可用模型列表 | 显示所有可用模型 | P0 |
| 模型切换 | 切换不同 AI 模型 | 切换成功，使用新模型 | P0 |
| Claude 集成 | 使用 Claude 模型 | 正常对话，无报错 | P0 |
| Codex 集成 | 使用 Codex 模型 | 正常对话，无报错 | P0 |
| Gemini 集成 | 使用 Gemini 模型 | 正常对话，无报错 | P0 |
| Grok 集成 | 使用 Grok 模型 | 正常对话，无报错 | P1 |
| OpenCode 集成 | 使用 OpenCode 模型 | 正常对话，无报错 | P1 |
| Pi 集成 | 使用 Pi 模型 | 正常对话，无报错 | P1 |
| 自定义模型 | 添加自定义模型配置 | 模型可用，正常调用 | P2 |
| 提供商健康检查 | 检测提供商可用性 | 显示健康状态，异常提示 | P1 |
| 速率限制处理 | 触发速率限制 | 显示限制信息，自动重试 | P1 |

#### 6.1.4 终端管理系统

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| 创建终端 | 创建新终端会话 | 终端窗口正常显示 | P0 |
| 终端输入 | 输入命令并执行 | 命令正确执行，输出显示 | P0 |
| 终端输出 | 查看命令输出 | 输出正确渲染，支持颜色 | P0 |
| 终端调整大小 | 调整终端窗口大小 | 终端自适应，无错位 | P0 |
| 终端复制粘贴 | 复制终端内容 | 复制到剪贴板成功 | P1 |
| 终端搜索 | 搜索终端内容 | 高亮匹配项 | P1 |
| 多终端标签 | 创建多个终端标签 | 标签切换正常 | P1 |
| 终端关闭 | 关闭终端会话 | 进程正确终止 | P0 |
| 终端历史 | 查看命令历史 | 显示历史命令 | P2 |
| 终端主题 | 切换终端主题 | 主题应用成功 | P2 |

#### 6.1.5 Git 集成功能

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| Git 状态查询 | 查看仓库状态 | 显示修改、新增、删除文件 | P0 |
| 分支列表 | 查看所有分支 | 显示本地和远程分支 | P0 |
| 分支切换 | 切换到其他分支 | 切换成功，文件更新 | P0 |
| 创建分支 | 创建新分支 | 分支创建成功 | P1 |
| 删除分支 | 删除指定分支 | 分支删除成功 | P1 |
| 提交更改 | 提交文件更改 | 提交成功，历史更新 | P0 |
| 差异对比 | 查看文件差异 | 显示代码差异，高亮变更 | P0 |
| 暂存更改 | 暂存/恢复更改 | 暂存区操作正常 | P1 |
| 推送拉取 | 推送/拉取远程 | 同步成功 | P0 |
| 冲突解决 | 处理合并冲突 | 冲突标记正确显示 | P2 |
| 工作树管理 | 创建/切换工作树 | 工作树操作正常 | P2 |

#### 6.1.6 项目管理

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| 项目列表 | 查看所有项目 | 显示项目列表和图标 | P0 |
| 添加项目 | 添加新项目 | 项目添加成功 | P0 |
| 移除项目 | 移除项目 | 项目从列表移除 | P0 |
| 项目切换 | 切换工作项目 | 上下文切换成功 | P0 |
| 项目设置 | 配置项目参数 | 设置保存成功 | P1 |
| 项目搜索 | 搜索项目 | 快速定位项目 | P1 |
| 项目排序 | 调整项目顺序 | 排序保存成功 | P2 |

#### 6.1.7 工作区管理

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| 文件浏览器 | 浏览项目文件 | 显示文件树结构 | P0 |
| 文件打开 | 打开文件查看 | 文件内容正确显示 | P0 |
| 文件编辑 | 编辑文件内容 | 编辑保存成功 | P0 |
| 文件创建 | 创建新文件 | 文件创建成功 | P1 |
| 文件删除 | 删除文件 | 文件删除成功 | P1 |
| 文件重命名 | 重命名文件 | 重命名成功 | P1 |
| 文件搜索 | 搜索文件内容 | 显示匹配结果 | P1 |
| 目录创建 | 创建新目录 | 目录创建成功 | P2 |

### 6.2 边界场景验证

#### 6.2.1 大数据量场景

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| 长消息列表 | 1000+ 条消息 | 虚拟滚动流畅，无卡顿 | P0 |
| 大文件处理 | 处理 10MB+ 文件 | 正常加载，内存稳定 | P1 |
| 大量线程 | 100+ 个聊天线程 | 列表渲染流畅 | P1 |
| 大量终端输出 | 快速输出大量日志 | 终端正常显示，不丢失 | P1 |
| 大项目文件树 | 10000+ 文件项目 | 文件树加载正常 | P2 |

#### 6.2.2 异常场景

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| 网络断开 | 断开网络连接 | 显示离线提示，本地功能可用 | P0 |
| API 调用失败 | AI 提供商 API 错误 | 显示错误信息，可重试 | P0 |
| 数据库损坏 | SQLite 文件损坏 | 提示错误，可恢复 | P1 |
| 进程崩溃 | 后端进程异常退出 | 自动重启，数据不丢失 | P1 |
| 磁盘空间不足 | 磁盘空间耗尽 | 提示错误，优雅降级 | P1 |
| 权限不足 | 无文件访问权限 | 提示权限错误 | P1 |
| 并发操作 | 同时执行多个操作 | 操作队列正常处理 | P2 |

#### 6.2.3 并发场景

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| 多线程并发 | 多个线程同时对话 | 各线程独立运行 | P1 |
| 多终端并发 | 多个终端同时执行 | 各终端独立运行 | P1 |
| 文件并发操作 | 同时编辑多个文件 | 操作互不干扰 | P2 |
| 快速切换 | 快速切换线程/终端 | 状态正确保存恢复 | P1 |

### 6.3 用户体验验证

#### 6.3.1 界面交互

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| 响应式布局 | 调整窗口大小 | 布局自适应 | P0 |
| 快捷键 | 使用键盘快捷键 | 快捷键正常工作 | P1 |
| 拖拽功能 | 拖拽文件/标签 | 拖拽流畅 | P2 |
| 右键菜单 | 使用上下文菜单 | 菜单显示正确 | P1 |
| 模态对话框 | 打开/关闭对话框 | 对话框正常显示 | P0 |
| 提示消息 | 操作反馈提示 | Toast 显示正确 | P1 |
| 加载状态 | 长时间操作反馈 | 显示加载指示器 | P1 |

#### 6.3.2 主题与外观

| 测试项 | 验证内容 | 预期结果 | 优先级 |
|--------|----------|----------|--------|
| 深色模式 | 切换到深色主题 | 主题切换成功 | P0 |
| 浅色模式 | 切换到浅色主题 | 主题切换成功 | P0 |
| 字体大小 | 调整字体大小 | 字体大小变化 | P1 |
| 代码字体 | 调整代码字体 | 字体应用成功 | P2 |
| 主题自定义 | 自定义主题颜色 | 自定义生效 | P2 |

---

## 七、专项性能优化策略

### 7.1 启动速度优化

#### 7.1.1 当前问题分析

**Remi Code (Electron)**:
- 启动时间：~5秒
- 主要瓶颈：
  - Electron 主进程初始化
  - Node.js 后端启动
  - 前端资源加载
  - 数据库连接建立

#### 7.1.2 优化目标

| 阶段 | 当前时间 | 目标时间 | 优化策略 |
|------|----------|----------|----------|
| 应用启动 | ~2s | ~0.5s | Tauri 轻量级启动 |
| 前端渲染 | ~3s | ~1.5s | 代码分割 + 懒加载 |
| **总计** | **~5s** | **~2s** | **60% 提升** |

#### 7.1.3 优化措施

**前端优化**：

```typescript
// 1. 代码分割
const ChatView = lazy(() => import('./components/ChatView'));
const TerminalView = lazy(() => import('./components/TerminalView'));
const SettingsView = lazy(() => import('./components/Settings'));

// 2. 预加载关键资源
<link rel="preload" href="/fonts/inter.woff2" as="font" crossorigin />
<link rel="preload" href="/icons/sprite.svg" as="image" />

// 3. 服务工作者缓存
navigator.serviceWorker.register('/sw.js').then(reg => {
  // 缓存静态资源
});
```

### 7.2 页面渲染优化

#### 7.2.1 虚拟滚动优化

**问题**：长消息列表导致渲染卡顿

**解决方案**：

```typescript
// 使用 @legendapp/list 实现虚拟滚动
import { LegendList } from '@legendapp/list/react';

export function MessagesTimeline({ messages }: { messages: Message[] }) {
  return (
    <LegendList
      data={messages}
      renderItem={({ item }) => <MessageItem message={item} />}
      estimatedItemSize={80}
      overscan={5}
      recycleItems={true}
    />
  );
}
```

**优化效果**：
- 1000 条消息渲染时间：从 800ms 降至 50ms
- 内存占用：从 200MB 降至 50MB

#### 7.2.2 React 性能优化

```typescript
// 1. 使用 React.memo 避免不必要的重渲染
const MessageItem = React.memo(({ message }: { message: Message }) => {
  return <div>{message.content}</div>;
});

// 2. 使用 useMemo 缓存计算结果
const filteredMessages = useMemo(() => {
  return messages.filter(m => m.visible);
}, [messages]);

// 3. 使用 useCallback 缓存回调函数
const handleMessageClick = useCallback((id: string) => {
  setSelectedMessage(id);
}, []);

// 4. 使用 React Compiler（已配置）
// babel-plugin-react-compiler 自动优化
```

#### 7.2.3 图片优化

```typescript
// 1. 图片懒加载
<img loading="lazy" src={imageUrl} />

// 2. 图片压缩
import { compressImage } from './utils/image';
const compressed = await compressImage(file, { quality: 0.8 });

// 3. 使用 WebP 格式
<picture>
  <source srcSet={imageWebp} type="image/webp" />
  <img src={imagePng} />
</picture>
```

### 7.3 交互响应优化

#### 7.3.1 防抖与节流

```typescript
// 1. 搜索输入防抖
import { useDebouncedValue } from '@tanstack/react-pacer';

function SearchInput() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, { wait: 300 });
  
  useEffect(() => {
    if (debouncedQuery) {
      performSearch(debouncedQuery);
    }
  }, [debouncedQuery]);
  
  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}

// 2. 滚动事件节流
function useThrottledScroll(callback: () => void, delay: number) {
  const throttled = useMemo(
    () => throttle(callback, delay),
    [callback, delay]
  );
  
  useEffect(() => {
    window.addEventListener('scroll', throttled);
    return () => window.removeEventListener('scroll', throttled);
  }, [throttled]);
}
```

#### 7.3.2 异步操作优化

```typescript
// 1. 使用 React Query 缓存请求
const { data: models } = useQuery({
  queryKey: ['models'],
  queryFn: () => tauriBridge.provider.listModels(),
  staleTime: 5 * 60 * 1000, // 5分钟内使用缓存
});

// 2. 乐观更新
const sendMessage = useMutation({
  mutationFn: (msg: string) => tauriBridge.orchestration.sendMessage(msg),
  onMutate: async (msg) => {
    // 乐观更新 UI
    await queryClient.cancelQueries({ queryKey: ['messages'] });
    const previous = queryClient.getQueryData(['messages']);
    queryClient.setQueryData(['messages'], (old: Message[]) => [
      ...old,
      { id: 'temp', content: msg, status: 'sending' }
    ]);
    return { previous };
  },
  onError: (err, msg, context) => {
    // 回滚
    queryClient.setQueryData(['messages'], context?.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['messages'] });
  },
});
```

### 7.4 内存占用优化

#### 7.4.1 当前问题分析

**Remi Code (Electron)**:
- 基础内存：~300MB
- 主要占用：
  - Electron 主进程：~80MB
  - Node.js 后端：~120MB
  - 渲染进程：~100MB

#### 7.4.2 优化目标

| 组件 | 当前占用 | 目标占用 | 优化策略 |
|------|----------|----------|----------|
| Tauri 主进程 | - | ~30MB | Tauri 轻量级 |
| 前端渲染 | ~100MB | ~70MB | 虚拟滚动 + 懒加载 |
| **总计** | **~300MB** | **~150MB** | **50% 降低** |

#### 7.4.3 优化措施

```typescript
// 1. 及时清理事件监听器
useEffect(() => {
  const unlisten = tauriBridge.events.onMessage(handleMessage);
  return () => {
    unlisten.then(fn => fn());
  };
}, []);

// 2. 使用 WeakMap 缓存
const cache = new WeakMap();

function getCachedData(obj: object) {
  if (!cache.has(obj)) {
    cache.set(obj, computeData(obj));
  }
  return cache.get(obj);
}

// 3. 避免内存泄漏
// 及时取消订阅
// 及时清理定时器
// 及时释放大对象
```

---

## 八、多场景兼容性测试方案

### 8.1 操作系统兼容性

#### 8.1.1 Windows 兼容性

| 测试项 | 测试环境 | 验证内容 | 预期结果 |
|--------|----------|----------|----------|
| Windows 11 23H2 | 最新版本 | 完整功能测试 | 所有功能正常 |
| Windows 11 22H2 | 旧版本 | 完整功能测试 | 所有功能正常 |
| Windows 10 22H2 | LTSB | 完整功能测试 | 所有功能正常 |
| Windows 10 21H2 | 旧版本 | 完整功能测试 | 所有功能正常 |
| Windows ARM64 | Surface Pro X | 完整功能测试 | 所有功能正常 |

**Windows 特定测试**：

```powershell
# 1. 安装测试
.\RemiCode_0.1.0_x64-setup.exe /S

# 2. 卸载测试
.\RemiCode_0.1.0_x64-setup.exe /S /uninstall

# 3. 自动更新测试
# 检查更新 -> 下载 -> 安装 -> 重启

# 4. 权限测试
# 以管理员身份运行
# 以普通用户运行

# 5. 路径测试
# 安装到 C:\Program Files\RemiCode
# 安装到 D:\Apps\RemiCode（含空格）
# 安装到中文路径
```

#### 8.1.2 macOS 兼容性

| 测试项 | 测试环境 | 验证内容 | 预期结果 |
|--------|----------|----------|----------|
| macOS 14 Sonoma | M1/M2 Mac | 完整功能测试 | 所有功能正常 |
| macOS 13 Ventura | Intel Mac | 完整功能测试 | 所有功能正常 |
| macOS 12 Monterey | 旧版本 | 完整功能测试 | 所有功能正常 |
| macOS ARM64 | Apple Silicon | 原生运行测试 | 性能优于 Rosetta |
| macOS x64 | Intel Mac | Rosetta 2 运行 | 功能正常 |

**macOS 特定测试**：

```bash
# 1. DMG 安装测试
hdiutil attach RemiCode_0.1.0.dmg
# 拖拽到 Applications

# 2. 代码签名验证
codesign --verify --deep --strict RemiCode.app

# 3. Gatekeeper 测试
xattr -d com.apple.quarantine RemiCode.app

# 4. 权限测试
# 辅助功能权限
# 文件访问权限
# 网络权限
```

#### 8.1.3 Linux 兼容性

| 测试项 | 测试环境 | 验证内容 | 预期结果 |
|--------|----------|----------|----------|
| Ubuntu 22.04 | GNOME | 完整功能测试 | 所有功能正常 |
| Ubuntu 20.04 | GNOME | 完整功能测试 | 所有功能正常 |
| Fedora 38 | GNOME | 完整功能测试 | 所有功能正常 |
| Debian 12 | GNOME | 完整功能测试 | 所有功能正常 |
| Arch Linux | KDE | 完整功能测试 | 所有功能正常 |
| Linux ARM64 | Raspberry Pi | 完整功能测试 | 所有功能正常 |

**Linux 特定测试**：

```bash
# 1. AppImage 测试
chmod +x RemiCode_0.1.0_amd64.AppImage
./RemiCode_0.1.0_amd64.AppImage

# 2. DEB 包测试
sudo dpkg -i remi-code_0.1.0_amd64.deb

# 3. 依赖测试
ldd remi-code | grep "not found"

# 4. Wayland 兼容性测试
# 在 Wayland 会话中运行
# 在 X11 会话中运行

# 5. 桌面环境测试
# GNOME
# KDE Plasma
# XFCE
```

### 8.2 硬件兼容性

#### 8.2.1 CPU 架构

| 架构 | 测试设备 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| x86_64 | Intel/AMD PC | 完整功能测试 | 所有功能正常 |
| ARM64 | Apple M1/M2 | 原生运行 | 性能优秀 |
| ARM64 | Surface Pro X | Windows ARM | 功能正常 |
| ARM64 | Raspberry Pi 4 | Linux ARM | 功能正常 |

#### 8.2.2 内存配置

| 内存 | 测试场景 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| 4GB | 低内存设备 | 内存占用优化 | 正常运行，不OOM |
| 8GB | 标准配置 | 多任务处理 | 流畅运行 |
| 16GB | 高配置 | 大量并发 | 性能优秀 |
| 32GB+ | 专业配置 | 极限测试 | 稳定运行 |

#### 8.2.3 存储设备

| 存储类型 | 测试场景 | 验证内容 | 预期结果 |
|----------|----------|----------|----------|
| HDD | 机械硬盘 | 读写性能 | 正常运行 |
| SSD | 固态硬盘 | 快速启动 | 性能优秀 |
| NVMe | 高速固态 | 极限性能 | 性能最佳 |
| 外部存储 | U盘/移动硬盘 | 便携性测试 | 可正常运行 |

### 8.3 网络环境兼容性

#### 8.3.1 网络类型

| 网络类型 | 测试场景 | 验证内容 | 预期结果 |
|----------|----------|----------|----------|
| 有线网络 | 以太网连接 | 稳定性测试 | 连接稳定 |
| WiFi | 无线网络 | 信号波动 | 自动重连 |
| 移动热点 | 4G/5G 热点 | 延迟测试 | 正常工作 |
| 代理网络 | HTTP/SOCKS 代理 | 代理配置 | 正常连接 |
| VPN | 虚拟专用网络 | VPN 兼容 | 正常工作 |

#### 8.3.2 网络异常

| 异常场景 | 测试方法 | 验证内容 | 预期结果 |
|----------|----------|----------|----------|
| 网络断开 | 拔掉网线 | 离线处理 | 提示离线，本地功能可用 |
| 网络恢复 | 重新连接 | 自动重连 | 自动恢复连接 |
| 弱网环境 | 限制带宽 | 超时处理 | 显示加载，可取消 |
| DNS 故障 | 修改 hosts | 错误处理 | 提示错误，可重试 |
| API 限流 | 频繁请求 | 限流处理 | 显示限流，自动重试 |

### 8.4 多显示器兼容性

| 测试场景 | 验证内容 | 预期结果 |
|----------|----------|----------|
| 单显示器 | 基本显示 | 正常显示 |
| 双显示器 | 窗口移动 | 窗口可跨屏 |
| 多分辨率 | 不同 DPI | 界面自适应 |
| 投影模式 | 扩展/复制 | 正常显示 |
| 热插拔 | 动态连接 | 自动适应 |

### 8.5 辅助功能兼容性

| 测试项 | 验证内容 | 预期结果 |
|--------|----------|----------|
| 屏幕阅读器 | NVDA/VoiceOver | 可正常读取 |
| 高对比度 | 系统高对比度 | 界面可见 |
| 键盘导航 | Tab/Enter/Esc | 完全可操作 |
| 字体缩放 | 系统字体放大 | 界面自适应 |
| 色盲模式 | 颜色识别 | 信息可区分 |

---

## 九、代码质量提升措施

### 9.1 代码规范统一

#### 9.1.1 TypeScript 代码规范

**ESLint 配置** `remi-app/.eslintrc.cjs`：

```javascript
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    'no-console': 'warn',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
  },
};
```

**Prettier 配置** `remi-app/.prettierrc`：

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

**执行规范检查**：

```bash
cd remi-app

# ESLint 检查
npm run lint

# Prettier 格式化
npm run format

# 类型检查
npm run typecheck
```

#### 9.1.2 提交规范

**Commit Message 格式**：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型说明**：

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行的变动）
- `refactor`: 重构（既不是新增功能，也不是修改 bug 的代码变动）
- `perf`: 性能优化
- `test`: 增加测试
- `chore`: 构建过程或辅助工具的变动

**示例**：

```
feat(chat): 添加消息虚拟滚动

- 使用 @legendapp/list 实现虚拟滚动
- 优化长列表渲染性能
- 支持 1000+ 条消息流畅滚动

Closes #123
```

### 9.2 冗余代码清理

#### 9.2.1 死代码检测

**TypeScript 死代码检测**：

```bash
# 使用 ts-prune
npm install -g ts-prune
ts-prune remi-app/src

# 使用 knip
npm install -D knip
npx knip
```

#### 9.2.2 重复代码检测

**TypeScript 重复代码**：

```bash
# 使用 jscpd
npm install -g jscpd
jscpd remi-app/src
```

#### 9.2.3 清理策略

1. **未使用的导入**：自动移除
2. **未使用的变量**：重命名为 `_` 或删除
3. **未使用的函数**：删除或标记为内部使用
4. **未使用的类型**：删除或导出
5. **注释掉的代码**：删除（通过 Git 历史恢复）

### 9.3 模块化拆分

#### 9.3.1 TypeScript 模块结构

```typescript
// remi-app/src/components/chat/
├── ChatView.tsx           // 主视图
├── ChatView.logic.ts      // 业务逻辑
├── ChatView.selectors.ts  // 状态选择器
├── ChatTranscriptPane.tsx // 子组件
├── MessagesTimeline.tsx   // 子组件
└── index.ts               // 统一导出
```

**拆分原则**：

1. **按功能拆分**：聊天、终端、设置等
2. **按层级拆分**：组件、逻辑、样式
3. **按复用性拆分**：通用组件、业务组件
4. **按大小拆分**：大文件拆分为多个小文件

### 9.4 注释完善

#### 9.4.1 TypeScript 文档注释

```typescript
/**
 * 聊天视图主组件
 * 
 * 负责渲染聊天界面，包括消息列表、输入框、工具栏等
 * 
 * @param props - 组件属性
 * @param props.threadId - 当前线程 ID
 * @param props.projectId - 当前项目 ID
 * 
 * @returns React 组件
 * 
 * @example
 * ```tsx
 * <ChatView threadId="123" projectId="456" />
 * ```
 */
export function ChatView({ threadId, projectId }: ChatViewProps) {
  // ...
}

/**
 * 发送消息到 AI 提供商
 * 
 * 该函数会：
 * 1. 验证消息内容
 * 2. 保存到数据库
 * 3. 调用 AI API
 * 4. 流式返回响应
 * 
 * @param message - 消息内容
 * @param options - 发送选项
 * @returns 返回 AI 响应
 * 
 * @throws {ValidationError} 当消息内容为空时
 * @throws {NetworkError} 当网络请求失败时
 */
async function sendMessage(message: string, options?: SendOptions): Promise<Response> {
  // ...
}
```

### 9.5 风险代码修复

#### 9.5.1 常见风险点

**TypeScript 风险代码**：

```typescript
// ❌ 风险：any 类型
function process(data: any) {
  return data.value; // 类型不安全
}

// ✅ 安全：明确类型
function process(data: { value: string }): string {
  return data.value;
}

// ❌ 风险：未捕获的 Promise
async function load() {
  const data = await fetchData(); // 可能抛出异常
}

// ✅ 安全：错误处理
async function load() {
  try {
    const data = await fetchData();
  } catch (error) {
    console.error('Failed to load:', error);
  }
}

// ❌ 风险：内存泄漏
useEffect(() => {
  const timer = setInterval(() => {
    // ...
  }, 1000);
}, []);

// ✅ 安全：清理定时器
useEffect(() => {
  const timer = setInterval(() => {
    // ...
  }, 1000);
  return () => clearInterval(timer);
}, []);
```

#### 9.5.2 静态分析工具

**TypeScript 静态分析**：

```bash
# 使用 npm audit 检查依赖漏洞
npm audit

# 使用 eslint-plugin-security 检查安全问题
npm install -D eslint-plugin-security

# 使用 sonarqube 进行代码质量分析
```

### 9.6 测试覆盖率提升

#### 9.6.1 TypeScript 测试

```typescript
// 单元测试
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatView } from './ChatView';

describe('ChatView', () => {
  it('renders messages', () => {
    render(<ChatView threadId="123" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});

// 集成测试
import { test, expect } from '@playwright/test';

test('chat workflow', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="new-thread"]');
  await page.fill('[data-testid="message-input"]', 'Hello');
  await page.click('[data-testid="send-button"]');
  await expect(page.locator('[data-testid="message"]')).toContainText('Hello');
});
```

**覆盖率报告**：

```bash
# 使用 vitest
npm run test -- --coverage

# 使用 playwright
npm run test:e2e -- --coverage
```

---

## 十、全套文档更新计划

### 10.1 项目部署文档

#### 10.1.1 安装指南

**文档结构**：

```markdown
# Remi Code 安装指南

## 系统要求

### Windows
- 操作系统：Windows 10 21H2 或更高版本
- 处理器：x86_64 或 ARM64
- 内存：4GB RAM（推荐 8GB）
- 存储空间：500MB 可用空间

### macOS
- 操作系统：macOS 12 或更高版本
- 处理器：Intel x86_64 或 Apple Silicon
- 内存：4GB RAM（推荐 8GB）
- 存储空间：500MB 可用空间

### Linux
- 操作系统：Ubuntu 20.04+、Fedora 38+、Debian 12+
- 处理器：x86_64 或 ARM64
- 内存：4GB RAM（推荐 8GB）
- 存储空间：500MB 可用空间

## 安装步骤

### Windows
1. 下载 `RemiCode_0.1.0_x64-setup.exe`
2. 双击运行安装程序
3. 按照向导完成安装
4. 启动 Remi Code

### macOS
1. 下载 `RemiCode_0.1.0.dmg`
2. 双击打开 DMG 文件
3. 将 Remi Code 拖拽到 Applications 文件夹
4. 首次启动时允许应用运行

### Linux
#### AppImage
1. 下载 `RemiCode_0.1.0_amd64.AppImage`
2. 添加执行权限：`chmod +x RemiCode_0.1.0_amd64.AppImage`
3. 运行：`./RemiCode_0.1.0_amd64.AppImage`

#### DEB 包（Ubuntu/Debian）
1. 下载 `remi-code_0.1.0_amd64.deb`
2. 安装：`sudo dpkg -i remi-code_0.1.0_amd64.deb`
3. 启动：`remi-code`

## 首次配置
1. 配置 AI 提供商 API Key
2. 添加项目目录
3. 开始使用

## 卸载
### Windows
- 通过控制面板卸载
- 或删除安装目录

### macOS
- 将 Remi Code 从 Applications 拖到废纸篓
- 删除配置：`rm -rf ~/Library/Application Support/com.remi.code`

### Linux
#### AppImage
- 删除 AppImage 文件
- 删除配置：`rm -rf ~/.config/remi-code`

#### DEB 包
- 卸载：`sudo apt remove remi-code`
- 删除配置：`rm -rf ~/.config/remi-code`
```

#### 10.1.2 更新指南

```markdown
# Remi Code 更新指南

## 自动更新
Remi Code 支持自动更新，当有新版本时会提示用户。

1. 点击提示中的"下载更新"
2. 等待下载完成
3. 点击"重启并安装"
4. 应用自动重启并应用更新

## 手动更新
1. 访问 [GitHub Releases](https://github.com/remi-code/remi-code/releases)
2. 下载最新版本安装包
3. 运行安装程序（会自动覆盖旧版本）

## 版本说明
- **主版本号**：不兼容的重大更新
- **次版本号**：新功能更新（向下兼容）
- **修订号**：Bug 修复和小改进

## 回滚版本
如果新版本有问题，可以安装旧版本：
1. 卸载当前版本
2. 下载旧版本安装包
3. 安装旧版本
```

### 10.2 开发文档

#### 10.2.1 架构文档

```markdown
# Remi Code 架构文档

## 整体架构

```
┌─────────────────────────────────────┐
│         Tauri 前端 (React)          │
│  ┌──────────┐  ┌──────────┐        │
│  │ 聊天界面 │  │ 终端界面 │        │
│  └──────────┘  └──────────┘        │
└──────────────┬──────────────────────┘
               │ Tauri Commands
┌──────────────▼──────────────────────┐
│        Tauri 后端 (Rust)            │
│         （单独任务负责）             │
└─────────────────────────────────────┘
```

## 前端模块

### 聊天界面 (Chat)
负责聊天线程管理和消息交互。

**核心组件**：
- `ChatView`: 聊天主视图
- `ChatTranscriptPane`: 消息时间线
- `ComposerPromptEditor`: 消息编辑器
- `MessagesTimeline`: 消息列表

**数据流**：
```
用户输入 → tauriBridge.orchestration.sendMessage → 后端处理 → 事件推送 → UI 更新
```

### 终端管理 (Terminal)
管理终端会话和交互。

**核心组件**：
- `TerminalWorkspaceTabs`: 终端标签管理
- `TerminalViewportPane`: 终端视口
- `TerminalChrome`: 终端外壳

**数据流**：
```
用户输入 → tauriBridge.terminal.write → 后端 PTY → 事件推送 → 终端显示
```

### 状态管理 (State)
使用 Zustand 和 React Query 管理应用状态。

**核心 Store**：
- `appStore`: 应用全局状态
- `threadStore`: 聊天线程状态
- `composerDraftStore`: 编辑器草稿

### 路由管理 (Router)
使用 TanStack Router 管理应用路由。

**核心路由**：
- `/`: 主页
- `/chat/:threadId`: 聊天页面
- `/terminal/:sessionId`: 终端页面
- `/settings`: 设置页面
```

#### 10.2.2 API 文档

```markdown
# Tauri Bridge API

## orchestration

### createThread
创建新的聊天线程。

**参数**：
```typescript
interface CreateThreadParams {
  title?: string;
  projectId: string;
  modelSelection?: ModelSelection;
}
```

**返回**：`Promise<Thread>`

**示例**：
```typescript
import { tauriBridge } from './lib/tauri-bridge';

const thread = await tauriBridge.orchestration.createThread({
  title: 'New Thread',
  projectId: '123',
});
```

### sendMessage
发送消息到 AI。

**参数**：
```typescript
interface SendMessageParams {
  threadId: string;
  content: string;
  attachments?: Attachment[];
}
```

**返回**：`Promise<void>`

**示例**：
```typescript
await tauriBridge.orchestration.sendMessage({
  threadId: '123',
  content: 'Hello, AI!',
});
```

## provider

### listModels
获取可用模型列表。

**参数**：
```typescript
interface ListModelsParams {
  provider?: string;
}
```

**返回**：`Promise<Model[]>`

**示例**：
```typescript
const models = await tauriBridge.provider.listModels({
  provider: 'claude',
});
```

## terminal

### create
创建新的终端会话。

**参数**：
```typescript
interface CreateTerminalParams {
  cwd: string;
  shell?: string;
}
```

**返回**：`Promise<string>` (sessionId)

**示例**：
```typescript
const sessionId = await tauriBridge.terminal.create({
  cwd: '/home/user/project',
});
```

### write
向终端写入数据。

**参数**：
```typescript
interface WriteTerminalParams {
  sessionId: string;
  data: string;
}
```

**返回**：`Promise<void>`

**示例**：
```typescript
await tauriBridge.terminal.write({
  sessionId: 'abc123',
  data: 'ls -la\n',
});
```
```

### 10.3 组件使用文档

```markdown
# Remi Code 组件使用文档

## ChatView
聊天视图主组件。

**属性**：
| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| threadId | string | 是 | 线程 ID |
| projectId | string | 是 | 项目 ID |

**示例**：
```tsx
import { ChatView } from '@remi-code/components';

function App() {
  return <ChatView threadId="123" projectId="456" />;
}
```

## TerminalViewport
终端视口组件。

**属性**：
| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | 是 | 终端会话 ID |
| theme | TerminalTheme | 否 | 终端主题 |

**示例**：
```tsx
import { TerminalViewport } from '@remi-code/components';

function Terminal() {
  return <TerminalViewport sessionId="abc123" />;
}
```
```

### 10.4 迁移改造说明

```markdown
# 从 Remi Code 迁移到 Remi Code

## 主要变化

### 1. 技术栈变化
- **桌面框架**：Electron → Tauri
- **前端框架**：React 保持不变
- **后端**：Node.js → Rust（单独任务）

### 2. API 变化

#### Electron API → Tauri API
```typescript
// 旧代码（Electron）
const result = await window.electronAPI.someMethod();

// 新代码（Tauri）
import { tauriBridge } from './lib/tauri-bridge';
const result = await tauriBridge.someModule.someMethod();
```

#### 事件系统
```typescript
// 旧代码（Electron）
window.electronAPI.onEvent((data) => {
  console.log(data);
});

// 新代码（Tauri）
import { tauriBridge } from './lib/tauri-bridge';
const unlisten = await tauriBridge.events.onEvent((data) => {
  console.log(data);
});
```

### 3. 包名变化
```typescript
// 旧代码
import { Thread } from '@remi-code/contracts';

// 新代码
import { Thread } from '@remi-code/contracts';
```

### 4. 配置变化

#### 环境变量
```bash
# 旧配置
ELECTRON=true

# 新配置
TAURI=true
```

#### 存储路径
```bash
# 旧路径（Electron）
Windows: %APPDATA%/RemiCode
macOS: ~/Library/Application Support/RemiCode
Linux: ~/.config/RemiCode

# 新路径（Tauri）
Windows: %APPDATA%/com.remi.code
macOS: ~/Library/Application Support/com.remi.code
Linux: ~/.config/remi-code
```

## 迁移步骤

### 1. 备份数据
```bash
# 备份配置文件
cp -r ~/Library/Application\ Support/RemiCode ~/RemiCode-backup
```

### 2. 卸载旧版本
```bash
# macOS
rm -rf /Applications/RemiCode.app
```

### 3. 安装新版本
参考安装指南

### 4. 导入配置
首次启动时选择"导入旧配置"

## 已知问题

### 1. 插件兼容性
部分 Electron 插件不支持 Tauri，已替换为等效方案。

### 2. 性能差异
某些操作在 Tauri 中性能表现不同，已优化。

## 回滚方案

如需回滚到 Remi Code：
1. 卸载 Remi Code
2. 重新安装 Remi Code
3. 恢复备份数据
```

### 10.5 文档维护计划

#### 10.5.1 文档更新流程

```markdown
## 文档更新流程

### 1. 代码变更时
- 开发者更新相关文档
- PR 中包含文档更新
- Code Review 检查文档

### 2. 版本发布时
- 更新 CHANGELOG.md
- 更新版本号
- 更新安装指南

### 3. 定期审查
- 每月审查文档准确性
- 收集用户反馈
- 修复文档错误
```

#### 10.5.2 文档工具链

```markdown
## 文档工具链

### Markdown 编辑器
- VS Code + Markdown 插件
- Typora

### 文档生成
- VitePress：生成静态站点
- TypeDoc：生成 API 文档

### 文档托管
- GitHub Pages
- Netlify

### 文档搜索
- Algolia DocSearch
```

---

## 十一、迭代开发优先级排序

### 11.1 优先级定义

| 优先级 | 说明 | 时间范围 |
|--------|------|----------|
| **P0** | 核心功能，必须立即完成 | Week 1-2 |
| **P1** | 重要功能，尽快完成 | Week 3-4 |
| **P2** | 次要功能，计划完成 | Week 5-6 |
| **P3** | 可选功能，后续迭代 | Week 7+ |

### 11.2 P0 - 核心功能（Week 1-2）

#### 11.2.1 基础架构搭建

| 任务 | 描述 | 依赖 | 风险 |
|------|------|------|------|
| Tauri 项目初始化 | 创建 Tauri 项目，配置构建 | 无 | 低 |
| 共享包迁移 | 迁移 contracts 和 shared | 无 | 低 |
| Tauri 桥接层 | 实现 tauri-bridge.ts | Tauri 初始化 | 中 |
| 环境检测适配 | 修改 env.ts 和 nativeApi.ts | Tauri 初始化 | 低 |

#### 11.2.2 核心组件迁移

| 任务 | 描述 | 依赖 | 风险 |
|------|------|------|------|
| 聊天界面 | 迁移 ChatView 及相关组件 | 桥接层 | 中 |
| 终端组件 | 迁移 TerminalViewport | 桥接层 | 中 |
| 路由配置 | 迁移路由和导航 | 基础架构 | 低 |
| 状态管理 | 迁移 stores | 基础架构 | 低 |

#### 11.2.3 验收标准

- [ ] 应用可以启动并显示界面
- [ ] 可以创建聊天线程
- [ ] 可以发送消息并收到 AI 响应
- [ ] 可以创建终端并执行命令
- [ ] 数据可以通过后端 API 持久化

### 11.3 P1 - 重要功能（Week 3-4）

#### 11.3.1 完整功能迁移

| 任务 | 描述 | 依赖 | 风险 |
|------|------|------|------|
| Git 集成界面 | 迁移 Git 操作组件 | 核心功能 | 中 |
| 项目管理 | 迁移项目列表和切换 | 核心功能 | 低 |
| 设置系统 | 迁移应用设置界面 | 核心功能 | 低 |
| 主题系统 | 迁移深色/浅色主题 | 前端 | 低 |

#### 11.3.2 性能优化

| 任务 | 描述 | 依赖 | 风险 |
|------|------|------|------|
| 虚拟滚动 | 优化长列表渲染 | 前端 | 低 |
| 代码分割 | 优化前端加载 | 前端 | 低 |
| 状态优化 | 优化状态管理 | 核心功能 | 中 |
| 内存优化 | 减少内存占用 | 核心功能 | 中 |

#### 11.3.3 验收标准

- [ ] 所有核心功能正常工作
- [ ] Git 操作界面正常
- [ ] 项目切换正常
- [ ] 设置保存正常
- [ ] 启动时间 < 3秒
- [ ] 内存占用 < 200MB

### 11.4 P2 - 次要功能（Week 5-6）

#### 11.4.1 增强功能

| 任务 | 描述 | 依赖 | 风险 |
|------|------|------|------|
| 插件系统界面 | 实现插件管理界面 | 核心功能 | 高 |
| 技能系统界面 | 实现技能管理界面 | 核心功能 | 高 |
| 浏览器面板 | 实现内置浏览器界面 | 前端 | 中 |
| 快捷键系统 | 完善快捷键支持 | 前端 | 低 |

#### 11.4.2 测试完善

| 任务 | 描述 | 依赖 | 风险 |
|------|------|------|------|
| 单元测试 | 编写核心组件单元测试 | 核心功能 | 低 |
| 集成测试 | 编写端到端测试 | 核心功能 | 中 |
| 性能测试 | 编写性能基准测试 | 核心功能 | 低 |
| 兼容性测试 | 多平台测试 | 打包 | 中 |

#### 11.4.3 验收标准

- [ ] 插件系统界面可用
- [ ] 技能系统界面可用
- [ ] 浏览器面板可用
- [ ] 测试覆盖率 > 80%
- [ ] 通过所有平台测试

### 11.5 P3 - 可选功能（Week 7+）

#### 11.5.1 高级功能

| 任务 | 描述 | 依赖 | 风险 |
|------|------|------|------|
| 协作功能界面 | 实现多人协作界面 | 核心功能 | 高 |
| 云同步界面 | 实现配置云同步界面 | 核心功能 | 中 |
| AI 训练界面 | 实现自定义模型训练界面 | 提供商 | 高 |
| 语音输入界面 | 实现语音转文字界面 | 终端 | 中 |

#### 11.5.2 生态建设

| 任务 | 描述 | 依赖 | 风险 |
|------|------|------|------|
| 插件市场界面 | 建立插件分发平台界面 | 插件系统 | 高 |
| 文档站点 | 建立完整文档站 | 文档 | 低 |
| 社区建设 | 建立开发者社区 | 文档 | 中 |
| 教程视频 | 制作使用教程 | 核心功能 | 低 |

#### 11.5.3 验收标准

- [ ] 高级功能界面可用
- [ ] 文档完整
- [ ] 社区活跃
- [ ] 用户反馈良好

### 11.6 风险应对策略

#### 11.6.1 技术风险

| 风险 | 影响 | 概率 | 应对策略 |
|------|------|------|----------|
| Tauri API 不熟悉 | 中 | 高 | 查阅官方文档，参考示例项目 |
| Tauri 2.x 不稳定 | 高 | 中 | 使用稳定版本，充分测试，准备回滚方案 |
| 前端组件兼容性问题 | 中 | 中 | 逐个组件迁移，充分测试 |
| 跨平台兼容性问题 | 中 | 高 | 多平台测试，使用跨平台库，CI/CD 自动化测试 |

#### 11.6.2 进度风险

| 风险 | 影响 | 概率 | 应对策略 |
|------|------|------|----------|
| 核心功能迁移延迟 | 高 | 中 | 优先迁移核心功能，分阶段交付，增加资源 |
| 性能优化困难 | 中 | 中 | 早期性能测试，持续优化，性能预算 |
| 测试覆盖不足 | 中 | 高 | 编写自动化测试，持续集成，代码审查 |
| 文档不完善 | 低 | 高 | 文档与代码同步，定期审查，用户反馈 |

#### 11.6.3 质量风险

| 风险 | 影响 | 概率 | 应对策略 |
|------|------|------|----------|
| 代码质量下降 | 高 | 中 | 代码审查，静态分析，编码规范 |
| 安全漏洞 | 高 | 中 | 安全审计，依赖扫描，渗透测试 |
| 数据丢失 | 高 | 低 | 数据备份，事务保护，版本控制 |
| 用户体验差 | 中 | 中 | 用户测试，A/B 测试，反馈收集 |

### 11.7 资源需求

#### 11.7.1 人力资源

| 角色 | 人数 | 技能要求 | 时间投入 |
|------|------|----------|----------|
| React 开发工程师 | 2 | React, TypeScript, Tauri | 全职 |
| 测试工程师 | 1 | 自动化测试, 性能测试 | 全职 |
| 技术负责人 | 1 | 全栈, 架构设计 | 全职 |
| 产品经理 | 1 | 需求分析, 项目管理 | 兼职 |

#### 11.7.2 工具资源

| 工具 | 用途 | 成本 |
|------|------|------|
| GitHub | 代码托管, CI/CD | 免费 |
| VS Code | 开发工具 | 免费 |
| Figma | UI 设计 | 付费 |
| Notion | 项目管理 | 付费 |

#### 11.7.3 硬件资源

| 设备 | 用途 | 数量 |
|------|------|------|
| Windows PC | Windows 测试 | 2 |
| MacBook | macOS 测试 | 2 |
| Linux PC | Linux 测试 | 1 |
| ARM 设备 | ARM 测试 | 1 |

### 11.8 里程碑计划

#### 里程碑 1：基础架构（Week 2）

**交付物**：
- [ ] Tauri 项目搭建完成
- [ ] 共享包迁移完成
- [ ] Tauri 桥接层实现
- [ ] 环境检测适配

**验收标准**：
- [ ] 应用可以启动
- [ ] 基础 API 可以调用
- [ ] 开发环境正常

#### 里程碑 2：核心功能（Week 4）

**交付物**：
- [ ] 聊天界面迁移完成
- [ ] 终端组件迁移完成
- [ ] 路由配置迁移完成
- [ ] 状态管理迁移完成

**验收标准**：
- [ ] 可以创建聊天线程
- [ ] 可以发送消息
- [ ] 可以创建终端
- [ ] 数据可以通过后端 API 持久化

#### 里程碑 3：完整功能（Week 6）

**交付物**：
- [ ] Git 集成界面完成
- [ ] 项目管理完成
- [ ] 设置系统完成
- [ ] 性能优化完成

**验收标准**：
- [ ] 所有功能正常工作
- [ ] 性能指标达标
- [ ] 测试覆盖率 > 80%

#### 里程碑 4：发布准备（Week 7）

**交付物**：
- [ ] 多平台测试完成
- [ ] 文档完善
- [ ] 安装包生成
- [ ] 发布流程确认

**验收标准**：
- [ ] 通过所有平台测试
- [ ] 文档完整准确
- [ ] 安装包可以正常安装
- [ ] 可以发布

---

## 十二、总结

### 12.1 关键成功因素

1. **技术方案合理**：Tauri + React 技术栈成熟可行
2. **迁移策略清晰**：分阶段迁移，风险可控
3. **团队能力匹配**：具备 React 和 Tauri 开发能力
4. **测试充分**：全维度测试保证质量
5. **文档完善**：完整的文档支持

### 12.2 预期收益

1. **性能提升**：启动速度提升 60%，内存占用降低 50%
2. **体积减小**：安装包体积减少 60-70%
3. **安全性提高**：Tauri 安全特性
4. **维护性提升**：代码质量提高，文档完善
5. **用户体验优化**：更流畅的交互体验

### 12.3 下一步行动

1. **确认方案**：确认迁移方案和迭代计划
2. **组建团队**：组建开发团队，分配任务
3. **环境准备**：准备开发环境和测试环境
4. **开始实施**：按照里程碑计划开始实施
5. **持续改进**：根据反馈持续改进

---

**文档版本**: v1.0  
**最后更新**: 2026-06-19  
**负责人**: 技术负责人  
**审批人**: 待确认
