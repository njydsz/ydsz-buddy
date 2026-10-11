/**
 * @file Web Chat 视图组件
 * @description 简化版 Chat 视图：消息渲染 + 输入框（无高级编辑器功能）
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { useAppStore } from "~/store/appStore";
import { cn } from "~/lib/utils";

export function WebChatView() {
  const { messages, addMessage, activeSessionId, addSession, clearMessages } = useAppStore();
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 发送消息
  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSending) return;

    // 如果没有活跃会话，先创建
    if (!activeSessionId) {
      const newId = `session-${Date.now()}`;
      addSession({
        id: newId,
        title: trimmed.slice(0, 30),
        lastMessage: trimmed,
        updatedAt: Date.now(),
      });
      clearMessages();
    }

    const userMessage = {
      id: `msg-${Date.now()}`,
      role: "user" as const,
      content: trimmed,
      timestamp: Date.now(),
    };

    addMessage(userMessage);
    setInputValue("");
    setIsSending(true);

    // TODO: 通过 WebSocket 发送到后端，当前使用模拟回复
    setTimeout(() => {
      addMessage({
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: `收到你的消息："${trimmed}"。\n\n这是 Web 端的骨架版本，实际功能开发中...`,
        timestamp: Date.now(),
      });
      setIsSending(false);
    }, 500);
  }, [inputValue, isSending, activeSessionId, addMessage, addSession, clearMessages]);

  // 键盘发送（Enter 发送，Shift+Enter 换行）
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  // 自适应输入框高度
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // 重置高度后按内容自适应
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <h2 className="text-lg font-medium">欢迎使用云顶数字 Buddy</h2>
              <p className="mt-1 text-sm">发送消息开始对话</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 输入区域 */}
      <div className="border-t bg-background p-3">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-lg border bg-background p-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="发送消息... (Enter 发送, Shift+Enter 换行)"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              disabled={isSending}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!inputValue.trim() || isSending}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-md p-2 transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
              aria-label="发送"
            >
              {isSending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
