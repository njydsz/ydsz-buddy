import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    // Stage 1 Electron main-process entry. tsdown follows the import graph, so
    // host-runtime.ts (imported here) and electron-runtime.ts (imported by
    // host-runtime) are bundled as part of this entry automatically.
    main: 'src/main.ts',
    // electron-runtime is the overlay Cordis plugin the Loader imports by its
    // bare module specifier (@njydsz/ydb-gui/runtime); it must be a
    // standalone entry so the exports map's ./runtime resolves to lib/.
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
