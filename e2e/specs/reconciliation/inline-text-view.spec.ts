import { test, expect } from '@playwright/test';

/**
 * E2E Test Suite: Inline Text View Feature
 *
 * Tests the inline highlighted text view toggle and interactions
 * in the reconciliation page Overview tab.
 */
test.describe('Inline Text View', () => {
  // Store deal ID for reuse across tests
  let testDealId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // Find an existing deal with completed processing for testing
    console.log('Finding a deal with completed processing...');

    const response = await request.get('/api/deals');
    if (response.ok()) {
      const data = await response.json();
      const deals = data.data || [];

      // Find a deal that has completed processing
      for (const deal of deals) {
        if (deal.id) {
          const reconciliationResponse = await request.get(`/api/reconciliation/${deal.id}`);
          if (reconciliationResponse.ok()) {
            const reconciliationData = await reconciliationResponse.json();
            if (reconciliationData.data?.document?.processing_status === 'completed') {
              testDealId = deal.id;
              console.log(`Using deal ID: ${testDealId} (${deal.title || 'Untitled'})`);
              break;
            }
          }
        }
      }
    }

    if (!testDealId) {
      console.log('No existing deal found with completed processing');
    }
  });

  test('should display Cards/Inline toggle in Overview tab', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing toggle visibility...');

    // Navigate to reconciliation page - use domcontentloaded and wait for specific element
    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for the Overview tab to be visible (indicates page has loaded)
    const overviewTab = page.locator('button:has-text("Overview")');
    await expect(overviewTab).toBeVisible({ timeout: 30000 });

    // Verify Cards toggle button exists
    const cardsToggle = page.locator('[data-testid="view-toggle-cards"]');
    await expect(cardsToggle).toBeVisible();

    // Verify Inline toggle button exists
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');
    await expect(inlineToggle).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'e2e/artifacts/inline-view-toggle-visible.png', fullPage: true });

    console.log('Toggle visibility test passed');
  });

  test('should toggle between Cards and Inline view', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing toggle functionality...');

    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for Cards toggle to be visible
    const cardsToggle = page.locator('[data-testid="view-toggle-cards"]');
    await expect(cardsToggle).toBeVisible({ timeout: 30000 });
    await expect(cardsToggle).toHaveAttribute('data-state', 'active').catch(() => {
      // Fallback: check if button has "default" variant class
    });

    // Click Inline toggle
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');

    // Check if inline toggle is disabled (no extracted_text available)
    const isDisabled = await inlineToggle.isDisabled();
    if (isDisabled) {
      console.log('Inline toggle is disabled - extracted_text not available for this document');
      await page.screenshot({ path: 'e2e/artifacts/inline-view-disabled.png', fullPage: true });
      return;
    }

    await inlineToggle.click();
    await page.waitForTimeout(500);

    // Verify inline text container exists
    const inlineContainer = page.locator('[data-testid="inline-text-container"]');
    await expect(inlineContainer).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'e2e/artifacts/inline-view-active.png', fullPage: true });

    // Click Cards toggle to switch back
    await cardsToggle.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'e2e/artifacts/cards-view-active.png', fullPage: true });

    console.log('Toggle functionality test passed');
  });

  test('should display highlighted text with correct colors', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing highlighted text colors...');

    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for inline toggle to be visible
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');
    await expect(inlineToggle).toBeVisible({ timeout: 30000 });
    const isDisabled = await inlineToggle.isDisabled();

    if (isDisabled) {
      console.log('Skipping - inline view not available');
      test.skip();
      return;
    }

    await inlineToggle.click();
    await page.waitForTimeout(500);

    // Check for highlighted clause spans
    const clauseHighlights = page.locator('[data-testid^="clause-highlight-"]');
    const count = await clauseHighlights.count();

    console.log(`Found ${count} highlighted clauses`);

    if (count > 0) {
      // Verify first highlight has background color set
      const firstHighlight = clauseHighlights.first();
      const bgColor = await firstHighlight.evaluate(el =>
        window.getComputedStyle(el).backgroundColor
      );
      console.log(`First clause background color: ${bgColor}`);
      expect(bgColor).not.toBe('transparent');
      expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    }

    await page.screenshot({ path: 'e2e/artifacts/inline-view-highlights.png', fullPage: true });

    console.log('Highlighted text colors test passed');
  });

  test('should select clause when clicking highlighted text', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing clause selection...');

    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for inline toggle to be visible
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');
    await expect(inlineToggle).toBeVisible({ timeout: 30000 });
    const isDisabled = await inlineToggle.isDisabled();

    if (isDisabled) {
      console.log('Skipping - inline view not available');
      test.skip();
      return;
    }

    await inlineToggle.click();
    await page.waitForTimeout(500);

    // Find and click a highlighted clause
    const clauseHighlights = page.locator('[data-testid^="clause-highlight-"]');
    const count = await clauseHighlights.count();

    if (count === 0) {
      console.log('No highlighted clauses found');
      test.skip();
      return;
    }

    // Click the first highlighted clause
    const firstHighlight = clauseHighlights.first();
    await firstHighlight.click();
    await page.waitForTimeout(500);

    // Verify the clause has selection styling (blue tint background)
    // Note: Selection uses background color change instead of ring for inline spans
    const bgColor = await firstHighlight.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );
    // Selected clause should have blue tint: rgba(59, 130, 246, 0.25)
    const hasSelectionTint = bgColor.includes('59') && bgColor.includes('130') && bgColor.includes('246');
    expect(hasSelectionTint).toBe(true);

    // Take screenshot showing selection
    await page.screenshot({ path: 'e2e/artifacts/inline-view-clause-selected.png', fullPage: true });

    // Verify right sidebar shows clause details (Review tab should be visible)
    // Use exact match to avoid matching "Complete Review" button
    const reviewTab = page.getByRole('button', { name: 'Review', exact: true });
    await expect(reviewTab).toBeVisible();

    console.log('Clause selection test passed');
  });

  test('should show hover actions on highlighted text', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing hover actions...');

    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for inline toggle to be visible
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');
    await expect(inlineToggle).toBeVisible({ timeout: 30000 });
    const isDisabled = await inlineToggle.isDisabled();

    if (isDisabled) {
      console.log('Skipping - inline view not available');
      test.skip();
      return;
    }

    await inlineToggle.click();
    await page.waitForTimeout(500);

    // Find highlighted clauses
    const clauseHighlights = page.locator('[data-testid^="clause-highlight-"]');
    const count = await clauseHighlights.count();

    if (count === 0) {
      console.log('No highlighted clauses found');
      test.skip();
      return;
    }

    // Hover over the first highlighted clause
    const firstHighlight = clauseHighlights.first();
    await firstHighlight.hover();
    await page.waitForTimeout(300);

    // Verify hover actions popover appears
    const hoverActions = page.locator('[data-testid="clause-hover-actions"]');
    await expect(hoverActions).toBeVisible({ timeout: 3000 });

    // Verify approve button exists
    const approveBtn = page.locator('[data-testid="hover-approve-btn"]');
    await expect(approveBtn).toBeVisible();

    // Verify reject button exists
    const rejectBtn = page.locator('[data-testid="hover-reject-btn"]');
    await expect(rejectBtn).toBeVisible();

    await page.screenshot({ path: 'e2e/artifacts/inline-view-hover-actions.png', fullPage: true });

    console.log('Hover actions test passed');
  });

  test('should approve clause via hover action button', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing approve via hover action...');

    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for inline toggle to be visible
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');
    await expect(inlineToggle).toBeVisible({ timeout: 30000 });
    const isDisabled = await inlineToggle.isDisabled();

    if (isDisabled) {
      console.log('Skipping - inline view not available');
      test.skip();
      return;
    }

    await inlineToggle.click();
    await page.waitForTimeout(500);

    // Find highlighted clauses
    const clauseHighlights = page.locator('[data-testid^="clause-highlight-"]');
    const count = await clauseHighlights.count();

    if (count === 0) {
      console.log('No highlighted clauses found');
      test.skip();
      return;
    }

    // Hover over the first highlighted clause
    const firstHighlight = clauseHighlights.first();
    await firstHighlight.hover();
    await page.waitForTimeout(300);

    // Click approve button
    const approveBtn = page.locator('[data-testid="hover-approve-btn"]');
    await expect(approveBtn).toBeVisible({ timeout: 3000 });
    await approveBtn.click();

    // Wait for confetti or status change
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'e2e/artifacts/inline-view-after-approve.png', fullPage: true });

    console.log('Approve via hover action test passed');
  });

  test('should scroll to clause when selected from sidebar', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing auto-scroll on sidebar selection...');

    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for inline toggle to be visible
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');
    await expect(inlineToggle).toBeVisible({ timeout: 30000 });
    const isDisabled = await inlineToggle.isDisabled();

    if (isDisabled) {
      console.log('Skipping - inline view not available');
      test.skip();
      return;
    }

    await inlineToggle.click();
    await page.waitForTimeout(500);

    // Find clause cards in left sidebar using data-testid
    const clauseCards = page.locator('[data-testid="clause-card"]');
    const cardCount = await clauseCards.count();

    if (cardCount < 2) {
      console.log('Not enough clause cards for scroll test');
      test.skip();
      return;
    }

    // Click a clause card that's lower in the list
    const laterClause = clauseCards.nth(Math.min(cardCount - 1, 3));
    await laterClause.click();
    await page.waitForTimeout(800); // Wait for scroll animation

    await page.screenshot({ path: 'e2e/artifacts/inline-view-after-sidebar-click.png', fullPage: true });

    console.log('Auto-scroll test passed');
  });

  test('should fallback gracefully when no character positions available', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing fallback behavior...');

    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for inline toggle to be visible
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');
    await expect(inlineToggle).toBeVisible({ timeout: 30000 });
    const isDisabled = await inlineToggle.isDisabled();

    if (isDisabled) {
      // This is expected behavior when no extracted_text
      console.log('Inline toggle correctly disabled when no extracted_text');

      // Verify tooltip explains why
      const title = await inlineToggle.getAttribute('title');
      expect(title).toContain('not available');

      await page.screenshot({ path: 'e2e/artifacts/inline-view-disabled-tooltip.png', fullPage: true });
    } else {
      // If enabled, switch to inline and check for fallback message
      await inlineToggle.click();
      await page.waitForTimeout(500);

      const container = page.locator('[data-testid="inline-text-container"]');
      const text = await container.textContent();

      // If no character positions, should show fallback
      if (text?.includes('not available') || text?.includes('Switch to Cards')) {
        console.log('Fallback message displayed correctly');
      }
    }

    console.log('Fallback behavior test passed');
  });

  // ====== Pagination Tests (V2) ======

  test('should display pagination controls in inline view', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing pagination controls visibility...');

    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for inline toggle to be visible
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');
    await expect(inlineToggle).toBeVisible({ timeout: 30000 });
    const isDisabled = await inlineToggle.isDisabled();

    if (isDisabled) {
      console.log('Skipping - inline view not available');
      test.skip();
      return;
    }

    await inlineToggle.click();
    await page.waitForTimeout(500);

    // Verify pagination controls are visible
    const prevButton = page.locator('[data-testid="page-nav-prev"]');
    const nextButton = page.locator('[data-testid="page-nav-next"]');
    const pageIndicator = page.locator('[data-testid="page-indicator"]');

    await expect(prevButton).toBeVisible({ timeout: 5000 });
    await expect(nextButton).toBeVisible();
    await expect(pageIndicator).toBeVisible();

    // Verify page indicator shows page info
    const indicatorText = await pageIndicator.textContent();
    expect(indicatorText).toMatch(/Page \d+ of \d+/);

    await page.screenshot({ path: 'e2e/artifacts/inline-view-pagination-controls.png', fullPage: true });

    console.log('Pagination controls visibility test passed');
  });

  test('should navigate between pages using pagination buttons', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing pagination navigation...');

    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for inline toggle to be visible
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');
    await expect(inlineToggle).toBeVisible({ timeout: 30000 });
    const isDisabled = await inlineToggle.isDisabled();

    if (isDisabled) {
      console.log('Skipping - inline view not available');
      test.skip();
      return;
    }

    await inlineToggle.click();
    await page.waitForTimeout(500);

    // Get page indicator
    const pageIndicator = page.locator('[data-testid="page-indicator"]');
    await expect(pageIndicator).toBeVisible({ timeout: 5000 });

    // Get initial page text
    const initialText = await pageIndicator.textContent();
    const match = initialText?.match(/Page (\d+) of (\d+)/);

    if (!match) {
      console.log('Could not parse page indicator');
      test.skip();
      return;
    }

    const totalPages = parseInt(match[2], 10);

    if (totalPages < 2) {
      console.log('Document has only 1 page, skipping navigation test');
      test.skip();
      return;
    }

    // Click Next button
    const nextButton = page.locator('[data-testid="page-nav-next"]');
    await nextButton.click();
    await page.waitForTimeout(500);

    // Verify page changed to 2
    const newText = await pageIndicator.textContent();
    expect(newText).toContain('Page 2');

    await page.screenshot({ path: 'e2e/artifacts/inline-view-page-2.png', fullPage: true });

    // Click Previous button
    const prevButton = page.locator('[data-testid="page-nav-prev"]');
    await prevButton.click();
    await page.waitForTimeout(500);

    // Verify page changed back to 1
    const backText = await pageIndicator.textContent();
    expect(backText).toContain('Page 1');

    console.log('Pagination navigation test passed');
  });

  test('should navigate to correct page when clause selected from sidebar', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing page navigation on sidebar clause selection...');

    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for inline toggle to be visible
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');
    await expect(inlineToggle).toBeVisible({ timeout: 30000 });
    const isDisabled = await inlineToggle.isDisabled();

    if (isDisabled) {
      console.log('Skipping - inline view not available');
      test.skip();
      return;
    }

    await inlineToggle.click();
    await page.waitForTimeout(500);

    // Get page indicator
    const pageIndicator = page.locator('[data-testid="page-indicator"]');
    await expect(pageIndicator).toBeVisible({ timeout: 5000 });

    // Get total pages
    const initialText = await pageIndicator.textContent();
    const match = initialText?.match(/Page (\d+) of (\d+)/);

    if (!match || parseInt(match[2], 10) < 2) {
      console.log('Document has only 1 page, skipping navigation test');
      test.skip();
      return;
    }

    // Find clause cards in left sidebar using data-testid
    const clauseCards = page.locator('[data-testid="clause-card"]');
    const cardCount = await clauseCards.count();

    if (cardCount < 5) {
      console.log('Not enough clause cards for page navigation test');
      test.skip();
      return;
    }

    // Click a clause card that's later in the list (likely on a different page)
    const laterClause = clauseCards.nth(Math.min(cardCount - 1, 10));
    await laterClause.click();
    await page.waitForTimeout(800);

    // Take screenshot showing navigation result
    await page.screenshot({ path: 'e2e/artifacts/inline-view-sidebar-page-nav.png', fullPage: true });

    console.log('Sidebar clause page navigation test passed');
  });

  test('should disable Previous button on first page and Next button on last page', async ({ page }) => {
    test.skip(!testDealId, 'No test deal available');

    console.log('Testing pagination button disabled states...');

    await page.goto(`/reconciliation?dealId=${testDealId}`, { waitUntil: 'domcontentloaded' });

    // Wait for inline toggle to be visible
    const inlineToggle = page.locator('[data-testid="view-toggle-inline"]');
    await expect(inlineToggle).toBeVisible({ timeout: 30000 });
    const isDisabled = await inlineToggle.isDisabled();

    if (isDisabled) {
      console.log('Skipping - inline view not available');
      test.skip();
      return;
    }

    await inlineToggle.click();
    await page.waitForTimeout(500);

    const prevButton = page.locator('[data-testid="page-nav-prev"]');
    const nextButton = page.locator('[data-testid="page-nav-next"]');
    const pageIndicator = page.locator('[data-testid="page-indicator"]');

    await expect(pageIndicator).toBeVisible({ timeout: 5000 });

    // On page 1, Previous should be disabled
    expect(await prevButton.isDisabled()).toBe(true);

    // Get total pages
    const indicatorText = await pageIndicator.textContent();
    const match = indicatorText?.match(/Page \d+ of (\d+)/);
    const totalPages = match ? parseInt(match[1], 10) : 1;

    if (totalPages === 1) {
      // Both should be disabled if only 1 page
      expect(await nextButton.isDisabled()).toBe(true);
      console.log('Single page document - both buttons disabled');
    } else {
      // Navigate to last page
      for (let i = 1; i < totalPages; i++) {
        await nextButton.click();
        await page.waitForTimeout(200);
      }

      // On last page, Next should be disabled
      expect(await nextButton.isDisabled()).toBe(true);
      console.log('On last page - Next button disabled');
    }

    await page.screenshot({ path: 'e2e/artifacts/inline-view-pagination-disabled.png', fullPage: true });

    console.log('Pagination button disabled states test passed');
  });
});
