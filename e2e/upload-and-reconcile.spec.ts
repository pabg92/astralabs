import { test, expect, Page, BrowserContext } from '@playwright/test';
import { TestHelpers, DealData, TestResult } from './utils/test-helpers';
import * as path from 'path';

/**
 * E2E Regression Test Suite
 * Upload → Reconciliation Pipeline Validation
 *
 * Black-box testing approach:
 * - No assertions, only output capture
 * - Complete visibility at every step
 * - Comprehensive artifact collection
 */
test.describe('Upload → Reconciliation Pipeline', () => {
  let allResults: TestResult[] = [];

  test.beforeAll(async () => {
    console.log('═══════════════════════════════════════════');
    console.log('🚀 E2E REGRESSION TEST SUITE');
    console.log(`📅 Started: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════\n');
  });

  test.afterAll(async () => {
    console.log('\n═══════════════════════════════════════════');
    console.log('📊 GENERATING REPORTS...');
    console.log('═══════════════════════════════════════════');

    const helpers = new TestHelpers();
    await helpers.generateMarkdownReport(allResults);
    await helpers.generateJSONReport(allResults);

    console.log('\n═══════════════════════════════════════════');
    console.log('✅ E2E REGRESSION TEST COMPLETE');
    console.log(`📅 Finished: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════');
  });

  /**
   * Test C14.pdf Contract Processing
   */
  test('C14.pdf - Contract Processing', async ({ page, context }) => {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║         Testing: C14.pdf                  ║');
    console.log('╚══════════════════════════════════════════╝\n');

    const helpers = new TestHelpers();
    helpers.setupConsoleLogging(page);

    // Start HAR recording for complete network capture
    await helpers.startHARRecording(context, 'C14');

    try {
      // Step 1: Navigate to upload page
      console.log('━━━ STEP 1: NAVIGATION ━━━');
      await page.goto('/deals/new', { waitUntil: 'commit', timeout: 30000 });
      // Give Next.js time to render the page and stop recompiling
      await page.waitForTimeout(2000);
      // Wait for the form to be visible - with a more generous timeout
      await page.waitForSelector('#dealName', {
        timeout: 30000,
        state: 'visible'
      });
      console.log('✅ Navigated to /deals/new');
      await helpers.takeScreenshot(page, 'C14-deals-new');

      // Step 2: Upload contract
      console.log('\n━━━ STEP 2: FILE UPLOAD ━━━');
      const uploadTime = await helpers.uploadContract(page, '/Users/work/Downloads/C14.pdf');

      // Step 3: Fill form with required fields including pre-agreed terms
      console.log('\n━━━ STEP 3: FORM FILLING ━━━');
      const dealData: DealData = {
        dealName: 'C14 Test Contract',
        talent: 'Test Talent C14',
        brand: 'Test Brand C14',
        fee: '10000',
        terms: [
          {
            clauseType: 'Payment Terms',
            expectedTerm: '50% upfront, 50% on completion',
            notes: 'Mandatory term'
          }
        ]
      };
      await helpers.fillDealForm(page, dealData);
      await helpers.takeScreenshot(page, 'C14-form-filled');

      // Step 4: Trigger reconciliation workflow
      console.log('\n━━━ STEP 4: CREATE & START RECONCILIATION ━━━');

      await page.waitForSelector('button:has-text("Create & Start Reconciliation"):not([disabled])', {
        timeout: 10000,
      });

      const submitStart = Date.now();
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/deals') && resp.request().method() === 'POST',
        { timeout: 60000 }
      );

      await page.click('button:has-text("Create & Start Reconciliation")');
      console.log('   ⏳ Waiting for API response...');

      const response = await responsePromise;
      const responseTime = Date.now() - submitStart;
      const responseData = await response.json();
      const dealId = responseData.data?.id;
      console.log(`   ✅ Deal created with ID: ${dealId || 'unknown'}`);
      console.log(`   API Status: ${response.status()}`);

      helpers.recordApiCall({
        endpoint: '/api/deals',
        method: 'POST',
        status: response.status(),
        duration_ms: responseTime,
        payload_size: JSON.stringify(responseData).length,
      });

      if (!dealId) {
        throw new Error('No deal ID returned from Create & Start Reconciliation');
      }

      await page.waitForURL(`**/reconciliation?dealId=${dealId}*`, { timeout: 60000 });
      console.log(`   ✅ Navigated to reconciliation page`);
      await helpers.takeScreenshot(page, 'C14-reconciliation');

      console.log('\n━━━ STEP 5: WAIT FOR BACKEND PROCESSING ━━━');
      const { data: reconciliationData, durationMs: processingTime } =
        await helpers.waitForProcessingComplete(page, dealId);

      const result = helpers.generateTestResult('C14.pdf', reconciliationData);
      result.upload_time_ms = uploadTime;
      result.processing_time_ms = processingTime;

      if ((result.clauses_extracted || 0) === 0) {
        result.status = 'failed';
        result.errors.push('No clauses extracted from backend');
      }

      allResults.push(result);

      console.log('\n╔══════════════════════════════════════════╗');
      console.log('║         C14.pdf TEST COMPLETE             ║');
      console.log('╠══════════════════════════════════════════╣');
      console.log(`║ Status: ${result.status.toUpperCase().padEnd(32)} ║`);
      console.log(`║ Clauses: ${result.clauses_extracted}`.padEnd(43) + ' ║');
      console.log(`║ Doc Status: ${result.document_status}`.padEnd(43) + ' ║');
      console.log(`║ Processing: ${(processingTime / 1000).toFixed(1)}s`.padEnd(43) + ' ║');
      console.log('╚══════════════════════════════════════════╝');

    } catch (error) {
      console.error(`\n❌ Test failed with error: ${error}`);
      const result = helpers.generateTestResult('C14.pdf', null);
      result.status = 'failed';
      result.errors.push(error.toString());
      allResults.push(result);
      await helpers.takeScreenshot(page, 'C14-error');
    }

    // Ensure HAR file is saved
    await context.close();
  });

  /**
   * Test C19.pdf Contract Processing
   */
  test('C19.pdf - Contract Processing', async ({ page, context }) => {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║         Testing: C19.pdf                  ║');
    console.log('╚══════════════════════════════════════════╝\n');

    const helpers = new TestHelpers();
    helpers.setupConsoleLogging(page);

    // Start HAR recording for complete network capture
    await helpers.startHARRecording(context, 'C19');

    try {
      // Step 1: Navigate to upload page
      console.log('━━━ STEP 1: NAVIGATION ━━━');
      await page.goto('/deals/new', { waitUntil: 'commit', timeout: 30000 });
      // Give Next.js time to render the page and stop recompiling
      await page.waitForTimeout(2000);
      // Wait for the form to be visible - with a more generous timeout
      await page.waitForSelector('#dealName', {
        timeout: 30000,
        state: 'visible'
      });
      console.log('✅ Navigated to /deals/new');
      await helpers.takeScreenshot(page, 'C19-deals-new');

      // Step 2: Upload contract
      console.log('\n━━━ STEP 2: FILE UPLOAD ━━━');
      const uploadTime = await helpers.uploadContract(page, '/Users/work/Downloads/C19.pdf');

      // Step 3: Fill form with required fields including pre-agreed terms
      console.log('\n━━━ STEP 3: FORM FILLING ━━━');
      const dealData: DealData = {
        dealName: 'C19 Marketing Agreement',
        talent: 'Influencer C19',
        brand: 'Brand Partner C19',
        fee: '25000',
        terms: [
          {
            clauseType: 'Content Rights',
            expectedTerm: 'Brand owns all content for 12 months',
            notes: 'Critical'
          }
        ]
      };
      await helpers.fillDealForm(page, dealData);
      await helpers.takeScreenshot(page, 'C19-form-filled');

      // Step 4: Trigger reconciliation workflow
      console.log('\n━━━ STEP 4: CREATE & START RECONCILIATION ━━━');

      await page.waitForSelector('button:has-text("Create & Start Reconciliation"):not([disabled])', {
        timeout: 10000,
      });

      const submitStart = Date.now();
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/deals') && resp.request().method() === 'POST',
        { timeout: 60000 }
      );

      await page.click('button:has-text("Create & Start Reconciliation")');
      console.log('   ⏳ Waiting for API response...');

      const response = await responsePromise;
      const responseTime = Date.now() - submitStart;
      const responseData = await response.json();
      const dealId = responseData.data?.id;
      console.log(`   ✅ Deal created with ID: ${dealId || 'unknown'}`);
      console.log(`   API Status: ${response.status()}`);

      helpers.recordApiCall({
        endpoint: '/api/deals',
        method: 'POST',
        status: response.status(),
        duration_ms: responseTime,
        payload_size: JSON.stringify(responseData).length,
      });

      if (!dealId) {
        throw new Error('No deal ID returned from Create & Start Reconciliation');
      }

      await page.waitForURL(`**/reconciliation?dealId=${dealId}*`, { timeout: 60000 });
      console.log(`   ✅ Navigated to reconciliation page`);
      await helpers.takeScreenshot(page, 'C19-reconciliation');

      console.log('\n━━━ STEP 5: WAIT FOR BACKEND PROCESSING ━━━');
      const { data: reconciliationData, durationMs: processingTime } =
        await helpers.waitForProcessingComplete(page, dealId);

      const result = helpers.generateTestResult('C19.pdf', reconciliationData);
      result.upload_time_ms = uploadTime;
      result.processing_time_ms = processingTime;

      if ((result.clauses_extracted || 0) === 0) {
        result.status = 'failed';
        result.errors.push('No clauses extracted from backend');
      }

      allResults.push(result);

      console.log('\n╔══════════════════════════════════════════╗');
      console.log('║         C19.pdf TEST COMPLETE             ║');
      console.log('╠══════════════════════════════════════════╣');
      console.log(`║ Status: ${result.status.toUpperCase().padEnd(32)} ║`);
      console.log(`║ Clauses: ${result.clauses_extracted}`.padEnd(43) + ' ║');
      console.log(`║ Doc Status: ${result.document_status}`.padEnd(43) + ' ║');
      console.log(`║ Processing: ${(processingTime / 1000).toFixed(1)}s`.padEnd(43) + ' ║');
      console.log('╚══════════════════════════════════════════╝');

    } catch (error) {
      console.error(`\n❌ Test failed with error: ${error}`);
      const result = helpers.generateTestResult('C19.pdf', null);
      result.status = 'failed';
      result.errors.push(error.toString());
      allResults.push(result);
      await helpers.takeScreenshot(page, 'C19-error');
    }

    // Ensure HAR file is saved
    await context.close();
  });
});
