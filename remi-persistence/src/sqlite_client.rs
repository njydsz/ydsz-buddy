//! SQLite 客户端封装模块
//!
//! 本模块提供了一个线程安全的 SQLite 客户端封装，基于 `rusqlite` 库实现。
//! 主要功能包括：
//! - 数据库连接管理（使用 `Arc<Mutex<Connection>>` 保证线程安全）
//! - SQL 语句执行（单条和批量）
//! - 数据查询（单行和多行）
//! - 事务支持
//! - 自动启用 WAL 模式以优化并发读性能
//!
//! # 设计说明
//!
//! 由于 SQLite 是文件级数据库，写操作会阻塞其他写者，因此使用互斥锁保护连接。
//! 通过 `Arc` 实现客户端的克隆和共享，适合在多线程环境中使用。

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::error::{PersistenceError, PersistenceResult};

/// SQLite 客户端封装
///
/// 提供对 SQLite 数据库的线程安全访问。内部使用 `Arc<Mutex<Connection>>` 管理数据库连接，
/// 支持克隆并在多个线程间共享同一个数据库连接。
///
/// # 线程安全
///
/// 通过互斥锁保证同一时刻只有一个线程能访问数据库连接，避免数据竞争。
/// 使用 `Arc` 实现引用计数，允许多个所有者共享同一个连接。
///
/// # 示例
///
/// ```rust
/// let client = SqliteClient::new(Path::new("/path/to/db.sqlite"))?;
/// client.execute("CREATE TABLE test (id INTEGER PRIMARY KEY)", &[])?;
/// ```
#[derive(Clone)]
pub struct SqliteClient {
    /// 数据库连接，使用 Arc<Mutex<>> 包装以实现线程安全的共享访问
    conn: Arc<Mutex<Connection>>,
}

