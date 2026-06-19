//! Persistence layer for Remi Code.
//!
//! This crate handles all database operations using SQLite via sqlx.

pub mod migrations;
pub mod repositories;

use remi_core::{Error, Result, ServerConfig};
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use tracing::info;

/// Database connection pool.
#[derive(Debug, Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    /// Create a new database connection.
    pub async fn connect(config: &ServerConfig) -> Result<Self> {
        let database_url = format!("sqlite://{}?mode=rwc", config.db_path.display());

        info!("Connecting to database at {}", config.db_path.display());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&database_url)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        // Set pragmas
        sqlx::query("PRAGMA journal_mode = WAL;")
            .execute(&pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        sqlx::query("PRAGMA foreign_keys = ON;")
            .execute(&pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        info!("Database connected successfully");

        Ok(Self { pool })
    }

    /// Get a reference to the connection pool.
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    /// Run migrations.
    pub async fn run_migrations(&self) -> Result<()> {
        migrations::run_migrations(&self.pool).await
    }

    /// Close the database connection.
    pub async fn close(&self) {
        self.pool.close().await;
    }
}
