import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    preload: 'src/preload.ts',
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
