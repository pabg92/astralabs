import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Testing Configuration
 * For bulletproof upload → reconciliation regression testing
 */
export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Artifact output directory
  outputDir: './e2e/artifacts',

  // Run tests sequentially for consistency
  fullyParallel: false,

  // Fail fast on CI
  forbidOnly: !!process.env.CI,

  // No retries - we want raw results
  retries: 0,

  // No parallel workers - sequential execution
  workers: 1,

  // Reporters for comprehensive output
  reporter: [
    ['list'],  // Console output with real-time updates
    ['html', { outputFolder: 'e2e/reports/html', open: 'never' }],
    ['json', { outputFile: 'e2e/reports/test-results.json' }],
  ],

  // Global timeout settings
  timeout: 120000, // 2 minutes per test
  expect: {
    timeout: 30000, // 30 seconds for assertions
  },

  // Shared settings for all projects
  use: {
    // Base URL for the application
    baseURL: 'http://localhost:4000',

    // Collect trace for every test
    trace: 'on',

    // Record video for every test
    video: {
      mode: 'on',
      size: { width: 1280, height: 720 }
    },

    // Take screenshot on failure
    screenshot: {
      mode: 'only-on-failure',
      fullPage: true
    },

    // Action timeout
    actionTimeout: 30000, // 30s for actions

    // Navigation timeout
    navigationTimeout: 60000, // 60s for page loads

    // Viewport size
    viewport: { width: 1280, height: 720 },

    // Ignore HTTPS errors
    ignoreHTTPSErrors: true,

    // Emulate network conditions
    offline: false,

    // Permissions
    permissions: [],

    // Extra HTTP headers
    extraHTTPHeaders: {
      'Accept': 'application/json, text/plain, */*',
    },
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // HAR recording will be enabled per test
        launchOptions: {
          slowMo: 100, // Slow down actions by 100ms for visibility
        },
      },
    },
  ],

  // Run local dev server before tests if needed
  webServer: process.env.CI ? {
    command: 'pnpm dev',
    port: 3000,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  } : undefined,
});