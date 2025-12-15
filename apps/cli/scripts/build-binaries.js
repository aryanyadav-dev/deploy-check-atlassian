#!/usr/bin/env node

/**
 * Build standalone binaries for deploy-check CLI
 * 
 * This script uses @yao-pkg/pkg to create standalone executables
 * for macOS, Linux, and Windows platforms.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TARGETS = [
  { target: 'node18-macos-x64', output: 'deploy-check-macos-x64' },
  { target: 'node18-macos-arm64', output: 'deploy-check-macos-arm64' },
  { target: 'node18-linux-x64', output: 'deploy-check-linux-x64' },
  { target: 'node18-linux-arm64', output: 'deploy-check-linux-arm64' },
  { target: 'node18-win-x64', output: 'deploy-check-win-x64.exe' },
];

const ROOT_DIR = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT_DIR, 'bin');
const DIST_FILE = path.join(ROOT_DIR, 'dist', 'index.js');

async function main() {
  console.log('🔨 Building standalone binaries for deploy-check CLI\n');

  // Ensure dist exists
  if (!fs.existsSync(DIST_FILE)) {
    console.log('📦 Building TypeScript bundle first...');
    execSync('pnpm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
  }

  // Create bin directory
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  console.log('\n📦 Creating standalone binaries...\n');

  for (const { target, output } of TARGETS) {
    const outputPath = path.join(BIN_DIR, output);
    console.log(`  Building ${output}...`);
    
    try {
      execSync(
        `npx @yao-pkg/pkg ${DIST_FILE} --target ${target} --output ${outputPath}`,
        { cwd: ROOT_DIR, stdio: 'pipe' }
      );
      
      const stats = fs.statSync(outputPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`  ✅ ${output} (${sizeMB} MB)`);
    } catch (error) {
      console.error(`  ❌ Failed to build ${output}: ${error.message}`);
    }
  }

  console.log('\n✨ Binary builds complete!');
  console.log(`\nBinaries are located in: ${BIN_DIR}`);
  
  // List all binaries
  console.log('\nGenerated files:');
  const files = fs.readdirSync(BIN_DIR);
  for (const file of files) {
    const filePath = path.join(BIN_DIR, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`  - ${file} (${sizeMB} MB)`);
  }
}

main().catch(console.error);
