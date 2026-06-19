//! Authentication and authorization for Remi Code.
//!
//! This crate handles user authentication, session management, secret storage,
//! settings management, and lifecycle event tracking.
//!
//! Persistence tables (defined by remi-persistence migrations):
//! - `auth_sessions` – issued client sessions
//! - `auth_pairing_links` – one-time pairing credentials
//! - `secrets` – encrypted secret store
//! - `lifecycle_events` – system lifecycle audit log
//! - `settings` – generic key/value settings

pub mod lifecycle;
pub mod secret_store;
pub mod settings;

use aes_gcm::{
    Aes256Gcm, Key,
    aead::{Aead, KeyInit, OsRng as AeadOsRng},
};
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use chrono::{Duration, Utc};
use remi_contracts::{
    AuthBootstrapInput, AuthBootstrapOutput, AuthCreatePairingCredentialInput,
    AuthCreatePairingCredentialOutput,
};
use remi_core::{Error, Result};
use remi_persistence::Database;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;
use uuid::Uuid;

pub use lifecycle::{LifecycleEvent, LifecycleEventType, LifecycleManager};
pub use secret_store::{SecretMetadata, SecretStore};
pub use settings::{Setting, SettingsManager};

/// Authentication service.
#[derive(Clone)]
#[allow(dead_code)]
pub struct AuthService {
    db: Arc<Database>,
    secret_key: Arc<RwLock<Vec<u8>>>,
}

impl AuthService {
    /// Create a new authentication service.
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            secret_key: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Initialize the service with a secret key.
    pub async fn initialize(&self, secret_key: Vec<u8>) -> Result<()> {
        let mut key = self.secret_key.write().await;
        *key = secret_key;
        Ok(())
    }

    /// Bootstrap authentication.
    pub async fn bootstrap(&self, input: AuthBootstrapInput) -> Result<AuthBootstrapOutput> {
        if let Some(token) = &input.token {
            self.verify_token(token).await?;
            info!("Verified bootstrap token for client: {}", input.client_id);
        }

        let session_token = self.generate_session_token().await?;
        let expires_at = Utc::now() + Duration::hours(24);
        self.store_session(&session_token, &input.client_id, expires_at, "web")
            .await?;

        Ok(AuthBootstrapOutput {
            session_token,
            expires_at: expires_at.to_rfc3339(),
        })
    }

    /// Create a pairing credential.
    pub async fn create_pairing_credential(
        &self,
        input: AuthCreatePairingCredentialInput,
    ) -> Result<AuthCreatePairingCredentialOutput> {
        let pairing_code = self.generate_pairing_code().await?;
        let pairing_link = format!("remi-code://pair?code={}", pairing_code);
        let expires_at = Utc::now() + Duration::minutes(10);

        self.store_pairing_link(&pairing_code, &input.device_id, &input.device_name, expires_at)
            .await?;

        Ok(AuthCreatePairingCredentialOutput {
            pairing_code,
            pairing_link,
            expires_at: expires_at.to_rfc3339(),
        })
    }

