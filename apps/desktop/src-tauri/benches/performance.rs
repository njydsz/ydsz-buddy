use criterion::{black_box, criterion_group, criterion_main, Criterion};
use remi_code_desktop_lib::browser::BrowserManager;
use remi_code_desktop_lib::state::AppState;
use std::sync::Arc;

fn benchmark_browser_state_operations(c: &mut Criterion) {
    let manager = BrowserManager::new();
    let state = Arc::new(AppState::new());
    
    c.bench_function("browser_create_thread_state", |b| {
        b.iter(|| {
            let _ = manager.create_thread_state(black_box("test-thread-1"));
        })
    });
    
    c.bench_function("browser_get_state", |b| {
        b.iter(|| {
            let _ = manager.get_state(black_box("test-thread-1"));
        })
    });
}

fn benchmark_state_lock_operations(c: &mut Criterion) {
    let state = Arc::new(AppState::new());
    
    c.bench_function("state_write_read_cycle", |b| {
        b.iter(|| {
            {
                let mut port = state.backend_port.write();
                *port = black_box(8080);
            }
            {
                let port = state.backend_port.read();
                let _ = *port;
            }
        })
    });
}

criterion_group!(
    benches,
    benchmark_browser_state_operations,
    benchmark_state_lock_operations
);
criterion_main!(benches);
