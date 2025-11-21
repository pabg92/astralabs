import { Page, BrowserContext, APIResponse } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface PreAgreedTermInput {
  clauseType: string;
  expectedTerm: string;
  notes?: string;
}

export interface DealData {
  dealName: string;
  talent: string;
  brand: string;
  fee: string;
  terms?: PreAgreedTermInput[];
}

export interface TestResult {
  contractName: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  upload_time_ms?: number;
  processing_time_ms?: number;
  clauses_extracted?: number;
  pre_agreed_terms?: number;
  document_status?: string;
  api_calls: Array<{
    endpoint: string;
    method: string;
    status: number;
    duration_ms: number;
    payload_size?: number;
  }>;
  errors: string[];
  reconciliation_data?: any;
}

export class TestHelpers {
  private apiCalls: TestResult['api_calls'] = [];
  private errors: string[] = [];
  private startTime: number = 0;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Track API call metadata for reporting
   */
  recordApiCall(call: TestResult['api_calls'][number]) {
    this.apiCalls.push(call);
  }

  /**
   * Record helper-level errors
   */
  addError(message: string) {
    this.errors.push(message);
  }

  /**
   * Start HAR recording for complete network capture
   */
  async startHARRecording(context: BrowserContext, filename: string): Promise<void> {
    const harPath = path.join('e2e', 'artifacts', 'har', `${filename}.har`);
    console.log(`🎬 Starting HAR recording: ${harPath}`);

    await context.routeFromHAR(harPath, {
      url: '**/*',
      update: true,
      updateMode: 'full',
      updateContent: 'attach'
    });
  }

