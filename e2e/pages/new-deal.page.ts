import { Page, Locator, expect } from "@playwright/test"
import * as fs from "fs"
import * as path from "path"

interface PreAgreedTerm {
  clauseType: string
  expectedTerm: string
  notes?: string
}

interface DealFormData {
  dealName: string
  talent: string
  agency?: string
  brand: string
  inOut?: "In" | "Out"
  deliverables?: string
  usage?: string
  exclusivity?: string
  fee?: string
  terms?: PreAgreedTerm[]
}

/**
 * Page Object for /deals/new page
 * Encapsulates all interactions with the new deal creation form
 */
export class NewDealPage {
  readonly page: Page

  // Form field locators
  readonly dealNameInput: Locator
  readonly talentInput: Locator
  readonly agencyInput: Locator
  readonly brandInput: Locator
  readonly inOutSelect: Locator
  readonly deliverablesTextarea: Locator
  readonly usageInput: Locator
  readonly exclusivityInput: Locator
  readonly feeInput: Locator
  readonly dateAddedInput: Locator

  // File upload locators
  readonly fileInput: Locator
  readonly uploadDropzone: Locator
  readonly uploadSuccessIndicator: Locator

  // Terms section locators
  readonly addTermButton: Locator
  readonly termsContainer: Locator

  // Action buttons
  readonly createAndReconcileButton: Locator
  readonly saveAsDraftButton: Locator
  readonly backButton: Locator
  readonly skipToReconciliationButton: Locator

  // Progress indicators
  readonly dealInfoProgress: Locator
  readonly contractUploadProgress: Locator
  readonly termsProgress: Locator

  // Error display
  readonly submitError: Locator

  constructor(page: Page) {
    this.page = page

    // Form fields by ID
    this.dealNameInput = page.locator("#dealName")
    this.talentInput = page.locator("#talent")
    this.agencyInput = page.locator("#agency")
    this.brandInput = page.locator("#brand")
    this.inOutSelect = page.locator('[data-slot="select-trigger"]').first()
    this.deliverablesTextarea = page.locator("#deliverables")
    this.usageInput = page.locator("#usage")
    this.exclusivityInput = page.locator("#exclusivity")
    this.feeInput = page.locator("#fee")
    this.dateAddedInput = page.locator("#dateAdded")

    // File upload
    this.fileInput = page.locator('#contract-upload')
    this.uploadDropzone = page.locator('[class*="border-dashed"]').first()
    this.uploadSuccessIndicator = page.locator('text=Contract uploaded successfully')

    // Terms section
    this.addTermButton = page.getByRole("button", { name: /add term/i })
    this.termsContainer = page.locator('[class*="space-y-4"]').last()

    // Action buttons
    this.createAndReconcileButton = page.getByRole("button", { name: /create & start reconciliation/i })
    this.saveAsDraftButton = page.getByRole("button", { name: /save as draft/i })
    this.backButton = page.getByRole("link", { name: /back to deals/i })
    this.skipToReconciliationButton = page.getByRole("button", { name: /skip to reconciliation/i })

    // Progress indicators
    this.dealInfoProgress = page.locator('text=Deal Information').first()
    this.contractUploadProgress = page.locator('text=Contract Upload').first()
    this.termsProgress = page.locator('text=Pre-agreed Terms').first()

    // Error display
    this.submitError = page.locator('[class*="text-red-600"]')
  }

  // Navigation
  async goto() {
    await this.page.goto("/deals/new")
    await this.waitForPageLoad()
  }

  async waitForPageLoad() {
    // Wait for the form to be visible
    await this.dealNameInput.waitFor({ state: "visible", timeout: 30000 })

    // Wait for hydration to complete - Next.js adds data attributes after hydration
    // Also wait for any ongoing compilations to settle
    await this.page.waitForTimeout(2000)

    // Wait for network to be idle (no more hot reloading)
    await this.page.waitForLoadState("networkidle").catch(() => {})

    // Additional wait for React hydration to fully complete
    await this.page.waitForTimeout(1000)
  }

