use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::Mutex as ParkingMutex;
use serde_json::{json, Value};
use tokio::sync::Mutex;
use tracing::info;

use super::error::LspError;
use super::presets::LanguagePreset;
use super::transport::{LocalLspTransport, LspTransport};
use super::LspResult;

/// 文件 URI → 诊断列表缓存
///
/// 由 LSP 服务器通过 `textDocument/publishDiagnostics` 通知维护,
/// 客户端在每次 `request` 收到通知时同步更新,前端通过
/// `diagnostics(file_path)` 拉取最新快照.
type DiagnosticsCache = HashMap<String, Vec<lsp_types::Diagnostic>>;

/// LSP 客户端：封装与服务器的交互
pub struct LspClient {
    transport: Arc<Mutex<Box<dyn LspTransport>>>,
    preset: LanguagePreset,
    request_id: ParkingMutex<u64>,
    initialized: ParkingMutex<bool>,
    /// 诊断缓存:file_uri → diagnostics
    diagnostics: Arc<ParkingMutex<DiagnosticsCache>>,
}

impl LspClient {
    /// 启动并初始化本地 LSP 服务器
    ///
    /// 通过 [`LocalLspTransport`] spawn 本地语言服务器子进程，
    /// 适用于本地开发场景。
    pub async fn start(preset: LanguagePreset, workspace_root: PathBuf) -> LspResult<Self> {
        let transport = LocalLspTransport::spawn(&preset).await?;
        Self::start_with_transport(Box::new(transport), preset, workspace_root).await
    }

    /// 使用自定义传输层启动 LSP 客户端
    ///
    /// 适用于远端开发场景（传入 [`crate::lsp::ssh_transport::SshLspTransport`]），
    /// 或测试场景（传入 mock transport）。
    ///
    /// # 参数
    ///
    /// - `transport`: 任意实现 [`LspTransport`] 的传输层（以 trait object 形式持有）
    /// - `preset`: 语言服务器预置（仅用于语言标识，不用于启动）
    /// - `workspace_root`: 工作区根目录（用于 LSP `initialize` 请求的 `rootUri`）
    pub async fn start_with_transport(
        transport: Box<dyn LspTransport>,
        preset: LanguagePreset,
        workspace_root: PathBuf,
    ) -> LspResult<Self> {
        let client = Self {
            transport: Arc::new(Mutex::new(transport)),
            preset,
            request_id: ParkingMutex::new(0),
            initialized: ParkingMutex::new(false),
            diagnostics: Arc::new(ParkingMutex::new(HashMap::new())),
        };
        client.initialize(workspace_root).await?;
        Ok(client)
    }

    /// 返回当前 LSP 服务器所代表的语言(例如 `"typescript"` / `"python"` / `"rust"` / `"go"`).
    ///
    /// 用于在 Tauri 命令中向 Composer 暴露活跃语言状态,以及在多 LSP
    /// 并发场景下做语言匹配 / 路由.
    pub fn language(&self) -> &str {
        &self.preset.language
    }

    /// 发送 initialize 请求
    async fn initialize(&self, workspace_root: PathBuf) -> LspResult<()> {
        let req = self.build_request(
            "initialize",
            json!({
                "processId": null,
                "rootUri": format!("file://{}", workspace_root.to_string_lossy().replace('\\', "/")),
                "capabilities": {
                    "textDocument": {
                        "definition": { "linkSupport": false },
                        "references": {},
                        "hover": { "contentFormat": ["markdown", "plaintext"] },
                        "rename": { "prepareSupport": false },
                        "completion": {
                            "completionItem": {
                                "snippetSupport": true,
                                "documentationFormat": ["markdown", "plaintext"]
                            },
                            "contextSupport": true
                        },
                        "synchronization": {
                            "didOpen": true,
                            "didChange": true,
                            "didSave": true,
                            "willSave": false,
                            "willSaveWaitUntil": false
                        },
                        "publishDiagnostics": {
                            "relatedInformation": true,
                            "versionSupport": true
                        },
                        "codeAction": {
                            "codeActionLiteralSupport": {
                                "codeActionKind": {
                                    "valueSet": [
                                        "quickfix",
                                        "refactor",
                                        "refactor.extract",
                                        "refactor.inline",
                                        "refactor.rewrite",
                                        "source",
                                        "source.organizeImports"
                                    ]
                                }
                            }
                        },
                        "signatureHelp": {
                            "signatureInformation": {
                                "documentationFormat": ["markdown", "plaintext"]
                            }
                        },
                        "formatting": {}
                    }
                }
            }),
        );
        let _resp = self.request(req).await?;
        info!(language = %self.preset.language, "LSP 服务器初始化成功");

        // 发送 initialized 通知
        let notif = self.build_notification("initialized", json!({}));
        self.notify(notif).await?;

        *self.initialized.lock() = true;
        Ok(())
    }