impl SqliteClient {
    /// 创建新的 SQLite 客户端实例
    ///
    /// 打开指定路径的 SQLite 数据库文件，并执行以下初始化操作：
    /// 1. 自动创建父目录（如果不存在）
    /// 2. 启用 WAL（Write-Ahead Logging）日志模式，提升并发读性能
    /// 3. 设置同步级别为 NORMAL，平衡性能和数据安全性
    /// 4. 将临时存储设置为内存模式，提升临时表性能
    /// 5. 启用外键约束
    ///
    /// # 参数
    ///
    /// * `db_path` - 数据库文件的路径，如果父目录不存在会自动创建
    ///
    /// # 返回值
    ///
    /// 成功时返回 `SqliteClient` 实例，失败时返回 `PersistenceError`
    ///
    /// # 错误
    ///
    /// - 当目录创建失败时返回 `DatabaseError`
    /// - 当数据库文件打开失败时返回 `DatabaseError`
    /// - 当 PRAGMA 设置失败时返回 `DatabaseError`
    pub fn new(db_path: &Path) -> PersistenceResult<Self> {
        // 确保数据库文件的父目录存在，避免打开文件时因目录不存在而失败
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| PersistenceError::DatabaseError(format!("创建目录失败: {}", e)))?;
        }

        let conn = Connection::open(db_path)?;

        // 启用 WAL 模式提升并发读性能
        // WAL 模式允许读写并发执行，相比默认的 rollback journal 模式有显著的性能提升
        // synchronous=NORMAL 在 WAL 模式下是推荐设置，在保证数据安全的同时提升写入性能
        // temp_store=MEMORY 将临时表和索引存储在内存中，减少磁盘 I/O
        // foreign_keys=ON 启用外键约束检查，确保数据完整性
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA temp_store=MEMORY;
             PRAGMA foreign_keys=ON;",
        )?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// 执行单条 SQL 语句（带参数绑定）
    ///
    /// 用于执行 INSERT、UPDATE、DELETE 等写操作，也支持带返回值的语句。
    /// 使用参数化查询防止 SQL 注入攻击。
    ///
    /// # 参数
    ///
    /// * `sql` - SQL 语句字符串，使用 `?1`, `?2` 等作为参数占位符
    /// * `params` - 参数数组，每个参数必须实现 `rusqlite::ToSql` trait
    ///
    /// # 返回值
    ///
    /// 成功时返回受影响的行数，失败时返回 `PersistenceError`
    ///
    /// # 示例
    ///
    /// ```rust
    /// let affected = client.execute(
    ///     "INSERT INTO users (name, age) VALUES (?1, ?2)",
    ///     &[&"张三", &25],
    /// )?;
    /// ```
    pub fn execute(&self, sql: &str, params: &[&dyn rusqlite::ToSql]) -> PersistenceResult<usize> {
        // 获取互斥锁以独占访问数据库连接
        let conn = self.conn.lock().map_err(|e| {
            PersistenceError::DatabaseError(format!("获取锁失败: {}", e))
        })?;
        let affected = conn.execute(sql, params)?;
        Ok(affected)
    }

    /// 执行批量 SQL 语句
    ///
    /// 用于执行多条 SQL 语句（以分号分隔），典型场景包括：
    /// - 数据库迁移脚本执行
    /// - 批量建表/建索引
    /// - 初始化数据库配置
    ///
    /// # 参数
    ///
    /// * `sql` - 包含一条或多条 SQL 语句的字符串，语句间以分号分隔
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    ///
    /// # 注意
    ///
    /// 批量执行不支持参数绑定，所有值必须直接嵌入 SQL 字符串中。
    /// 批量语句中如果某条失败，后续语句可能不会执行（取决于错误类型）。
    pub fn execute_batch(&self, sql: &str) -> PersistenceResult<()> {
        let conn = self.conn.lock().map_err(|e| {
            PersistenceError::DatabaseError(format!("获取锁失败: {}", e))
        })?;
        conn.execute_batch(sql)?;
        Ok(())
    }

    /// 查询单行数据
    ///
    /// 执行查询语句并期望返回恰好一行数据。如果查询结果为空，将返回 `rusqlite::Error::QueryReturnedNoRows`。
    /// 通过闭包函数处理行数据到目标类型的转换。
    ///
    /// # 参数
    ///
    /// * `sql` - SQL 查询语句，使用 `?1`, `?2` 等作为参数占位符
    /// * `params` - 参数数组
    /// * `f` - 行映射闭包，接收 `&rusqlite::Row` 并返回 `rusqlite::Result<T>`
    ///
    /// # 返回值
    ///
    /// 成功时返回映射后的值 `T`，失败时返回 `PersistenceError`
    ///
    /// # 泛型
    ///
    /// * `T` - 期望返回的值类型
    /// * `F` - 行映射闭包类型
    pub fn query_row<T, F>(&self, sql: &str, params: &[&dyn rusqlite::ToSql], f: F) -> PersistenceResult<T>
    where
        F: FnOnce(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
    {
        let conn = self.conn.lock().map_err(|e| {
            PersistenceError::DatabaseError(format!("获取锁失败: {}", e))
        })?;
        let result = conn.query_row(sql, params, f)?;
        Ok(result)
    }

    /// 查询多行数据
    ///
    /// 执行查询语句并将所有结果行映射为指定类型的集合。
    /// 内部使用预编译语句（prepared statement）提升查询性能。
    ///
    /// # 参数
    ///
    /// * `sql` - SQL 查询语句，使用 `?1`, `?2` 等作为参数占位符
    /// * `params` - 参数数组
    /// * `f` - 行映射闭包，接收 `&rusqlite::Row` 并返回 `rusqlite::Result<T>`
    ///
    /// # 返回值
    ///
    /// 成功时返回包含所有映射结果的 `Vec<T>`，失败时返回 `PersistenceError`
    /// 如果查询无结果，返回空 `Vec`。
    ///
    /// # 泛型
    ///
    /// * `T` - 每行映射后的值类型
    /// * `F` - 行映射闭包类型
    pub fn query_map<T, F>(&self, sql: &str, params: &[&dyn rusqlite::ToSql], f: F) -> PersistenceResult<Vec<T>>
    where
        F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
    {
        let conn = self.conn.lock().map_err(|e| {
            PersistenceError::DatabaseError(format!("获取锁失败: {}", e))
        })?;
        // 预编译 SQL 语句，提升重复查询的性能
        let mut stmt = conn.prepare(sql)?;
        // 执行查询并获取行迭代器
        let rows = stmt.query_map(params, f)?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// 在事务中执行操作
    ///
    /// 开启一个数据库事务，在事务中执行给定的操作闭包。
    /// 如果闭包返回 `Ok`，则自动提交事务；如果返回 `Err`，则自动回滚事务。
    ///
    /// # 参数
    ///
    /// * `f` - 事务操作闭包，接收 `&Connection` 引用并返回 `PersistenceResult<T>`
    ///
    /// # 返回值
    ///
    /// 成功时返回闭包的返回值 `T`，失败时返回 `PersistenceError` 并自动回滚事务
    ///
    /// # 泛型
    ///
    /// * `F` - 事务操作闭包类型
    /// * `T` - 事务操作的返回值类型
    ///
    /// # 注意
    ///
    /// 使用 `unchecked_transaction` 而非 `transaction`，因为锁已经保证了互斥访问。
    pub fn transaction<F, T>(&self, f: F) -> PersistenceResult<T>
    where
        F: FnOnce(&Connection) -> PersistenceResult<T>,
    {
        let conn = self.conn.lock().map_err(|e| {
            PersistenceError::DatabaseError(format!("获取锁失败: {}", e))
        })?;
        // 使用 unchecked_transaction 避免重复检查事务状态（锁已保证互斥）
        let tx = conn.unchecked_transaction()?;
        // 执行事务内的操作
        let result = f(&tx)?;
        // 操作成功，提交事务
        tx.commit()?;
        Ok(result)
    }

    /// 获取最后插入行的 rowid
    ///
    /// 返回最近一次 INSERT 操作生成的 rowid 值。
    /// 常用于获取自增主键的值。
    ///
    /// # 返回值
    ///
    /// 成功时返回最后插入行的 rowid（`i64` 类型），失败时返回 `PersistenceError`
    ///
    /// # 注意
    ///
    /// 如果没有执行过 INSERT 操作，返回值是未定义的。
    /// 此方法应在 INSERT 操作成功后立即调用，避免被其他操作覆盖。
    pub fn last_insert_rowid(&self) -> PersistenceResult<i64> {
        let conn = self.conn.lock().map_err(|e| {
            PersistenceError::DatabaseError(format!("获取锁失败: {}", e))
        })?;
        Ok(conn.last_insert_rowid())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_sqlite_client_creation() {
        let temp_dir = std::env::temp_dir().join("remi-test-sqlite");
        let db_path = temp_dir.join("test.sqlite");
        
        let client = SqliteClient::new(&db_path);
        assert!(client.is_ok());

        // 清理
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_execute_and_query() {
        let temp_dir = std::env::temp_dir().join("remi-test-sqlite-2");
        let db_path = temp_dir.join("test.sqlite");
        
        let client = SqliteClient::new(&db_path).unwrap();
        
        // 创建表
        client.execute_batch("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT NOT NULL)").unwrap();
        
        // 插入数据
        client.execute("INSERT INTO test (name) VALUES (?1)", &[&"test_name"]).unwrap();
        
        // 查询数据
        let name: String = client.query_row(
            "SELECT name FROM test WHERE id = ?1",
            &[&1i64],
            |row| row.get(0),
        ).unwrap();
        
        assert_eq!(name, "test_name");

        // 清理
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
