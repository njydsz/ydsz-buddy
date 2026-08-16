// 包装 use-sync-external-store 以解决 Vite 构建时 Rollup 无法解析其
// 条件 require 模式的问题。通过 ESM 包装将 CJS 模块重新暴露为命名导出。
// 直接导入 CJS 开发版本，该文件使用 exports.xxx 命名导出模式。
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.development.js'
export { useSyncExternalStoreWithSelector }
