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
 * Tauri 桥接�? * 封装所有与 Tauri 后端的交�? */
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
     * 重命名线�?     */
    renameThread: async (threadId: string, title: string): Promise<void> => {
      return await invoke<void>('rename_thread', { threadId, title });
    },
  },

  /**
   * AI 提供商相关命�?   */
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
     * 获取提供商状�?     */
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
     * 向终端写入数�?     */
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
     * 获取 Git 状�?     */
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
   * 工作区管理相关命�?   */
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
     * 监听 Git 状态变化事�?     */
    onGitStatusChanged: (callback: (status: any) => void) => {
      return listen('git-status-changed', (event) => {
        callback(event.payload);
      });
    },

    /**
     * 发射事件到后�?     */
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
   * 对话�?   */
  dialog: {
    /**
     * 打开文件选择对话�?     */
    open: async (options?: any): Promise<string | null> => {
      const { open } = await import('@tauri-apps/api/dialog');
      return await open(options);
    },

    /**
     * 打开保存文件对话�?     */
    save: async (options?: any): Promise<string | null> => {
      const { save } = await import('@tauri-apps/api/dialog');
      return await save(options);
    },

    /**
     * 显示消息对话�?     */
    message: async (message: string, options?: any) => {
      const { message: showMessage } = await import('@tauri-apps/api/dialog');
      return await showMessage(message, options);
    },

    /**
     * 显示确认对话�?     */
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
   * 剪贴�?   */
  clipboard: {
    /**
     * 写入剪贴�?     */
    writeText: async (text: string): Promise<void> => {
      const { writeText } = await import('@tauri-apps/api/clipboard');
      return await writeText(text);
    },

    /**
     * 读取剪贴�?     */
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
