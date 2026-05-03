// tests/global-setup.js
// WHY: This runs ONCE before any test file executes.
// It starts our Express server and waits until it's ready.
// This is called a "test fixture" — setting up preconditions.

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Use a separate test database so tests NEVER touch dev data
process.env.DB_PATH = path.join(__dirname, '../data/test-taskflow.db');
process.env.PORT = '3001'; // Different port from dev server
process.env.NODE_ENV = 'test';

// Update BASE_URL for test port
process.env.BASE_URL = 'http://localhost:3001';

async function waitForServer(url, maxRetries = 30) {
  // WHY: Server takes a moment to start. We poll /health
  // until it responds — this is called a "readiness check"
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        http.get(`${url}/health`, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status: ${res.statusCode}`));
        }).on('error', reject);
      });
      console.log(`✅ Test server ready at ${url}`);
      return;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500)); // Wait 500ms before retry
    }
  }
  throw new Error(`❌ Server never became ready at ${url}`);
}

module.exports = async function globalSetup() {
  console.log('\n🚀 Starting test server...');

  // Start the server as a child process
  const server = spawn('node', ['src/app.js'], {
    env: { ...process.env },
    stdio: 'pipe' // Capture output
  });

  // Log server output for debugging
  server.stdout.on('data', (data) => {
    if (process.env.DEBUG_TESTS) console.log(`[SERVER] ${data}`);
  });

  server.stderr.on('data', (data) => {
    console.error(`[SERVER ERROR] ${data}`);
  });

  // Store PID so teardown can kill it
  process.env.TEST_SERVER_PID = server.pid;

  // Wait for server to be ready
  await waitForServer(process.env.BASE_URL);

  console.log('✅ Global setup complete\n');
};