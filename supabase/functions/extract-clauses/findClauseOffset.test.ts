/**
 * Unit tests for findClauseOffset function
 * Tests exact match, duplicate handling, whitespace variance, and no-match scenarios
 *
 * Run with:
 *   Deno: deno test supabase/functions/extract-clauses/findClauseOffset.test.ts
 *   Node: npx tsx supabase/functions/extract-clauses/findClauseOffset.test.ts
 */

// Simple assertion helpers (compatible with both Deno and Node)
function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected} but got ${actual}`)
  }
}

function assertNotEquals<T>(actual: T, notExpected: T, msg?: string): void {
  if (actual === notExpected) {
    throw new Error(msg || `Expected value to not equal ${notExpected}`)
  }
}

// Test runner
const tests: Array<{ name: string; fn: () => void }> = []
function test(name: string, fn: () => void): void {
  tests.push({ name, fn })
}

// Alias for Deno compatibility
const Deno = { test } as any

// Copy of findClauseOffset for testing (same implementation as index.ts)
function findClauseOffset(
  fullText: string,
  clauseContent: string,
  searchFrom: number
): { start: number; end: number } | null {
  if (!clauseContent || !fullText) return null

  // First try: exact match from searchFrom position
  const exactIdx = fullText.indexOf(clauseContent, searchFrom)
  if (exactIdx >= 0) {
    return { start: exactIdx, end: exactIdx + clauseContent.length }
  }

  // Fallback: whitespace-normalized fuzzy search
  const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim()
  const normalizedClause = normalizeWs(clauseContent)

  if (normalizedClause.length < 20) {
    // Too short for reliable fuzzy matching
    return null
  }

  // Search in a window from searchFrom
  const searchWindow = fullText.slice(searchFrom)
  const normalizedWindow = normalizeWs(searchWindow)
  const fuzzyIdx = normalizedWindow.indexOf(normalizedClause)

  if (fuzzyIdx >= 0) {
    // Map back to original positions (approximate)
    let normalizedCount = 0
    let originalStart = searchFrom
    let inWhitespace = false

    for (let i = 0; i < searchWindow.length && normalizedCount < fuzzyIdx; i++) {
      const isWs = /\s/.test(searchWindow[i])
      if (!isWs) {
        normalizedCount++
        inWhitespace = false
      } else if (!inWhitespace) {
        normalizedCount++
        inWhitespace = true
      }
      originalStart = searchFrom + i + 1
    }

    // Find where the clause ends in original text
    const endSearchStart = originalStart
    let endNormalizedCount = 0
    let originalEnd = originalStart
    inWhitespace = false

    for (let i = 0; i < fullText.length - endSearchStart && endNormalizedCount < normalizedClause.length; i++) {
      const char = fullText[endSearchStart + i]
      const isWs = /\s/.test(char)
      if (!isWs) {
        endNormalizedCount++
        inWhitespace = false
      } else if (!inWhitespace) {
        endNormalizedCount++
        inWhitespace = true
      }
      originalEnd = endSearchStart + i + 1
    }

    return { start: originalStart, end: originalEnd }
  }

  // Not found - return null rather than wrong offset
  return null
}

// ============ TEST CASES ============

Deno.test("exact match - finds clause at correct position", () => {
  const fullText = "This is the preamble. The Party agrees to the terms. More text follows."
  const clause = "The Party agrees to the terms."

  const result = findClauseOffset(fullText, clause, 0)

  assertEquals(result?.start, 22)
  assertEquals(result?.end, 52)
  assertEquals(fullText.slice(result!.start, result!.end), clause)
})

Deno.test("exact match - respects searchFrom position", () => {
  const fullText = "The Party agrees. The Party agrees. The Party agrees."
  const clause = "The Party agrees."

  // First occurrence
  const result1 = findClauseOffset(fullText, clause, 0)
  assertEquals(result1?.start, 0)

  // Second occurrence (search from after first)
  const result2 = findClauseOffset(fullText, clause, 18)
  assertEquals(result2?.start, 18)

  // Third occurrence (search from after second)
  const result3 = findClauseOffset(fullText, clause, 36)
  assertEquals(result3?.start, 36)
})

Deno.test("duplicate clauses - monotonic search prevents double-matching", () => {
  const fullText = "Payment terms: Net 30 days. Payment terms: Net 30 days."
  const clause = "Payment terms: Net 30 days."

  // Simulate monotonic search by tracking lastEnd
  let lastEnd = 0

  const result1 = findClauseOffset(fullText, clause, lastEnd)
  assertEquals(result1?.start, 0)
  lastEnd = result1?.end ?? lastEnd

  const result2 = findClauseOffset(fullText, clause, lastEnd)
  assertEquals(result2?.start, 28) // Second occurrence
  assertNotEquals(result2?.start, result1?.start) // Must be different
})

Deno.test("whitespace variance - handles GPT reformatting", () => {
  const fullText = "The   influencer  shall   deliver   content   on   time."
  const clause = "The influencer shall deliver content on time."

  const result = findClauseOffset(fullText, clause, 0)

  // Should find via fuzzy matching (clause is 45 chars, > 20 min)
  assertEquals(result !== null, true)
})

Deno.test("whitespace variance - handles newlines in document", () => {
  const fullText = "The influencer\nshall deliver\ncontent on time."
  const clause = "The influencer shall deliver content on time."

  const result = findClauseOffset(fullText, clause, 0)

  assertEquals(result !== null, true)
})

Deno.test("no match - returns null when clause not found", () => {
  const fullText = "This is a completely different document."
  const clause = "The Party agrees to the terms."

  const result = findClauseOffset(fullText, clause, 0)

  assertEquals(result, null)
})

Deno.test("no match - returns null when searchFrom is past clause", () => {
  const fullText = "The Party agrees. Some more text here."
  const clause = "The Party agrees."

  const result = findClauseOffset(fullText, clause, 20) // Start after the clause

  assertEquals(result, null)
})

Deno.test("short clause - returns null for unreliable fuzzy matching", () => {
  const fullText = "Short text here."
  const clause = "Short" // Less than 20 chars

  // Exact match should work
  const exactResult = findClauseOffset(fullText, clause, 0)
  assertEquals(exactResult?.start, 0)

  // But fuzzy matching for short modified clause should fail
  const modifiedClause = "Shrt" // Typo, no exact match
  const fuzzyResult = findClauseOffset(fullText, modifiedClause, 0)
  assertEquals(fuzzyResult, null)
})

Deno.test("empty inputs - handles gracefully", () => {
  assertEquals(findClauseOffset("", "clause", 0), null)
  assertEquals(findClauseOffset("text", "", 0), null)
  assertEquals(findClauseOffset("", "", 0), null)
})

Deno.test("offset boundary - doesn't exceed text length", () => {
  const fullText = "Short text."
  const clause = "Short text."

  const result = findClauseOffset(fullText, clause, 0)

  assertEquals(result?.start, 0)
  assertEquals(result?.end, fullText.length)
  assertEquals(result!.end <= fullText.length, true)
})

Deno.test("complex document - finds clauses in order", () => {
  const fullText = `
