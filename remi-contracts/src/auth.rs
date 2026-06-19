//! Authentication schemas.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Input for bootstrapping authentication.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthBootstrapInput {
    /// Client identifier.
    pub client_id: String,
    /// Bootstrap token (if required).
    pub token: Option<String>,
}

/// Output for successful authentication.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthBootstrapOutput {
    /// Session token.
    pub session_token: String,
    /// Session expiration timestamp (ISO 8601).
    pub expires_at: String,
}

/// Input for creating a pairing credential.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthCreatePairingCredentialInput {
    /// Device identifier.
    pub device_id: String,
    /// Device name.
    pub device_name: String,
}

/// Output for pairing credential creation.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthCreatePairingCredentialOutput {
    /// Pairing code.
    pub pairing_code: String,
    /// Pairing link (for URL-based pairing).
    pub pairing_link: String,
    /// Expiration timestamp (ISO 8601).
    pub expires_at: String,
}

/// Input for verifying an auth token.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthVerifyInput {
    /// Token to verify.
    pub token: String,
}

/// Input for revoking a pairing link.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthRevokePairingLinkInput {
    /// Pairing code to revoke.
    pub code: String,
}

/// Input for revoking a client session.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthRevokeClientSessionInput {
    /// Session token to revoke.
    pub token: String,
}

/// Authentication error types.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, thiserror::Error)]
#[serde(tag = "_tag")]
pub enum AuthError {
    /// Invalid credentials.
    #[error("invalid credentials")]
    InvalidCredentials,
    /// Session expired.
    #[error("session expired")]
    SessionExpired,
    /// Pairing link expired.
    #[error("pairing link expired")]
    PairingLinkExpired,
    /// Internal error.
    #[error("internal error: {message}")]
    Internal { message: String },
}
