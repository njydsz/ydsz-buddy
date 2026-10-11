//! # 离座锁定 / 隐私屏 模块（P2-1）
//!
//! 用户离开座位后自动锁定应用并展示隐私屏,防止屏幕被偷窥 / 数据泄露。
//!
//! ## 设计原则
//!
//! - **状态后端独享**：锁定状态、PIN 哈希、阈值都存在 `IdleLockState` 的
//!   `Mutex` 中,多 webview / 多 tab 共享一致视图。
//! - **活动由前端上报**：用户活动(mousemove / keydown)由前端 hook 监听,
//!   通过 `idle_lock_record_activity` 命令通知后端,后端维护 `last_activity_ms`。
//! - **锁定决策在后端**:`lock_now` / `unlock` / `arm` / `disarm` 都由后端
//!   决定,前端只是薄壳,避免被旁路。
//! - **PIN 不明文存储**:PIN 用 FNV-1a 64 + 短 salt 散列后保存(本机本地安全基线,
//!   不是为了对抗 root 用户,只是防止明文泄漏到设置文件)。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `idle_lock_get_state` | 获取当前快照 |
//! | `idle_lock_set_config` | 更新配置(enabled / threshold_secs / privacy_only) |
//! | `idle_lock_arm` | 启动自动锁定(超过阈值自动 lock) |
//! | `idle_lock_disarm` | 关闭自动锁定 |
//! | `idle_lock_now` | 立即锁定(手动触发) |
//! | `idle_lock_unlock` | 用 PIN 解锁 |
//! | `idle_lock_set_pin` | 设置/更新 PIN(首次清空表示未设置) |
//! | `idle_lock_record_activity` | 上报用户活动,刷新 `last_activity_ms` |
//!
//! ## 离座检测策略
//!
//! 本模块本身**不**做 OS 级 idle 探测(macOS CGEventSource / Windows
//! GetLastInputInfo / Linux X11 screensaver),那部分由前端 `useIdleDetector`
//! 钩子在 `requestAnimationFrame` 里统计鼠标/键盘事件,然后通过本模块的
//! `record_activity` 写入后端。后端只在 `last_activity_ms` 距今超过 `threshold_secs`
//! 时自动转 `Locked` 状态(由前端的"轮询"循环触发 `try_auto_lock` 评估)。

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;

/// 默认自动锁定阈值(秒):用户 5 分钟无活动则触发
pub const DEFAULT_THRESHOLD_SECS: u64 = 300;

/// PIN 最短长度
pub const MIN_PIN_LENGTH: usize = 4;
/// PIN 最长长度
pub const MAX_PIN_LENGTH: usize = 32;

/// 锁定状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum LockState {
    /// 未启用
    Disarmed,
    /// 启用,等待离座
    Armed,
    /// 已锁定(展示隐私屏)
    Locked,
}

/// 离座配置
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct IdleLockConfig {
    /// 是否启用自动锁定
    pub enabled: bool,
    /// 离座阈值(秒)
    pub threshold_secs: u64,
    /// 是否仅展示隐私屏(不解锁所有功能)
    pub privacy_only: bool,
}

impl Default for IdleLockConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            threshold_secs: DEFAULT_THRESHOLD_SECS,
            privacy_only: false,
        }
    }
}

/// 锁定快照
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct IdleLockSnapshot {
    /// 当前锁定状态
    pub state: LockState,
    /// 当前配置
    pub config: IdleLockConfig,
    /// 最后一次活动时间(unix ms)
    pub last_activity_ms: i64,
    /// 距今空闲秒数
    pub idle_secs: u64,
    /// 是否设置了 PIN
    pub has_pin: bool,
    /// 锁定开始时间(unix ms;未锁定时为 0)
    pub locked_at_ms: i64,
}

/// 解锁结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct UnlockResult {
    pub ok: bool,
    pub reason: UnlockFailureReason,
}

/// 解锁失败原因
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum UnlockFailureReason {
    /// 成功
    None,
    /// 未设置 PIN(应先 set_pin)
    PinNotSet,
    /// PIN 错误
    PinMismatch,
    /// 当前未锁定
    NotLocked,
}

struct IdleLockInner {
    state: LockState,
    config: IdleLockConfig,
    last_activity_ms: i64,
    pin_hash: Option<String>,
    locked_at_ms: i64,
}

/// 离座锁定状态管理
pub struct IdleLockState {
    inner: Mutex<IdleLockInner>,
}

impl Default for IdleLockState {
    fn default() -> Self {
        Self::new()
    }
}

