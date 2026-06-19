//! Remi Code server library.
//!
//! This crate exposes:
//!
//! - [`routes`] — the full HTTP route surface (50+ endpoints).
//! - [`AppStateAccess`] / [`ServerState`] — the state trait and concrete
//!   wrapper used by every handler.
//! - [`register_routes`] — single entry point to mount all routes on an
//!   `axum::Router`.

pub mod routes;

pub use routes::{
    AppStateAccess, ServerState, register_routes, route_count,
};