AGREEMENT

1. PARTIES
The Influencer ("Creator") and Brand ("Client") enter into this agreement.

2. PAYMENT TERMS
The Client shall pay the Creator within thirty (30) days of invoice receipt.

3. DELIVERABLES
The Creator shall deliver all content by the agreed deadline.
`.trim()

  const clause1 = 'The Influencer ("Creator") and Brand ("Client") enter into this agreement.'
  const clause2 = "The Client shall pay the Creator within thirty (30) days of invoice receipt."
  const clause3 = "The Creator shall deliver all content by the agreed deadline."

  let lastEnd = 0

  const r1 = findClauseOffset(fullText, clause1, lastEnd)
  assertEquals(r1 !== null, true)
  lastEnd = r1?.end ?? lastEnd

  const r2 = findClauseOffset(fullText, clause2, lastEnd)
  assertEquals(r2 !== null, true)
  assertEquals(r2!.start > r1!.end, true) // Must be after first
  lastEnd = r2?.end ?? lastEnd

  const r3 = findClauseOffset(fullText, clause3, lastEnd)
  assertEquals(r3 !== null, true)
  assertEquals(r3!.start > r2!.end, true) // Must be after second
})

// ============ RUN TESTS ============
// When run directly (not imported), execute all tests
const hasDeno = typeof (globalThis as any).Deno !== "undefined"

if (!hasDeno) {
  // Node.js environment - run tests
  let passed = 0
  let failed = 0

  console.log("\n🧪 Running findClauseOffset tests...\n")

  for (const { name, fn } of tests) {
    try {
      fn()
      console.log(`✅ ${name}`)
      passed++
    } catch (error) {
      console.log(`❌ ${name}`)
      console.log(`   ${(error as Error).message}`)
      failed++
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`)

  if (failed > 0) {
    process.exit(1)
  }
}