    /// Revoke a pairing link.
    pub async fn revoke_pairing_link(&self, code: &str) -> Result<()> {
        let pool = self.db.pool();
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE auth_pairing_links SET revoked_at = ? WHERE credential = ?")
            .bind(&now)
            .bind(code)
            .execute(pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }

    /// Revoke a client session by token.
    pub async fn revoke_client_session(&self, token: &str) -> Result<()> {
        let pool = self.db.pool();
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE auth_sessions SET revoked_at = ? WHERE session_id = ?")
            .bind(&now)
            .bind(token)
            .execute(pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }

    /// List all active pairing links.
    pub async fn list_pairing_links(&self) -> Result<Vec<serde_json::Value>> {
        let pool = self.db.pool();
        let rows: Vec<(String, String, String, String, String, String)> = sqlx::query_as(
            "SELECT id, credential, subject, label, created_at, expires_at FROM auth_pairing_links WHERE revoked_at IS NULL AND consumed_at IS NULL AND expires_at > ?",
        )
        .bind(Utc::now().to_rfc3339())
        .fetch_all(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(rows
            .into_iter()
            .map(|(id, credential, subject, label, created_at, expires_at)| {
                serde_json::json!({
                    "id": id,
                    "code": credential,
                    "deviceId": subject,
                    "label": label,
                    "createdAt": created_at,
                    "expiresAt": expires_at,
                })
            })
            .collect())
    }

    /// List client sessions.
    pub async fn list_client_sessions(
        &self,
        exclude_session_id: Option<&str>,
    ) -> Result<Vec<serde_json::Value>> {
        let pool = self.db.pool();
        let rows: Vec<(String, String, String, String, String)> = sqlx::query_as(
            "SELECT session_id, subject, client_label, issued_at, expires_at FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ?",
        )
        .bind(Utc::now().to_rfc3339())
        .fetch_all(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(rows
            .into_iter()
            .filter(|(id, _, _, _, _)| {
                exclude_session_id.map_or(true, |exclude| id != exclude)
            })
            .map(|(id, subject, label, issued_at, expires_at)| {
                serde_json::json!({
                    "id": id,
                    "clientId": subject,
                    "clientLabel": label,
                    "createdAt": issued_at,
                    "expiresAt": expires_at,
                })
            })
            .collect())
    }

    /// Revoke all other client sessions except the given one.
    pub async fn revoke_other_client_sessions(&self, keep_session_id: &str) -> Result<u64> {
        let pool = self.db.pool();
        let now = Utc::now().to_rfc3339();
        let result = sqlx::query(
            "UPDATE auth_sessions SET revoked_at = ? WHERE session_id != ? AND revoked_at IS NULL",
        )
        .bind(&now)
        .bind(keep_session_id)
        .execute(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        Ok(result.rows_affected())
    }

    /// Get session state for the current request.
    pub async fn get_session_state(&self, token: &str) -> Result<serde_json::Value> {
        let pool = self.db.pool();
        let result: Option<(String, String, String)> = sqlx::query_as(
            "SELECT session_id, subject, issued_at FROM auth_sessions WHERE session_id = ? AND revoked_at IS NULL AND expires_at > ?",
        )
        .bind(token)
        .bind(Utc::now().to_rfc3339())
        .fetch_optional(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        match result {
            Some((id, subject, issued_at)) => Ok(serde_json::json!({
                "authenticated": true,
                "sessionId": id,
                "clientId": subject,
                "createdAt": issued_at,
            })),
            None => Ok(serde_json::json!({
                "authenticated": false
            })),
        }
    }

    /// Issue a WebSocket token for an authenticated session.
    pub async fn issue_websocket_token(&self, session_token: &str) -> Result<serde_json::Value> {
        let pool = self.db.pool();
        let result: Option<(String,)> = sqlx::query_as(
            "SELECT subject FROM auth_sessions WHERE session_id = ? AND revoked_at IS NULL AND expires_at > ?",
        )
        .bind(session_token)
        .bind(Utc::now().to_rfc3339())
        .fetch_optional(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        match result {
            Some(_) => {
                let ws_token = self.generate_session_token().await?;
                let expires_at = Utc::now() + Duration::hours(1);
                self.store_session(&ws_token, "websocket", expires_at, "websocket")
                    .await?;
                Ok(serde_json::json!({
                    "token": ws_token,
                    "expiresAt": expires_at.to_rfc3339()
                }))
            }
            None => Err(Error::Auth("Invalid session token".to_string())),
        }
    }

    /// Verify a session token.
    pub async fn verify_token(&self, token: &str) -> Result<bool> {
        let pool = self.db.pool();
        let result: Option<(String,)> = sqlx::query_as(
            "SELECT subject FROM auth_sessions WHERE session_id = ? AND revoked_at IS NULL AND expires_at > ?",
        )
        .bind(token)
        .bind(Utc::now().to_rfc3339())
        .fetch_optional(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        Ok(result.is_some())
    }

    /// Verify a WebSocket token.
    pub async fn verify_websocket_token(&self, token: &str) -> Result<bool> {
        let pool = self.db.pool();
        let result: Option<(String,)> = sqlx::query_as(
            "SELECT subject FROM auth_sessions WHERE session_id = ? AND method = 'websocket' AND revoked_at IS NULL AND expires_at > ?",
        )
        .bind(token)
        .bind(Utc::now().to_rfc3339())
        .fetch_optional(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        Ok(result.is_some())
    }

    /// List active sessions with connection status.
    pub async fn list_active_sessions(&self) -> Result<Vec<serde_json::Value>> {
        let pool = self.db.pool();
        let rows: Vec<(String, String, String, String, Option<String>)> = sqlx::query_as(
            "SELECT session_id, subject, issued_at, expires_at, last_connected_at FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ?",
        )
        .bind(Utc::now().to_rfc3339())
        .fetch_all(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(rows
            .into_iter()
            .map(|(id, subject, issued_at, expires_at, last_connected_at)| {
                serde_json::json!({
                    "id": id,
                    "clientId": subject,
                    "createdAt": issued_at,
                    "expiresAt": expires_at,
                    "lastConnectedAt": last_connected_at,
                })
            })
            .collect())
    }

    /// Mark a session as connected.
    pub async fn mark_connected(&self, session_id: &str) -> Result<()> {
        let pool = self.db.pool();
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE auth_sessions SET last_connected_at = ? WHERE session_id = ?")
            .bind(&now)
            .bind(session_id)
            .execute(pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }

    /// Mark a session as disconnected.
    pub async fn mark_disconnected(&self, _session_id: &str) -> Result<()> {
        // No-op: we don't track transient connection state in the new schema.
        Ok(())
    }

    /// Consume a bootstrap/pairing token (one-time use).
    pub async fn consume_bootstrap_token(&self, token: &str) -> Result<String> {
        let pool = self.db.pool();
        let result: Option<(String, String)> = sqlx::query_as(
            "SELECT subject, label FROM auth_pairing_links WHERE credential = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
        )
        .bind(token)
        .bind(Utc::now().to_rfc3339())
        .fetch_optional(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        match result {
            Some((subject, label)) => {
                let now = Utc::now().to_rfc3339();
                sqlx::query("UPDATE auth_pairing_links SET consumed_at = ? WHERE credential = ?")
                    .bind(&now)
                    .bind(token)
                    .execute(pool)
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                info!("Consumed bootstrap token for device: {}", label);
                Ok(subject)
            }
            None => Err(Error::Auth("Invalid or expired bootstrap token".to_string())),
        }
    }

    /// Authenticate an HTTP request by extracting and verifying the bearer token.
    pub async fn authenticate_http_request(
        &self,
        headers: &axum::http::HeaderMap,
    ) -> Result<Option<String>> {
        let token = headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| {
                if v.starts_with("Bearer ") {
                    Some(v[7..].to_string())
                } else {
                    Some(v.to_string())
                }
            });
        match token {
            Some(t) if self.verify_token(&t).await? => Ok(Some(t)),
            Some(_) => Ok(None),
            None => Ok(None),
        }
    }

    /// Authenticate a WebSocket upgrade request.
    pub async fn authenticate_websocket_upgrade(
        &self,
        headers: &axum::http::HeaderMap,
    ) -> Result<Option<String>> {
        let token = headers
            .get("sec-websocket-protocol")
            .and_then(|v| v.to_str().ok())
            .map(|v| v.to_string())
            .or_else(|| {
                headers
                    .get("authorization")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| {
                        if v.starts_with("Bearer ") {
                            Some(v[7..].to_string())
                        } else {
                            Some(v.to_string())
                        }
                    })
            });
        match token {
            Some(t) if self.verify_websocket_token(&t).await? || self.verify_token(&t).await? => {
                Ok(Some(t))
            }
            Some(_) => Ok(None),
            None => Ok(None),
        }
    }

    /// Store a session in the database.
    async fn store_session(
        &self,
        session_id: &str,
        subject: &str,
        expires_at: chrono::DateTime<Utc>,
        method: &str,
    ) -> Result<()> {
        let pool = self.db.pool();
        let issued_at = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO auth_sessions (session_id, subject, role, method, client_device_type, issued_at, expires_at) VALUES (?, ?, 'owner', ?, 'unknown', ?, ?)",
        )
        .bind(session_id)
        .bind(subject)
        .bind(method)
        .bind(&issued_at)
        .bind(expires_at.to_rfc3339())
        .execute(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }

    /// Store a pairing link.
    async fn store_pairing_link(
        &self,
        code: &str,
        device_id: &str,
        device_name: &str,
        expires_at: chrono::DateTime<Utc>,
    ) -> Result<()> {
        let pool = self.db.pool();
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO auth_pairing_links (id, credential, method, role, subject, label, created_at, expires_at) VALUES (?, ?, 'pairing-code', 'owner', ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(code)
        .bind(device_id)
        .bind(device_name)
        .bind(&created_at)
        .bind(expires_at.to_rfc3339())
        .execute(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }

    /// Generate a session token (random UUID encoded as hex).
    async fn generate_session_token(&self) -> Result<String> {
        let key = self.secret_key.read().await;
        if key.is_empty() {
            return Err(Error::Auth("Secret key not initialized".to_string()));
        }

        let key = Key::<Aes256Gcm>::from_slice(&key[..32]);
        let cipher = Aes256Gcm::new(key);

        let mut nonce_bytes = [0u8; 12];
        use aes_gcm::aead::rand_core::RngCore;
        AeadOsRng.fill_bytes(&mut nonce_bytes);
        let nonce = aes_gcm::Nonce::from_slice(&nonce_bytes);
        let plaintext = Uuid::new_v4().to_string();

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| Error::Auth(format!("Failed to encrypt: {}", e)))?;

        let mut combined = nonce_bytes.to_vec();
        combined.extend_from_slice(&ciphertext);
        Ok(hex::encode(combined))
    }

    /// Generate a pairing code.
    async fn generate_pairing_code(&self) -> Result<String> {
        let code = Uuid::new_v4().to_string().replace('-', "").to_uppercase();
        Ok(code[..8].to_string())
    }

    /// Hash a password.
    pub async fn hash_password(&self, password: &str) -> Result<String> {
        let salt = SaltString::generate(&mut AeadOsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| Error::Auth(format!("Failed to hash password: {}", e)))?
            .to_string();
        Ok(password_hash)
    }

    /// Verify a password.
    pub async fn verify_password(&self, password: &str, hash: &str) -> Result<bool> {
        let parsed_hash = PasswordHash::new(hash)
            .map_err(|e| Error::Auth(format!("Invalid password hash: {}", e)))?;
        let argon2 = Argon2::default();
        Ok(argon2
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_password_hashing() {
        let db = Arc::new(
            Database::connect(&remi_core::ServerConfig::default())
                .await
                .expect("DB connect"),
        );
        let service = AuthService::new(db);
        service.initialize(vec![0u8; 32]).await.expect("Init");

        let password = "test_password";
        let hash = service.hash_password(password).await.expect("Hash");
        assert!(
            service
                .verify_password(password, &hash)
                .await
                .expect("Verify")
        );
    }

    #[tokio::test]
    async fn test_bootstrap_and_pairing_lifecycle() {
        let temp_dir = std::env::temp_dir().join(format!("remi-auth-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("Failed to create temp dir");
        let mut config = remi_core::ServerConfig::default();
        config.db_path = temp_dir.join("test.db");
        let db = Arc::new(
            Database::connect(&config)
                .await
                .expect("DB connect"),
        );
        db.run_migrations().await.expect("Migrations");
        let service = AuthService::new(db);
        service.initialize(vec![0u8; 32]).await.expect("Init");

        let bootstrap = service
            .bootstrap(AuthBootstrapInput {
                client_id: "client-1".to_string(),
                token: None,
            })
            .await
            .expect("Bootstrap");
        assert!(!bootstrap.session_token.is_empty());

        let pairing = service
            .create_pairing_credential(AuthCreatePairingCredentialInput {
                device_id: "device-1".to_string(),
                device_name: "Test Device".to_string(),
            })
            .await
            .expect("Pairing");
        assert_eq!(pairing.pairing_code.len(), 8);

        service
            .revoke_pairing_link(&pairing.pairing_code)
            .await
            .expect("Revoke pairing");
        service
            .revoke_client_session(&bootstrap.session_token)
            .await
            .expect("Revoke session");
    }
}
