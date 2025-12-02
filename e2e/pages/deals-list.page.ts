import { Page, Locator, expect } from "@playwright/test"

/**
 * Page Object for /deals page
 * Encapsulates all interactions with the deals list page
 */
export class DealsListPage {
  readonly page: Page

  // Locators
  readonly pageContainer: Locator
  readonly searchInput: Locator
  readonly statusFilter: Locator
  readonly categoryFilter: Locator
  readonly sortSelect: Locator
  readonly uploadContractButton: Locator
  readonly newDealButton: Locator
  readonly dealsTable: Locator
  readonly dealsTableBody: Locator
  readonly emptyState: Locator
  readonly loadingState: Locator
  readonly errorBanner: Locator
  readonly retryButton: Locator

  constructor(page: Page) {
    this.page = page

    // Initialize locators using data-testid
    this.pageContainer = page.getByTestId("deals-page")
    this.searchInput = page.getByTestId("deals-search-input")
    this.statusFilter = page.getByTestId("deals-status-filter")
    this.categoryFilter = page.getByTestId("deals-category-filter")
    this.sortSelect = page.getByTestId("deals-sort-select")
    this.uploadContractButton = page.getByTestId("upload-contract-button")
    this.newDealButton = page.getByTestId("new-deal-button")
    this.dealsTable = page.getByTestId("deals-table")
    this.dealsTableBody = page.getByTestId("deals-table-body")
    this.emptyState = page.getByTestId("deals-empty-state")
    this.loadingState = page.getByTestId("deals-loading-state")
    this.errorBanner = page.getByTestId("deals-error-banner")
    this.retryButton = page.getByTestId("deals-retry-button")
  }

  // Navigation
  async goto() {
    await this.page.goto("/deals")
    await this.waitForPageLoad()
  }

  async waitForPageLoad() {
    // Wait for either the table, empty state, or error banner to be visible
    await Promise.race([
      this.dealsTable.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
      this.emptyState.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
      this.errorBanner.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
    ])
  }

  // Actions
  async search(query: string) {
    await this.searchInput.fill(query)
    // Wait for debounce
    await this.page.waitForTimeout(500)
  }

  async clearSearch() {
    await this.searchInput.clear()
    await this.page.waitForTimeout(500)
  }

  async filterByStatus(status: string) {
    await this.statusFilter.click()
    await this.page.getByRole("option", { name: status }).click()
  }

  async sortBy(option: string) {
    await this.sortSelect.click()
    await this.page.getByRole("option", { name: option }).click()
  }

  async clickUploadContract() {
    await this.uploadContractButton.click()
  }

  async clickNewDeal() {
    await this.newDealButton.click()
  }

  async clickRetry() {
    await this.retryButton.click()
  }

  // Deal row interactions
  getDealRow(dealId: string): Locator {
    return this.page.getByTestId(`deal-row-${dealId}`)
  }

  getDealTitle(dealId: string): Locator {
    return this.page.getByTestId(`deal-title-${dealId}`)
  }

  getDealStatus(dealId: string): Locator {
    return this.page.getByTestId(`deal-status-${dealId}`)
  }

  getDealActions(dealId: string): Locator {
    return this.page.getByTestId(`deal-actions-${dealId}`)
  }

  async openDealActions(dealId: string) {
    const actionsCell = this.getDealActions(dealId)
    await actionsCell.locator("button").click()
  }

  async clickVersionHistory(dealId: string) {
    await this.openDealActions(dealId)
    await this.page.getByRole("menuitem", { name: /version history/i }).click()
  }

  // Assertions
  async expectDealsLoaded(count?: number) {
    await expect(this.dealsTable).toBeVisible()
    if (count !== undefined) {
      const rows = this.page.locator('[data-testid^="deal-row-"]')
      await expect(rows).toHaveCount(count)
    }
  }

  async expectEmptyState() {
    await expect(this.emptyState).toBeVisible()
  }

  async expectErrorState() {
    await expect(this.errorBanner).toBeVisible()
  }

  async expectLoadingState() {
    await expect(this.loadingState).toBeVisible()
  }

  async getDealCount(): Promise<number> {
    const rows = this.page.locator('[data-testid^="deal-row-"]')
    return await rows.count()
  }

  // Page state detection
  async getPageState(): Promise<"loaded" | "empty" | "error" | "loading"> {
    if (await this.loadingState.isVisible()) return "loading"
    if (await this.errorBanner.isVisible()) return "error"
    if (await this.emptyState.isVisible()) return "empty"
    if (await this.dealsTable.isVisible()) return "loaded"
    return "loading"
  }
}