impl IdleLockState {
    /// 创建新状态
    pub fn new() -> Self {
        let now_ms = current_ms();
        Self {
            inner: Mutex::new(IdleLockInner {
                state: LockState::Disarmed,
                config: IdleLockConfig::default(),
                last_activity_ms: now_ms,
                pin_hash: None,
                locked_at_ms: 0,
            }),
        }
    }

    /// 获取快照
    pub fn snapshot(&self) -> IdleLockSnapshot {
        let g = self.inner.lock().expect("idle lock state poisoned");
        let now = current_ms();
        let idle_secs = if g.last_activity_ms > 0 {
            ((now - g.last_activity_ms).max(0) as u64) / 1000
        } else {
            0
        };
        IdleLockSnapshot {
            state: g.state,
            config: g.config.clone(),
            last_activity_ms: g.last_activity_ms,
            idle_secs,
            has_pin: g.pin_hash.is_some(),
            locked_at_ms: g.locked_at_ms,
        }
    }

    /// 更新配置
    ///
    /// 注意:`enabled` 字段不会直接修改 state;请调用 `arm` / `disarm` 显式切换。
    pub fn set_config(&self, new_config: IdleLockConfig) -> IdleLockSnapshot {
        let mut g = self.inner.lock().expect("idle lock state poisoned");
        g.config = new_config;
        // 阈值变小后,可能需要立即锁定
        if g.state == LockState::Armed {
            let now = current_ms();
            let idle_secs = ((now - g.last_activity_ms).max(0) as u64) / 1000;
            if idle_secs >= g.config.threshold_secs {
                g.state = LockState::Locked;
                g.locked_at_ms = now;
            }
        }
        self.snapshot()
    }

    /// 启动自动锁定
    pub fn arm(&self) -> IdleLockSnapshot {
        let mut g = self.inner.lock().expect("idle lock state poisoned");
        g.state = LockState::Armed;
        g.config.enabled = true;
        self.snapshot()
    }

    /// 关闭自动锁定
    ///
    /// 如果已锁定,会同时解锁(因为已不再监控)。
    pub fn disarm(&self) -> IdleLockSnapshot {
        let mut g = self.inner.lock().expect("idle lock state poisoned");
        g.state = LockState::Disarmed;
        g.config.enabled = false;
        // 已锁定的状态下 disarm 应该一并解锁
        if g.locked_at_ms > 0 {
            g.locked_at_ms = 0;
        }
        self.snapshot()
    }

    /// 立即锁定
    pub fn lock_now(&self) -> IdleLockSnapshot {
        let mut g = self.inner.lock().expect("idle lock state poisoned");
        let now = current_ms();
        g.state = LockState::Locked;
        g.locked_at_ms = now;
        g.last_activity_ms = now;
        self.snapshot()
    }

    /// 评估是否需要自动锁定
    ///
    /// 由前端 idle 检测循环每 1s 调用一次,检查是否到阈值。
    /// 仅在 `state == Armed` 时生效。
    pub fn try_auto_lock(&self) -> IdleLockSnapshot {
        let mut g = self.inner.lock().expect("idle lock state poisoned");
        if g.state == LockState::Armed {
            let now = current_ms();
            let idle_secs = ((now - g.last_activity_ms).max(0) as u64) / 1000;
            if idle_secs >= g.config.threshold_secs {
                g.state = LockState::Locked;
                g.locked_at_ms = now;
            }
        }
        self.snapshot()
    }

    /// 用 PIN 解锁
    pub fn unlock(&self, pin: &str) -> UnlockResult {
        let mut g = self.inner.lock().expect("idle lock state poisoned");
        if g.state != LockState::Locked {
            return UnlockResult {
                ok: false,
                reason: UnlockFailureReason::NotLocked,
            };
        }
        let Some(expected) = g.pin_hash.as_ref() else {
            return UnlockResult {
                ok: false,
                reason: UnlockFailureReason::PinNotSet,
            };
        };
        if !verify_pin(pin, expected) {
            return UnlockResult {
                ok: false,
                reason: UnlockFailureReason::PinMismatch,
            };
        }
        // 解锁成功
        g.state = if g.config.enabled {
            LockState::Armed
        } else {
            LockState::Disarmed
        };
        g.locked_at_ms = 0;
        g.last_activity_ms = current_ms();
        UnlockResult {
            ok: true,
            reason: UnlockFailureReason::None,
        }
    }

