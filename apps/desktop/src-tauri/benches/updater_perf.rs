use criterion::{black_box, criterion_group, criterion_main, Criterion};
use remi_code_desktop_lib::updater::UpdaterManager;
use remi_code_desktop_lib::state::AppState;
use std::sync::Arc;

fn benchmark_update_state_operations(c: &mut Criterion) {
    let state = Arc::new(AppState::new());
    
    c.bench_function("update_state_write_read", |b| {
        b.iter(|| {
            {
                let mut update_state = state.update_state.write();
                update_state.status = black_box("checking".to_string());
                update_state.available_version = Some(black_box("1.0.0".to_string()));
            }
            {
                let update_state = state.update_state.read();
                let _ = update_state.status.clone();
            }
        })
    });
}

fn benchmark_auth_token_operations(c: &mut Criterion) {
    let state = Arc::new(AppState::new());
    
    c.bench_function("auth_token_write_read", |b| {
        b.iter(|| {
            {
                let mut token = state.backend_auth_token.write();
                *token = black_box("test-token-12345".to_string());
            }
            {
                let token = state.backend_auth_token.read();
                let _ = token.clone();
            }
        })
    });
}

criterion_group!(
    benches,
    benchmark_update_state_operations,
    benchmark_auth_token_operations
);
criterion_main!(benches);
