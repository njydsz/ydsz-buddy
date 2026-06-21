//! # 配对码生成器
//!
//! 本模块提供安全的配对码生成功能，用于客户端与服务端之间的配对流程。
//!
//! ## 设计特点
//!
//! - **12 位长度**: 提供足够的熵值，防止暴力破解
//! - **自定义字母表**: 使用 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`
//!   - 去除易混淆字符：`0`、`1`、`I`、`O`
//!   - 避免视觉识别错误
//! - **密码学安全**: 使用 `rand::rngs::OsRng` 生成随机数
//!
//! ## 使用示例
//!
//!```rust,ignore
//! use remi_auth::generate_pairing_code;
//!
//! let code = generate_pairing_code();
//! assert_eq!(code.len(), 12);
//! ```

use rand::Rng;
use rand::rngs::OsRng;

/// 配对码长度
const PAIRING_CODE_LENGTH: usize = 12;

/// 自定义字母表（去除易混淆字符 0/1/I/O）
const PAIRING_CODE_ALPHABET: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/// 生成配对码
///
/// 生成一个 12 位的配对码，使用自定义字母表（去除易混淆字符）。
///
/// ## 返回值
///
/// 返回一个 12 位的配对码字符串。
///
/// ## 示例
///
///```rust,ignore
/// use remi_auth::generate_pairing_code;
///
/// let code = generate_pairing_code();
/// println!('Generated pairing code: {}', code);
/// ```
pub fn generate_pairing_code() -> String {
    let mut rng = OsRng;
    let alphabet_len = PAIRING_CODE_ALPHABET.len() as u8;
    
    (0..PAIRING_CODE_LENGTH)
        .map(|_| {
            let idx = rng.gen_range(0..alphabet_len);
            PAIRING_CODE_ALPHABET[idx as usize] as char
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_pairing_code_length() {
        let code = generate_pairing_code();
        assert_eq!(code.len(), PAIRING_CODE_LENGTH);
    }

    #[test]
    fn test_generate_pairing_code_characters() {
        let code = generate_pairing_code();
        for ch in code.chars() {
            assert!(
                PAIRING_CODE_ALPHABET.contains(&(ch as u8)),
                "Character {} is not in alphabet",
                ch
            );
        }
    }

    #[test]
    fn test_generate_pairing_code_no_confusing_chars() {
        // 生成多个配对码，确保不包含易混淆字符
        for _ in 0..100 {
            let code = generate_pairing_code();
            assert!(!code.contains('0'), "Code contains confusing char '0'");
            assert!(!code.contains('1'), "Code contains confusing char '1'");
            assert!(!code.contains('I'), "Code contains confusing char 'I'");
            assert!(!code.contains('O'), "Code contains confusing char 'O'");
        }
    }

    #[test]
    fn test_generate_pairing_code_uniqueness() {
        // 生成多个配对码，确保不重复
        let mut codes = std::collections::HashSet::new();
        for _ in 0..1000 {
            let code = generate_pairing_code();
            assert!(codes.insert(code), "Generated duplicate pairing code");
        }
    }
}
