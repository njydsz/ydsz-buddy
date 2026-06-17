#!/usr/bin/env node
/**
 * Dev runner script with Rust backend support
 * 
 * Usage:
 *   REMI_CODE_SERVER=rust node scripts/dev-runner.ts dev
 *   REMI_CODE_SERVER=ts node scripts/dev-runner.ts dev
 */

const { spawn } = require('child_process');
const path = require('path');

const serverMode = process.env.REMI_CODE_SERVER || 'ts';

console.log(`🚀 Starting Remi Code in ${serverMode.toUpperCase()} mode...`);

if (serverMode === 'rust') {
  console.log('🦀 Using Rust backend');
  
  // Build Rust server
  const build = spawn('cargo', ['build', '-p', 'remi-server'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  
  build.on('close', (code) => {
    if (code !== 0) {
      console.error('❌ Rust build failed');
      process.exit(1);
    }
    
    console.log('✅ Rust build successful, starting server...');
    
    // Run Rust server
    const server = spawn('cargo', ['run', '-p', 'remi-server'], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    server.on('close', (code) => {
      process.exit(code);
    });
  });
} else {
  console.log('📦 Using TypeScript backend');
  
  // Original TypeScript dev flow
  const dev = spawn('turbo', ['run', 'dev'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  
  dev.on('close', (code) => {
    process.exit(code);
  });
}