  /**
   * Upload contract file with detailed logging
   */
  async uploadContract(page: Page, filepath: string): Promise<number> {
    const uploadStart = Date.now();
    console.log(`\n📤 Uploading contract: ${filepath}`);

    try {
      // Check if file exists
      if (!fs.existsSync(filepath)) {
        throw new Error(`File not found: ${filepath}`);
      }

      const fileSize = fs.statSync(filepath).size;
      console.log(`   File size: ${(fileSize / 1024).toFixed(2)} KB`);

      // Find and interact with file input
      const fileInput = await page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filepath);

      const uploadTime = Date.now() - uploadStart;
      console.log(`   ✅ File selected successfully (${uploadTime}ms)`);

      return uploadTime;
    } catch (error) {
      const errorMsg = `Failed to upload file: ${error}`;
      console.error(`   ❌ ${errorMsg}`);
      this.errors.push(errorMsg);
      return -1;
    }
  }

  /**
   * Fill deal form with comprehensive logging
   */
  async fillDealForm(page: Page, data: DealData): Promise<void> {
    console.log(`\n📝 Filling deal form:`);
    console.log(`   Deal Name: ${data.dealName}`);
    console.log(`   Talent: ${data.talent}`);
    console.log(`   Brand: ${data.brand}`);
    console.log(`   Fee: ${data.fee}`);

    try {
      // Fill basic fields using id selectors
      // First clear any existing values, then fill
      await page.locator('#dealName').clear();
      await page.locator('#dealName').fill(data.dealName);
      await page.locator('#talent').clear();
      await page.locator('#talent').fill(data.talent);
      await page.locator('#brand').clear();
      await page.locator('#brand').fill(data.brand);
      await page.locator('#fee').clear();
      await page.locator('#fee').fill(data.fee);

      // Add pre-agreed terms if provided
      if (data.terms && data.terms.length > 0) {
        console.log(`   Adding ${data.terms.length} pre-agreed terms...`);
        for (let i = 0; i < data.terms.length; i++) {
          await this.addPreAgreedTerm(page, data.terms[i], i);
        }
      }

      console.log(`   ✅ Form filled successfully`);
    } catch (error) {
      const errorMsg = `Failed to fill form: ${error}`;
      console.error(`   ❌ ${errorMsg}`);
      this.errors.push(errorMsg);
    }
  }

  /**
   * Add a pre-agreed term
   */
  private async addPreAgreedTerm(page: Page, term: PreAgreedTermInput, index: number = 0): Promise<void> {
    try {
      const clauseInputs = page.locator('input[placeholder*="Payment Terms"]');
      const expectedInputs = page.locator('textarea[placeholder*="expected term"]');
      const notesInputs = page.locator('textarea[placeholder*="Additional notes"]');

      const existingRows = await clauseInputs.count();
      if (index >= existingRows) {
        await page.click('button:has-text("Add Term")');
        await page.waitForTimeout(500);
      }

      await clauseInputs.nth(index).fill(term.clauseType);
      await expectedInputs.nth(index).fill(term.expectedTerm);
      if (await notesInputs.count()) {
        await notesInputs.nth(index).fill(term.notes || '');
      }

      console.log(`      + Filled term ${index + 1}: ${term.clauseType}`);
    } catch (error) {
      console.error(`      ❌ Failed to add term: ${error}`);
      this.addError(`Failed to add term row ${index + 1}: ${error}`);
    }
  }

  /**
   * Submit form and capture API response
   */
  async submitAndCaptureResponse(page: Page, buttonText: string): Promise<any> {
    console.log(`\n🚀 Submitting form: "${buttonText}"`);
    const submitStart = Date.now();

    try {
      // Set up response listener before clicking
      const responsePromise = page.waitForResponse(
        resp => resp.url().includes('/api/deals') && resp.method() === 'POST',
        { timeout: 60000 }
      );

      // Click submit button
      await page.click(`button:has-text("${buttonText}")`);

      // Wait for and capture response
      const response = await responsePromise;
      const responseTime = Date.now() - submitStart;

      const responseData = await response.json().catch(() => null);
      const status = response.status();

      // Log API call details
      this.apiCalls.push({
        endpoint: '/api/deals',
        method: 'POST',
        status: status,
        duration_ms: responseTime,
        payload_size: JSON.stringify(responseData).length
      });

      console.log(`   Status: ${status}`);
      console.log(`   Response time: ${responseTime}ms`);
      if (responseData?.id) {
        console.log(`   Deal ID: ${responseData.id}`);
      }

      return responseData;
    } catch (error) {
      const errorMsg = `Form submission failed: ${error}`;
      console.error(`   ❌ ${errorMsg}`);
      this.errors.push(errorMsg);
      return null;
    }
  }

  /**
   * Wait for and capture reconciliation data
   */
  async captureReconciliationData(page: Page, dealId?: string): Promise<any> {
    console.log(`\n📊 Capturing reconciliation data...`);

    try {
      // Wait for reconciliation API call
      const response = await page.waitForResponse(
        resp => resp.url().includes('/api/reconciliation/') && resp.status() === 200,
        { timeout: 60000 }
      );

      const responseData = await response.json();
      const payload = responseData?.data ? responseData : { data: responseData };
      const data = payload.data;
      const responseTime = response.timing()?.responseEnd || 0;

      // Log API call
      this.apiCalls.push({
        endpoint: `/api/reconciliation/${dealId || 'unknown'}`,
        method: 'GET',
        status: response.status(),
        duration_ms: Math.round(responseTime),
        payload_size: JSON.stringify(responseData).length
      });

      // Log summary
      console.log(`   ✅ Data received successfully`);
      const clauseCount =
        data?.document?.clause_boundaries?.length || data?.clauses?.length || 0;
      console.log(`   Clauses: ${clauseCount}`);
      console.log(`   Pre-agreed terms: ${data?.pre_agreed_terms?.length || 0}`);
      console.log(`   Document status: ${data?.document?.processing_status || 'unknown'}`);

      // Count RAG distribution if available
      if (data?.document?.clause_boundaries?.length) {
        const ragCounts = this.countRAGDistribution(data.document.clause_boundaries);
        console.log(`   RAG distribution: ${ragCounts.green} green, ${ragCounts.amber} amber, ${ragCounts.red} red`);
      }

      return data;
    } catch (error) {
      const errorMsg = `Failed to capture reconciliation data: ${error}`;
      console.error(`   ❌ ${errorMsg}`);
      this.errors.push(errorMsg);
      return null;
    }
  }

  /**
   * Poll reconciliation API until processing completes
   */
  async waitForProcessingComplete(page: Page, dealId: string, timeoutMs = 120000, intervalMs = 3000): Promise<{ data: any; durationMs: number }> {
    console.log(`\n⏳ Waiting for backend processing (dealId: ${dealId})...`);
    const start = Date.now();
    let lastStatus = 'unknown';
    let lastClauseCount = 0;
    let attempt = 0;

    while (Date.now() - start < timeoutMs) {
      attempt++;
      try {
        const response = await page.request.get(`/api/reconciliation/${dealId}`);
        const statusCode = response.status();
        const payload = await response.json().catch(() => null);

        if (statusCode === 200 && payload?.success) {
          const data = payload.data;
          const processingStatus = data?.document?.processing_status || 'unknown';
          const clauseCount = data?.document?.clause_boundaries?.length || 0;
          lastStatus = processingStatus;
          lastClauseCount = clauseCount;

          console.log(
            `   [${((Date.now() - start) / 1000).toFixed(1)}s] status=${processingStatus}, clauses=${clauseCount}`
          );

          if (processingStatus === 'completed' && clauseCount > 0) {
            const durationMs = Date.now() - start;
            this.recordApiCall({
              endpoint: `/api/reconciliation/${dealId}`,
              method: 'GET',
              status: statusCode,
              duration_ms: durationMs,
              payload_size: JSON.stringify(payload).length,
            });
            return { data, durationMs };
          }
        } else {
          console.warn(
            `   [${((Date.now() - start) / 1000).toFixed(1)}s] Reconciliation API returned status ${statusCode}`
          );
        }
      } catch (error) {
        console.warn(`   [poll #${attempt}] Error fetching reconciliation data: ${error}`);
      }

      await page.waitForTimeout(intervalMs);
    }

    throw new Error(
      `Timed out waiting for processing (last status: ${lastStatus}, clauses: ${lastClauseCount})`
    );
  }

  /**
   * Count RAG status distribution
   */
  private countRAGDistribution(clauses: any[]): { green: number; amber: number; red: number } {
    const counts = { green: 0, amber: 0, red: 0 };

    for (const clause of clauses) {
      const status =
        clause?.match_result?.rag_status ||
        clause?.rag_status ||
        clause?.status;
      if (status === 'match' || status === 'green') counts.green++;
      else if (status === 'review' || status === 'amber') counts.amber++;
      else if (status === 'issue' || status === 'red') counts.red++;
    }

    return counts;
  }

  /**
   * Take screenshot with descriptive filename
   */
  async takeScreenshot(page: Page, name: string): Promise<void> {
    const screenshotPath = path.join('e2e', 'artifacts', `screenshot-${name}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`   📸 Screenshot saved: ${screenshotPath}`);
  }

  /**
   * Log console messages from the page
   */
  setupConsoleLogging(page: Page): void {
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();

      if (type === 'error') {
        console.error(`   🔴 Console Error: ${text}`);
        this.errors.push(`Console: ${text}`);
      } else if (type === 'warning') {
        console.warn(`   🟡 Console Warning: ${text}`);
      }
    });

    page.on('pageerror', (error) => {
      console.error(`   🔴 Page Error: ${error.message}`);
      this.errors.push(`Page Error: ${error.message}`);
    });
  }

  /**
   * Generate test result object
   */
  generateTestResult(contractName: string, reconciliationData: any): TestResult {
    const duration = Date.now() - this.startTime;

    const clauseCount =
      reconciliationData?.document?.clause_boundaries?.length ||
      reconciliationData?.clauses?.length ||
      0;

    return {
      contractName,
      status: this.errors.length === 0 ? 'passed' : 'failed',
      duration_ms: duration,
      clauses_extracted: clauseCount,
      pre_agreed_terms: reconciliationData?.pre_agreed_terms?.length || 0,
      document_status: reconciliationData?.document?.processing_status || 'unknown',
      api_calls: [...this.apiCalls],
      errors: this.errors,
      reconciliation_data: reconciliationData
    };
  }

  /**
   * Generate markdown report
   */
  async generateMarkdownReport(results: TestResult[]): Promise<string> {
    const timestamp = new Date().toISOString();
    const reportPath = path.join('e2e', 'reports', `test-report-${timestamp.replace(/[:.]/g, '-')}.md`);

    let markdown = `# E2E Regression Test Report\n\n`;
    markdown += `## Test Execution: ${timestamp}\n\n`;
    markdown += `### Test Environment\n`;
    markdown += `- Playwright Version: 1.56.1\n`;
    markdown += `- Base URL: http://localhost:3000\n`;
    markdown += `- Total Tests: ${results.length}\n\n`;

    for (const result of results) {
      const statusEmoji = result.status === 'passed' ? '✅' : '❌';
      markdown += `### ${result.contractName} Results\n`;
      markdown += `- ${statusEmoji} Status: ${result.status}\n`;
      markdown += `- ⏱️ Duration: ${(result.duration_ms / 1000).toFixed(2)}s\n`;
      markdown += `- 📄 Clauses extracted: ${result.clauses_extracted}\n`;
      markdown += `- 📝 Pre-agreed terms: ${result.pre_agreed_terms}\n`;
      markdown += `- 📊 Document status: ${result.document_status}\n`;

      if (result.api_calls.length > 0) {
        markdown += `\n#### API Calls\n`;
        markdown += `| Endpoint | Method | Status | Duration |\n`;
        markdown += `|----------|--------|--------|----------|\n`;
        for (const call of result.api_calls) {
          markdown += `| ${call.endpoint} | ${call.method} | ${call.status} | ${call.duration_ms}ms |\n`;
        }
      }

      if (result.errors.length > 0) {
        markdown += `\n#### Errors\n`;
        for (const error of result.errors) {
          markdown += `- ${error}\n`;
        }
      }

      markdown += `\n`;
    }

    markdown += `### Artifacts Generated\n`;
    markdown += `- Network logs: e2e/artifacts/har/\n`;
    markdown += `- Video recordings: e2e/artifacts/videos/\n`;
    markdown += `- Traces: e2e/artifacts/traces/\n`;
    markdown += `- Screenshots: e2e/artifacts/\n\n`;

    markdown += `### Summary\n`;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    markdown += `- ✅ Passed: ${passed}\n`;
    markdown += `- ❌ Failed: ${failed}\n`;
    markdown += `- 📊 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%\n`;

    // Write report
    fs.writeFileSync(reportPath, markdown);
    console.log(`\n📄 Markdown report generated: ${reportPath}`);

    return reportPath;
  }

  /**
   * Generate JSON report
   */
  async generateJSONReport(results: TestResult[]): Promise<void> {
    const timestamp = new Date().toISOString();
    const reportPath = path.join('e2e', 'reports', 'test-results.json');

    const report = {
      timestamp,
      duration_ms: results.reduce((sum, r) => sum + r.duration_ms, 0),
      tests: results.reduce((acc, result) => {
        acc[result.contractName] = {
          status: result.status,
          duration_ms: result.duration_ms,
          clauses_extracted: result.clauses_extracted,
          pre_agreed_terms: result.pre_agreed_terms,
          document_status: result.document_status,
          api_calls: result.api_calls,
          errors: result.errors
        };
        return acc;
      }, {} as any)
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📊 JSON report generated: ${reportPath}`);
  }
}
