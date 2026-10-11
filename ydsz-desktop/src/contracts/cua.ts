/**
 * @file CUA (Computer Use Agent) 契约模块
 *
 * 本模块定义 Computer Use Agent 的核心类型，包括：
 *
 * - `CuaStatus`：CUA 会话状态枚举
 * - `ScreenElement`：屏幕可交互元素描述
 * - `CuaAction`：CUA 可执行动作联合类型
 * - `CuaSession`：CUA 会话全状态
 * - 辅助 DTO：权限状态、操作记录、截图结果、录制状态
 *
 * ## 使用场景
 *
 * - CUA 权限面板：展示权限状态与历史操作
 * - CUA 截图查看器：在截图上标注可交互元素
 * - CUA 录制指示器：跟踪屏幕录制生命周期
 * - CUA 坐标叠加层：将元素边界框覆盖显示在截图上
 *
 * ## 后端对应命令
 *
 * 前端通过 Tauri invoke 调用以下命令（Rust 端 stub）：
 * - `cua_get_screen_elements` → 获取可交互元素列表
 * - `cua_execute_action` → 在指定坐标执行操作
 * - `cua_get_screenshot` → 获取屏幕截图
 * - `cua_start_recording` / `cua_stop_recording` → 屏幕录制
 *
 * ## 扩展性
 *
 * - 新增动作类型：扩展 `CuaAction` 联合类型
 * - 新增元素属性：扩展 `ScreenElement` 接口
 */

// ============================================================================
// 核心枚举与类型
// ============================================================================

/**
 * CUA 会话状态枚举
 *
 * - `idle`：空闲，未进行任何操作
 * - `capturing`：正在截取屏幕/分析元素
 * - `analyzing`：正在分析截图内容
 * - `acting`：正在执行自动化操作
 * - `recording`：正在录制屏幕
 */
export type CuaStatus =
  | "idle"
  | "capturing"
  | "analyzing"
  | "acting"
  | "recording";

/**
 * 屏幕可交互元素描述
 *
 * 表示在屏幕截图中检测到的可交互 UI 元素
 */
export interface ScreenElement {
  /** 唯一标识 */
  id: string;
  /** HTML 标签名（如 button, input, a） */
  tagName: string;
  /** 元素文本内容 */
  text?: string;
  /** 元素在屏幕上的边界框 */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 是否可交互 */
  interactive: boolean;
  /** ARIA 角色 */
  role?: string;
}

/**
 * CUA 动作联合类型
 *
 * 描述 CUA 可执行的各类操作
 */
export type CuaAction =
  | {
      type: "click";
      coordinates: { x: number; y: number };
      target_element?: string;
    }
  | {
      type: "type";
      coordinates: { x: number; y: number };
      text: string;
      target_element?: string;
    }
  | {
      type: "hover";
      coordinates: { x: number; y: number };
      target_element?: string;
    }
  | {
      type: "scroll";
      coordinates?: { x: number; y: number };
      /** 滚动量（正=下，负=上） */
      deltaY?: number;
      deltaX?: number;
    }
  | {
      type: "wait";
      duration_ms: number;
    }
  | {
      type: "screenshot";
    };

/**
 * CUA 会话全状态
 */
export interface CuaSession {
  /** 会话唯一 ID */
  id: string;
  /** 当前状态 */
  status: CuaStatus;
  /** 是否正在录制 */
  recording: boolean;
  /** 最近截图 base64 编码 */
  screenshot?: string;
  /** 检测到的可交互元素列表 */
  elements: ScreenElement[];
  /** 已执行/待执行的动作列表 */
  actions: CuaAction[];
}

// ============================================================================
// 权限相关类型
// ============================================================================

/**
 * CUA 权限状态
 */
export type CuaPermissionState = "idle" | "active" | "denied";

/**
 * 权限项详情
 */
export interface CuaPermissionItem {
  /** 权限名称 */
  name: string;
  /** 权限描述 */
  description: string;
  /** 当前状态 */
  granted: boolean;
  /** 是否必需 */
  required: boolean;
  /** 操作系统原生提示文案 */
  systemHint?: string;
}

