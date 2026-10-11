//! # TUI App 状态管理
//!
//! 定义 TUI 的核心状态机，处理屏幕切换、用户输入分发和生命周期管理。

use std::sync::Arc;

use anyhow::Result;
use crossterm::event::{KeyCode, KeyModifiers};
use ratatui::Frame;

use crate::client::{YdszClient, ClientEvent};
use crate::theme::Theme;
use crate::ui;

/// 应用屏幕枚举——定义 TUI 的各层级界面
#[derive(Debug, Clone, PartialEq)]
pub enum Screen {
    /// 工作区选择界面
    WorkspaceSelect,
    /// 会话列表界面
    SessionList,
    /// 对话界面（携带线程 ID）
    Chat {
        thread_id: String,
    },
    /// 设置面板
    Settings,
}

/// TUI 应用主状态机
pub struct TuiApp {
    /// 当前界面状态
    pub screen: Screen,
    /// 配色主题
    pub theme: Theme,
    /// WebSocket 客户端
    pub client: Arc<YdszClient>,
    /// 当前选中的项目（工作区）路径
    pub current_workspace: Option<String>,
    /// 是否正在运行
    pub running: bool,
    /// 会话列表
    pub threads: Vec<ydsz_core::models::Thread>,
    /// 当前对话的消息列表
    pub messages: Vec<ydsz_core::models::Message>,
    /// 当前用户输入
    pub input: String,
    /// 执行模式
    pub mode: String,
    /// Token 用量追踪
    pub token_usage: TokenUsage,
}

/// Token 用量信息
#[derive(Debug, Clone, Default)]
pub struct TokenUsage {
    /// 输入 token 数（累计）
    pub input_tokens: u64,
    /// 输出 token 数（累计）
    pub output_tokens: u64,
    /// 当前轮次估算 token
    pub current_turn_tokens: u64,
}

impl TuiApp {
    /// 创建新的 TUI 应用实例
    pub fn new(server_url: &str, mode: &str) -> Self {
        Self {
            screen: Screen::WorkspaceSelect,
            theme: Theme::default(),
            client: Arc::new(YdszClient::new(server_url)),
            current_workspace: None,
            running: true,
            threads: Vec::new(),
            messages: Vec::new(),
            input: String::new(),
            mode: mode.to_string(),
            token_usage: TokenUsage::default(),
        }
    }

    /// 主运行循环（完整 TUI 模式）
    pub async fn run(&mut self) -> Result<()> {
        use crossterm::event::{self, Event, KeyCode, KeyModifiers};
        use crossterm::{execute, terminal};
        use std::io;
        use std::time::Duration;

        // 进入原始模式
        terminal::enable_raw_mode()?;
        let mut stdout = io::stdout();
        execute!(
            stdout,
            terminal::EnterAlternateScreen,
            crossterm::event::EnableMouseCapture
        )?;

        let backend = ratatui::backend::CrosstermBackend::new(stdout);
        let mut terminal = ratatui::Terminal::new(backend)?;

        // 异步通道：接收服务端推送事件
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<ClientEvent>();

        // 启动客户端连接
        self.client.connect(tx).await?;

        // 主事件循环
        while self.running {
            // 渲染
            terminal.draw(|f| self.render(f))?;

            // 轮询事件（带超时）
            if event::poll(Duration::from_millis(100))? {
                if let Event::Key(key) = event::read()? {
                    self.handle_key(key.code, key.modifiers).await?;
                }
            }

            // 处理服务端推送事件
            while let Ok(event) = rx.try_recv() {
                self.handle_client_event(event).await;
            }
        }

        // 恢复终端
        execute!(
            terminal.backend_mut(),
            terminal::LeaveAlternateScreen,
            crossterm::event::DisableMouseCapture
        )?;
        terminal::disable_raw_mode()?;

        Ok(())
    }

    /// Headless 模式：单轮执行后退出
    pub async fn run_headless(&mut self, prompt: &str) -> Result<()> {
        tracing::info!(prompt = %prompt, "Headless 模式执行中");

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<ClientEvent>();
        self.client.connect(tx).await?;

        // 发送用户消息
        self.client.send_message(prompt).await?;

        // 等待并打印响应
        while let Some(event) = rx.recv().await {
            match event {
                ClientEvent::MessageDelta { delta, .. } => {
                    print!("{delta}");
                }
                ClientEvent::TurnComplete { .. } => {
                    println!();
                    tracing::info!("单轮执行完成");
                    break;
                }
                ClientEvent::Error { message } => {
                    eprintln!("错误: {message}");
                    break;
                }
                _ => {}
            }
        }

        Ok(())
    }

