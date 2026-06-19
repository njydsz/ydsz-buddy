//! Remi Code 服务器库。
//!
//! 本 crate 暴露以下内容：
//!
//! - [`routes`] — 完整 HTTP 路由表（50+ 端点）。
//! - [`AppStateAccess`] / [`ServerState`] — 状态 trait 及每个处理器使用的具体包装器。
//! - [`register_routes`] — 将所有路由挂载到 `axum::Router` 上的单一入口。

pub mod routes;

pub use routes::{
    AppStateAccess, ServerState, register_routes, route_count,
};
