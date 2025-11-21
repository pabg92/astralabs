#!/usr/bin/env tsx
/**
 * PDF Tab Regression Test
 *
 * Tests that the PDF viewer loads without the React-PDF "Object.defineProperty" error.
 *
 * Usage: pnpm test:pdf-tab
 *
 * Exit codes:
 * - 0: Test passed (PDF tab renders without errors)
 * - 1: Test failed (errors detected or PDF didn't load)
 */

import { chromium, Browser, Page } from 'playwright'

const TEST_DEAL_ID = '1d6b4c0a-7fe5-4aed-aa59-817d8ff86893'
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001'
const TIMEOUT = 30000 // 30 seconds

interface TestResult {
  passed: boolean
  message: string
  errors: string[]
}

async function testPDFTab(): Promise<TestResult> {
  let browser: Browser | null = null
  let page: Page | null = null
  const consoleErrors: string[] = []

  try {
    console.log('🚀 Starting PDF tab test...')
    console.log(`   URL: ${BASE_URL}/reconciliation?dealId=${TEST_DEAL_ID}`)

    // Launch browser
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    })
    page = await context.newPage()

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        consoleErrors.push(text)
        console.log(`   ❌ Console error: ${text}`)
      }
    })

    // Capture page errors
    page.on('pageerror', (error) => {
      consoleErrors.push(error.message)
      console.log(`   ❌ Page error: ${error.message}`)
    })

    // Navigate to reconciliation page
    console.log('   📄 Navigating to reconciliation page...')
    await page.goto(`${BASE_URL}/reconciliation?dealId=${TEST_DEAL_ID}`, {
      waitUntil: 'load',
      timeout: TIMEOUT
    })

    // Give page time to hydrate
    await page.waitForTimeout(2000)

    // Wait for page to load - look for contract content
    await page.waitForSelector('text=Contract Review Progress', { timeout: TIMEOUT })
    console.log('   ✅ Page loaded')

    // Wait for tabs to be clickable - Radix UI tabs
    await page.waitForSelector('button[role="tab"]', { timeout: TIMEOUT })
    console.log('   ✅ Tabs rendered')

    // Click PDF tab
    console.log('   🖱️  Clicking PDF tab...')
    const pdfTab = page.locator('button[role="tab"]:has-text("PDF")')
    await pdfTab.click()
    console.log('   ✅ PDF tab clicked')

    // Wait for PDF viewer to appear
    console.log('   ⏳ Waiting for PDF viewer to load...')
    await page.waitForSelector('#pdf-container', { timeout: TIMEOUT })
    console.log('   ✅ PDF container found')

    // Wait for PDF canvas or loading indicator
    try {
      await page.waitForSelector('canvas.react-pdf__Page__canvas, .react-pdf__Page', {
        timeout: TIMEOUT
      })
      console.log('   ✅ PDF canvas rendered')
    } catch (err) {
      // Check if there's a loading state or error message
      const loadingText = await page.textContent('body')
      if (loadingText?.includes('Loading PDF') || loadingText?.includes('No PDF available')) {
        console.log('   ⚠️  PDF viewer in loading/unavailable state (this is OK for empty data)')
      } else {
        throw new Error('PDF canvas did not render and no loading state detected')
      }
    }

    // Give React time to fully initialize
    await page.waitForTimeout(2000)

    // Check for authentication/authorization errors (should not occur with bypass)
    const hasAuthError = consoleErrors.some(err =>
      err.includes('401') ||
      err.includes('Unauthorized') ||
      err.includes('authentication required')
    )

    if (hasAuthError) {
      return {
        passed: false,
        message: 'PDF endpoint returned 401 Unauthorized - auth bypass not working',
        errors: consoleErrors
      }
    }

    // Check for specific "Object.defineProperty" error
    const hasDefinePropertyError = consoleErrors.some(err =>
      err.includes('Object.defineProperty') ||
      err.includes('defineProperty called on non-object')
    )

    if (hasDefinePropertyError) {
      return {
        passed: false,
        message: 'React-PDF "Object.defineProperty" error detected',
        errors: consoleErrors
      }
    }

    // Check for any React-PDF related errors
    const hasReactPdfError = consoleErrors.some(err =>
      err.toLowerCase().includes('react-pdf') ||
      err.toLowerCase().includes('pdfjs')
    )

    if (hasReactPdfError) {
      return {
        passed: false,
        message: 'React-PDF related error detected',
        errors: consoleErrors
      }
    }

    // Success!
    return {
      passed: true,
      message: 'PDF tab loaded successfully without errors',
      errors: consoleErrors
    }

  } catch (error) {
    return {
      passed: false,
      message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      errors: consoleErrors
    }
  } finally {
    if (page) await page.close()
    if (browser) await browser.close()
  }
}

// Run test
(async () => {
  console.log('')
  console.log('═══════════════════════════════════════')
  console.log('  PDF Tab Regression Test')
  console.log('═══════════════════════════════════════')
  console.log('')

  const result = await testPDFTab()

  console.log('')
  console.log('═══════════════════════════════════════')
  console.log('  Test Results')
  console.log('═══════════════════════════════════════')
  console.log('')

  if (result.passed) {
    console.log('✅ PASS:', result.message)
    if (result.errors.length > 0) {
      console.log('')
      console.log('ℹ️  Non-blocking console messages:', result.errors.length)
      result.errors.forEach(err => console.log(`   - ${err}`))
    }
    process.exit(0)
  } else {
    console.log('❌ FAIL:', result.message)
    if (result.errors.length > 0) {
      console.log('')
      console.log('Console errors:')
      result.errors.forEach(err => console.log(`   ❌ ${err}`))
    }
    process.exit(1)
  }
})()