    /// 处理键盘输入事件
    pub async fn handle_key(&mut self, code: KeyCode, modifiers: KeyModifiers) -> Result<()> {
        match (&self.screen, code) {
            // Ctrl+C：全局退出
            (_, KeyCode::Char('c')) if modifiers.contains(KeyModifiers::CONTROL) => {
                self.running = false;
            }

            // 对话界面快捷键
            (Screen::Chat { .. }, KeyCode::Char('n')) if modifiers.contains(KeyModifiers::CONTROL) => {
                self.screen = Screen::SessionList;
                self.input.clear();
            }

            // Tab：切换界面（WorkspaceSelect ↔ SessionList ↔ Settings）
            (_, KeyCode::Tab) => {
                self.screen = match self.screen {
                    Screen::WorkspaceSelect => Screen::SessionList,
                    Screen::SessionList => Screen::Settings,
                    Screen::Settings => Screen::WorkspaceSelect,
                    Screen::Chat { .. } => Screen::Chat {
                        thread_id: String::new(), // 保持在当前对话
                    },
                };
            }

            // 输入处理和屏幕特定逻辑委托给 UI 模块
            (Screen::Chat { thread_id: _ }, _) => {
                if let KeyCode::Enter = code {
                    // 发送消息
                    let input = self.input.clone();
                    if !input.is_empty() {
                        self.messages.push(ydsz_core::models::Message {
                            id: uuid::Uuid::new_v4(),
                            role: ydsz_core::models::MessageRole::User,
                            text: input.clone(),
                            attachments: Vec::new(),
                            skills: Vec::new(),
                            mentions: Vec::new(),
                            dispatch_mode: None,
                            turn_id: None,
                            streaming: false,
                            source: None,
                            created_at: chrono::Utc::now(),
                            updated_at: chrono::Utc::now(),
                        });
                        self.input.clear();
                        self.client.send_message(&input).await?;
                    }
                } else if let KeyCode::Char(c) = code {
                    self.input.push(c);
                } else if let KeyCode::Backspace = code {
                    self.input.pop();
                } else if let KeyCode::Esc = code {
                    self.screen = Screen::SessionList;
                }
            }
            _ => {
                // 屏幕特定的输入处理委托给 UI 模块
                ui::handle_screen_input(self, code, modifiers).await?;
            }
        }

        Ok(())
    }

    /// 处理服务端推送事件
    async fn handle_client_event(&mut self, event: ClientEvent) {
        match event {
            ClientEvent::ThreadList { threads } => {
                self.threads = threads;
            }
            ClientEvent::MessageDelta { thread_id: _, delta } => {
                // 流式更新最后一条助手消息
                if let Some(last) = self.messages.last_mut() {
                    if last.role == ydsz_core::models::MessageRole::Assistant {
                        last.text.push_str(&delta);
                        last.streaming = true;
                    }
                } else {
                    // 创建新的助手消息
                    self.messages.push(ydsz_core::models::Message {
                        id: uuid::Uuid::new_v4(),
                        role: ydsz_core::models::MessageRole::Assistant,
                        text: delta,
                        attachments: Vec::new(),
                        skills: Vec::new(),
                        mentions: Vec::new(),
                        dispatch_mode: None,
                        turn_id: None,
                        streaming: true,
                        source: None,
                        created_at: chrono::Utc::now(),
                        updated_at: chrono::Utc::now(),
                    });
                }
            }
            ClientEvent::TurnComplete { usage, .. } => {
                if let Some(last) = self.messages.last_mut() {
                    last.streaming = false;
                }
                if let Some(usage) = usage {
                    self.token_usage.input_tokens += usage.input_tokens;
                    self.token_usage.output_tokens += usage.output_tokens;
                }
            }
            ClientEvent::Error { message } => {
                self.messages.push(ydsz_core::models::Message {
                    id: uuid::Uuid::new_v4(),
                    role: ydsz_core::models::MessageRole::System,
                    text: format!("[错误] {message}"),
                    attachments: Vec::new(),
                    skills: Vec::new(),
                    mentions: Vec::new(),
                    dispatch_mode: None,
                    turn_id: None,
                    streaming: false,
                    source: None,
                    created_at: chrono::Utc::now(),
                    updated_at: chrono::Utc::now(),
                });
            }
            _ => {}
        }
    }

    /// 渲染当前界面到 Frame
    fn render(&mut self, frame: &mut Frame<'_>) {
        use ratatui::layout::{Constraint, Direction, Layout};

        // 垂直布局：主内容区域 + 状态栏
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .margin(0)
            .constraints([
                Constraint::Min(0),
                Constraint::Length(1),
            ])
            .split(frame.area());

        // 渲染当前屏幕内容
        match &self.screen {
            Screen::WorkspaceSelect => {
                ui::workspace_selector::render(self, frame, chunks[0]);
            }
            Screen::SessionList => {
                ui::session_list::render(self, frame, chunks[0]);
            }
            Screen::Chat { thread_id: _ } => {
                ui::chat_view::render(self, frame, chunks[0]);
            }
            Screen::Settings => {
                ui::settings::render(self, frame, chunks[0]);
            }
        }

        // 渲染底部状态栏
        ui::status_bar::render(self, frame, chunks[1]);
    }
}
