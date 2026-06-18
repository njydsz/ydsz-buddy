#!/usr/bin/env node

/**
 * Tauri development launcher
 * Starts Vite dev server and Tauri app concurrently
 */

import { spawn } from 'child_process';
import { platform } from 'os';

const isWindows = platform() === 'win32';

// Start Vite dev server
console.log('🚀 Starting Vite dev server...');
const vite = spawn(isWindows ? 'npm' : 'npx', ['run', 'dev'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: isWindows
});

// Wait for Vite to be ready, then start Tauri
setTimeout(() => {
  console.log('🦀 Starting Tauri app...');
  const tauri = spawn(isWindows ? 'npm' : 'npx', ['run', 'dev:tauri'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: isWindows
  });

  tauri.on('exit', (code) => {
    vite.kill();
    process.exit(code);
  });
}, 3000);

vite.on('exit', (code) => {
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  vite.kill();
  process.exit(0);
});
