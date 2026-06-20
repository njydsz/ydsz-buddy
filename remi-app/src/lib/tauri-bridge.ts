import { invoke } from '@tauri-apps/api/core';
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save, message as showMessage, confirm } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile, mkdir, readDir } from '@tauri-apps/plugin-fs';
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import type { 
  DesktopTheme,
  DesktopUpdateState,
  DesktopUpdateActionResult,
  DesktopNotificationInput,
  ContextMenuItem,
  ServerVoiceTranscriptionInput,
  ServerVoiceTranscriptionResult,
  BrowserOpenInput,
  BrowserThreadInput,
  BrowserSetPanelBoundsInput,
  BrowserAttachWebviewInput,
  BrowserTabInput,
  BrowserCaptureScreenshotResult,
  BrowserExecuteCdpInput,
  BrowserNavigateInput,
  BrowserNewTabInput,
  ThreadBrowserState
} from '@remi-code/contracts';
import { WsTransport } from '../wsTransport';

// TODO: 迁移完成后替换为 contracts 中的正式类型
type Thread = unknown;
type Message = unknown;
type Model = unknown;
type CreateThreadParams = unknown;
type SendMessageParams = unknown;

// 全局 WebSocket 传输实例
let wsTransport: WsTransport | null = null;

/**
 * 获取或创建 WebSocket 传输实例
 */
async function getWsTransport(): Promise<WsTransport> {
  if (!wsTransport) {
    const wsUrl = await invoke<string>('get_server_ws_url');
    wsTransport = new WsTransport(wsUrl);
  }
  return wsTransport;
}

/**
 * 将 Tauri 异步 listen 包装为同步 cleanup 函数。
 * Tauri 的 listen 返回 Promise<UnlistenFn>，但上层契约期望 () => void，
 * 因此在卸载回调内部异步等待 unlisten 完成。
 */
function syncListen<T>(event: string, handler: (event: { payload: T }) => void): () => void {
  let unlisten: UnlistenFn | null = null;
  const unlistenPromise = listen<T>(event, handler).then((fn) => {
    unlisten = fn;
    return fn;
  });
  return () => {
    if (unlisten) {
      unlisten();
    } else {
      void unlistenPromise.then((fn) => fn());
    }
  };
}

/**
 * Tauri 桥接层
 * 封装所有与 Tauri 后端的交互
 */