    /// 设置 / 更新 PIN
    ///
    /// - `pin` 为空字符串:清除 PIN
    /// - `pin` 长度必须在 [MIN_PIN_LENGTH, MAX_PIN_LENGTH]
    pub fn set_pin(&self, pin: &str) -> Result<IdleLockSnapshot, String> {
        let mut g = self.inner.lock().expect("idle lock state poisoned");
        if pin.is_empty() {
            g.pin_hash = None;
        } else {
            if pin.len() < MIN_PIN_LENGTH {
                return Err(format!("PIN 至少 {MIN_PIN_LENGTH} 位"));
            }
            if pin.len() > MAX_PIN_LENGTH {
                return Err(format!("PIN 最多 {MAX_PIN_LENGTH} 位"));
            }
            g.pin_hash = Some(hash_pin(pin));
        }
        Ok(self.snapshot())
    }

    /// 记录用户活动
    pub fn record_activity(&self) -> IdleLockSnapshot {
        let mut g = self.inner.lock().expect("idle lock state poisoned");
        let now = current_ms();
        // 已锁定状态下,记录活动不刷新 last_activity(避免 unlock 后立即误判为活动)
        if g.state == LockState::Locked {
            return self.snapshot();
        }
        g.last_activity_ms = now;
        self.snapshot()
    }
}

/// 读取当前 unix 毫秒
fn current_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 短 salt(明文常量),仅用于防明文落盘;不是用于抗破解。
const PIN_SALT: &str = "2. 环境变量 YDSZ_BOOTSTRAP_TOKEN-idle-lock-v1";