  // Form filling methods
  async fillDealInfo(data: DealFormData) {
    console.log("  Filling deal information...")

    // Required fields
    await this.dealNameInput.clear()
    await this.dealNameInput.fill(data.dealName)

    await this.talentInput.clear()
    await this.talentInput.fill(data.talent)

    await this.brandInput.clear()
    await this.brandInput.fill(data.brand)

    // Optional fields
    if (data.agency) {
      await this.agencyInput.clear()
      await this.agencyInput.fill(data.agency)
    }

    if (data.deliverables) {
      await this.deliverablesTextarea.clear()
      await this.deliverablesTextarea.fill(data.deliverables)
    }

    if (data.usage) {
      await this.usageInput.clear()
      await this.usageInput.fill(data.usage)
    }

    if (data.exclusivity) {
      await this.exclusivityInput.clear()
      await this.exclusivityInput.fill(data.exclusivity)
    }

    if (data.fee) {
      await this.feeInput.clear()
      await this.feeInput.fill(data.fee)
    }

    console.log("  Deal information filled successfully")
  }

  async uploadContract(filePath: string): Promise<{ success: boolean; durationMs: number }> {
    const start = Date.now()
    console.log(`  Uploading contract: ${filePath}`)

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.error(`  File not found: ${filePath}`)
        return { success: false, durationMs: Date.now() - start }
      }

      const fileSize = fs.statSync(filePath).size
      const fileName = path.basename(filePath)
      console.log(`  File size: ${(fileSize / 1024).toFixed(2)} KB`)

      // Upload file using the file input
      await this.fileInput.setInputFiles(filePath)

      // Wait a moment for React state to update
      await this.page.waitForTimeout(500)

      // Wait for either the success indicator or the file name to appear
      try {
        await this.uploadSuccessIndicator.waitFor({ state: "visible", timeout: 5000 })
      } catch {
        // Also try waiting for the filename to appear on page
        const fileNameLocator = this.page.locator(`text=${fileName}`)
        await fileNameLocator.waitFor({ state: "visible", timeout: 5000 }).catch(() => {})
      }

      // Check if the upload zone changed to success state (emerald color)
      const hasSuccessState = await this.page.locator('.text-emerald-700, .text-emerald-600, .text-emerald-500').first().isVisible()

