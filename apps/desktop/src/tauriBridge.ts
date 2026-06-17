// Tauri 2 IPC bridge - replaces Electron preload.ts
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  DesktopBridge,
  DesktopTheme,
  DesktopUpdateState,
  DesktopUpdateActionResult,
  ContextMenuItem,
  ThreadBrowserState,
  BrowserOpenInput,
  BrowserThreadInput,
  BrowserTabInput,
  BrowserNavigateInput,
  BrowserNewTabInput,
  BrowserSetPanelBoundsInput,
  BrowserAttachWebviewInput,
  BrowserCaptureScreenshotResult,
  BrowserExecuteCdpInput,
  DesktopNotificationInput,
  ServerVoiceTranscriptionInput,
  ServerVoiceTranscriptionResult,
} from "@remi-code/contracts";

/** Cached WebSocket URL, set during initialization */
let cachedWsUrl: string | null = null;

/**
 * Sets the cached WebSocket URL. Called from tauriSetup.ts during initialization.
 * @internal
 */
export function setCachedWsUrl(url: string | null): void {
  cachedWsUrl = url;
}

/**
 * Creates the Tauri 2 desktop bridge implementing the DesktopBridge interface.
 * This replaces Electron's preload.ts IPC mechanism.
 */
export function createTauriBridge(): DesktopBridge {
  return {
    /**
     * Returns the cached WebSocket URL.
     * Tauri equivalent of Electron's ipcRenderer.sendSync(DESKTOP_WS_URL_CHANNEL)
     */
    getWsUrl: (): string | null => {
      return cachedWsUrl;
    },

    /**
     * Opens a folder picker dialog.
     * Tauri equivalent of Electron's ipcRenderer.invoke(PICK_FOLDER_CHANNEL)
     */
    pickFolder: async (): Promise<string | null> => {
      try {
        return await invoke<string | null>("pick_folder");
      } catch (error) {
        console.error("Failed to pick folder:", error);
        return null;
      }
    },

    /**
     * Opens a save file dialog.
     * Tauri equivalent of Electron's ipcRenderer.invoke(SAVE_FILE_CHANNEL, input)
     */
    saveFile: async (input): Promise<string | null> => {
      try {
        const filters = input.filters?.map((f) => ({
          name: f.name,
          extensions: Array.from(f.extensions),
        }));
        return await invoke<string | null>("save_file", {
          defaultFilename: input.defaultFilename,
          contents: input.contents,
          filters: filters,
        });
      } catch (error) {
        console.error("Failed to save file:", error);
        return null;
      }
    },

    /**
     * Shows a confirmation dialog.
     * Tauri equivalent of Electron's ipcRenderer.invoke(CONFIRM_CHANNEL, message)
     */
    confirm: async (message: string): Promise<boolean> => {
      try {
        return await invoke<boolean>("confirm_dialog", { message });
      } catch (error) {
        console.error("Failed to show confirm dialog:", error);
        return false;
      }
    },

    /**
     * Sets the application theme.
     * Tauri equivalent of Electron's ipcRenderer.invoke(SET_THEME_CHANNEL, theme)
     */
    setTheme: async (theme: DesktopTheme): Promise<void> => {
      await invoke("set_theme", { theme });
    },

    /**
     * Shows a context menu at the specified position.
     * Tauri equivalent of Electron's ipcRenderer.invoke(CONTEXT_MENU_CHANNEL, items, position)
     */
    showContextMenu: async <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ): Promise<T | null> => {
      try {
        const normalizedItems = items.map((item) => ({
          id: item.id,
          label: item.label,
          separator_before: item.separatorBefore ?? false,
          destructive: item.destructive ?? false,
        }));
        return await invoke<T | null>("show_context_menu", {
          items: normalizedItems,
          position: position,
        });
      } catch (error) {
        console.error("Failed to show context menu:", error);
        return null;
      }
    },

    /**
     * Opens a URL in the default browser.
     * Tauri equivalent of Electron's ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, url)
     */
    openExternal: async (url: string): Promise<boolean> => {
      try {
        await invoke("open_external", { url });
        return true;
      } catch (error) {
        console.error("Failed to open external URL:", error);
        return false;
      }
    },

    /**
     * Shows a file in the system file manager.
     * Tauri equivalent of Electron's ipcRenderer.invoke(SHOW_IN_FOLDER_CHANNEL, path)
     */
    showInFolder: async (path: string): Promise<void> => {
      await invoke("show_in_folder", { path });
    },

    /**
     * Shell namespace for file operations.
     * Tauri equivalent of Electron's shell API
     */
    shell: {
      showInFolder: async (path: string): Promise<void> => {
        await invoke("show_in_folder", { path });
      },
    },

    /**
     * Registers a listener for menu actions.
     * Tauri equivalent of Electron's ipcRenderer.on(MENU_ACTION_CHANNEL, listener)
     * Returns a cleanup function to unsubscribe.
     */
    onMenuAction: (listener: (action: string) => void): (() => void) => {
      let unlistenFn: UnlistenFn | null = null;
      let cancelled = false;

      listen<string>("menu-action", (event) => {
        if (!cancelled && typeof event.payload === "string") {
          listener(event.payload);
        }
      }).then((unlisten) => {
        if (cancelled) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      });

      return () => {
        cancelled = true;
        if (unlistenFn) {
          unlistenFn();
        }
      };
    },

    /**
     * Gets the current update state.
     * Tauri equivalent of Electron's ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL)
     */
    getUpdateState: async (): Promise<DesktopUpdateState> => {
      return await invoke<DesktopUpdateState>("get_update_state");
    },

    /**
     * Checks for available updates.
     * Tauri equivalent of Electron's ipcRenderer.invoke(UPDATE_CHECK_CHANNEL)
     */
    checkForUpdates: async (): Promise<DesktopUpdateState> => {
      return await invoke<DesktopUpdateState>("check_for_updates");
    },

    /**
     * Downloads the available update.
     * Tauri equivalent of Electron's ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL)
     */
    downloadUpdate: async (): Promise<DesktopUpdateActionResult> => {
      try {
        const state = await invoke<DesktopUpdateState>("download_update");
        return {
          accepted: true,
          completed: true,
          state,
        };
      } catch (error) {
        console.error("Failed to download update:", error);
        const state = await invoke<DesktopUpdateState>("get_update_state");
        return {
          accepted: false,
          completed: false,
          state,
        };
      }
    },

    /**
     * Installs the downloaded update.
     * Tauri equivalent of Electron's ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL)
     */
    installUpdate: async (): Promise<DesktopUpdateActionResult> => {
      try {
        await invoke("install_update");
        const state = await invoke<DesktopUpdateState>("get_update_state");
        return {
          accepted: true,
          completed: true,
          state,
        };
      } catch (error) {
        console.error("Failed to install update:", error);
        const state = await invoke<DesktopUpdateState>("get_update_state");
        return {
          accepted: false,
          completed: false,
          state,
        };
      }
    },

    /**
     * Registers a listener for update state changes.
     * Tauri equivalent of Electron's ipcRenderer.on(UPDATE_STATE_CHANNEL, listener)
     * Returns a cleanup function to unsubscribe.
     */
    onUpdateState: (listener: (state: DesktopUpdateState) => void): (() => void) => {
      let unlistenFn: UnlistenFn | null = null;
      let cancelled = false;

      listen<DesktopUpdateState>("update-state", (event) => {
        if (!cancelled && event.payload) {
          listener(event.payload);
        }
      }).then((unlisten) => {
        if (cancelled) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      });

      return () => {
        cancelled = true;
        if (unlistenFn) {
          unlistenFn();
        }
      };
    },

    /**
     * Notification API.
     * Tauri equivalent of Electron's Notification API
     */
    notifications: {
      isSupported: async (): Promise<boolean> => {
        try {
          const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
          const permission = await isPermissionGranted();
          return permission || Notification.permission === "granted";
        } catch {
          return false;
        }
      },
      show: async (input: DesktopNotificationInput): Promise<boolean> => {
        try {
          const { sendNotification, requestPermission } = await import(
            "@tauri-apps/plugin-notification"
          );
          await requestPermission();
          sendNotification({
            title: input.title,
            body: input.body,
            silent: input.silent,
          });
          return true;
        } catch (error) {
          console.error("Failed to show notification:", error);
          return false;
        }
      },
    },

    /**
     * Server namespace for voice transcription.
     * Tauri equivalent of Electron's ipcRenderer.invoke(SERVER_TRANSCRIBE_VOICE_CHANNEL, input)
     */
    server: {
      transcribeVoice: async (
        input: ServerVoiceTranscriptionInput,
      ): Promise<ServerVoiceTranscriptionResult> => {
        return await invoke<ServerVoiceTranscriptionResult>("server_transcribe_voice", {
          input,
        });
      },
    },

    /**
     * Browser API for thread browser panels.
     * Tauri equivalent of Electron's browser IPC channels
     */
    browser: {
      /**
       * Opens a browser panel for a thread.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.open, input)
       */
      open: async (input: BrowserOpenInput): Promise<ThreadBrowserState> => {
        return await invoke<ThreadBrowserState>("browser_open", {
          threadId: input.threadId,
          initialUrl: input.initialUrl,
        });
      },

      /**
       * Closes a browser panel for a thread.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.close, input)
       */
      close: async (input: BrowserThreadInput): Promise<ThreadBrowserState> => {
        return await invoke<ThreadBrowserState>("browser_close", {
          threadId: input.threadId,
        });
      },

      /**
       * Hides a browser panel.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.hide, input)
       */
      hide: async (input: BrowserThreadInput): Promise<void> => {
        await invoke("browser_hide", {
          threadId: input.threadId,
        });
      },

      /**
       * Gets the current browser state for a thread.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.getState, input)
       */
      getState: async (input: BrowserThreadInput): Promise<ThreadBrowserState> => {
        return await invoke<ThreadBrowserState>("browser_get_state", {
          threadId: input.threadId,
        });
      },

      /**
       * Sets the panel bounds for a browser.
       * Tauri equivalent of ipcRenderer.send(BROWSER_IPC_CHANNELS.setBounds, input)
       */
      setPanelBounds: async (input: BrowserSetPanelBoundsInput): Promise<void> => {
        await invoke("browser_set_panel_bounds", {
          threadId: input.threadId,
          bounds: input.bounds,
          surface: input.surface,
        });
      },

      /**
       * Attaches a webview to a browser tab.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.attachWebview, input)
       */
      attachWebview: async (input: BrowserAttachWebviewInput): Promise<ThreadBrowserState> => {
        return await invoke<ThreadBrowserState>("browser_attach_webview", {
          threadId: input.threadId,
          tabId: input.tabId,
          webContentsId: input.webContentsId,
        });
      },

      /**
       * Copies a screenshot to the clipboard.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.copyScreenshotToClipboard, input)
       */
      copyScreenshotToClipboard: async (input: BrowserTabInput): Promise<void> => {
        await invoke("browser_copy_screenshot_to_clipboard", {
          threadId: input.threadId,
          tabId: input.tabId,
        });
      },

      /**
       * Captures a screenshot of a browser tab.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.captureScreenshot, input)
       */
      captureScreenshot: async (input: BrowserTabInput): Promise<BrowserCaptureScreenshotResult> => {
        return await invoke<BrowserCaptureScreenshotResult>("browser_capture_screenshot", {
          threadId: input.threadId,
          tabId: input.tabId,
        });
      },

      /**
       * Executes a Chrome DevTools Protocol command.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.executeCdp, input)
       */
      executeCdp: async (input: BrowserExecuteCdpInput): Promise<unknown> => {
        return await invoke("browser_execute_cdp", {
          threadId: input.threadId,
          tabId: input.tabId,
          method: input.method,
          params: input.params,
        });
      },

      /**
       * Navigates a browser tab to a URL.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.navigate, input)
       */
      navigate: async (input: BrowserNavigateInput): Promise<ThreadBrowserState> => {
        return await invoke<ThreadBrowserState>("browser_navigate", {
          threadId: input.threadId,
          tabId: input.tabId,
          url: input.url,
        });
      },

      /**
       * Reloads a browser tab.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.reload, input)
       */
      reload: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
        return await invoke<ThreadBrowserState>("browser_reload", {
          threadId: input.threadId,
          tabId: input.tabId,
        });
      },

      /**
       * Navigates back in a browser tab.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.goBack, input)
       */
      goBack: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
        return await invoke<ThreadBrowserState>("browser_go_back", {
          threadId: input.threadId,
          tabId: input.tabId,
        });
      },

      /**
       * Navigates forward in a browser tab.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.goForward, input)
       */
      goForward: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
        return await invoke<ThreadBrowserState>("browser_go_forward", {
          threadId: input.threadId,
          tabId: input.tabId,
        });
      },

      /**
       * Creates a new tab in a browser panel.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.newTab, input)
       */
      newTab: async (input: BrowserNewTabInput): Promise<ThreadBrowserState> => {
        return await invoke<ThreadBrowserState>("browser_new_tab", {
          threadId: input.threadId,
          url: input.url,
          activate: input.activate,
        });
      },

      /**
       * Closes a tab in a browser panel.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.closeTab, input)
       */
      closeTab: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
        return await invoke<ThreadBrowserState>("browser_close_tab", {
          threadId: input.threadId,
          tabId: input.tabId,
        });
      },

      /**
       * Selects a tab in a browser panel.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.selectTab, input)
       */
      selectTab: async (input: BrowserTabInput): Promise<ThreadBrowserState> => {
        return await invoke<ThreadBrowserState>("browser_select_tab", {
          threadId: input.threadId,
          tabId: input.tabId,
        });
      },

      /**
       * Opens DevTools for a browser tab.
       * Tauri equivalent of ipcRenderer.invoke(BROWSER_IPC_CHANNELS.openDevTools, input)
       */
      openDevTools: async (input: BrowserTabInput): Promise<void> => {
        await invoke("browser_open_devtools", {
          threadId: input.threadId,
          tabId: input.tabId,
        });
      },

      /**
       * Registers a listener for browser state changes.
       * Tauri equivalent of ipcRenderer.on(BROWSER_IPC_CHANNELS.state, listener)
       * Returns a cleanup function to unsubscribe.
       */
      onState: (listener: (state: ThreadBrowserState) => void): (() => void) => {
        let unlistenFn: UnlistenFn | null = null;
        let cancelled = false;

        listen<ThreadBrowserState>("browser-state", (event) => {
          if (!cancelled && event.payload) {
            listener(event.payload);
          }
        }).then((unlisten) => {
          if (cancelled) {
            unlisten();
          } else {
            unlistenFn = unlisten;
          }
        });

        return () => {
          cancelled = true;
          if (unlistenFn) {
            unlistenFn();
          }
        };
      },

      /**
       * Registers a listener for browser use panel open requests.
       * Tauri equivalent of ipcRenderer.on(BROWSER_IPC_CHANNELS.requestOpenPanel, listener)
       * Returns a cleanup function to unsubscribe.
       */
      onBrowserUseOpenPanelRequest: (listener: () => void): (() => void) => {
        let unlistenFn: UnlistenFn | null = null;
        let cancelled = false;

        listen("browser-use-request-open-panel", () => {
          if (!cancelled) {
            listener();
          }
        }).then((unlisten) => {
          if (cancelled) {
            unlisten();
          } else {
            unlistenFn = unlisten;
          }
        });

        return () => {
          cancelled = true;
          if (unlistenFn) {
            unlistenFn();
          }
        };
      },
    },
  };
}
