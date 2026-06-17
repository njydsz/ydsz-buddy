# Remi Code Rust Backend Development Guide

This guide covers the Rust backend architecture and development practices.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Crate Structure](#crate-structure)
3. [Development Workflow](#development-workflow)
4. [Testing Strategy](#testing-strategy)
5. [Performance Guidelines](#performance-guidelines)
6. [Common Patterns](#common-patterns)

## Architecture Overview

The Rust backend follows a layered architecture:

```
┌─────────────────────────────────────┐
│         remi-server (Binary)        │
├─────────────────────────────────────┤
│  remi-orchestration (Event Sourcing)│
├─────────────────────────────────────┤
│ remi-providers │ remi-auth │ remi-pty│
├─────────────────────────────────────┤
│ remi-git │ remi-workspace │ remi-rpc│
├─────────────────────────────────────┤
│      remi-persistence (SQLite)      │
├─────────────────────────────────────┤
│  remi-contracts │    remi-core      │
└─────────────────────────────────────┘
```

### Key Principles

1. **Separation of Concerns**: Each crate has a single responsibility
2. **Dependency Injection**: Services are injected via traits
3. **Error Handling**: Use `thiserror` for domain errors
4. **Async First**: All I/O operations are async using Tokio
5. **Type Safety**: Leverage Rust's type system for correctness

## Crate Structure

### remi-core

Core types and utilities shared across all crates.

**Responsibilities:**
- Configuration management
- Error types
- Common types (ThreadId, ProjectId, etc.)

**Key Types:**
```rust
pub struct ServerConfig { ... }
pub enum Error { ... }
pub type Result<T, E = Error> = std::result::Result<T, E>;
```

### remi-contracts

Schema definitions and RPC protocol. This is the **single source of truth** for all data types.

**Responsibilities:**
- Define all request/response types
- Define RPC methods
- Generate JSON Schema for TypeScript interop

**Key Types:**
```rust
pub enum RpcMethod { ... }
pub enum RpcResponse { ... }
pub struct Thread { ... }
```

### remi-persistence

Database layer using SQLite via sqlx.

**Responsibilities:**
- Database connection management
- Schema migrations
- Repository implementations

**Key Types:**
```rust
pub struct Database { ... }
pub trait ProjectRepositoryTrait { ... }
pub trait ThreadRepositoryTrait { ... }
```

### remi-rpc

WebSocket JSON-RPC server.

**Responsibilities:**
- WebSocket connection handling
- JSON-RPC protocol parsing
- Request routing

**Key Types:**
```rust
pub struct WsState { ... }
pub async fn handle_ws_connection(...) { ... }
```

### remi-orchestration

Event sourcing engine and projection pipeline.

**Responsibilities:**
- Command handling
- Event storage
- State projection

**Key Types:**
```rust
pub struct OrchestrationEngine { ... }
pub enum OrchestrationEvent { ... }
pub enum OrchestrationCommand { ... }
```

## Development Workflow

### Setting Up

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Clone the repository
git clone <repo-url>
cd remi-code

# Build the project
cargo build

# Run tests
cargo test --workspace
```

### Making Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes**:
   - Follow Rust conventions
   - Add tests for new functionality
   - Update documentation

3. **Run checks**:
   ```bash
   cargo fmt --all
   cargo clippy --workspace --all-targets -- -D warnings
   cargo test --workspace
   ```

4. **Commit and push**:
   ```bash
   git add .
   git commit -m "feat: add my feature"
   git push origin feature/my-feature
   ```

5. **Create a pull request**

### Code Review Checklist

- [ ] Code compiles without warnings
- [ ] All tests pass
- [ ] Code is formatted with `cargo fmt`
- [ ] No clippy warnings
- [ ] Documentation is updated
- [ ] Error handling is appropriate
- [ ] No unsafe code (or justified)

## Testing Strategy

### Unit Tests

Each module should have unit tests for its core logic.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_my_function() {
        let result = my_function();
        assert_eq!(result, expected);
    }
}
```

### Integration Tests

Integration tests verify that components work together.

```rust
#[cfg(test)]
mod integration_tests {
    use remi_persistence::Database;
    use remi_core::ServerConfig;

    #[tokio::test]
    async fn test_database_operations() {
        let config = ServerConfig::default();
        let db = Database::connect(&config).await.unwrap();
        // Test database operations
    }
}
```

### Running Tests

```bash
# Run all tests
cargo test --workspace

# Run specific test
cargo test test_my_function

# Run with output
cargo test -- --nocapture

# Run doc tests
cargo test --doc
```

## Performance Guidelines

### Async Best Practices

1. **Use `tokio::spawn` for concurrent tasks**:
   ```rust
   let handle = tokio::spawn(async {
       // Long-running task
   });
   ```

2. **Avoid blocking the async runtime**:
   ```rust
   // Bad: Blocking I/O
   std::fs::read_to_string("file.txt")?;
   
   // Good: Async I/O
   tokio::fs::read_to_string("file.txt").await?;
   ```

3. **Use channels for communication**:
   ```rust
   let (tx, mut rx) = mpsc::channel(32);
   ```

### Memory Management

1. **Use `Arc` for shared ownership**:
   ```rust
   let shared = Arc::new(MyStruct { ... });
   ```

2. **Use `Rc` for single-threaded sharing**:
   ```rust
   let shared = Rc::new(MyStruct { ... });
   ```

3. **Avoid unnecessary cloning**:
   ```rust
   // Bad: Cloning
   let data = my_struct.clone();
   
   // Good: Borrowing
   let data = &my_struct;
   ```

### Database Performance

1. **Use connection pooling**:
   ```rust
   let pool = SqlitePoolOptions::new()
       .max_connections(5)
       .connect(&database_url)
       .await?;
   ```

2. **Batch operations**:
   ```rust
   // Good: Batch insert
   sqlx::query("INSERT INTO ... VALUES (?, ?)")
       .bind(value1)
       .bind(value2)
       .execute(&pool)
       .await?;
   ```

3. **Use indexes**:
   ```sql
   CREATE INDEX idx_threads_project_id ON threads(project_id);
   ```

## Common Patterns

### Error Handling

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MyError {
    #[error("database error: {0}")]
    Database(String),
    
    #[error("not found: {0}")]
    NotFound(String),
}

// Usage
fn my_function() -> Result<(), MyError> {
    if !exists {
        return Err(MyError::NotFound("item".to_string()));
    }
    Ok(())
}
```

### Dependency Injection

```rust
// Define trait
#[async_trait]
pub trait MyService: Send + Sync {
    async fn do_something(&self) -> Result<()>;
}

// Implement
pub struct MyServiceImpl {
    db: Arc<Database>,
}

#[async_trait]
impl MyService for MyServiceImpl {
    async fn do_something(&self) -> Result<()> {
        // Implementation
        Ok(())
    }
}

// Inject
pub struct MyHandler {
    service: Arc<dyn MyService>,
}
```

### Configuration

```rust
use figment::{Figment, providers::{Env, Format, Toml}};

#[derive(Debug, Deserialize)]
pub struct Config {
    pub host: String,
    pub port: u16,
}

impl Config {
    pub fn load() -> Result<Self> {
        Figment::new()
            .merge(Toml::file("config.toml"))
            .merge(Env::prefixed("APP_"))
            .extract()
            .map_err(Into::into)
    }
}
```

### Logging

```rust
use tracing::{info, warn, error};

fn my_function() {
    info!("Starting operation");
    
    if something_wrong {
        warn!("Something is not right");
    }
    
    if error_occurred {
        error!("Operation failed: {}", err);
    }
}
```

## Troubleshooting

### Common Issues

1. **Compilation errors**:
   - Run `cargo clean` and rebuild
   - Check Rust version: `rustc --version`

2. **Test failures**:
   - Run with `--nocapture` to see output
   - Check database state

3. **Performance issues**:
   - Use `cargo flamegraph` for profiling
   - Check for blocking operations

### Getting Help

- Check the [Rust Book](https://doc.rust-lang.org/book/)
- Read the [Tokio Guide](https://tokio.rs/tokio/tutorial)
- Ask in the team chat

## License

MIT
