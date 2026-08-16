/**
 * @file 跨组件 prompt 传递模块
 *
 * 用于 WorkspaceView 快捷操作 → ChatView 的初始 prompt 传递。
 *
 * ## 为什么不用 URL search params？
 *
 * WorkspaceView 在 `/_chat/workspace/` 路由下，快捷操作点击后需要：
 * 1. 创建新线程（handleNewChat → 导航到 /_chat/ → 自动重定向到 /$threadId）
 * 2. 在新线程的 ChatView 中预填 prompt
 *
 * 由于 /_chat/ → /$threadId 的重定向会丢失 search params，
 * 因此使用模块级变量作为跨组件的临时传递通道。
 *
 * ## 使用方式
 *
 * ```ts
 * // 发送方（WorkspaceView）
 * setPendingInitialPrompt("帮我开发一个应用");
 * await handleNewChat({ fresh: true });
 *
 * // 接收方（ChatView）
 * const prompt = consumePendingInitialPrompt();
 * if (prompt) { setPrompt(prompt); }
 * ```
 */

let pendingInitialPrompt: string | null = null;

export function setPendingInitialPrompt(prompt: string | null): void {
  pendingInitialPrompt = prompt;
}

export function consumePendingInitialPrompt(): string | null {
  const value = pendingInitialPrompt;
  pendingInitialPrompt = null;
  return value;
}
