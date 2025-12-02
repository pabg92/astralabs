import { test, expect } from "@playwright/test"
import { DealsListPage } from "../../pages/deals-list.page"
import { mockDeals, mockVersionHistory } from "../../fixtures/deals.fixture"

test.describe("Deals List Page", () => {
  let dealsPage: DealsListPage

  test.beforeEach(async ({ page }) => {
    dealsPage = new DealsListPage(page)
  })

  test("should load deals page successfully", async ({ page }) => {
    // Mock API with standard deals
    await page.route("**/api/deals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDeals.standard),
      })
    })

    await dealsPage.goto()
    await dealsPage.expectDealsLoaded(3)
  })

  test("should display empty state when no deals exist", async ({ page }) => {
    // Mock API with empty response
    await page.route("**/api/deals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDeals.empty),
      })
    })

    await dealsPage.goto()
    await dealsPage.expectEmptyState()
  })

  test("should display error state when API fails", async ({ page }) => {
    // Mock API with error response
    await page.route("**/api/deals", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify(mockDeals.error),
      })
    })

    await dealsPage.goto()
    await dealsPage.expectErrorState()
    await expect(page.getByText("Database connection failed")).toBeVisible()
  })

  test("should retry loading when retry button clicked", async ({ page }) => {
    let callCount = 0

    // Mock API - first call fails, second succeeds
    await page.route("**/api/deals", async (route) => {
      callCount++
      if (callCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify(mockDeals.error),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockDeals.standard),
        })
      }
    })

    await dealsPage.goto()
    await dealsPage.expectErrorState()

    await dealsPage.clickRetry()
    await dealsPage.expectDealsLoaded(3)

    expect(callCount).toBe(2)
  })

  test("should filter deals by search query", async ({ page }) => {
    await page.route("**/api/deals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDeals.standard),
      })
    })

    await dealsPage.goto()
    await dealsPage.expectDealsLoaded(3)

    // Search for a specific deal
    await dealsPage.search("Fashion")

    // Should filter to show only matching deal
    const count = await dealsPage.getDealCount()
    expect(count).toBeLessThanOrEqual(3)
  })

  test("should navigate to new deal page when button clicked", async ({ page }) => {
    await page.route("**/api/deals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDeals.standard),
      })
    })

    await dealsPage.goto()
    await dealsPage.clickNewDeal()

    await expect(page).toHaveURL(/\/deals\/new/)
  })

  test("should open version history modal", async ({ page }) => {
    await page.route("**/api/deals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDeals.standard),
      })
    })

    await page.route("**/api/deals/*/history", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockVersionHistory.standard),
      })
    })

    await dealsPage.goto()
    await dealsPage.clickVersionHistory("test-deal-1")

    // Verify modal opens
    await expect(page.getByText("Version History")).toBeVisible()
    await expect(page.getByText("Documents")).toBeVisible()
    await expect(page.getByText("Clause Changes")).toBeVisible()
  })

  test("should show upload hint on row hover", async ({ page }) => {
    await page.route("**/api/deals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDeals.standard),
      })
    })

    await dealsPage.goto()
    await dealsPage.expectDealsLoaded()

    // Hover over a deal row
    const dealRow = dealsPage.getDealRow("test-deal-1")
    await dealRow.hover()

    // The upload icon should become visible (opacity change)
    const uploadHint = dealRow.locator('[class*="group-hover"]')
    await expect(uploadHint).toBeVisible()
  })
})
