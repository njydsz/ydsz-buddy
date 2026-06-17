//! Authentication and authorization for Remi Code.
//!
//! This crate handles user authentication, session management, and secret storage.

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng as AeadOsRng},
    Aes256Gcm, Key,
};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
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

/// Authentication service.
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
        if let Some(_token) = &input.token {
            // TODO: Verify token against database
            info!("Verifying bootstrap token for client: {}", input.client_id);
        }

        // Create session token
        let session_token = self.generate_session_token().await?;
        let expires_at = Utc::now() + Duration::hours(24);

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

        // Store pairing link in database
        // TODO: Implement database storage

        Ok(AuthCreatePairingCredentialOutput {
            pairing_code,
            pairing_link,
            expires_at: expires_at.to_rfc3339(),
        })
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
        let db = Arc::new(Database::connect(&remi_core::ServerConfig::default()).await.expect("DB connect"));
        let service = AuthService::new(db);
        service.initialize(vec![0u8; 32]).await.expect("Init");

        let password = "test_password";
        let hash = service.hash_password(password).await.expect("Hash");
        assert!(service.verify_password(password, &hash).await.expect("Verify"));
    }
}
