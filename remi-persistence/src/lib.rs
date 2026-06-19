//! Remi Code 持久化层
//!
//! 本 crate 封装所有数据库访问逻辑，向上层提供面向领域的仓储（Repository）接口，
//! 屏蔽底层 SQLite + sqlx 细节。
//!
//! # 设计原则
//! - **数据库类型**：使用 SQLite（`sqlx` 驱动）作为唯一数据源，便于本地部署。
//! - **PRAGMA 强制开启**：`WAL`（write-ahead log）+ `foreign_keys`，
//!   提升并发读写性能与外键一致性。
//! - **迁移集中**：所有建表与升级 SQL 集中在 [`migrations`] 模块中，保证
//!   开发/测试/生产环境 schema 一致。
//! - **仓储分层**：业务层不直接写 SQL，而是通过 [`repositories`] 中的
//!   `xxx_repo` 模块提供的强类型 API 操作数据。
//!
//! # 模块概览
//! - [`Database`]：连接池封装，负责建立连接、运行迁移、释放资源。
//! - [`migrations`]：内联 SQL 迁移，按版本号顺序执行。
//! - [`repositories`]：业务级仓储（项目、线程、设置、密钥）。

pub mod migrations;
pub mod repositories;

use remi_core::{Error, Result, ServerConfig};
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use tracing::info;

/// 数据库连接池封装
///
/// 通过 `Clone` 共享 `Arc<SqlitePool>`，避免在调用栈上重复 clone 整个池。
#[derive(Debug, Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    /// 创建并初始化数据库连接
    ///
    /// # 流程
    /// 1. 构造 `sqlite://<path>?mode=rwc` URL（`rwc` = 读写 + 创建）。
    /// 2. 用 [`SqlitePoolOptions`] 设置最大连接数（默认 5）。
    /// 3. 显式开启 `PRAGMA journal_mode = WAL` 与 `PRAGMA foreign_keys = ON`。
    ///
    /// # 错误
    /// - 数据库文件不可写：返回 [`Error::Database`]。
    /// - 任意 PRAGMA 失败：返回 [`Error::Database`]。
    pub async fn connect(config: &ServerConfig) -> Result<Self> {
        let database_url = format!("sqlite://{}?mode=rwc", config.db_path.display());

        info!("正在连接数据库: {}", config.db_path.display());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&database_url)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        // region: PRAGMA 设置
        // WAL 模式：读写并发显著提升，崩溃恢复更安全。
        sqlx::query("PRAGMA journal_mode = WAL;")
            .execute(&pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        // 启用外键约束：默认是关闭的，必须显式打开才能保证引用完整性。
        sqlx::query("PRAGMA foreign_keys = ON;")
            .execute(&pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
        // endregion: PRAGMA 设置

        info!("数据库连接成功");

        Ok(Self { pool })
    }

    /// 获取底层 `SqlitePool` 的不可变引用
    ///
    /// 主要在需要自定义 SQL 或事务的高级场景使用；普通业务代码应优先调用仓储。
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    /// 执行数据库迁移
    ///
    /// 内部按版本号顺序运行 [`migrations`] 中所有未执行过的脚本。
    pub async fn run_migrations(&self) -> Result<()> {
        migrations::run_migrations(&self.pool).await
    }

    /// 优雅关闭数据库连接
    ///
    /// 等待在途查询完成后再关闭连接池；通常在服务器优雅停机时调用。
    pub async fn close(&self) {
        self.pool.close().await;
    }
}
