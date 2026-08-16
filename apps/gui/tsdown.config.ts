import { defineConfig } from 'tsdown'

// Electron's built-in module system only injects its named exports (app,
// BrowserWindow, ...) for CJS require() — its ESM loader does not. The main
// process must therefore be emitted as CJS so that when Electron loads
// lib/main.cjs the electron builtins resolve. electron-runtime stays ESM: the
// Cordis Loader imports it via dynamic import() and evaluates it itself, so
// Node's module rules don't constrain it.
export default defineConfig({
  entry: {
    // CJS main process — required so Electron's require('electron') resolves
    // the built-in API names.
    main: 'src/main.ts',
    // ESM Cordis plugin — the Loader imports this by its bare specifier
    // (@njydsz/ydb-gui/runtime), so it must be a standalone ESM entry.
    'electron-runtime': 'src/electron-runtime.ts',
    // Stage 2 IPC carrier: enable these when the IPC transport replaces HTTP.
    // preload: 'src/preload.ts',
    // 'ipc-api-client': 'src/ipc-api-client.ts',
    // 'ipc-connection-controller': 'src/ipc-connection-controller.ts',
    // 'ipc-protocol': 'src/ipc-protocol.ts',
  },
  format: 'esm',
  target: 'node22',
  platform: 'node',
  outDir: 'lib',
  clean: true,
  dts: false,
  sourcemap: true,
  external: ['electron'],
})
