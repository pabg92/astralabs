/**
 * Convert LCL CSV template to SQL INSERT statements
 * Usage: npx ts-node scripts/csv-to-lcl-sql.ts
 */

import * as fs from 'fs'
import * as path from 'path'

const CSV_FILE = path.join(__dirname, 'lcl-backfill-template.csv')
const OUTPUT_FILE = path.join(__dirname, 'lcl-backfill-generated.sql')

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n')
  const headers = parseCSVLine(lines[0])

  return lines.slice(1).map(line => {
    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((header, i) => {
      row[header] = values[i] || ''
    })
    return row
  })
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function escapeSQL(str: string): string {
  return str.replace(/'/g, "''")
}

function generateSQL(rows: Record<string, string>[]): string {
  let sql = `-- Generated LCL Backfill SQL
-- Generated at: ${new Date().toISOString()}
-- Total clauses: ${rows.length}

BEGIN;

`

  for (const row of rows) {
    const tags = row.tags
      ? `ARRAY[${row.tags.split('|').map(t => `'${escapeSQL(t.trim())}'`).join(', ')}]`
      : 'NULL'

    sql += `INSERT INTO legal_clause_library (
  clause_id,
  clause_type,
  category,
  standard_text,
  risk_level,
  plain_english_summary,
  tags,
  is_required,
  is_approved,
  variation_letter,
  version,
  created_at
) VALUES (
  '${escapeSQL(row.clause_id)}',
  '${escapeSQL(row.clause_type)}',
  '${escapeSQL(row.category)}',
  '${escapeSQL(row.standard_text)}',
  '${escapeSQL(row.risk_level)}',
  '${escapeSQL(row.plain_english_summary)}',
  ${tags},
  ${row.is_required === 'true'},
  true,
  '${row.clause_id.slice(-1)}',
  1,
  NOW()
) ON CONFLICT (clause_id) DO UPDATE SET
  standard_text = EXCLUDED.standard_text,
  plain_english_summary = EXCLUDED.plain_english_summary,
  updated_at = NOW();

`
  }

  sql += `COMMIT;

-- Verification
SELECT
  COUNT(*) as total_clauses,
  COUNT(DISTINCT category) as categories,
  COUNT(DISTINCT clause_type) as clause_types
FROM legal_clause_library;
`

  return sql
}

// Main
const csvContent = fs.readFileSync(CSV_FILE, 'utf-8')
const rows = parseCSV(csvContent)
const sql = generateSQL(rows)

fs.writeFileSync(OUTPUT_FILE, sql)
console.log(`Generated ${OUTPUT_FILE} with ${rows.length} clauses`)
console.log(`\nTo apply: supabase db execute < ${OUTPUT_FILE}`)
console.log(`Or copy/paste into Supabase SQL Editor`)