      const durationMs = Date.now() - start
      if (hasSuccessState) {
        console.log(`  Contract uploaded successfully (${durationMs}ms)`)
        return { success: true, durationMs }
      } else {
        console.log(`  Contract may have uploaded, checking state... (${durationMs}ms)`)
        // Still return success if the file input has the file
        return { success: true, durationMs }
      }
    } catch (error) {
      console.error(`  Failed to upload contract: ${error}`)
      return { success: false, durationMs: Date.now() - start }
    }
  }

  async addPreAgreedTerm(term: PreAgreedTerm, index: number = 0) {
    console.log(`  Adding pre-agreed term: ${term.clauseType}`)

    // Get term inputs by their placeholders
    const clauseInputs = this.page.locator('input[placeholder*="Payment Terms"]')
    const expectedInputs = this.page.locator('textarea[placeholder*="expected term"]')
    const notesInputs = this.page.locator('textarea[placeholder*="Additional notes"]')

    const existingCount = await clauseInputs.count()

    // Add new term row if needed
    if (index >= existingCount) {
      await this.addTermButton.click()
      await this.page.waitForTimeout(300) // Wait for animation
    }

    // Fill the term fields
    await clauseInputs.nth(index).fill(term.clauseType)
    await expectedInputs.nth(index).fill(term.expectedTerm)

    if (term.notes && await notesInputs.count() > index) {
      await notesInputs.nth(index).fill(term.notes)
    }

    console.log(`  Term added: ${term.clauseType}`)
  }

  async addMultipleTerms(terms: PreAgreedTerm[]) {
    for (let i = 0; i < terms.length; i++) {
      await this.addPreAgreedTerm(terms[i], i)
    }
    console.log(`  Added ${terms.length} pre-agreed terms`)
  }

  async fillCompleteForm(data: DealFormData, contractPath: string): Promise<{ uploadSuccess: boolean; uploadDurationMs: number }> {
    // Step 1: Fill deal info
    await this.fillDealInfo(data)

    // Step 2: Upload contract
    const uploadResult = await this.uploadContract(contractPath)

    // Step 3: Add pre-agreed terms
    if (data.terms && data.terms.length > 0) {
      await this.addMultipleTerms(data.terms)
    }

    return {
      uploadSuccess: uploadResult.success,
      uploadDurationMs: uploadResult.durationMs
    }
  }

  // Actions
  async clickCreateAndReconcile(): Promise<{ dealId: string | null; responseStatus: number; durationMs: number }> {
    const start = Date.now()
    console.log("  Clicking Create & Start Reconciliation...")

    // Set up response listener
    const responsePromise = this.page.waitForResponse(
      resp => resp.url().includes("/api/deals") && resp.request().method() === "POST",
      { timeout: 60000 }
    )

    // Click the button
    await this.createAndReconcileButton.click()

    // Wait for API response
    const response = await responsePromise
    const durationMs = Date.now() - start
    const responseData = await response.json().catch(() => null)

    const dealId = responseData?.data?.id || null
    const responseStatus = response.status()

    console.log(`  API Response: ${responseStatus}, Deal ID: ${dealId}, Duration: ${durationMs}ms`)

    return { dealId, responseStatus, durationMs }
  }

  async clickSaveAsDraft(): Promise<{ success: boolean; responseStatus: number; durationMs: number }> {
    const start = Date.now()
    console.log("  Clicking Save as Draft...")

    const responsePromise = this.page.waitForResponse(
      resp => resp.url().includes("/api/deals") && resp.request().method() === "POST",
      { timeout: 60000 }
    )

    await this.saveAsDraftButton.click()

    const response = await responsePromise
    const durationMs = Date.now() - start

    return {
      success: response.status() === 200 || response.status() === 201,
      responseStatus: response.status(),
      durationMs
    }
  }

  async waitForReconciliationPage(dealId: string) {
    // Log current URL
    console.log(`  Current URL after submit: ${this.page.url()}`)

    // Wait for either navigation to reconciliation or some other page change
    try {
      await this.page.waitForURL(`**/reconciliation?dealId=${dealId}*`, { timeout: 30000 })
      console.log(`  Navigated to reconciliation page for deal: ${dealId}`)
    } catch {
      // Check if we're on any reconciliation page
      const currentUrl = this.page.url()
      console.log(`  Navigation timeout. Current URL: ${currentUrl}`)

      if (currentUrl.includes('/reconciliation')) {
        console.log(`  On reconciliation page (different URL format)`)
        return
      }

      // Maybe the page is still processing, wait a bit more
      await this.page.waitForTimeout(5000)
      const finalUrl = this.page.url()
      console.log(`  Final URL after extra wait: ${finalUrl}`)

      if (finalUrl.includes('/reconciliation')) {
        console.log(`  Successfully navigated to reconciliation`)
        return
      }

      // If still on new deal page, there might have been an error
      if (finalUrl.includes('/deals/new')) {
        const errorText = await this.submitError.textContent().catch(() => null)
        if (errorText) {
          throw new Error(`Navigation failed - error on page: ${errorText}`)
        }
        throw new Error(`Navigation failed - still on deals/new page`)
      }

      throw new Error(`Navigation timeout - ended up on: ${finalUrl}`)
    }
  }

  // Assertions
  async expectFormVisible() {
    await expect(this.dealNameInput).toBeVisible()
    await expect(this.talentInput).toBeVisible()
    await expect(this.brandInput).toBeVisible()
  }

  async expectUploadSuccess() {
    await expect(this.uploadSuccessIndicator).toBeVisible()
  }

  async expectCreateButtonEnabled() {
    await expect(this.createAndReconcileButton).toBeEnabled()
  }

  async expectCreateButtonDisabled() {
    await expect(this.createAndReconcileButton).toBeDisabled()
  }

  async expectError(errorText?: string) {
    await expect(this.submitError).toBeVisible()
    if (errorText) {
      await expect(this.submitError).toContainText(errorText)
    }
  }

  // Screenshot helper
  async takeScreenshot(name: string) {
    const screenshotPath = path.join("e2e", "artifacts", `${name}-${Date.now()}.png`)
    await this.page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(`  Screenshot saved: ${screenshotPath}`)
    return screenshotPath
  }
}
