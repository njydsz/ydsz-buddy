//! Authentication and authorization for Remi Code.
//!
//! This crate handles user authentication, session management, secret storage,
//! settings management, and lifecycle event tracking.

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
        // Verify token if provided
        if let Some(token) = &input.token {
            self.verify_token(token).await?;
            info!("Verified bootstrap token for client: {}", input.client_id);
        }

        // Create session token
        let session_token = self.generate_session_token().await?;
        let expires_at = Utc::now() + Duration::hours(24);

        // Store session token in database
        self.store_session_token(&session_token, &input.client_id, expires_at).await?;

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

        // Store pairing credential in database
        self.store_pairing_credential(&pairing_code, &input.device_id, expires_at).await?;

        Ok(AuthCreatePairingCredentialOutput {
            pairing_code,
            pairing_link,
            expires_at: expires_at.to_rfc3339(),
        })
    }

    /// Revoke a pairing link by marking it as used.
    pub async fn revoke_pairing_link(&self, code: &str) -> Result<()> {
        let pool = self.db.pool();

        sqlx::query(
            "UPDATE pairing_credentials SET used = 1 WHERE code = ?"
        )
        .bind(code)
        .execute(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    /// Revoke a client session by token.
    pub async fn revoke_client_session(&self, token: &str) -> Result<()> {
        let pool = self.db.pool();

        sqlx::query(
            "DELETE FROM sessions WHERE token = ?"
        )
        .bind(token)
        .execute(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    /// Verify a session token.
    pub async fn verify_token(&self, token: &str) -> Result<bool> {
        let pool = self.db.pool();
        
        let result: Option<(String,)> = sqlx::query_as(
            "SELECT client_id FROM sessions WHERE token = ? AND expires_at > ?"
        )
        .bind(token)
        .bind(Utc::now().to_rfc3339())
        .fetch_optional(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(result.is_some())
    }

    /// Store a session token in the database.
    async fn store_session_token(
        &self,
        token: &str,
        client_id: &str,
        expires_at: chrono::DateTime<Utc>,
    ) -> Result<()> {
        let pool = self.db.pool();
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO sessions (id, token, client_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(token)
        .bind(client_id)
        .bind(&created_at)
        .bind(expires_at.to_rfc3339())
        .execute(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    /// Store a pairing credential in the database.
    async fn store_pairing_credential(
        &self,
        code: &str,
        device_id: &str,
        expires_at: chrono::DateTime<Utc>,
    ) -> Result<()> {
        let pool = self.db.pool();
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO pairing_credentials (id, code, device_id, created_at, expires_at, used) VALUES (?, ?, ?, ?, ?, FALSE)"
        )
        .bind(&id)
        .bind(code)
        .bind(device_id)
        .bind(&created_at)
        .bind(expires_at.to_rfc3339())
        .execute(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    /// Generate a session token.
    async fn generate_session_token(&self) -> Result<String> {
        let key = self.secret_key.read().await;
        if key.is_empty() {
            return Err(Error::Auth("Secret key not initialized".to_string()));
        }

        let key = Key::<Aes256Gcm>::from_slice(&key[..32]);
        let cipher = Aes256Gcm::new(key);

        // Generate random nonce
        let mut nonce_bytes = [0u8; 12];
        use aes_gcm::aead::rand_core::RngCore;
        AeadOsRng.fill_bytes(&mut nonce_bytes);
        let nonce = aes_gcm::Nonce::from_slice(&nonce_bytes);
        let plaintext = Uuid::new_v4().to_string();

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| Error::Auth(format!("Failed to encrypt: {}", e)))?;

        // Prepend nonce to ciphertext for decryption
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
        let db = Arc::new(
            Database::connect(&remi_core::ServerConfig::default())
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
