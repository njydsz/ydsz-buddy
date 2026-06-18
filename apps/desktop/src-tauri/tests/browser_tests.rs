use crate::browser::{BrowserManager, BrowserTab, BrowserTabState};

#[test]
fn test_browser_manager_creation() {
    let manager = BrowserManager::new();
    assert!(manager.get_all_tabs().is_empty());
}

#[test]
fn test_browser_tab_state_default() {
    let tab = BrowserTab::new("test-thread".to_string(), "test-tab".to_string());
    assert_eq!(tab.thread_id, "test-thread");
    assert_eq!(tab.tab_id, "test-tab");
    assert_eq!(tab.state, BrowserTabState::Loading);
    assert!(tab.url.is_empty());
    assert!(tab.title.is_empty());
}

#[test]
fn test_browser_manager_get_tab() {
    let manager = BrowserManager::new();
    let tab = BrowserTab::new("thread-1".to_string(), "tab-1".to_string());
    
    manager.insert_tab(tab);
    
    let retrieved = manager.get_tab("thread-1", "tab-1");
    assert!(retrieved.is_some());
    let retrieved = retrieved.unwrap();
    assert_eq!(retrieved.thread_id, "thread-1");
    assert_eq!(retrieved.tab_id, "tab-1");
}

#[test]
fn test_browser_manager_remove_tab() {
    let manager = BrowserManager::new();
    let tab = BrowserTab::new("thread-1".to_string(), "tab-1".to_string());
    
    manager.insert_tab(tab);
    assert!(manager.get_tab("thread-1", "tab-1").is_some());
    
    manager.remove_tab("thread-1", "tab-1");
    assert!(manager.get_tab("thread-1", "tab-1").is_none());
}

#[test]
fn test_browser_manager_get_all_tabs_for_thread() {
    let manager = BrowserManager::new();
    
    let tab1 = BrowserTab::new("thread-1".to_string(), "tab-1".to_string());
    let tab2 = BrowserTab::new("thread-1".to_string(), "tab-2".to_string());
    let tab3 = BrowserTab::new("thread-2".to_string(), "tab-3".to_string());
    
    manager.insert_tab(tab1);
    manager.insert_tab(tab2);
    manager.insert_tab(tab3);
    
    let thread1_tabs = manager.get_tabs_for_thread("thread-1");
    assert_eq!(thread1_tabs.len(), 2);
    
    let thread2_tabs = manager.get_tabs_for_thread("thread-2");
    assert_eq!(thread2_tabs.len(), 1);
}

#[test]
fn test_browser_tab_state_transitions() {
    let mut tab = BrowserTab::new("thread-1".to_string(), "tab-1".to_string());
    
    assert_eq!(tab.state, BrowserTabState::Loading);
    
    tab.state = BrowserTabState::Ready;
    assert_eq!(tab.state, BrowserTabState::Ready);
    
    tab.state = BrowserTabState::Error("Failed to load".to_string());
    match &tab.state {
        BrowserTabState::Error(msg) => assert_eq!(msg, "Failed to load"),
        _ => panic!("Expected Error state"),
    }
}

#[test]
fn test_browser_tab_url_update() {
    let mut tab = BrowserTab::new("thread-1".to_string(), "tab-1".to_string());
    
    tab.url = "https://example.com".to_string();
    assert_eq!(tab.url, "https://example.com");
    
    tab.url = "https://test.com".to_string();
    assert_eq!(tab.url, "https://test.com");
}

#[test]
fn test_browser_tab_title_update() {
    let mut tab = BrowserTab::new("thread-1".to_string(), "tab-1".to_string());
    
    tab.title = "Example Domain".to_string();
    assert_eq!(tab.title, "Example Domain");
}

#[test]
fn test_browser_manager_clear_thread_tabs() {
    let manager = BrowserManager::new();
    
    let tab1 = BrowserTab::new("thread-1".to_string(), "tab-1".to_string());
    let tab2 = BrowserTab::new("thread-1".to_string(), "tab-2".to_string());
    
    manager.insert_tab(tab1);
    manager.insert_tab(tab2);
    
    assert_eq!(manager.get_tabs_for_thread("thread-1").len(), 2);
    
    manager.clear_thread_tabs("thread-1");
    assert_eq!(manager.get_tabs_for_thread("thread-1").len(), 0);
}
