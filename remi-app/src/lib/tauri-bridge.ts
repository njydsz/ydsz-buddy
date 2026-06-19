import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { appWindow } from '@tauri-apps/api/window';
import { open, save, message, confirm } from '@tauri-apps/api/dialog';
import { writeTextFile, readTextFile, createDir, readDir } from '@tauri-apps/api/fs';
import { writeText, readText } from '@tauri-apps/api/clipboard';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import type { 
  Thread, 
  Message, 
  Model, 
  CreateThreadParams,
  SendMessageParams,
  DesktopBridge,
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

/**
 * Tauri 桥接层
 * 封装所有与 Tauri 后端的交互
 */
export const tauriBridge: DesktopBridge = {
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
      type: 'info'
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
    return listen<string>('menu-action', (event) => {
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
    return listen<DesktopUpdateState>('update-state', (event) => {
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
   * 服务器模块
   */
  server: {
    transcribeVoice: async (
      input: ServerVoiceTranscriptionInput
    ): Promise<ServerVoiceTranscriptionResult> => {
      return await invoke<ServerVoiceTranscriptionResult>('transcribe_voice', input);
    },

    getConfig: async (): Promise<any> => {
      return await invoke('server_get_config');
    },

    getEnvironment: async (): Promise<any> => {
      return await invoke('server_get_environment');
    },

    getSettings: async (): Promise<any> => {
      return await invoke('server_get_settings');
    },

    updateSettings: async (settings: any): Promise<void> => {
      return await invoke<void>('server_update_settings', { settings });
    },

    refreshProviders: async (): Promise<void> => {
      return await invoke<void>('server_refresh_providers');
    },

    updateProvider: async (provider: any): Promise<void> => {
      return await invoke<void>('server_update_provider', { provider });
    },

    listWorktrees: async (): Promise<any[]> => {
      return await invoke('server_list_worktrees');
    },

    getProviderUsageSnapshot: async (): Promise<any> => {
      return await invoke('server_get_provider_usage_snapshot');
    },

    getDiagnostics: async (): Promise<any> => {
      return await invoke('server_get_diagnostics');
    },

    upsertKeybinding: async (keybinding: any): Promise<void> => {
      return await invoke<void>('server_upsert_keybinding', { keybinding });
    },
  },

  /**
   * 浏览器模块
   */
  browser: {
    open: async (input: BrowserOpenInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_open', input);
    },

    close: async (input: BrowserThreadInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_close', input);
    },

    hide: async (input: BrowserThreadInput): Promise<void> => {
      await invoke('browser_hide', input);
    },

    getState: async (input: BrowserThreadInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_get_state', input);
    },

    setPanelBounds: async (input: BrowserSetPanelBoundsInput): Promise<void> => {
      await invoke('browser_set_panel_bounds', input);
    },

    attachWebview: async (input: BrowserAttachWebviewInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_attach_webview', input);
    },

    copyScreenshotToClipboard: async (input: BrowserTabInput): Promise<void> => {
      await invoke('browser_copy_screenshot_to_clipboard', input);
    },

    captureScreenshot: async (input: BrowserTabInput): Promise<BrowserCaptureScreenshotResult> => {
      return await invoke<BrowserCaptureScreenshotResult>('browser_capture_screenshot', input);
    },

    executeCdp: async (input: BrowserExecuteCdpInput): Promise<unknown> => {
      return await invoke('browser_execute_cdp', input);
    },

    navigate: async (input: BrowserNavigateInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_navigate', input);
    },

    reload: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_reload', input);
    },

    goBack: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_go_back', input);
    },

    goForward: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_go_forward', input);
    },

    newTab: async (input: BrowserNewTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_new_tab', input);
    },

    closeTab: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_close_tab', input);
    },

    selectTab: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
      return await invoke<ThreadBrowserState>('browser_select_tab', input);
    },

    openDevTools: async (input: BrowserTabInput): Promise<void> => {
      await invoke('browser_open_dev_tools', input);
    },

    onState: (listener: (state: ThreadBrowserState) => void) => {
      return listen<ThreadBrowserState>('browser-state', (event) => {
        listener(event.payload);
      });
    },

    onBrowserUseOpenPanelRequest: (listener: () => void) => {
      return listen('browser-use-open-panel-request', () => {
        listener();
      });
    },
  },

  /**
   * 编排引擎相关命令
   */
  orchestration: {
    createThread: async (params: CreateThreadParams): Promise<Thread> => {
      return await invoke<Thread>('create_thread', { params });
    },

    sendMessage: async (params: SendMessageParams): Promise<void> => {
      return await invoke<void>('send_message', params);
    },

    listThreads: async (projectId: string): Promise<Thread[]> => {
      return await invoke<Thread[]>('list_threads', { projectId });
    },

    deleteThread: async (threadId: string): Promise<void> => {
      return await invoke<void>('delete_thread', { threadId });
    },

    renameThread: async (threadId: string, title: string): Promise<void> => {
      return await invoke<void>('rename_thread', { threadId, title });
    },

    getSnapshot: async (): Promise<any> => {
      return await invoke('orchestration_get_snapshot');
    },

    getShellSnapshot: async (): Promise<any> => {
      return await invoke('orchestration_get_shell_snapshot');
    },

    dispatchCommand: async (command: any): Promise<void> => {
      return await invoke<void>('orchestration_dispatch_command', { command });
    },

    importThread: async (input: any): Promise<Thread> => {
      return await invoke<Thread>('orchestration_import_thread', input);
    },

    repairState: async (): Promise<void> => {
      return await invoke<void>('orchestration_repair_state');
    },

    getTurnDiff: async (input: any): Promise<string> => {
      return await invoke<string>('orchestration_get_turn_diff', input);
    },

    getFullThreadDiff: async (input: any): Promise<string> => {
      return await invoke<string>('orchestration_get_full_thread_diff', input);
    },

    replayEvents: async (fromSequenceExclusive: number): Promise<void> => {
      return await invoke<void>('orchestration_replay_events', { fromSequenceExclusive });
    },

    subscribeShell: async (): Promise<void> => {
      return await invoke<void>('orchestration_subscribe_shell');
    },

    unsubscribeShell: async (): Promise<void> => {
      return await invoke<void>('orchestration_unsubscribe_shell');
    },

    subscribeThread: async (input: any): Promise<void> => {
      return await invoke<void>('orchestration_subscribe_thread', input);
    },

    unsubscribeThread: async (input: any): Promise<void> => {
      return await invoke<void>('orchestration_unsubscribe_thread', input);
    },

    onDomainEvent: (listener: (event: any) => void) => {
      return listen('orchestration-domain-event', (event) => {
        listener(event.payload);
      });
    },

    onShellEvent: (listener: (event: any) => void) => {
      return listen('orchestration-shell-event', (event) => {
        listener(event.payload);
      });
    },

    onThreadEvent: (listener: (event: any) => void) => {
      return listen('orchestration-thread-event', (event) => {
        listener(event.payload);
      });
    },
  },

  /**
   * AI 提供商相关命令
   */
  provider: {
    listModels: async (provider?: string): Promise<Model[]> => {
      return await invoke<Model[]>('list_models', { provider });
    },

    setApiKey: async (provider: string, key: string): Promise<void> => {
      return await invoke<void>('set_api_key', { provider, key });
    },

    getProviderStatus: async (): Promise<Record<string, any>> => {
      return await invoke('get_provider_status');
    },

    getComposerCapabilities: async (input: any): Promise<any> => {
      return await invoke('provider_get_composer_capabilities', input);
    },

    compactThread: async (input: any): Promise<void> => {
      return await invoke<void>('provider_compact_thread', input);
    },

    listCommands: async (input: any): Promise<any[]> => {
      return await invoke('provider_list_commands', input);
    },

    listSkills: async (input: any): Promise<any[]> => {
      return await invoke('provider_list_skills', input);
    },

    listPlugins: async (input: any): Promise<any[]> => {
      return await invoke('provider_list_plugins', input);
    },

    readPlugin: async (input: any): Promise<any> => {
      return await invoke('provider_read_plugin', input);
    },

    listAgents: async (input: any): Promise<any[]> => {
      return await invoke('provider_list_agents', input);
    },
  },

  /**
   * 技能模块
   */
  skills: {
    listLocal: async (): Promise<any[]> => {
      return await invoke('skills_list_local');
    },
  },

  /**
   * 终端管理相关命令
   */
  terminal: {
    create: async (cwd: string, shell?: string): Promise<string> => {
      return await invoke<string>('create_terminal', { cwd, shell });
    },

    write: async (sessionId: string, data: string): Promise<void> => {
      return await invoke<void>('write_terminal', { sessionId, data });
    },

    resize: async (sessionId: string, rows: number, cols: number): Promise<void> => {
      return await invoke<void>('resize_terminal', { sessionId, rows, cols });
    },

    close: async (sessionId: string): Promise<void> => {
      return await invoke<void>('close_terminal', { sessionId });
    },

    clear: async (sessionId: string): Promise<void> => {
      return await invoke<void>('clear_terminal', { sessionId });
    },

    restart: async (sessionId: string): Promise<void> => {
      return await invoke<void>('restart_terminal', { sessionId });
    },
  },

  /**
   * Git 操作相关命令
   */
  git: {
    getStatus: async (cwd: string): Promise<any> => {
      return await invoke('git_status', { cwd });
    },

    listBranches: async (cwd: string): Promise<string[]> => {
      return await invoke<string[]>('git_list_branches', { cwd });
    },

    checkoutBranch: async (cwd: string, branch: string): Promise<void> => {
      return await invoke<void>('git_checkout', { cwd, branch });
    },

    commit: async (cwd: string, message: string): Promise<void> => {
      return await invoke<void>('git_commit', { cwd, message });
    },

    pull: async (cwd: string): Promise<void> => {
      return await invoke<void>('git_pull', { cwd });
    },

    push: async (cwd: string): Promise<void> => {
      return await invoke<void>('git_push', { cwd });
    },

    readWorkingTreeDiff: async (cwd: string): Promise<string> => {
      return await invoke<string>('git_diff', { cwd, staged: false });
    },

    summarizeDiff: async (cwd: string): Promise<string> => {
      return await invoke<string>('git_diff', { cwd, staged: true });
    },

    createBranch: async (cwd: string, branchName: string): Promise<void> => {
      return await invoke<void>('git_create_branch', { cwd, branchName });
    },

    stash: async (cwd: string): Promise<void> => {
      return await invoke<void>('git_stash', { cwd });
    },

    stashPop: async (cwd: string): Promise<void> => {
      return await invoke<void>('git_stash_pop', { cwd });
    },

    log: async (cwd: string, maxCount?: number): Promise<string> => {
      return await invoke<string>('git_log', { cwd, maxCount });
    },
  },

  /**
   * 工作区管理相关命令
   */
  workspace: {
    listProjects: async (): Promise<any[]> => {
      return await invoke('list_projects');
    },

    addProject: async (path: string): Promise<void> => {
      return await invoke<void>('add_project', { path });
    },

    removeProject: async (projectId: string): Promise<void> => {
      return await invoke<void>('remove_project', { projectId });
    },

    readFile: async (path: string): Promise<string> => {
      return await invoke<string>('read_file', { path });
    },

    writeFile: async (path: string, content: string): Promise<void> => {
      return await invoke<void>('write_file', { path, content });
    },
  },

  /**
   * 设置管理相关命令
   */
  settings: {
    get: async (): Promise<any> => {
      return await invoke('get_settings');
    },

    save: async (settings: any): Promise<void> => {
      return await invoke<void>('save_settings', { settings });
    },
  },

  /**
   * 事件监听
   */
  events: {
    onThreadUpdated: (callback: (thread: Thread) => void) => {
      return listen<Thread>('thread-updated', (event) => {
        callback(event.payload);
      });
    },

    onTerminalOutput: (callback: (data: { sessionId: string; output: string }) => void) => {
      return listen('terminal-output', (event) => {
        callback(event.payload as { sessionId: string; output: string });
      });
    },

    onMessage: (callback: (message: Message) => void) => {
      return listen<Message>('message-received', (event) => {
        callback(event.payload);
      });
    },

    onGitStatusChanged: (callback: (status: any) => void) => {
      return listen('git-status-changed', (event) => {
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
      await appWindow.minimize();
    },

    maximize: async () => {
      await appWindow.toggleMaximize();
    },

    close: async () => {
      await appWindow.close();
    },

    setTitle: async (title: string) => {
      await appWindow.setTitle(title);
    },
  },

  /**
   * 对话框
   */
  dialog: {
    open: async (options?: any): Promise<string | null> => {
      return await open(options);
    },

    save: async (options?: any): Promise<string | null> => {
      return await save(options);
    },

    message: async (message: string, options?: any) => {
      return await message(message, options);
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
      return await createDir(path, options);
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
