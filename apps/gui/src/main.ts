/**
 * Electron main-process entry point (Stage 1 — HTTP carriage). Boots the
 * Cordis host runtime in the main process, spins up a hidden webserver that
 * serves the SPA and the /api gateway, then opens a BrowserWindow pointed at
 * that local URL. The renderer talks to the host over loopback HTTP exactly
 * as a browser would — no IPC transport yet. Stage 2 adds the IPC carrier
 * (IpcApiClient + preload bridge) to replace HTTP for unary/streaming RPC.
 *
 * The host runtime boot is async (the Loader tree resolves fibers in
 * dependency order). We create the window hidden, show it only after the
 * server URL resolves so the user never sees a blank frame.
 * @module @njydsz/ydb-gui/main
 */

import { app, BrowserWindow } from 'electron'
import { bootHostRuntime } from './host-runtime.ts'

/** Single-instance guard: Electron apps quit on second-instance. */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

/**
 * Boot the host runtime and open the (initially hidden) BrowserWindow once
 * the webserver URL resolves. The window stays hidden until `ready-to-show`
 * so the renderer's first paint is the composed app, not a white frame.
 */
async function createMainWindow(): Promise<void> {
  // Boots the Cordis tree and the loopback webserver; resolves with the URL
  // the renderer should load.
  const { url } = await bootHostRuntime()

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // Stage 1 loads from the loopback webserver — no Node access needed
      // in the renderer. contextIsolation stays on (Electron default);
      // nodeIntegration off keeps the renderer sandboxed.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // show() is wired to the renderer's ready-to-show; until then the window
  // stays hidden so the first paint is meaningful.
  window.once('ready-to-show', () => { window.show() })

  await window.loadURL(url)
}

// app.whenReady() gates on Electron being fully initialized (GPU, etc).
// Any boot failure here is fatal — log cleanly and exit rather than opening
// a window pointing at a dead host.
app.whenReady().then(createMainWindow).catch((error) => {
  console.error('[electron] host boot failed:', error)
  app.exit(1)
})

// macOS: re-create the window when the dock icon hits and no windows are
// open. Other platforms quit when the last window closes.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow().catch((error) => {
      console.error('[electron] re-activate boot failed:', error)
      app.exit(1)
    })
  }
})

// A second-instance launch forwards to the primary; the early singleLock
// guard already quit the duplicate, so this is only a hardening hook.
app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0]
  if (window === undefined) return
  if (window.isMinimized()) window.restore()
  window.focus()
})