/**
 * CUA 操作模式
 *
 * - `safe`：安全模式，所有操作需用户确认
 * - `yolo`：YOLO 模式，AI 自主执行所有操作（存在风险）
 */
export type CuaMode = "safe" | "yolo";

// ============================================================================
// DTO（前后端通信数据对象）
// ============================================================================

/**
 * 获取屏幕元素请求
 */
export interface CuaGetScreenElementsRequest {
  /** 截图 ID（可选，空则重新截取） */
  screenshotId?: string;
}

/**
 * 获取屏幕元素响应
 */
export interface CuaGetScreenElementsResponse {
  elements: ScreenElement[];
  screenshotId: string;
}

/**
 * 执行动作请求
 */
export interface CuaExecuteActionRequest {
  action: CuaAction;
  /** 关联会话 ID */
  sessionId?: string;
}

/**
 * 执行动作响应
 */
export interface CuaExecuteActionResponse {
  success: boolean;
  /** 执行耗时 (ms) */
  durationMs: number;
  /** 失败时的错误信息 */
  error?: string;
  /** 操作后的新截图 */
  screenshot?: string;
}

/**
 * 获取截图请求
 */
export interface CuaGetScreenshotRequest {
  /** 屏幕索引（多屏场景） */
  screenIndex?: number;
  /** 是否仅截取指定区域 */
  region?: { x: number; y: number; width: number; height: number };
}

/**
 * 获取截图响应
 */
export interface CuaGetScreenshotResponse {
  /** Base64 编码的 PNG 图像数据 */
  base64: string;
  /** 截图宽度 */
  width: number;
  /** 截图高度 */
  height: number;
  /** 截图 ID（用于后续获取元素） */
  screenshotId: string;
}

/**
 * 开始录制请求
 */
export interface CuaStartRecordingRequest {
  /** 帧率 */
  fps?: number;
  /** 是否包含音频 */
  includeAudio?: boolean;
  /** 屏幕索引 */
  screenIndex?: number;
}

/**
 * 开始录制响应
 */
export interface CuaStartRecordingResponse {
  success: boolean;
  /** 录制会话 ID */
  recordingId: string;
}

/**
 * 停止录制请求
 */
export interface CuaStopRecordingRequest {
  recordingId: string;
}

/**
 * 停止录制响应
 */
export interface CuaStopRecordingResponse {
  success: boolean;
  /** 录制文件路径 */
  filePath?: string;
  /** 录制时长 (ms) */
  durationMs: number;
  /** 帧数 */
  frameCount: number;
}

// ============================================================================
// 操作历史记录
// ============================================================================

/**
 * 单条操作历史记录
 */
export interface CuaActionHistoryItem {
  /** 记录 ID */
  id: string;
  /** 会话 ID */
  sessionId: string;
  /** 动作详情 */
  action: CuaAction;
  /** 执行时间戳 (ms) */
  timestamp: number;
  /** 是否执行成功 */
  success: boolean;
  /** 失败信息 */
  error?: string;
}

/**
 * 操作历史统计
 */
export interface CuaHistoryStats {
  /** 总执行次数 */
  total: number;
  /** 成功次数 */
  succeeded: number;
  /** 失败次数 */
  failed: number;
}

// ============================================================================
// 辅助常量与函数
// ============================================================================

/**
 * CUA 状态显示标签映射
 */
export const CUA_STATUS_LABELS: Record<CuaStatus, string> = {
  idle: "空闲",
  capturing: "截取中",
  analyzing: "分析中",
  acting: "执行中",
  recording: "录制中",
};

/**
 * CUA 动作类型中文标签
 */
export const CUA_ACTION_LABELS: Record<CuaAction["type"], string> = {
  click: "点击",
  type: "输入",
  hover: "悬停",
  scroll: "滚动",
  wait: "等待",
  screenshot: "截图",
};

/**
 * 生成唯一 ID
 *
 * 用于前端生成会话 ID 或动作记录 ID（后端场景建议使用 crypto.randomUUID）
 */
export function generateCuaId(): string {
  return `cua_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
