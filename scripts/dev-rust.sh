#!/bin/bash
# Development script for Rust backend

set -e

echo "🦀 Starting Remi Code Rust Backend..."

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust is not installed. Please install Rust first:"
    echo "   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

# Build the project
echo "📦 Building..."
cargo build -p remi-server

# Run the server
echo "🚀 Starting server..."
cargo run -p remi-server
