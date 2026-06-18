use crate::state::{AppState, UpdateState};
use std::sync::Arc;

#[test]
fn test_app_state_initial_values() {
    let state = AppState::new();
    assert_eq!(*state.backend_port.read(), 0);
    assert!(state.backend_auth_token.read().is_empty());
    assert!(state.backend_http_url.read().is_empty());
    assert!(state.backend_ws_url.read().is_empty());
    assert!(!*state.is_quitting.read());
    assert!(state.downloaded_bytes.read().is_none());
}

#[test]
fn test_update_state_default() {
    let state = UpdateState::default();
    assert_eq!(state.status, "idle");
    assert!(state.available_version.is_none());
    assert!(state.downloaded_version.is_none());
    assert_eq!(state.download_percent, None);
}

#[test]
fn test_app_state_port_update() {
    let state = AppState::new();
    {
        let mut port = state.backend_port.write();
        *port = 8080;
    }
    assert_eq!(*state.backend_port.read(), 8080);
}

#[test]
fn test_app_state_auth_token_update() {
    let state = AppState::new();
    let token = "test-token-abc123";
    {
        let mut t = state.backend_auth_token.write();
        *t = token.to_string();
    }
    assert_eq!(*state.backend_auth_token.read(), token);
}

#[test]
fn test_app_state_urls_update() {
    let state = AppState::new();
    {
        let mut url = state.backend_http_url.write();
        *url = "http://127.0.0.1:3000".to_string();
    }
    {
        let mut url = state.backend_ws_url.write();
        *url = "ws://127.0.0.1:3000/?token=abc".to_string();
    }
    assert_eq!(*state.backend_http_url.read(), "http://127.0.0.1:3000");
    assert_eq!(*state.backend_ws_url.read(), "ws://127.0.0.1:3000/?token=abc");
}

#[test]
fn test_app_state_is_quitting() {
    let state = AppState::new();
    assert!(!*state.is_quitting.read());
    {
        let mut quitting = state.is_quitting.write();
        *quitting = true;
    }
    assert!(*state.is_quitting.read());
}

#[test]
fn test_app_state_downloaded_bytes() {
    let state = AppState::new();
    assert!(state.downloaded_bytes.read().is_none());
    {
        let mut bytes = state.downloaded_bytes.write();
        *bytes = Some(vec![1, 2, 3, 4]);
    }
    assert_eq!(state.downloaded_bytes.read().as_ref().unwrap().len(), 4);
}

#[test]
fn test_update_state_status_transitions() {
    let state = UpdateState::default();
    assert_eq!(state.status, "idle");

    // Simulate checking
    let mut state = state;
    state.status = "checking".to_string();
    assert_eq!(state.status, "checking");

    // Simulate available
    state.status = "available".to_string();
    state.available_version = Some("1.0.0".to_string());
    assert_eq!(state.available_version, Some("1.0.0".to_string()));

    // Simulate downloading
    state.status = "downloading".to_string();
    state.download_percent = Some(50.0);
    assert_eq!(state.download_percent, Some(50.0));

    // Simulate downloaded
    state.status = "downloaded".to_string();
    state.downloaded_version = Some("1.0.0".to_string());
    state.download_percent = Some(100.0);
    assert_eq!(state.status, "downloaded");
}

#[test]
fn test_app_state_thread_safe() {
    let state = Arc::new(AppState::new());
    let handles: Vec<_> = (0..10)
        .map(|i| {
            let state = state.clone();
            std::thread::spawn(move || {
                let mut port = state.backend_port.write();
                *port = i as u16;
                std::thread::sleep(std::time::Duration::from_millis(1));
                let _ = *port;
            })
        })
        .collect();

    for handle in handles {
        handle.join().unwrap();
    }
}
