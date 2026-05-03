// tests/global-teardown.js
// WHY: Clean up after ALL tests. Kill the test server
// and remove the test database so next run starts fresh.

const fs = require('fs');
const path = require('path');

module.exports = async function globalTeardown() {
  console.log('\n🧹 Running global teardown...');

  // Kill the test server
  const pid = process.env.TEST_SERVER_PID;
  if (pid) {
    try {
      process.kill(parseInt(pid), 'SIGTERM');
      console.log(`✅ Test server (PID: ${pid}) stopped`);
    } catch (e) {
      console.log('Server already stopped');
    }
  }

  // Remove test database
  const testDbPath = path.join(__dirname, '../data/test-taskflow.db');
  const walPath = testDbPath + '-wal';
  const shmPath = testDbPath + '-shm';

  [testDbPath, walPath, shmPath].forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });

  console.log('✅ Test database cleaned up');
  console.log('✅ Global teardown complete\n');
};