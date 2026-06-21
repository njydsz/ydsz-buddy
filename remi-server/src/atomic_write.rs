//! # 原子文件写入模块
//!
//! 本模块提供原子文件写入功能，通过'先写临时文件再重命名'的方式，
//! 确保写入操作要么完全成功，要么完全不生效，避免写入中断导致数据损坏。
//!
//! 迁移自 Peak Code `apps/server/src/atomicWrite.ts`

use std::io;
use std::path::Path;

/// 原子性地将字符串内容写入文件
///
/// 实现方式：
/// 1. 创建目标文件的父目录（如果不存在）
/// 2. 将内容写入临时文件（`{filePath}.{pid}.{timestamp}.tmp`）
/// 3. 将临时文件重命名为目标文件（原子操作）
///
/// 如果在写入过程中发生错误，临时文件不会影响目标文件。
pub fn write_file_string_atomically(file_path: &Path, contents: &str) -> io::Result<()> {
    let pid = std::process::id();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    let temp_file_name = format!("{}.{}.{}.tmp", file_name, pid, timestamp);
    let temp_path = if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)?;
        parent.join(&temp_file_name)
    } else {
        Path::new(&temp_file_name).to_path_buf()
    };

    // 写入临时文件
    std::fs::write(&temp_path, contents)?;

    // 原子重命名
    std::fs::rename(&temp_path, file_path)?;

    Ok(())
}

/// 原子性地将字节内容写入文件
pub fn write_file_bytes_atomically(file_path: &Path, contents: &[u8]) -> io::Result<()> {
    let pid = std::process::id();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    let temp_file_name = format!("{}.{}.{}.tmp", file_name, pid, timestamp);
    let temp_path = if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)?;
        parent.join(&temp_file_name)
    } else {
        Path::new(&temp_file_name).to_path_buf()
    };

    // 写入临时文件
    std::fs::write(&temp_path, contents)?;

    // 原子重命名
    std::fs::rename(&temp_path, file_path)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn test_atomic_write_string() {
        let dir = std::env::temp_dir().join("remi-atomic-write-test");
        let file_path = dir.join("test.txt");

        // 清理
        let _ = std::fs::remove_dir_all(&dir);

        write_file_string_atomically(&file_path, "hello world").unwrap();

        let mut contents = String::new();
        std::fs::File::open(&file_path)
            .unwrap()
            .read_to_string(&mut contents)
            .unwrap();
        assert_eq!(contents, "hello world");

        // 验证没有遗留临时文件
        let entries: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(entries.len(), 1);

        // 清理
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_atomic_write_bytes() {
        let dir = std::env::temp_dir().join("remi-atomic-write-test-bytes");
        let file_path = dir.join("test.bin");

        let _ = std::fs::remove_dir_all(&dir);

        write_file_bytes_atomically(&file_path, &[0x00, 0x01, 0x02, 0x03]).unwrap();

        let contents = std::fs::read(&file_path).unwrap();
        assert_eq!(contents, vec![0x00, 0x01, 0x02, 0x03]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_atomic_write_overwrite() {
        let dir = std::env::temp_dir().join("remi-atomic-write-test-overwrite");
        let file_path = dir.join("overwrite.txt");

        let _ = std::fs::remove_dir_all(&dir);

        write_file_string_atomically(&file_path, "first").unwrap();
        write_file_string_atomically(&file_path, "second").unwrap();

        let mut contents = String::new();
        std::fs::File::open(&file_path)
            .unwrap()
            .read_to_string(&mut contents)
            .unwrap();
        assert_eq!(contents, "second");

        let _ = std::fs::remove_dir_all(&dir);
    }
}