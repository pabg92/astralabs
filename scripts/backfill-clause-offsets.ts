#!/usr/bin/env npx tsx
/**
 * Backfill script to populate start_char and end_char for clause_boundaries
 * that were extracted before the character offset feature was implemented.
 *
 * Usage:
 *   npx tsx scripts/backfill-clause-offsets.ts [document_id]
 *
 * If document_id is provided, only that document is processed.
 * Otherwise, all documents with null offsets are processed.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

/**
 * Monotonic search for clause offset in extracted text.
 * Searches starting from lastEnd to prevent duplicate misplacement.
 * Falls back to fuzzy whitespace-normalized matching if exact match fails.
 */
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
    // Walk through original text counting normalized chars
    let normalizedCount = 0
    let originalStart = searchFrom
    let inWhitespace = false

    for (let i = 0; i < searchWindow.length && normalizedCount < fuzzyIdx; i++) {
      const isWs = /\s/.test(searchWindow[i])
      if (!isWs) {
        normalizedCount++
        inWhitespace = false
      } else if (!inWhitespace) {
        normalizedCount++ // Count first whitespace as single space
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

    // Validate span length to avoid truncated highlights on fuzzy matches
    const spanLength = originalEnd - originalStart
    const expectedLength = clauseContent.length
    const lengthDiff = Math.abs(spanLength - expectedLength)

    if (lengthDiff > expectedLength * 0.2 || lengthDiff > 50) {
      return null // Better to skip highlight than render wrong span
    }

    return { start: originalStart, end: originalEnd }
  }

  // Not found - return null rather than wrong offset
  return null
}

async function backfillClauseOffsets(specificDocumentId?: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Find documents with clauses that have null offsets
  let query = supabase
    .from('document_repository')
    .select(`
      id,
      extracted_text,
      original_filename
    `)
    .not('extracted_text', 'is', null)

  if (specificDocumentId) {
    query = query.eq('id', specificDocumentId)
  }

  const { data: documents, error: docError } = await query

  if (docError) {
    throw new Error(`Failed to fetch documents: ${docError.message}`)
  }

  if (!documents || documents.length === 0) {
    console.log('No documents found with extracted text')
    return
  }

  console.log(`Found ${documents.length} document(s) to process`)

  let totalUpdated = 0
  let totalSkipped = 0
  let totalMissed = 0

  for (const doc of documents) {
    console.log(`\nProcessing: ${doc.original_filename} (${doc.id})`)

    // Get all clauses for this document that have null start_char
    const { data: clauses, error: clauseError } = await supabase
      .from('clause_boundaries')
      .select('id, content, start_char, end_char')
      .eq('document_id', doc.id)
      .is('start_char', null)
      .order('created_at', { ascending: true })

    if (clauseError) {
      console.error(`  Error fetching clauses: ${clauseError.message}`)
      continue
    }

    if (!clauses || clauses.length === 0) {
      console.log(`  No clauses need backfill (all have offsets or none exist)`)
      continue
    }

    console.log(`  ${clauses.length} clauses need offset backfill`)

    const extractedText = doc.extracted_text
    if (!extractedText) {
      console.log(`  Skipping - no extracted_text available`)
      totalSkipped += clauses.length
      continue
    }

    // Calculate offsets using monotonic search
    let lastEnd = 0
    let hits = 0
    let misses = 0
    const updates: Array<{ id: string; start_char: number; end_char: number }> = []

    for (const clause of clauses) {
      const offset = findClauseOffset(extractedText, clause.content, lastEnd)

      if (offset) {
        updates.push({
          id: clause.id,
          start_char: offset.start,
          end_char: offset.end
        })
        lastEnd = offset.end
        hits++
      } else {
        // Advance search position even on miss
        lastEnd = Math.min(lastEnd + clause.content.length, extractedText.length)
        misses++
      }
    }

    console.log(`  Offset calculation: ${hits} hits, ${misses} misses`)

    // Batch update clauses
    if (updates.length > 0) {
      // Supabase doesn't support bulk upsert with different values per row easily,
      // so we do individual updates (could optimize with raw SQL if needed)
      let updateSuccess = 0
      let updateFail = 0

      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('clause_boundaries')
          .update({
            start_char: update.start_char,
            end_char: update.end_char
          })
          .eq('id', update.id)

        if (updateError) {
          updateFail++
          console.error(`  Update failed for clause ${update.id}: ${updateError.message}`)
        } else {
          updateSuccess++
        }
      }

      console.log(`  Updated ${updateSuccess} clauses (${updateFail} failures)`)
      totalUpdated += updateSuccess
    }

    totalMissed += misses
  }

  console.log(`\n=== Backfill Complete ===`)
  console.log(`Total updated: ${totalUpdated}`)
  console.log(`Total skipped: ${totalSkipped}`)
  console.log(`Total missed (no match found): ${totalMissed}`)
}

// Run the backfill
const documentIdArg = process.argv[2]
backfillClauseOffsets(documentIdArg)
  .then(() => {
    console.log('\nBackfill finished successfully')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\nBackfill failed:', err)
    process.exit(1)
  })