export const tauriBridge = {
  /**
   * 获取 WebSocket URL
   */
  getWsUrl: () => {
    return import.meta.env.VITE_WS_URL || null;
  },

  /**
   * 选择文件夹
   */
  pickFolder: async (): Promise<string | null> => {
    return await open({
      directory: true,
      multiple: false,
      title: '选择文件夹'
    });
  },

  /**
   * 保存文件
   */
  saveFile: async (input: {
    defaultFilename: string;
    contents: string;
    filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
  }): Promise<string | null> => {
    const filePath = await save({
      defaultPath: input.defaultFilename,
      filters: input.filters?.map(f => ({
        name: f.name,
        extensions: [...f.extensions]
      }))
    });
    
    if (filePath) {
      await writeTextFile(filePath, input.contents);
    }
    
    return filePath;
  },

  /**
   * 显示确认对话框
   */
  confirm: async (message: string): Promise<boolean> => {
    return await confirm(message, {
      title: '确认',
      kind: 'info'
    });
  },

  /**
   * 设置主题
   */
  setTheme: async (theme: DesktopTheme): Promise<void> => {
    await invoke('set_theme', { theme });
  },

  /**
   * 显示上下文菜单
   */
  showContextMenu: async <T extends string>(
    items: readonly ContextMenuItem<T>[],
    position?: { x: number; y: number }
  ): Promise<T | null> => {
    return await invoke<T | null>('show_context_menu', { items, position });
  },

  /**
   * 打开外部链接
   */
  openExternal: async (url: string): Promise<boolean> => {
    try {
      await invoke('open_external', { url });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * 在文件夹中显示文件
   */
  showInFolder: async (path: string): Promise<void> => {
    await invoke('show_in_folder', { path });
  },

  /**
   * Shell 模块
   */
  shell: {
    showInFolder: async (path: string): Promise<void> => {
      await invoke('show_in_folder', { path });
    },
  },

  /**
   * 监听菜单动作
   */
  onMenuAction: (listener: (action: string) => void) => {
    return syncListen<string>('menu-action', (event) => {
      listener(event.payload);
    });
  },

  /**
   * 获取更新状态
   */
  getUpdateState: async (): Promise<DesktopUpdateState> => {
    return await invoke<DesktopUpdateState>('get_update_state');
  },

  /**
   * 检查更新
   */
  checkForUpdates: async (): Promise<DesktopUpdateState> => {
    return await invoke<DesktopUpdateState>('check_for_updates');
  },

  /**
   * 下载更新
   */
  downloadUpdate: async (): Promise<DesktopUpdateActionResult> => {
    return await invoke<DesktopUpdateActionResult>('download_update');
  },

  /**
   * 安装更新
   */
  installUpdate: async (): Promise<DesktopUpdateActionResult> => {
    return await invoke<DesktopUpdateActionResult>('install_update');
  },

  /**
   * 监听更新状态
   */
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => {
    return syncListen<DesktopUpdateState>('update-state', (event) => {
      listener(event.payload);
    });
  },

  /**
   * 通知模块
   */
  notifications: {
    isSupported: async (): Promise<boolean> => {
      return true; // Tauri 支持通知
    },
    
    show: async (input: DesktopNotificationInput): Promise<boolean> => {
      const granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        if (permission !== 'granted') {
          return false;
        }
      }
      
      sendNotification({
        title: input.title,
        body: input.body
      });
      return true;
    },
  },

  /**
   * 服务器模块 - 通过 WebSocket 调用
   */
  server: {
    transcribeVoice: async (
      input: ServerVoiceTranscriptionInput
    ): Promise<ServerVoiceTranscriptionResult> => {
      const transport = await getWsTransport();
      return await transport.request<ServerVoiceTranscriptionResult>('server.transcribeVoice', input);
    },

    getConfig: async (): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('server.getConfig');
    },

    getEnvironment: async (): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('server.getEnvironment');
    },

    getSettings: async (): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('server.getSettings');
    },

    updateSettings: async (settings: any): Promise<void> => {
      const transport = await getWsTransport();
      return await transport.request<void>('server.updateSettings', { settings });
    },

    refreshProviders: async (): Promise<void> => {
      const transport = await getWsTransport();
      return await transport.request<void>('server.refreshProviders');
    },

    updateProvider: async (provider: any): Promise<void> => {
      const transport = await getWsTransport();
      return await transport.request<void>('server.updateProvider', { provider });
    },

    listWorktrees: async (): Promise<any[]> => {
      const transport = await getWsTransport();
      return await transport.request('server.listWorktrees');
    },

    getProviderUsageSnapshot: async (): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('server.getProviderUsageSnapshot');
    },

    getDiagnostics: async (): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('server.getDiagnostics');
    },

    upsertKeybinding: async (keybinding: any): Promise<void> => {
      const transport = await getWsTransport();
      return await transport.request<void>('server.upsertKeybinding', { keybinding });
    },
  },

  /**
   * 浏览器模块
   */
  browser: {
    open: async (input: BrowserOpenInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_open', { ...input });
    },

    close: async (input: BrowserThreadInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_close', { ...input });
    },

    hide: async (input: BrowserThreadInput): Promise<void> => {
      await invoke('browser_hide', { ...input });
    },

    getState: async (input: BrowserThreadInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_get_state', { ...input });
    },

    setPanelBounds: async (input: BrowserSetPanelBoundsInput): Promise<void> => {
      await invoke('browser_set_panel_bounds', { ...input });
    },

    attachWebview: async (input: BrowserAttachWebviewInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_attach_webview', { ...input });
    },

    copyScreenshotToClipboard: async (input: BrowserTabInput): Promise<void> => {
      await invoke('browser_copy_screenshot_to_clipboard', { ...input });
    },

    captureScreenshot: async (input: BrowserTabInput): Promise<BrowserCaptureScreenshotResult> => {
      return await invoke<BrowserCaptureScreenshotResult>('browser_capture_screenshot', { ...input });
    },

    executeCdp: async (input: BrowserExecuteCdpInput): Promise<unknown> => {
      return await invoke('browser_execute_cdp', { ...input });
    },

    navigate: async (input: BrowserNavigateInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_navigate', { ...input });
    },

    reload: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_reload', { ...input });
    },

    goBack: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_go_back', { ...input });
    },

    goForward: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_go_forward', { ...input });
    },

    newTab: async (input: BrowserNewTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_new_tab', { ...input });
    },

    closeTab: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_close_tab', { ...input });
    },

    selectTab: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_select_tab', { ...input });
    },

    openDevTools: async (input: BrowserTabInput): Promise<void> => {
      await invoke('browser_open_dev_tools', { ...input });
    },

    onState: (listener: (state: ThreadBrowserState) => void) => {
      return syncListen<ThreadBrowserState>('browser-state', (event) => {
        listener(event.payload);
      });
    },

    onBrowserUseOpenPanelRequest: (listener: () => void) => {
      return syncListen('browser-use-open-panel-request', () => {
        listener();
      });
    },
  },

  /**
   * 编排引擎相关命令 - 通过 WebSocket 调用
   */
  orchestration: {
    /**
     * 通用命令分发器 - 所有编排操作都通过此方法
     */
    dispatchCommand: async (command: any): Promise<{ sequence: number }> => {
      const transport = await getWsTransport();
      return await transport.request<{ sequence: number }>('orchestration.dispatchCommand', command);
    },

    /**
     * 获取完整快照
     */
    getSnapshot: async (): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('orchestration.getSnapshot');
    },

    /**
     * 获取 Shell 快照
     */
    getShellSnapshot: async (): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('orchestration.getShellSnapshot');
    },

    /**
     * 获取线程详情
     */
    getThreadDetail: async (threadId: string): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('orchestration.getThreadDetail', { threadId });
    },

    /**
     * 获取项目详情
     */
    getProjectDetail: async (projectId: string): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('orchestration.getProjectDetail', { projectId });
    },

    /**
     * 获取统计数据
     */
    getCounts: async (): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('orchestration.getCounts');
    },

    /**
     * 重放事件
     */
    replayEvents: async (fromSequenceExclusive: number, limit?: number): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('orchestration.replayEvents', { fromSequenceExclusive, limit });
    },

    /**
     * 修复状态（预留接口）
     */
    repairState: async (): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('orchestration.repairState');
    },

    /**
     * 监听域事件
     */
    onDomainEvent: (listener: (event: any) => void) => {
      return syncListen('orchestration-domain-event', (event) => {
        listener(event.payload);
      });
    },

    /**
     * 监听 Shell 事件
     */
    onShellEvent: (listener: (event: any) => void) => {
      return syncListen('orchestration-shell-event', (event) => {
        listener(event.payload);
      });
    },

    onThreadEvent: (listener: (event: any) => void) => {
      return syncListen('orchestration-thread-event', (event) => {
        listener(event.payload);
      });
    },
  },

  /**
   * AI 提供商相关命令 - 通过 WebSocket 调用
   */
  provider: {
    listModels: async (provider?: string): Promise<Model[]> => {
      const transport = await getWsTransport();
      return await transport.request<Model[]>('provider.listModels', { provider });
    },

    setApiKey: async (provider: string, key: string): Promise<void> => {
      const transport = await getWsTransport();
      return await transport.request<void>('provider.setApiKey', { provider, key });
    },

    getProviderStatus: async (): Promise<Record<string, any>> => {
      const transport = await getWsTransport();
      return await transport.request('provider.getProviderStatus');
    },

    getComposerCapabilities: async (input: any): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('provider.getComposerCapabilities', input);
    },

    compactThread: async (input: any): Promise<void> => {
      const transport = await getWsTransport();
      return await transport.request<void>('provider.compactThread', input);
    },

    listCommands: async (input: any): Promise<any[]> => {
      const transport = await getWsTransport();
      return await transport.request('provider.listCommands', input);
    },

    listSkills: async (input: any): Promise<any[]> => {
      const transport = await getWsTransport();
      return await transport.request('provider.listSkills', input);
    },

    listPlugins: async (input: any): Promise<any[]> => {
      const transport = await getWsTransport();
      return await transport.request('provider.listPlugins', input);
    },

    readPlugin: async (input: any): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('provider.readPlugin', input);
    },

    listAgents: async (input: any): Promise<any[]> => {
      const transport = await getWsTransport();
      return await transport.request('provider.listAgents', input);
    },
  },

  /**
   * 技能模块 - 通过 WebSocket 调用
   */
  skills: {
    listLocal: async (): Promise<any[]> => {
      const transport = await getWsTransport();
      return await transport.request('skills.listLocal');
    },
  },

  /**
   * 终端管理相关命令
   */
  terminal: {
    create: async (cwd: string, shell?: string): Promise<string> => {
      const transport = await getWsTransport();
      return await transport.request<string>('terminal.open', { cwd, shell });
    },

    write: async (sessionId: string, data: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('terminal.write', { sessionId, data });
    },

    resize: async (sessionId: string, rows: number, cols: number): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('terminal.resize', { sessionId, rows, cols });
    },

    close: async (sessionId: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('terminal.close', { sessionId });
    },

    clear: async (sessionId: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('terminal.clear', { sessionId });
    },

    restart: async (sessionId: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('terminal.restart', { sessionId });
    },
  },

  /**
   * Git 操作相关命令
   */
  git: {
    getStatus: async (cwd: string): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('git.status', { cwd });
    },

    listBranches: async (cwd: string): Promise<string[]> => {
      const transport = await getWsTransport();
      return await transport.request<string[]>('git.listBranches', { cwd });
    },

    checkoutBranch: async (cwd: string, branch: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('git.checkout', { cwd, branch });
    },

    commit: async (cwd: string, message: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('git.runStackedAction', { cwd, action: 'commit', message });
    },

    pull: async (cwd: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('git.pull', { cwd });
    },

    push: async (cwd: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('git.runStackedAction', { cwd, action: 'push' });
    },

    readWorkingTreeDiff: async (cwd: string): Promise<string> => {
      const transport = await getWsTransport();
      const result = await transport.request<{ diff: string }>('git.diff', { cwd, staged: false });
      return result.diff;
    },

    summarizeDiff: async (cwd: string): Promise<string> => {
      const transport = await getWsTransport();
      const result = await transport.request<{ diff: string }>('git.diff', { cwd, staged: true });
      return result.diff;
    },

    createBranch: async (cwd: string, branchName: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('git.createBranch', { cwd, branch: branchName });
    },

    stash: async (cwd: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('git.stash', { cwd });
    },

    stashPop: async (cwd: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request<void>('git.stashPop', { cwd });
    },

    log: async (cwd: string, maxCount?: number): Promise<string> => {
      const transport = await getWsTransport();
      const result = await transport.request<{ log: string }>('git.log', { cwd, maxCount: maxCount ?? 50 });
      return result.log;
    },
  },

  /**
   * 工作区管理相关命令
   */
  workspace: {
    listProjects: async (): Promise<any[]> => {
      const transport = await getWsTransport();
      return await transport.request('workspace.listProjects', {});
    },

    addProject: async (path: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request('workspace.addProject', { path });
    },

    removeProject: async (projectId: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request('workspace.removeProject', { projectId });
    },

    readFile: async (root: string, path: string): Promise<string> => {
      const transport = await getWsTransport();
      const result = await transport.request<{ content: string }>('workspace.readFile', { root, path });
      return result.content;
    },

    writeFile: async (root: string, path: string, content: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request('workspace.writeFile', { root, path, content });
    },
  },

  /**
   * 设置管理相关命令
   */
  settings: {
    get: async (): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('server.getSettings', {});
    },

    save: async (settings: any): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request('server.updateSettings', settings);
    },
  },

  /**
   * 检查点管理相关命令
   */
  checkpoint: {
    create: async (threadId: string, commitSha: string, message: string): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('checkpoint.create', { threadId, commitSha, message });
    },

    get: async (checkpointId: string): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('checkpoint.get', { checkpointId });
    },

    list: async (threadId: string): Promise<any[]> => {
      const transport = await getWsTransport();
      return await transport.request('checkpoint.list', { threadId });
    },

    delete: async (checkpointId: string): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request('checkpoint.delete', { checkpointId });
    },

    revert: async (threadId: string, checkpointId: string): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('checkpoint.revert', { threadId, checkpointId });
    },
  },

  /**
   * 遥测管理相关命令
   */
  telemetry: {
    getUsageStats: async (): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('telemetry.getUsageStats', {});
    },

    getEvents: async (limit: number = 100): Promise<any[]> => {
      const transport = await getWsTransport();
      return await transport.request('telemetry.getEvents', { limit });
    },

    clearEvents: async (): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request('telemetry.clearEvents', {});
    },

    getMetrics: async (): Promise<any> => {
      const transport = await getWsTransport();
      return await transport.request('telemetry.getMetrics', {});
    },

    clearMetrics: async (): Promise<void> => {
      const transport = await getWsTransport();
      await transport.request('telemetry.clearMetrics', {});
    },
  },

  /**
   * 事件监听
   */
  events: {
    onThreadUpdated: (callback: (thread: Thread) => void) => {
      return syncListen<Thread>('thread-updated', (event) => {
        callback(event.payload);
      });
    },

    onTerminalOutput: (callback: (data: { sessionId: string; output: string }) => void) => {
      return syncListen('terminal-output', (event) => {
        callback(event.payload as { sessionId: string; output: string });
      });
    },

    onMessage: (callback: (message: Message) => void) => {
      return syncListen<Message>('message-received', (event) => {
        callback(event.payload);
      });
    },

    onGitStatusChanged: (callback: (status: any) => void) => {
      return syncListen('git-status-changed', (event) => {
        callback(event.payload);
      });
    },

    emit: async (event: string, payload?: any) => {
      return await emit(event, payload);
    },
  },

  /**
   * 窗口操作
   */
  window: {
    minimize: async () => {
      await getCurrentWindow().minimize();
    },

    maximize: async () => {
      await getCurrentWindow().toggleMaximize();
    },

    close: async () => {
      await getCurrentWindow().close();
    },

    setTitle: async (title: string) => {
      await getCurrentWindow().setTitle(title);
    },
  },

  /**
   * 对话框
   */
  dialog: {
    open: async (options?: any): Promise<string | null> => {
      const result = await open(options);
      return Array.isArray(result) ? (result[0] ?? null) : result;
    },

    save: async (options?: any): Promise<string | null> => {
      return await save(options);
    },

    message: async (text: string, options?: any) => {
      return await showMessage(text, options);
    },

    confirm: async (message: string, options?: any): Promise<boolean> => {
      return await confirm(message, options);
    },
  },

  /**
   * 文件系统
   */
  fs: {
    readTextFile: async (path: string): Promise<string> => {
      return await readTextFile(path);
    },

    writeTextFile: async (path: string, content: string): Promise<void> => {
      return await writeTextFile(path, content);
    },

    createDir: async (path: string, options?: any): Promise<void> => {
      return await mkdir(path, options);
    },

    readDir: async (path: string): Promise<any[]> => {
      return await readDir(path);
    },
  },

  /**
   * 剪贴板
   */
  clipboard: {
    writeText: async (text: string): Promise<void> => {
      return await writeText(text);
    },

    readText: async (): Promise<string> => {
      return await readText();
    },
  },

  /**
   * 通知
   */
  notification: {
    requestPermission: async (): Promise<boolean> => {
      const granted = await isPermissionGranted();
      if (!granted) {
        return await requestPermission() === 'granted';
      }
      return true;
    },

    send: async (title: string, body: string): Promise<void> => {
      sendNotification({ title, body });
    },
  },
};

/**
 * 类型导出
 */
export type TauriBridge = typeof tauriBridge;
