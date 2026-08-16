# ydsz-buddy 智能体 (Agents)

## Agent 运行模式

- **Code**: 智能体开发模式 - 可执行代码读写、Git 操作、Shell 命令
- **Work**: 办公自动化模式 - 处理 Office 文档、浏览器自动化、定时任务  
- **Plan**: 计划模式 - 仅生成执行计划
- **Review**: 代码评审模式 - 围绕 diff 评审的专用交互
- **Ask**: 问答模式 - 仅信息查询

## 核心能力

1. **代码操作**: 文件读写、AST-Grep 搜索、LSP 集成
2. **Git 操作**: 状态查询、分支管理、Worktree、Commit、PR 管理
3. **终端 Shell**: PTY 伪终端、SSH 远程
4. **浏览器自动化**: 基于 CDP，支持交互、提取、设计模式
5. **Office 文档**: Word/Excel/PowerPoint 读写

## 工作流程

1. 用户输入 + 附件
2. Provider 处理 → AI 响应
3. 解析 Tool Calls → Agent 执行
4. 结果推送 → Tool Result
5. 生成下一步操作
6. 输出结果 + Activity 审计

## 并行协作

- **Thread Fan-Out**: 并行扇出，多模型/方案对比
- **SchedulerService**: 定时任务调度
- **RetryQueue**: 失败任务自动重试

## 外部集成

- **Linear** (P3-1): 从任务创建 worktree 线程
- **GitHub PR** (P1-3): 浏览和操作 PRs

## Provider 支持 (17家)

国际 (8): Anthropic (Claude), OpenAI (Codex), Cursor, Google (Gemini), xAI (Grok), Kilo, OpenCode, Pi
国内 (9): GLM (智谱), DeepSeek, Moonshot (Kimi), Qwen (通义千问), Mimo, MiniMax, Doubao (豆包), Ernie (文心一言), Hunyuan (混元)

## 安全

- ToolPermission: FileReadWriteAll / FileRead / None
- Sandbox: Worktree isolation, SSH tunnel, sensitive filter

## 性能优化

- Streaming response: 流式响应
- Vector embedding cache: 向量嵌入缓存
- PTY reuse: PTY 复用

## 相关文档

- [README.md](./README.md)
- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)
- [COMPETITOR_ANALYSIS.md](./COMPETITOR_ANALYSIS.md)