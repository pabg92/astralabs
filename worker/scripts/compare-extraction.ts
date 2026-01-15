/**
 * Compare extraction results before and after code changes
 *
 * Usage:
 *   npx ts-node scripts/compare-extraction.ts <document_id>
 *   npx ts-node scripts/compare-extraction.ts <document_id> --reprocess
 *
 * Without --reprocess: Shows current extraction stats
 * With --reprocess: Re-runs extraction and compares to previous results
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })
dotenv.config({ path: '../.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface ClauseStats {
  total_clauses: number
  by_type: Record<string, number>
  by_rag_status: Record<string, number>
  avg_length: number
  min_length: number
  max_length: number
  clauses: Array<{
    id: string
    clause_type: string
    content_preview: string
    length: number
    rag_status: string | null
  }>
}

async function getClauseStats(documentId: string): Promise<ClauseStats | null> {
  // Fetch clause boundaries
  const { data: clauses, error: clauseError } = await supabase
    .from('clause_boundaries')
    .select('id, clause_type, content, start_char, end_char')
    .eq('document_id', documentId)
    .order('start_char', { ascending: true })

  if (clauseError) {
    console.error('Error fetching clauses:', clauseError)
    return null
  }

  if (!clauses || clauses.length === 0) {
    console.log('No clauses found for document')
    return null
  }

  // Fetch match results for RAG status
  const { data: matches, error: matchError } = await supabase
    .from('clause_match_results')
    .select('clause_boundary_id, rag_status, rag_parsing, rag_risk')
    .eq('document_id', documentId)

  const matchMap = new Map(matches?.map(m => [m.clause_boundary_id, m]) || [])

  // Calculate stats
  const byType: Record<string, number> = {}
  const byRagStatus: Record<string, number> = {}
  let totalLength = 0

  const clauseDetails = clauses.map(c => {
    const match = matchMap.get(c.id)
    const ragStatus = match?.rag_status || match?.rag_parsing || match?.rag_risk || 'unknown'
    const length = c.content?.length || 0

    byType[c.clause_type] = (byType[c.clause_type] || 0) + 1
    byRagStatus[ragStatus] = (byRagStatus[ragStatus] || 0) + 1
    totalLength += length

    return {
      id: c.id,
      clause_type: c.clause_type,
      content_preview: c.content?.slice(0, 80) + (c.content?.length > 80 ? '...' : ''),
      length,
      rag_status: ragStatus
    }
  })

  const lengths = clauseDetails.map(c => c.length)

  return {
    total_clauses: clauses.length,
    by_type: byType,
    by_rag_status: byRagStatus,
    avg_length: Math.round(totalLength / clauses.length),
    min_length: Math.min(...lengths),
    max_length: Math.max(...lengths),
    clauses: clauseDetails
  }
}

async function getDocumentInfo(documentId: string) {
  const { data, error } = await supabase
    .from('document_repository')
    .select('id, original_filename, processing_status, deal_id, created_at')
    .eq('id', documentId)
    .single()

  if (error) {
    console.error('Error fetching document:', error)
    return null
  }
  return data
}

async function reprocessDocument(documentId: string): Promise<boolean> {
  console.log('\n📤 Re-enqueueing document for processing...')

  // Clear existing clause data
  const { error: deleteClausesError } = await supabase
    .from('clause_boundaries')
    .delete()
    .eq('document_id', documentId)

  if (deleteClausesError) {
    console.error('Error clearing clauses:', deleteClausesError)
    return false
  }

  const { error: deleteMatchesError } = await supabase
    .from('clause_match_results')
    .delete()
    .eq('document_id', documentId)

  if (deleteMatchesError) {
    console.error('Error clearing matches:', deleteMatchesError)
    return false
  }

  // Reset processing status
  const { error: updateError } = await supabase
    .from('document_repository')
    .update({ processing_status: 'pending' })
    .eq('id', documentId)

  if (updateError) {
    console.error('Error updating status:', updateError)
    return false
  }

  // Enqueue for processing
  const { error: enqueueError } = await supabase.rpc('manual_enqueue_document', {
    p_document_id: documentId
  })

  if (enqueueError) {
    console.error('Error enqueueing:', enqueueError)
    return false
  }

  console.log('✅ Document enqueued. Run the worker to process it.')
  return true
}

function printStats(stats: ClauseStats, label: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`📊 ${label}`)
  console.log('='.repeat(60))

  console.log(`\nTotal Clauses: ${stats.total_clauses}`)
  console.log(`Average Length: ${stats.avg_length} chars`)
  console.log(`Length Range: ${stats.min_length} - ${stats.max_length} chars`)

  console.log('\nBy Clause Type:')
  Object.entries(stats.by_type)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`)
    })

  console.log('\nBy RAG Status:')
  Object.entries(stats.by_rag_status)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      const emoji = status === 'green' ? '🟢' : status === 'amber' ? '🟡' : status === 'red' ? '🔴' : '⚪'
      console.log(`  ${emoji} ${status}: ${count}`)
    })
}

function compareStats(before: ClauseStats, after: ClauseStats) {
  console.log(`\n${'='.repeat(60)}`)
  console.log('📈 COMPARISON')
  console.log('='.repeat(60))

  const clauseDiff = after.total_clauses - before.total_clauses
  const lengthDiff = after.avg_length - before.avg_length

  console.log(`\nClause Count: ${before.total_clauses} → ${after.total_clauses} (${clauseDiff >= 0 ? '+' : ''}${clauseDiff})`)
  console.log(`Avg Length: ${before.avg_length} → ${after.avg_length} (${lengthDiff >= 0 ? '+' : ''}${lengthDiff})`)

  // Find new/removed clause types
  const beforeTypes = new Set(Object.keys(before.by_type))
  const afterTypes = new Set(Object.keys(after.by_type))

  const newTypes = [...afterTypes].filter(t => !beforeTypes.has(t))
  const removedTypes = [...beforeTypes].filter(t => !afterTypes.has(t))

  if (newTypes.length > 0) {
    console.log(`\n✅ New clause types detected: ${newTypes.join(', ')}`)
  }
  if (removedTypes.length > 0) {
    console.log(`\n⚠️ Removed clause types: ${removedTypes.join(', ')}`)
  }

  // RAG status changes
  console.log('\nRAG Status Changes:')
  const allStatuses = new Set([...Object.keys(before.by_rag_status), ...Object.keys(after.by_rag_status)])
  allStatuses.forEach(status => {
    const beforeCount = before.by_rag_status[status] || 0
    const afterCount = after.by_rag_status[status] || 0
    if (beforeCount !== afterCount) {
      const diff = afterCount - beforeCount
      const emoji = status === 'green' ? '🟢' : status === 'amber' ? '🟡' : status === 'red' ? '🔴' : '⚪'
      console.log(`  ${emoji} ${status}: ${beforeCount} → ${afterCount} (${diff >= 0 ? '+' : ''}${diff})`)
    }
  })
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log('Usage: npx ts-node scripts/compare-extraction.ts <document_id> [--reprocess]')
    console.log('\nTo find document IDs:')
    console.log('  SELECT id, original_filename FROM document_repository ORDER BY created_at DESC LIMIT 10;')
    process.exit(1)
  }

  const documentId = args[0]
  const shouldReprocess = args.includes('--reprocess')

  // Get document info
  const doc = await getDocumentInfo(documentId)
  if (!doc) {
    console.error('Document not found')
    process.exit(1)
  }

  console.log(`\n📄 Document: ${doc.original_filename}`)
  console.log(`   Status: ${doc.processing_status}`)
  console.log(`   Created: ${doc.created_at}`)

  // Get current stats
  const currentStats = await getClauseStats(documentId)

  if (!currentStats) {
    console.log('\nNo extraction data found. Run --reprocess to extract.')
    if (shouldReprocess) {
      await reprocessDocument(documentId)
    }
    process.exit(0)
  }

  printStats(currentStats, 'CURRENT EXTRACTION RESULTS')

  if (shouldReprocess) {
    // Save current stats for comparison
    const beforeStats = currentStats

    // Reprocess
    const success = await reprocessDocument(documentId)
    if (!success) {
      process.exit(1)
    }

    console.log('\n⏳ Waiting for processing... (run worker in another terminal)')
    console.log('   Then run this script again WITHOUT --reprocess to compare.')

    // Save before stats to a temp file for later comparison
    const fs = await import('fs')
    const snapshotPath = `/tmp/extraction-snapshot-${documentId}.json`
    fs.writeFileSync(snapshotPath, JSON.stringify(beforeStats, null, 2))
    console.log(`\n💾 Snapshot saved to: ${snapshotPath}`)
    console.log('   After processing, run:')
    console.log(`   npx ts-node scripts/compare-extraction.ts ${documentId} --compare ${snapshotPath}`)
  }

  // Check for comparison
  const compareIdx = args.indexOf('--compare')
  if (compareIdx !== -1 && args[compareIdx + 1]) {
    const snapshotPath = args[compareIdx + 1]
    const fs = await import('fs')
    try {
      const beforeStats = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as ClauseStats
      printStats(beforeStats, 'BEFORE (from snapshot)')
      compareStats(beforeStats, currentStats)
    } catch (e) {
      console.error('Could not read snapshot file:', snapshotPath)
    }
  }
}

main().catch(console.error)
