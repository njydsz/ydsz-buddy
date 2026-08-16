import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    preload: 'src/preload.ts',
    // Overlay-referenced plugins: the Cordis Loader imports these by their
    // bare module specifier (@njydsz/dsh-electron/<name>), so each must be
    // a standalone entry producing lib/<name>.js that the exports map resolves.
    'electron-runtime': 'src/electron-runtime.ts',
    'host-runtime': 'src/host-runtime.ts',
    // Stage 2 IPC carrier (renderer half): imported by the renderer-half of
    // the connection plugin when the Electron carrier is selected.
    'ipc-api-client': 'src/ipc-api-client.ts',
    'ipc-connection-controller': 'src/ipc-connection-controller.ts',
    'ipc-protocol': 'src/ipc-protocol.ts',
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
