/**
 * @file Contracts 模块导出聚合入口
 *
 * 本模块聚合了 ydsz 工作区所有业务域的契约（Contract）定义，
 * 通过重新导出各子模块的 Schema 和类型，提供统一的导入点。
 *
 * ## 核心子模块
 *
 * - `auth`：认证与授权相关契约
 * - `baseSchemas`：基础类型（ID、时间、字符串等）
 * - `ipc`：进程间通信契约聚合
 * - `terminal`：终端会话管理契约
 * - `provider`：Provider 配置与会话契约
 * - `providerDiscovery`：Provider 能力发现契约
 * - `providerRuntime`：Provider 运行时会话契约
 * - `model`：AI 模型元数据与能力契约
 * - `agentMentions`：Agent 提及相关契约
 * - `ws`：WebSocket 通信契约
 * - `keybindings`：快捷键绑定契约
 * - `server`：服务端配置契约
 * - `settings`：用户设置契约
 * - `git`：Git 操作契约
 * - `orchestration`：编排层核心契约
 * - `editor`：编辑器相关契约
 * - `environment`：环境相关契约
 * - `project`：项目相关契约
 * - `filesystem`：文件系统相关契约
 * - `rpc`：RPC 调用契约
 *
 * ## 使用场景
 *
 * - 业务代码通过本模块导入所有契约类型
 * - 避免循环依赖：各子模块独立定义，通过本模块聚合
 * - 统一管理契约的导入路径
 *
 * ## 注意事项
 *
 * - 本模块仅做重新导出，不定义新的 Schema
 * - 子模块内部可能有更详细的文档注释
 */

export * from "./auth";
export * from "./baseSchemas";
export * from "./ipc";
export * from "./terminal";
export * from "./provider";
export * from "./providerDiscovery";
export * from "./providerRuntime";
export * from "./model";
export * from "./agentMentions";
export * from "./ws";
export * from "./keybindings";
export * from "./server";
export * from "./settings";
export * from "./git";
export * from "./orchestration";
export * from "./editor";
export * from "./environment";
export * from "./project";
export * from "./filesystem";
export * from "./rpc";
export * from "./skillMarketplace";
export * from "./astGrep";
export * from "./lsp";
export * from "./urlPreview";
export * from "./office";
export * from "./linear";
export * from "./extensions";
export * from "./browserRecording";
