//! # 启动访问控制模块
//!
//! 本模块提供服务器启动时的网络访问控制工具，包括：
//! - 通配符主机检测
//! - 回环地址检测
//! - 主机地址格式化（用于 URL 构建）
//! - 监听端口解析
//!
//! 迁移自 Peak Code `apps/server/src/startupAccess.ts`

/// 判断主机地址是否为通配符地址（监听所有网络接口）
///
/// 通配符地址包括：
/// - `0.0.0.0`（IPv4 全监听）
/// - `::` 或 `[::]`（IPv6 全监听）
pub fn is_wildcard_host(host: Option<&str>) -> bool {
    match host {
        None => false,
        Some(h) => h == "0.0.0.0" || h == "::" || h == "[::]",
    }
}

/// 判断主机地址是否为回环地址（仅本机可访问）
///
/// 回环地址包括：
/// - 空字符串或 None（默认回环）
/// - `localhost`
/// - `127.0.0.1`
/// - `::1`
pub fn is_loopback_host(host: Option<&str>) -> bool {
    match host {
        None => true,
        Some(h) => {
            let normalized = if h.starts_with('[') && h.ends_with(']') {
                &h[1..h.len() - 1]
            } else {
                h
            };
            normalized.is_empty()
                || normalized == "localhost"
                || normalized == "127.0.0.1"
                || normalized == "::1"
        }
    }
}

/// 将主机地址格式化为可用于 URL 的形式
///
/// IPv6 地址需要包裹在方括号中，例如 `::1` → `[::1]`
pub fn format_host_for_url(host: &str) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("[{}]", host)
    } else {
        host.to_string()
    }
}

/// 从监听地址中解析端口号
///
/// 当无法从 address 中提取端口时，返回 fallback_port。
pub fn resolve_listening_port(address: &std::net::SocketAddr, _fallback_port: u16) -> u16 {
    address.port()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_wildcard_host() {
        assert!(is_wildcard_host(Some("0.0.0.0")));
        assert!(is_wildcard_host(Some("::")));
        assert!(is_wildcard_host(Some("[::]")));
        assert!(!is_wildcard_host(Some("127.0.0.1")));
        assert!(!is_wildcard_host(Some("localhost")));
        assert!(!is_wildcard_host(None));
    }

    #[test]
    fn test_is_loopback_host() {
        assert!(is_loopback_host(None));
        assert!(is_loopback_host(Some("")));
        assert!(is_loopback_host(Some("localhost")));
        assert!(is_loopback_host(Some("127.0.0.1")));
        assert!(is_loopback_host(Some("::1")));
        assert!(!is_loopback_host(Some("0.0.0.0")));
        assert!(!is_loopback_host(Some("192.168.1.1")));
    }

    #[test]
    fn test_format_host_for_url() {
        assert_eq!(format_host_for_url("127.0.0.1"), "127.0.0.1");
        assert_eq!(format_host_for_url("localhost"), "localhost");
        assert_eq!(format_host_for_url("::1"), "[::1]");
        assert_eq!(format_host_for_url("[::1]"), "[::1]");
        assert_eq!(format_host_for_url("fe80::1"), "[fe80::1]");
    }

    #[test]
    fn test_resolve_listening_port() {
        let addr: std::net::SocketAddr = "127.0.0.1:3773".parse().unwrap();
        assert_eq!(resolve_listening_port(&addr, 8080), 3773);
    }
}
