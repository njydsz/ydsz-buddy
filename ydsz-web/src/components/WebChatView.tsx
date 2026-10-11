/**
 * @file Web Chat 视图组件
 * @description 完整的 Chat 视图：消息渲染 + 输入框 + WebSocket RPC 集成。
 *              支持流式响应、错误状态、消息重试、会话切换。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  Sun,
  Moon,
} from "lucide-react";
import { useAppStore, type ChatMessage } from "~/store/appStore";
import { cn } from "~/lib/utils";
import {
  getSharedWsClient,
  dispatchOrchestrationCommand,
  subscribeThreadEvents,
} from "~/adapters/wsClient";
import {
  buildThreadTurnStartCommand,
  buildThreadCreateCommand,
  generateId,
  extractThreadEvent,
  parseMessageSentEvent,
} from "~/lib/wsProtocol";

/** 默认 projectId（单项目模式） */
const DEFAULT_PROJECT_ID = "default";

export function WebChatView() {
  const {
    messages,
    addMessage,
    updateMessage,
    setMessageError,
    clearMessages,
    activeSessionId,
    addSession,
    sessions,
    setActiveSession,
    connectionStatus,
    setConnectionStatus,
    reconnectAttempts,
    isDark,
    toggleTheme,
  } = useAppStore();

  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ── 自动滚动到底部 ────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessageId]);

  // ── 建立 WebSocket 连接 ──────────────────────────────────────────
  useEffect(() => {
    const client = getSharedWsClient({
      onConnected: () => {
        setConnectionStatus("connected");
      },
      onDisconnected: () => {
        setConnectionStatus("disconnected");
      },
      onError: () => {
        setConnectionStatus("error");
      },
    });
    client.connect();

    return () => {
      // 清理订阅
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [setConnectionStatus]);

  // ── 订阅 Thread 事件（流式响应 + 状态更新） ──────────────────────
  useEffect(() => {
    if (!activeSessionId) return;
    if (connectionStatus !== "connected") return;

    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session?.threadId) return;

    // 订阅编排层 threadEvent 通道
    const unsubscribe = subscribeThreadEvents((data: unknown) => {
      const event = extractThreadEvent(data);
      if (!event) return;

      // 只处理当前会话的事件
      if (event.threadId && event.threadId !== session.threadId) return;

      // 解析消息发送事件
      const messageData = parseMessageSentEvent(event);
      if (!messageData) return;

      if (messageData.role === "assistant" && messageData.streaming) {
        // 流式更新：找到或创建 assistant 消息
        setStreamingMessageId((prevStreamingId) => {
          if (prevStreamingId) {
            // 更新现有流式消息
            updateMessage(prevStreamingId, {
              content: messageData.text,
              status: "streaming",
              remoteMessageId: messageData.messageId,
            });
          } else {
            // 创建新流式消息
            const newId = generateId("stream");
            addMessage({
              id: newId,
              role: "assistant",
              content: messageData.text,
              timestamp: Date.now(),
              status: "streaming",
              threadId: session.threadId,
              remoteMessageId: messageData.messageId,
            });
          }
          return prevStreamingId;
        });
      } else if (messageData.role === "assistant" && !messageData.streaming) {
        // 流式完成
        setStreamingMessageId((prevStreamingId) => {
          if (prevStreamingId) {
            updateMessage(prevStreamingId, {
              content: messageData.text,
              status: "sent",
              remoteMessageId: messageData.messageId,
            });
          }
          return null;
        });
        setIsSending(false);
      }
    });

    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
      unsubscribeRef.current = null;
    };
  }, [activeSessionId, connectionStatus, sessions, addMessage, updateMessage]);

  // ── 获取当前会话对应的 threadId ──────────────────────────────────
  const getActiveThreadId = useCallback((): string | null => {
    const session = sessions.find((s) => s.id === activeSessionId);
    return session?.threadId ?? null;
  }, [sessions, activeSessionId]);

  // ── 发送消息 ────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setStreamingMessageId(null);

    let currentThreadId = getActiveThreadId();

    // 如果没有活跃会话，先创建会话和线程
    if (!currentThreadId) {
      try {
        // 创建线程
        const createCmd = buildThreadCreateCommand({
          projectId: DEFAULT_PROJECT_ID,
          title: trimmed.slice(0, 40),
        });
        const threadId = (createCmd.threadId as string) ?? generateId("thread");

        await dispatchOrchestrationCommand(createCmd);

        // 创建本地会话
        const newSessionId = generateId("session");
        addSession({
          id: newSessionId,
          title: trimmed.slice(0, 40),
          lastMessage: trimmed,
          updatedAt: Date.now(),
          threadId,
          projectId: DEFAULT_PROJECT_ID,
        });

        currentThreadId = threadId;
      } catch (error) {
        // 创建会话失败，添加错误消息
        addMessage({
          id: generateId("msg"),
          role: "assistant",
          content: error instanceof Error ? error.message : "创建会话失败",
          timestamp: Date.now(),
          status: "error",
          error: error instanceof Error ? error.message : "创建会话失败",
        });
        setIsSending(false);
        return;
      }
    }

    // 添加用户消息
    const userMessageId = generateId("msg");
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      status: "sending",
      threadId: currentThreadId ?? undefined,
    };
    addMessage(userMessage);
    setInputValue("");

    try {
      // 通过 WebSocket 发送消息
      const turnCmd = buildThreadTurnStartCommand({
        threadId: currentThreadId!,
        text: trimmed,
      });

      await dispatchOrchestrationCommand(turnCmd);

      // 标记用户消息为已发送
      updateMessage(userMessageId, { status: "sent" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "发送失败";
      setMessageError(userMessageId, errorMessage, true);
    } finally {
      // 如果流式消息没有结束，标记为完成
      setStreamingMessageId((prev) => {
        if (prev) {
          updateMessage(prev, { status: "sent" });
        }
        return null;
      });
      setIsSending(false);
    }
  }, [
    inputValue,
    isSending,
    activeSessionId,
    getActiveThreadId,
    addMessage,
    addSession,
    updateMessage,
    setMessageError,
  ]);

  // ── 重试发送失败的消息 ──────────────────────────────────────────
  const handleRetry = useCallback(
    async (messageId: string) => {
      const msg = messages.find((m) => m.id === messageId);
      if (!msg || !msg.retryable || !msg.content.trim()) return;

      // 移除原错误消息
      useAppStore.getState().removeMessage(messageId);

      // 重新发送
      setInputValue(msg.content);
      // 使用 setTimeout 确保输入框更新完成后再发送
      setTimeout(() => {
        setInputValue(msg.content);
        // 触发重发逻辑
        void (async () => {
          const currentThreadId = getActiveThreadId();
          if (!currentThreadId) return;

          const turnCmd = buildThreadTurnStartCommand({
            threadId: currentThreadId,
            text: msg.content,
          });

          try {
            await dispatchOrchestrationCommand(turnCmd);
          } catch {
            // 重试失败会再次由 catch 处理
          }
        })();
      }, 50);
    },
    [messages, getActiveThreadId],
  );

  // ── 键盘发送（Enter 发送，Shift+Enter 换行） ────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  // ── 自适应输入框高度 ──────────────────────────────────────────
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  // ── 新建会话 ──────────────────────────────────────────────────
  const handleNewSession = useCallback(() => {
    clearMessages();
    setActiveSession(null);
  }, [clearMessages, setActiveSession]);

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          {/* 连接状态 badge */}
          <ConnectionBadge
            status={connectionStatus}
            reconnectAttempts={reconnectAttempts}
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            type="button"
            onClick={handleNewSession}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            新会话
          </button>
        </div>
      </div>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <h2 className="text-lg font-medium">云顶数字 Buddy</h2>
              <p className="mt-1 text-sm">发送消息开始对话</p>
              {connectionStatus !== "connected" && (
                <p className="mt-2 text-xs text-yellow-500">
                  {connectionStatus === "connecting"
                    ? "正在连接服务器..."
                    : "连接已断开，请检查网络"}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onRetry={handleRetry}
              />
            ))}
            {isSending && !streamingMessageId && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  <span>正在生成回复...</span>
                </div>
              </div>
            )}
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
              placeholder={
                connectionStatus === "connected"
                  ? "发送消息... (Enter 发送, Shift+Enter 换行)"
                  : "等待连接..."
              }
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              disabled={isSending || connectionStatus !== "connected"}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={
                !inputValue.trim() ||
                isSending ||
                connectionStatus !== "connected"
              }
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
          {connectionStatus !== "connected" && (
            <p className="mt-1 text-center text-xs text-muted-foreground">
              未连接到服务器，消息将在连接恢复后发送
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 子组件 ──────────────────────────────────────────────────────────

/** 连接状态徽章 */
function ConnectionBadge({
  status,
  reconnectAttempts,
}: {
  status: string;
  reconnectAttempts: number;
}) {
  const statusMap: Record<
    string,
    { color: string; bgColor: string; label: string; icon: typeof Wifi }
  > = {
    connecting: {
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
      label: "连接中...",
      icon: Wifi,
    },
    connected: {
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-900/20",
      label: "已连接",
      icon: Wifi,
    },
    disconnected: {
      color: "text-muted-foreground",
      bgColor: "bg-gray-50 dark:bg-gray-800/50",
      label: "未连接",
      icon: WifiOff,
    },
    error: {
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-50 dark:bg-red-900/20",
      label: "连接错误",
      icon: WifiOff,
    },
  };

  const config = statusMap[status] ?? statusMap.disconnected;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
        config.bgColor,
        config.color,
      )}
    >
      <Icon size={12} />
      <span>{config.label}</span>
      {reconnectAttempts > 0 && status !== "connected" && (
        <span className="text-muted-foreground">
          (重试 {reconnectAttempts})
        </span>
      )}
    </div>
  );
}

/** 消息气泡 */
function MessageBubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry: (id: string) => void;
}) {
  const isUser = message.role === "user";
  const isError = message.status === "error";
  const isStreaming = message.status === "streaming";

  return (
    <div
      className={cn(
        "flex",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : isError
              ? "border border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
              : "bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {/* 错误提示和重试按钮 */}
        {isError && (
          <div className="mt-2 flex items-center gap-2">
            <AlertCircle size={12} className="shrink-0" />
            <span className="text-xs opacity-80">{message.error}</span>
            {message.retryable && (
              <button
                type="button"
                onClick={() => onRetry(message.id)}
                className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium hover:bg-black/10 dark:hover:bg-white/10"
              >
                <RefreshCw size={10} />
                重试
              </button>
            )}
          </div>
        )}

        {/* 流式指示器 */}
        {isStreaming && (
          <span className="ml-1 inline-block animate-pulse text-muted-foreground">
            |
          </span>
        )}

        {/* 发送中指示 */}
        {message.status === "sending" && message.role === "user" && (
          <span className="ml-1 text-xs opacity-50">发送中...</span>
        )}
      </div>
    </div>
  );
}