    // ===== 文本同步通知 =====

    /// 通知服务器打开了一个文本文档
    ///
    /// 在打开文件后调用,服务器会基于内容做初始分析并下发
    /// `publishDiagnostics` 通知.
    pub async fn did_open(
        &self,
        file_path: &str,
        language_id: &str,
        text: &str,
    ) -> LspResult<()> {
        let uri = file_path_to_uri(file_path);
        let notif = self.build_notification(
            "textDocument/didOpen",
            json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id,
                    "version": 1,
                    "text": text
                }
            }),
        );
        self.notify(notif).await
    }

    /// 通知服务器文本文档发生了增量变更
    ///
    /// 简化实现:发送全文替换(range = nil). 配合 `syncKind = Full`
    /// capability,服务器接收后会重新分析并下发新 diagnostics.
    pub async fn did_change(
        &self,
        file_path: &str,
        version: u32,
        text: &str,
    ) -> LspResult<()> {
        let uri = file_path_to_uri(file_path);
        let notif = self.build_notification(
            "textDocument/didChange",
            json!({
                "textDocument": { "uri": uri, "version": version },
                "contentChanges": [{ "text": text }]
            }),
        );
        self.notify(notif).await
    }

    /// 通知服务器文本文档已保存
    ///
    /// `text = Some(content)` 时携带最新全文(需在 initialize 中声明
    /// `textDocument.synchronization.willSave`/`includeText`,此处为简化直接发送).
    /// `text = None` 时仅发送 URI,符合 LSP 3.17 spec 默认行为.
    pub async fn did_save(
        &self,
        file_path: &str,
        text: Option<&str>,
    ) -> LspResult<()> {
        let uri = file_path_to_uri(file_path);
        let mut params = json!({
            "textDocument": { "uri": uri }
        });
        if let Some(t) = text {
            params["text"] = json!(t);
        }
        let notif = self.build_notification("textDocument/didSave", params);
        self.notify(notif).await
    }

    // ===== LSP 查询方法 =====

    /// 跳转定义
    pub async fn goto_definition(
        &self,
        file_path: &str,
        line: u32,
        character: u32,
    ) -> LspResult<Vec<lsp_types::Location>> {
        let uri = file_path_to_uri(file_path);
        let req = self.build_request(
            "textDocument/definition",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character }
            }),
        );
        let resp = self.request(req).await?;
        let locations: Vec<lsp_types::Location> = serde_json::from_value(resp)
            .unwrap_or_default();
        Ok(locations)
    }

    /// 查找引用
    ///
    /// `include_declaration = true` 时结果包含定义位置本身.
    pub async fn references(
        &self,
        file_path: &str,
        line: u32,
        character: u32,
        include_declaration: bool,
    ) -> LspResult<Vec<lsp_types::Location>> {
        let uri = file_path_to_uri(file_path);
        let req = self.build_request(
            "textDocument/references",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character },
                "context": { "includeDeclaration": include_declaration }
            }),
        );
        let resp = self.request(req).await?;
        let locations: Vec<lsp_types::Location> = serde_json::from_value(resp)
            .unwrap_or_default();
        Ok(locations)
    }

    /// 悬浮提示
    ///
    /// 返回 `serde_json::Value` 以兼容 `Hover | null` 的多种 contents 形态
    /// (MarkedString / MarkupContent / MarkedString[]).
    pub async fn hover(
        &self,
        file_path: &str,
        line: u32,
        character: u32,
    ) -> LspResult<Option<Value>> {
        let uri = file_path_to_uri(file_path);
        let req = self.build_request(
            "textDocument/hover",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character }
            }),
        );
        let resp = self.request(req).await?;
        // LSP: Hover | null
        if resp.is_null() {
            return Ok(None);
        }
        Ok(Some(resp))
    }

    /// 重命名符号
    ///
    /// 返回 `WorkspaceEdit | null` 的原始 JSON.
    pub async fn rename(
        &self,
        file_path: &str,
        line: u32,
        character: u32,
        new_name: &str,
    ) -> LspResult<Option<Value>> {
        let uri = file_path_to_uri(file_path);
        let req = self.build_request(
            "textDocument/rename",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character },
                "newName": new_name
            }),
        );
        let resp = self.request(req).await?;
        if resp.is_null() {
            return Ok(None);
        }
        Ok(Some(resp))
    }

    /// 代码补全
    ///
    /// 返回 `CompletionList | CompletionItem[] | null` 的原始 JSON,
    /// 前端按 `isList ? .items : $` 统一展开.
    pub async fn completion(
        &self,
        file_path: &str,
        line: u32,
        character: u32,
    ) -> LspResult<Option<Value>> {
        let uri = file_path_to_uri(file_path);
        let req = self.build_request(
            "textDocument/completion",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character },
                "context": {
                    "triggerKind": 1 // Invoked
                }
            }),
        );
        let resp = self.request(req).await?;
        if resp.is_null() {
            return Ok(None);
        }
        Ok(Some(resp))
    }

    /// Code Action(快速修复 / 重构建议)
    ///
    /// 发送 `textDocument/codeAction` 请求,查询指定范围内可用的代码操作.
    /// context 中的 diagnostics 取自客户端缓存的该文件诊断快照,使服务器
    /// 能基于当前诊断给出精准的 quickfix 建议.
    ///
    /// # 参数
    ///
    /// - `file_path`: 文件路径
    /// - `start_line` / `start_char`: 选区起始位置(0-based)
    /// - `end_line` / `end_char`: 选区结束位置(0-based)
    ///
    /// # 返回值
    ///
    /// `Vec<CodeActionOrCommand>` —— 服务器可能返回 `Command` 或 `CodeAction`,
    /// 由 `lsp_types::CodeActionOrCommand` 枚举统一承载;为 null 时返回空向量.
    pub async fn code_action(
        &self,
        file_path: &str,
        start_line: u32,
        start_char: u32,
        end_line: u32,
        end_char: u32,
    ) -> LspResult<Vec<lsp_types::CodeActionOrCommand>> {
        let uri = file_path_to_uri(file_path);
        // 从诊断缓存获取该文件的诊断信息,作为 codeAction context
        let diagnostics = self.diagnostics(file_path);
        let req = self.build_request(
            "textDocument/codeAction",
            json!({
                "textDocument": { "uri": uri },
                "range": {
                    "start": { "line": start_line, "character": start_char },
                    "end": { "line": end_line, "character": end_char }
                },
                "context": {
                    "diagnostics": diagnostics,
                    "triggerKind": 1 // Invoked
                }
            }),
        );
        let resp = self.request(req).await?;
        // LSP: (Command | CodeAction)[] | null
        if resp.is_null() {
            return Ok(Vec::new());
        }
        let actions: Vec<lsp_types::CodeActionOrCommand> =
            serde_json::from_value(resp).unwrap_or_default();
        Ok(actions)
    }

    /// Signature Help(函数参数提示)
    ///
    /// 发送 `textDocument/signatureHelp` 请求,查询指定位置可用的函数签名信息.
    /// 通常在用户输入 `(` 后触发,用于在编辑器中显示参数提示浮窗.
    ///
    /// # 参数
    ///
    /// - `file_path`: 文件路径
    /// - `line` / `character`: 光标位置(0-based)
    ///
    /// # 返回值
    ///
    /// `Option<SignatureHelp>` —— 包含签名列表、当前激活签名及参数索引;
    /// 无可用签名时返回 `None`.
    pub async fn signature_help(
        &self,
        file_path: &str,
        line: u32,
        character: u32,
    ) -> LspResult<Option<lsp_types::SignatureHelp>> {
        let uri = file_path_to_uri(file_path);
        let req = self.build_request(
            "textDocument/signatureHelp",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character }
            }),
        );
        let resp = self.request(req).await?;
        // LSP: SignatureHelp | null
        if resp.is_null() {
            return Ok(None);
        }
        let help: lsp_types::SignatureHelp = serde_json::from_value(resp)
            .map_err(|e| LspError::CommunicationFailed(format!("解析 SignatureHelp 失败: {e}")))?;
        Ok(Some(help))
    }

    /// Formatting(代码格式化)
    ///
    /// 发送 `textDocument/formatting` 请求,对整个文件执行格式化.
    /// 服务器返回 `TextEdit[]` 表示需要应用的文本编辑序列.
    ///
    /// # 参数
    ///
    /// - `file_path`: 文件路径
    /// - `tab_size`: 缩进宽度(空格数)
    /// - `insert_spaces`: `true` 使用空格缩进,`false` 使用 Tab
    ///
    /// # 返回值
    ///
    /// `Vec<TextEdit>` —— 格式化编辑列表;为 null 时返回空向量.
    pub async fn formatting(
        &self,
        file_path: &str,
        tab_size: u32,
        insert_spaces: bool,
    ) -> LspResult<Vec<lsp_types::TextEdit>> {
        let uri = file_path_to_uri(file_path);
        let req = self.build_request(
            "textDocument/formatting",
            json!({
                "textDocument": { "uri": uri },
                "options": {
                    "tabSize": tab_size,
                    "insertSpaces": insert_spaces
                }
            }),
        );
        let resp = self.request(req).await?;
        // LSP: TextEdit[] | null
        if resp.is_null() {
            return Ok(Vec::new());
        }
        let edits: Vec<lsp_types::TextEdit> =
            serde_json::from_value(resp).unwrap_or_default();
        Ok(edits)
    }

    /// 拉取某文件的诊断快照
    ///
    /// 数据来源于服务器通过 `textDocument/publishDiagnostics` 通知推送,
    /// 客户端在每次 `request` 中拦截通知并更新缓存.
    pub fn diagnostics(&self, file_path: &str) -> Vec<lsp_types::Diagnostic> {
        let uri = file_path_to_uri(file_path);
        let cache = self.diagnostics.lock();
        cache.get(&uri).cloned().unwrap_or_default()
    }

    /// 发送 LSP shutdown 请求 + exit 通知,优雅关闭语言服务器
    ///
    /// 按 LSP 规范,客户端应在 Drop 前显式发送 `shutdown` request 和 `exit` notification,
    /// 让服务器有机会释放资源. LocalLspTransport 已设置 `kill_on_drop(true)` 作为兜底.
    pub async fn shutdown(&self) -> LspResult<()> {
        let req = self.build_request("shutdown", json!({}));
        let _ = self.request(req).await;
        let notif = self.build_notification("exit", json!({}));
        self.notify(notif).await
    }

    /// 发送请求并等待匹配 ID 的响应
    ///
    /// 在等待期间,若收到 `textDocument/publishDiagnostics` 通知,会先把它
    /// 写入 diagnostics 缓存再继续等待响应,避免诊断信息被丢弃.
    async fn request(&self, req: serde_json::Value) -> LspResult<Value> {
        let transport = self.transport.lock().await;
        transport.send(&req).await?;
        loop {
            let msg = transport.recv().await?;
            // 处理 publishDiagnostics 通知
            if msg.get("id").is_none() {
                if let Some(method) = msg.get("method").and_then(|v| v.as_str()) {
                    if method == "textDocument/publishDiagnostics" {
                        self.handle_publish_diagnostics(&msg);
                    }
                }
                continue;
            }
            if msg.get("id") == req.get("id") {
                if let Some(err) = msg.get("error") {
                    return Err(LspError::CommunicationFailed(format!("LSP 错误: {err}")));
                }
                return Ok(msg.get("result").cloned().unwrap_or(Value::Null));
            }
            // 其他响应（不匹配 id）忽略
        }
    }

    /// 把 publishDiagnostics 通知中的诊断写入缓存
    fn handle_publish_diagnostics(&self, msg: &Value) {
        let Some(params) = msg.get("params") else { return; };
        let Some(uri) = params.get("uri").and_then(|v| v.as_str()) else { return; };
        let diagnostics: Vec<lsp_types::Diagnostic> = params
            .get("diagnostics")
            .and_then(|d| serde_json::from_value(d.clone()).ok())
            .unwrap_or_default();
        let mut cache = self.diagnostics.lock();
        if diagnostics.is_empty() {
            cache.remove(uri);
        } else {
            cache.insert(uri.to_string(), diagnostics);
        }
    }

    async fn notify(&self, notif: serde_json::Value) -> LspResult<()> {
        let transport = self.transport.lock().await;
        transport.send(&notif).await
    }

    fn next_id(&self) -> u64 {
        let mut id = self.request_id.lock();
        *id += 1;
        *id
    }

    fn build_request(&self, method: &str, params: serde_json::Value) -> serde_json::Value {
        json!({
            "jsonrpc": "2.0",
            "id": self.next_id(),
            "method": method,
            "params": params
        })
    }

    fn build_notification(&self, method: &str, params: serde_json::Value) -> serde_json::Value {
        json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        })
    }
}

fn file_path_to_uri(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    if normalized.starts_with('/') {
        format!("file://{normalized}")
    } else {
        format!("file:///{normalized}")
    }
}
