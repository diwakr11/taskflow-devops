// playwright.config.js
// WHY: This file controls ALL test behavior — local vs CI,
// retries, parallelism, timeouts, and report formats.

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({

  // ── Test Discovery ──────────────────────────────────────────
  // WHY: Only look in the tests/ directory, not everywhere
  testDir: './tests',

  // Match all .spec.js files
  testMatch: '**/*.spec.js',

  // ── Parallelism ─────────────────────────────────────────────
  // WHY: Run test files in parallel to save time in CI
  // Set to false only if tests share state (we'll handle this properly)
  fullyParallel: false, // Keep false — our tests share a running server

  // ── Failure Behavior ────────────────────────────────────────
  // WHY: In CI, one flaky test shouldn't block the pipeline
  // forbidOnly: true prevents `.only` from accidentally running in CI
  forbidOnly: !!process.env.CI,

  // ── Retries ─────────────────────────────────────────────────
  // WHY: Retry failed tests once in CI to handle network flakiness
  // Never retry locally (you want to see failures immediately)
  retries: process.env.CI ? 2 : 0,

  // ── Workers ─────────────────────────────────────────────────
  // WHY: Limit to 1 worker since our API tests hit the same
  // running server and we want predictable test ordering
  workers: process.env.CI ? 1 : 1,

  // ── Timeouts ─────────────────────────────────────────────────
  // Global timeout per test (30 seconds)
  timeout: 30000,
  // Timeout for expect() assertions
  expect: {
    timeout: 10000
  },

  // ── Reporters ────────────────────────────────────────────────
  // WHY: Multiple reporters serve different purposes:
  // - 'list'   → readable output in terminal during local runs
  // - 'html'   → beautiful report you can open in browser
  // - 'junit'  → XML format that Jenkins understands natively
  // - 'github' → annotations directly in GitHub PRs (when in CI)
  reporter: [
    ['list'],                                          // Terminal output
    ['html', { outputFolder: 'playwright-report',     // Browser report
               open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }], // Jenkins report
    ...(process.env.CI ? [['github']] : [])            // GitHub annotations
  ],

  // ── Global Setup ─────────────────────────────────────────────
  // These apply to ALL tests unless overridden in the test file
  use: {
    // Base URL — CI uses env var, local defaults to localhost
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Attach trace on retry (for debugging flaky tests)
    trace: 'on-first-retry',

    // Extra HTTP headers sent with every request
    extraHTTPHeaders: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },

    // Response timeout
    actionTimeout: 15000,
  },

  // ── Output Directories ────────────────────────────────────────
  outputDir: 'test-results/',

  // ── Global Setup/Teardown ─────────────────────────────────────
  // WHY: We start the server ONCE before all tests
  // and shut it down ONCE after — much faster than per-test
  globalSetup: require.resolve('./tests/global-setup.js'),
  globalTeardown: require.resolve('./tests/global-teardown.js'),

});