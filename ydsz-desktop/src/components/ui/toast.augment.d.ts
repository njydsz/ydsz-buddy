/**
 * @file toast.augment.d.ts
 * @description 模块增强：为 @base-ui/react/toast 的 ToastManager 接口
 *              补充 success / error 便捷方法。
 *
 * 实际运行时实现位于 toast.tsx 中，通过 Object.assign 注入。
 */

import "@base-ui/react/toast";

declare module "@base-ui/react/toast" {
  interface ToastManager {
    success: (result: unknown) => void;
    error: (message: string) => void;
  }
}