/// 计算 PIN 散列
///
/// 使用 FNV-1a 64 + 常量 salt,转 16 进制字符串。简单稳定,不依赖外部 crate。
pub fn hash_pin(pin: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    let mut buf = String::with_capacity(PIN_SALT.len() + pin.len());
    buf.push_str(PIN_SALT);
    buf.push_str(pin);
    for byte in buf.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

/// 校验 PIN
pub fn verify_pin(pin: &str, expected: &str) -> bool {
    hash_pin(pin) == expected
}

// ==================== Tauri 命令 ====================

/// 获取当前离座锁定快照
#[tauri::command]
#[specta::specta]
pub async fn idle_lock_get_state(state: State<'_, IdleLockState>) -> Result<IdleLockSnapshot, String> {
    Ok(state.snapshot())
}

/// 更新配置
#[tauri::command]
#[specta::specta]
pub async fn idle_lock_set_config(
    config: IdleLockConfig,
    state: State<'_, IdleLockState>,
) -> Result<IdleLockSnapshot, String> {
    Ok(state.set_config(config))
}

/// 启动自动锁定
#[tauri::command]
#[specta::specta]
pub async fn idle_lock_arm(state: State<'_, IdleLockState>) -> Result<IdleLockSnapshot, String> {
    Ok(state.arm())
}

/// 关闭自动锁定
#[tauri::command]
#[specta::specta]
pub async fn idle_lock_disarm(state: State<'_, IdleLockState>) -> Result<IdleLockSnapshot, String> {
    Ok(state.disarm())
}

/// 立即锁定
#[tauri::command]
#[specta::specta]
pub async fn idle_lock_now(state: State<'_, IdleLockState>) -> Result<IdleLockSnapshot, String> {
    Ok(state.lock_now())
}

/// 解锁
#[tauri::command]
#[specta::specta]
pub async fn idle_lock_unlock(pin: String, state: State<'_, IdleLockState>) -> Result<UnlockResult, String> {
    Ok(state.unlock(&pin))
}

/// 设置 / 更新 PIN
#[tauri::command]
#[specta::specta]
pub async fn idle_lock_set_pin(
    pin: String,
    state: State<'_, IdleLockState>,
) -> Result<IdleLockSnapshot, String> {
    state.set_pin(&pin)
}

/// 上报用户活动
#[tauri::command]
#[specta::specta]
pub async fn idle_lock_record_activity(state: State<'_, IdleLockState>) -> Result<IdleLockSnapshot, String> {
    Ok(state.record_activity())
}

/// 前端每 1s 调一次,后端在 `Armed` 状态下判断是否需要 lock
#[tauri::command]
#[specta::specta]
pub async fn idle_lock_tick(state: State<'_, IdleLockState>) -> Result<IdleLockSnapshot, String> {
    Ok(state.try_auto_lock())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_state_is_disarmed() {
        let s = IdleLockState::new();
        let snap = s.snapshot();
        assert_eq!(snap.state, LockState::Disarmed);
        assert!(!snap.config.enabled);
        assert_eq!(snap.config.threshold_secs, DEFAULT_THRESHOLD_SECS);
        assert!(!snap.config.privacy_only);
        assert!(!snap.has_pin);
        assert_eq!(snap.locked_at_ms, 0);
    }

    #[test]
    fn arm_sets_state_armed_and_enables_config() {
        let s = IdleLockState::new();
        let snap = s.arm();
        assert_eq!(snap.state, LockState::Armed);
        assert!(snap.config.enabled);
    }

    #[test]
    fn disarm_disables_and_unlocks() {
        let s = IdleLockState::new();
        s.arm();
        s.lock_now();
        let snap = s.snapshot();
        assert_eq!(snap.state, LockState::Locked);
        assert!(snap.locked_at_ms > 0);

        let snap2 = s.disarm();
        assert_eq!(snap2.state, LockState::Disarmed);
        assert!(!snap2.config.enabled);
        assert_eq!(snap2.locked_at_ms, 0);
    }

    #[test]
    fn set_pin_validates_length() {
        let s = IdleLockState::new();
        assert!(s.set_pin("").is_ok()); // 清空是允许的
        let snap = s.snapshot();
        assert!(!snap.has_pin);

        let too_short = s.set_pin("ab");
        assert!(too_short.is_err());

        let ok = s.set_pin("1234");
        assert!(ok.is_ok());
        let snap = s.snapshot();
        assert!(snap.has_pin);
    }

    #[test]
    fn unlock_with_correct_pin_succeeds() {
        let s = IdleLockState::new();
        s.arm();
        s.lock_now();
        s.set_pin("1234").unwrap();

        let r = s.unlock("1234");
        assert!(r.ok);
        assert_eq!(r.reason, UnlockFailureReason::None);

        let snap = s.snapshot();
        // 解锁后回到 Armed(因为 config.enabled = true)
        assert_eq!(snap.state, LockState::Armed);
        assert_eq!(snap.locked_at_ms, 0);
    }

    #[test]
    fn unlock_with_wrong_pin_fails() {
        let s = IdleLockState::new();
        s.arm();
        s.lock_now();
        s.set_pin("1234").unwrap();

        let r = s.unlock("9999");
        assert!(!r.ok);
        assert_eq!(r.reason, UnlockFailureReason::PinMismatch);

        // 仍然锁定
        assert_eq!(s.snapshot().state, LockState::Locked);
    }

    #[test]
    fn unlock_without_pin_fails() {
        let s = IdleLockState::new();
        s.arm();
        s.lock_now();

        let r = s.unlock("1234");
        assert!(!r.ok);
        assert_eq!(r.reason, UnlockFailureReason::PinNotSet);
    }

    #[test]
    fn unlock_when_not_locked_fails() {
        let s = IdleLockState::new();
        s.arm();
        s.set_pin("1234").unwrap();

        let r = s.unlock("1234");
        assert!(!r.ok);
        assert_eq!(r.reason, UnlockFailureReason::NotLocked);
    }

    #[test]
    fn record_activity_refreshes_timestamp_in_armed() {
        let s = IdleLockState::new();
        s.arm();
        let initial = s.snapshot();
        // 立刻 record_activity
        s.record_activity();
        let after = s.snapshot();
        assert!(after.last_activity_ms >= initial.last_activity_ms);
    }

    #[test]
    fn record_activity_doesnt_refresh_when_locked() {
        let s = IdleLockState::new();
        s.arm();
        s.lock_now();
        let locked = s.snapshot();
        s.record_activity();
        let after = s.snapshot();
        // 锁定状态下不刷新
        assert_eq!(after.last_activity_ms, locked.last_activity_ms);
    }

    #[test]
    fn try_auto_lock_does_nothing_in_disarmed() {
        let s = IdleLockState::new();
        // 即使阈值是 0 也不应锁定
        s.set_config(IdleLockConfig {
            enabled: false,
            threshold_secs: 0,
            privacy_only: false,
        });
        let snap = s.try_auto_lock();
        assert_eq!(snap.state, LockState::Disarmed);
    }

    #[test]
    fn try_auto_lock_triggers_when_idle_exceeds_threshold() {
        let s = IdleLockState::new();
        s.set_config(IdleLockConfig {
            enabled: true,
            threshold_secs: 0, // 立即触发
            privacy_only: false,
        });
        s.arm();
        // 把 last_activity_ms 写到很久之前
        {
            let mut g = s.inner.lock().unwrap();
            g.last_activity_ms = current_ms() - 10_000;
        }
        let snap = s.try_auto_lock();
        assert_eq!(snap.state, LockState::Locked);
        assert!(snap.locked_at_ms > 0);
    }

    #[test]
    fn set_config_shrinks_threshold_auto_locks() {
        let s = IdleLockState::new();
        s.arm();
        // 假装用户已经空闲 100 秒
        {
            let mut g = s.inner.lock().unwrap();
            g.last_activity_ms = current_ms() - 100_000;
        }
        // 把阈值设为 10s
        s.set_config(IdleLockConfig {
            enabled: true,
            threshold_secs: 10,
            privacy_only: false,
        });
        // 设置后状态应自动转为 Locked
        let snap = s.snapshot();
        assert_eq!(snap.state, LockState::Locked);
    }

    #[test]
    fn lock_now_sets_locked_at_and_activity() {
        let s = IdleLockState::new();
        s.arm();
        // 先把活动戳往前调
        {
            let mut g = s.inner.lock().unwrap();
            g.last_activity_ms = current_ms() - 50_000;
        }
        s.lock_now();
        let snap = s.snapshot();
        assert_eq!(snap.state, LockState::Locked);
        // lock_now 会刷新 last_activity_ms 到当前
        assert!(snap.last_activity_ms >= current_ms() - 1000);
    }

    #[test]
    fn hash_pin_is_deterministic() {
        assert_eq!(hash_pin("1234"), hash_pin("1234"));
        assert_ne!(hash_pin("1234"), hash_pin("12345"));
    }

    #[test]
    fn verify_pin_matches_hash() {
        let h = hash_pin("hello");
        assert!(verify_pin("hello", &h));
        assert!(!verify_pin("world", &h));
    }

    #[test]
    fn snapshot_idle_secs_reasonable() {
        let s = IdleLockState::new();
        // 初始应该 idle_secs 很小(刚启动)
        let snap = s.snapshot();
        assert!(snap.idle_secs <= 5);
    }

    #[test]
    fn default_threshold_is_five_minutes() {
        // 大厂基线:默认 5 分钟无活动自动锁,平衡安全与体验
        assert_eq!(DEFAULT_THRESHOLD_SECS, 300);
    }

    #[test]
    fn lock_state_serialization_snake_case() {
        for (state, expected) in [
            (LockState::Disarmed, "\"disarmed\""),
            (LockState::Armed, "\"armed\""),
            (LockState::Locked, "\"locked\""),
        ] {
            let s = serde_json::to_string(&state).unwrap();
            assert_eq!(s, expected, "state {state:?}");
        }
    }

    #[test]
    fn unlock_failure_reason_serialization_snake_case() {
        for (r, expected) in [
            (UnlockFailureReason::None, "\"none\""),
            (UnlockFailureReason::PinNotSet, "\"pin_not_set\""),
            (UnlockFailureReason::PinMismatch, "\"pin_mismatch\""),
            (UnlockFailureReason::NotLocked, "\"not_locked\""),
        ] {
            let s = serde_json::to_string(&r).unwrap();
            assert_eq!(s, expected, "reason {r:?}");
        }
    }

    #[test]
    fn set_pin_too_long_rejected() {
        let s = IdleLockState::new();
        let too_long = "x".repeat(MAX_PIN_LENGTH + 1);
        assert!(s.set_pin(&too_long).is_err());
    }

    #[test]
    fn disarm_when_disarmed_is_noop() {
        let s = IdleLockState::new();
        let snap = s.disarm();
        assert_eq!(snap.state, LockState::Disarmed);
        assert!(!snap.config.enabled);
    }

    #[test]
    fn unlock_rearms_when_config_enabled() {
        let s = IdleLockState::new();
        s.arm();
        s.set_pin("1234").unwrap();
        s.lock_now();
        s.unlock("1234");
        // 因为 arm 时 enabled=true,unlock 后应回到 Armed
        assert_eq!(s.snapshot().state, LockState::Armed);
    }

    #[test]
    fn unlock_back_to_disarmed_when_disabled() {
        let s = IdleLockState::new();
        // 先 arm 然后 disarm,但再 lock_now(模拟手动锁屏)
        s.arm();
        s.disarm();
        s.lock_now();
        s.set_pin("1234").unwrap();
        s.unlock("1234");
        // 之前已经 disarm,config.enabled=false,unlock 后应回 Disarmed
        assert_eq!(s.snapshot().state, LockState::Disarmed);
    }
}
