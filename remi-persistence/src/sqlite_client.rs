//! SQLite 客户端封装

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::error::{PersistenceError, PersistenceResult};

/// SQLite 客户端
#[derive(Clone)]
pub struct SqliteClient {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteClient {
    /// 创建新的 SQLite 客户端
    pub fn new(db_path: &Path) -> PersistenceResult<Self> {
        // 确保父目录存在
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| PersistenceError::DatabaseError(format!("创建目录失败: {}", e)))?;
        }

        let conn = Connection::open(db_path)?;

        // 启用 WAL 模式提升并发读性能
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

    /// 执行 SQL 语句
    pub fn execute(&self, sql: &str, params: &[&dyn rusqlite::ToSql]) -> PersistenceResult<usize> {
        let conn = self.conn.lock().map_err(|e| {
            PersistenceError::DatabaseError(format!("获取锁失败: {}", e))
        })?;
        let affected = conn.execute(sql, params)?;
        Ok(affected)
    }

    /// 执行批量 SQL
    pub fn execute_batch(&self, sql: &str) -> PersistenceResult<()> {
        let conn = self.conn.lock().map_err(|e| {
            PersistenceError::DatabaseError(format!("获取锁失败: {}", e))
        })?;
        conn.execute_batch(sql)?;
        Ok(())
    }

    /// 查询单行
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

    /// 查询多行
    pub fn query_map<T, F>(&self, sql: &str, params: &[&dyn rusqlite::ToSql], f: F) -> PersistenceResult<Vec<T>>
    where
        F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
    {
        let conn = self.conn.lock().map_err(|e| {
            PersistenceError::DatabaseError(format!("获取锁失败: {}", e))
        })?;
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params, f)?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// 事务
    pub fn transaction<F, T>(&self, f: F) -> PersistenceResult<T>
    where
        F: FnOnce(&Connection) -> PersistenceResult<T>,
    {
        let conn = self.conn.lock().map_err(|e| {
            PersistenceError::DatabaseError(format!("获取锁失败: {}", e))
        })?;
        let tx = conn.unchecked_transaction()?;
        let result = f(&tx)?;
        tx.commit()?;
        Ok(result)
    }

    /// 获取最后插入的 rowid
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
