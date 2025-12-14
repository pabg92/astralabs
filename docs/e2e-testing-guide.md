# End-to-End Testing Guide for ContractBuddy Reconciliation Pipeline

This guide documents how to run comprehensive end-to-end tests for the ContractBuddy contract reconciliation system, including LCL (Legal Clause Library) matching and P1 (Pre-Agreed Terms) reconciliation.

**Last Updated:** December 14, 2025

---

## Table of Contents

1. [Quick Start: 5-Minute E2E Test](#quick-start-5-minute-e2e-test)
2. [Overview](#overview)
3. [Prerequisites](#prerequisites)
4. [Understanding the Pipeline](#understanding-the-pipeline)
5. [Step 1: Analyze Contract Contents](#step-1-analyze-contract-contents)
6. [Step 2: Create Deals](#step-2-create-deals)
7. [Step 3: Create Pre-Agreed Terms (PATs)](#step-3-create-pre-agreed-terms-pats)
8. [Step 4: Link Documents to Deals](#step-4-link-documents-to-deals)
9. [Step 5: Clear Previous P1 Data](#step-5-clear-previous-p1-data)
10. [Step 6: Run P1 Reconciliation](#step-6-run-p1-reconciliation)
11. [Step 7: Validate Results](#step-7-validate-results)
12. [Testing with Red Herrings](#testing-with-red-herrings)
13. [Evaluating Clause Extraction Quality](#evaluating-clause-extraction-quality)
14. [Troubleshooting](#troubleshooting)
15. [Test Results Archive](#test-results-archive)

---

## Quick Start: 5-Minute E2E Test

Run this to quickly test a fresh contract:

```bash
# 1. Find an untested contract
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('document_repository').select('original_filename, id').is('deal_id', null).eq('processing_status', 'completed')
  .then(({data}) => console.log('Untested contracts:', data?.map(d => d.original_filename)));
"

# 2. Read contract clauses (replace CONTRACT.pdf)
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('clause_boundaries').select('clause_type, content').eq('document_id',
  supabase.from('document_repository').select('id').eq('original_filename', 'CONTRACT.pdf').single()
).then(({data}) => data?.forEach(c => console.log(\`[\${c.clause_type}] \${c.content.slice(0,200)}...\`)));
"

# 3. Create deal + PATs via Supabase SQL editor, then:

# 4. Run P1 reconciliation
npx tsx scripts/run-p1-all.ts

# 5. Check results
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.rpc('get_p1_results', { contract_name: 'CONTRACT.pdf' })
  .then(({data}) => console.table(data));
"
```

**Or use the SQL workflow below for full control.**

---

## Overview

The ContractBuddy reconciliation pipeline has two layers:

| Layer | Purpose | What It Checks |
|-------|---------|----------------|
| **LCL Matching** | Identify clause types | "Is this a payment clause? Usage rights clause?" |
| **P1 Reconciliation** | Compare against agreed terms | "Does this payment match what we agreed ($5k, 30 days)?" |

**Final Status = Worst of Both Layers**
- If LCL is GREEN but P1 is RED → Final is RED
- If LCL is RED but P1 is GREEN → Final is RED
- Both GREEN → Final is GREEN

---

## Prerequisites

1. **Environment Variables** in `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_key
   OPENAI_API_KEY=your_openai_key
   ```

2. **Dependencies installed**:
   ```bash
   pnpm install
   ```

3. **Documents already processed** (clauses extracted and embeddings generated)

---

## Understanding the Pipeline

### Data Flow

```
Document Upload
      ↓
Clause Extraction (extract-clauses edge function)
      ↓
Embedding Generation (generate-embeddings edge function)
      ↓
LCL Matching (find_similar_clauses RPC)
      ↓
P1 Reconciliation (worker/p1-reconciliation.ts)
      ↓
Final Status (rag_status = worst of rag_risk + rag_parsing)
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `deals` | Brand deals with talent |
| `pre_agreed_terms` | What was agreed for each deal |
| `document_repository` | Uploaded contracts linked to deals |
| `clause_boundaries` | Extracted clauses from contracts |
| `clause_match_results` | LCL matching + P1 comparison results |
| `discrepancies` | Flagged issues for review |

---

## Step 1: Analyze Contract Contents

Before testing, understand what's in each contract:

```sql
-- Get key terms from contracts
SELECT
  d.original_filename,
  cb.clause_type,
  LEFT(cb.content, 300) as content
FROM clause_boundaries cb
JOIN document_repository d ON d.id = cb.document_id
WHERE cb.clause_type IN ('payment_terms', 'deliverables', 'deliverable_obligation')
  AND (cb.content ILIKE '%$%' OR cb.content ILIKE '%fee%')
ORDER BY d.original_filename;
```

**Document what you find:**

| Contract | Brand | Fee | Deliverables | Payment Timing |
|----------|-------|-----|--------------|----------------|
| C7.pdf | Hourglass | $25,000 | 1 TikTok | 30 days |
| C8.pdf | Valentino | $20,000 | 1 TikTok | 60 days |
| C9.pdf | Glossier | $5,000 | 1 TikTok + Reels | - |

---

## Step 2: Create Deals

Create a deal for each brand:

```sql
-- Get tenant_id and created_by from existing data
SELECT tenant_id, created_by FROM deals LIMIT 1;

-- Create deals
INSERT INTO deals (id, tenant_id, title, client_name, talent_name, status, value, currency, created_by)
VALUES
  (gen_random_uuid(), 'your_tenant_id', 'Hourglass Cosmetics', 'Hourglass', '@stxph.h', 'in_review', 25000, 'USD', 'your_created_by'),
  (gen_random_uuid(), 'your_tenant_id', 'Valentino Beauty', 'Valentino', 'Eden Mackney', 'in_review', 20000, 'USD', 'your_created_by'),
  (gen_random_uuid(), 'your_tenant_id', 'Glossier Campaign', 'Glossier', 'Talent TBD', 'in_review', 5000, 'USD', 'your_created_by')
RETURNING id, title;
```

**Save the returned deal IDs** - you'll need them for PATs and document linking.

---

## Step 3: Create Pre-Agreed Terms (PATs)

PATs define what you agreed with the brand. Create them for each deal:

```sql
-- PATs for Hourglass (example: matching terms)
INSERT INTO pre_agreed_terms (deal_id, tenant_id, term_category, term_description, is_mandatory)
VALUES
  ('hourglass_deal_id', 'your_tenant_id',
   'Compensation & Payment Timing',
   'Fee: $25,000 USD. Payment within 30 days of invoice receipt.',
   true),
  ('hourglass_deal_id', 'your_tenant_id',
   'Deliverables & Posting Requirements',
   '1 TikTok video on talent''s personal channel.',
   true);
```

### Available PAT Categories

| Category | Maps To Clause Types |
|----------|---------------------|
| `Compensation & Payment Timing` | payment_terms |
| `Deliverables & Posting Requirements` | deliverables, deliverable_obligation |
| `Content Approval & Revisions` | content_requirement, acceptance_mechanism |
| `Content Retention & Non-Removal` | usage_rights, timeline_obligation |
| `Usage Rights & Licensing` | usage_rights, intellectual_property |

---

## Step 4: Link Documents to Deals

Each document must be linked to its correct deal:

```sql
-- Link C7.pdf to Hourglass deal
UPDATE document_repository
SET deal_id = 'hourglass_deal_id'
WHERE original_filename = 'C7.pdf';

-- Verify linkages
SELECT original_filename, d.title as deal
FROM document_repository dr
LEFT JOIN deals d ON d.id = dr.deal_id
WHERE dr.original_filename IN ('C7.pdf', 'C8.pdf', 'C9.pdf');
```

**Important:** Documents without a `deal_id` will skip P1 reconciliation.

---

## Step 5: Clear Previous P1 Data

Before re-running P1, clear old comparison data:

```sql
-- Delete old discrepancies
DELETE FROM discrepancies WHERE discrepancy_type IN ('missing', 'conflicting');

-- Clear P1 comparisons from match results
UPDATE clause_match_results
SET gpt_analysis = gpt_analysis - 'pre_agreed_comparisons' - 'reconciliation_timestamp',
    rag_parsing = NULL,
    rag_status = rag_risk
WHERE gpt_analysis ? 'pre_agreed_comparisons';

-- Delete virtual match results (missing term placeholders)
DELETE FROM clause_match_results WHERE clause_boundary_id IS NULL;
```

---

## Step 6: Run P1 Reconciliation

Run the P1 reconciliation script:

```bash
npx tsx scripts/run-p1-all.ts
```

**Expected output:**
```
🔍 Finding documents with deal_id for P1 reprocessing...
📄 Found 5 documents with deal_id

📋 Processing: C7.pdf (uuid)
   4️⃣ P1: Comparing against pre-agreed terms (batched)...
   Found 2 pre-agreed terms
   Built 11 comparisons for 2 PAT terms
   Using model: gpt-4o (estimated 1650 tokens)
     Batch 1/1: 11 comparisons...
   Got 11/11 results
   Selected 2 best matches (1 per PAT)
   ✅ P1 complete in 4.7s: 11 comparisons, 2 updated, 0 discrepancies

============================================================
📊 P1 Reconciliation Summary
============================================================
Documents processed: 5
Total comparisons: 100
Clauses updated: 15
Discrepancies created: 3
```

---

## Step 7: Validate Results

### Check P1 Results by Deal

```sql
SELECT
  deals.title as deal,
  d.original_filename,
  cmr.rag_parsing as p1_status,
  cmr.rag_status as final_status,
  cmr.gpt_analysis->'pre_agreed_comparisons'->0->>'term_category' as pat_category,
  cmr.gpt_analysis->'pre_agreed_comparisons'->0->'comparison_result'->>'explanation' as explanation
FROM clause_match_results cmr
JOIN document_repository d ON d.id = cmr.document_id
JOIN deals ON deals.id = d.deal_id
WHERE cmr.gpt_analysis->'pre_agreed_comparisons' IS NOT NULL
ORDER BY deals.title, cmr.rag_status DESC;
```

### Check LCL Results

```sql
SELECT
  d.original_filename,
  deals.title as deal,
  COUNT(*) as total_clauses,
  SUM(CASE WHEN cmr.rag_risk = 'green' THEN 1 ELSE 0 END) as lcl_green,
  ROUND(100.0 * SUM(CASE WHEN cmr.rag_risk = 'green' THEN 1 ELSE 0 END) / COUNT(*), 1) as lcl_green_pct,
  ROUND(AVG(cmr.similarity_score::numeric), 3) as avg_similarity
FROM clause_match_results cmr
JOIN document_repository d ON d.id = cmr.document_id
LEFT JOIN deals ON deals.id = d.deal_id
WHERE cmr.clause_boundary_id IS NOT NULL
GROUP BY d.original_filename, deals.title
ORDER BY d.original_filename;
```

### Check Overall Status Distribution

```sql
SELECT
  rag_status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as pct
FROM clause_match_results
WHERE clause_boundary_id IS NOT NULL
GROUP BY rag_status
ORDER BY
  CASE rag_status
    WHEN 'green' THEN 1
    WHEN 'amber' THEN 2
    WHEN 'red' THEN 3
  END;
```

---

## Testing with Red Herrings

To verify the pipeline catches real issues, plant deliberate mismatches:

### Example Red Herrings

| Deal | Actual Contract | PAT (Wrong) | Expected Result |
|------|-----------------|-------------|-----------------|
| Hourglass | Fee: $25,000 | Fee: $5,000 | 🔴 RED - Fee mismatch |
| Valentino | Payment: 60 days | Payment: 30 days | 🔴 RED - Timing mismatch |
| Kyra | Platform: TikTok | Platform: Instagram | 🔴 RED - Platform mismatch |

### Creating a Red Herring PAT

```sql
-- PAT with WRONG fee (contract says $25k, PAT says $5k)
INSERT INTO pre_agreed_terms (deal_id, tenant_id, term_category, term_description, is_mandatory)
VALUES
  ('hourglass_deal_id', 'your_tenant_id',
   'Compensation & Payment Timing',
   'Fee: $5,000 USD. Payment within 30 days.',  -- WRONG: actual is $25k
   true);
```

### Verifying Red Herring Detection

After running P1:

```sql
SELECT
  deals.title,
  cmr.rag_parsing,
  cmr.gpt_analysis->'pre_agreed_comparisons'->0->'comparison_result'->>'explanation' as why
FROM clause_match_results cmr
JOIN document_repository d ON d.id = cmr.document_id
JOIN deals ON deals.id = d.deal_id
WHERE deals.title = 'Hourglass Cosmetics'
  AND cmr.gpt_analysis->'pre_agreed_comparisons'->0->>'term_category' = 'Compensation & Payment Timing';
```

**Expected output:**
```
title: Hourglass Cosmetics
rag_parsing: red
why: "Fee amount conflicts with term"
```

---

## Troubleshooting

### P1 Shows "0 comparisons"

**Cause:** TERM_TO_CLAUSE_MAP doesn't have entries for your PAT categories.

**Fix:** Check `worker/p1-reconciliation.ts` and ensure your `term_category` values are in the map.

### Wrong Clause Selected for Comparison

**Cause:** P1 selects top clauses by LCL similarity, not by relevance to PAT.

**Fix:** The code now uses top 10 candidates instead of 3. If still an issue, increase the limit in `selectTopClausesForTerm()`.

### "Missing" Discrepancies for Matching Terms

**Cause:** Bug where `matchedCategories` was built from stale data.

**Fix:** Already fixed - `matchedCategories` now uses `bestMatchByTerm` (actual P1 results).

### All Contracts Show Same Issues

**Cause:** All documents linked to same deal with same PATs.

**Fix:** Create separate deals for each brand and link documents appropriately.

---

## Quick Reference: SQL Queries

### List All Deals and PATs
```sql
SELECT d.title, p.term_category, p.term_description
FROM deals d
JOIN pre_agreed_terms p ON p.deal_id = d.id
ORDER BY d.title, p.term_category;
```

### List Documents and Their Deals
```sql
SELECT dr.original_filename, d.title as deal
FROM document_repository dr
LEFT JOIN deals d ON d.id = dr.deal_id
ORDER BY d.title, dr.original_filename;
```

### Full Status Report
```sql
SELECT
  d.original_filename,
  deals.title as deal,
  cmr.rag_risk as lcl_status,
  cmr.rag_parsing as p1_status,
  cmr.rag_status as final_status
FROM clause_match_results cmr
JOIN document_repository d ON d.id = cmr.document_id
LEFT JOIN deals ON deals.id = d.deal_id
WHERE cmr.clause_boundary_id IS NOT NULL
ORDER BY d.original_filename, cmr.rag_status;
```

---

## Summary

1. **Analyze contracts** to understand actual terms
2. **Create deals** for each brand
3. **Create PATs** with agreed terms (include red herrings for testing)
4. **Link documents** to correct deals
5. **Clear old data** before re-running
6. **Run P1** with `npx tsx scripts/run-p1-all.ts`
7. **Validate** with SQL queries

**Success Criteria:**
- Red herrings detected as RED ✅
- Matching contracts show GREEN ✅
- LCL green rate > 75% ✅
- P1 explanations are accurate ✅

---

## Evaluating Clause Extraction Quality

Not all extracted clauses are complete. Evaluate quality before trusting results:

```sql
-- Check clause quality for a contract
SELECT
  cb.clause_type,
  LENGTH(cb.content) as content_length,
  CASE
    WHEN LENGTH(cb.content) < 80 THEN '⚠️ Too short'
    WHEN cb.content NOT LIKE '%.%' THEN '⚠️ No sentence'
    WHEN cb.content LIKE '%...%' THEN '⚠️ Truncated'
    ELSE '✅ Complete'
  END as quality,
  LEFT(cb.content, 100) as preview
FROM clause_boundaries cb
JOIN document_repository d ON d.id = cb.document_id
WHERE d.original_filename = 'CONTRACT.pdf'
ORDER BY cb.clause_type;
```

### Quality Indicators

| Quality | Indicator | Action |
|---------|-----------|--------|
| ✅ Complete | >100 chars, full sentences | Trust P1 result |
| ⚠️ Fragment | <80 chars or missing context | P1 may miss details |
| ⚠️ Truncated | Contains "..." | Check original PDF |

### Expected Quality Distribution

| Rating | Target % |
|--------|----------|
| Complete | >50% |
| Fragment | <40% |
| Too Short | <10% |

---

## Test Results Archive

### December 14, 2025 - P1 Fixes Validation

| Contract | Red Herrings | Detected | Controls | Correct |
|----------|--------------|----------|----------|---------|
| C12.pdf | 2 (fee $3.5k→$2.3k, deliverables 2→1) | 2/2 ✅ | 1 (usage 30d) | 1/1 ✅ |
| C16.pdf | 2 (fee $5.5k→$4k, usage 30d→60d) | 2/2 ✅ | 2 (deliverables, revisions) | 2/2 ✅ |
| C18.pdf | 2 (fee $3.5k→$2k, deliverables 3→1) | 2/2 ✅ | 2 (revisions, FTC) | 2/2 ✅ |
| C7.pdf | 1 (fee $5k→$25k, better for talent) | GREEN ✅ | 1 (deliverables) | 1/1 ✅ |
| C8.pdf | 1 (timing 30d→60d) | 1/1 ✅ | 1 (deliverables) | 1/1 ✅ |
| C10.pdf | 1 (platform IG→TikTok) | 1/1 ✅ | 2 (payment, retention) | 2/2 ✅ |

**Total: 9/9 red herrings detected, 9/9 controls correct**

### Key Fixes Applied

1. **Semantic Relevance Scoring**: Prioritizes clauses with matching $ amounts, platforms, durations
2. **Prefer RED for High Relevance**: When both clauses are relevant, surfaces RED (problems) over GREEN
3. **Talent-Protective Prompting**: GPT explicitly protects talent interests
4. **Compensation Fallback Mapping**: Finds fee info in usage_rights and general_terms clauses

### Example P1 Explanations (Good)

| Type | Before | After |
|------|--------|-------|
| Fee mismatch | "Payment terms missing" | "Contract: $4,000, Agreed: $5,500 - $1,500 shortfall" |
| Usage mismatch | "Matches: 60 days" | "Contract: 60 days, Agreed: 30 days - brand gets 30 extra days" |
| Fee better | N/A | "Contract: $25,000 fee, Agreed: $5,000 fee - better for talent" |

---

## P1 Selection Logic

The `isBetterMatch()` function in `worker/p1-reconciliation.ts` determines which clause to show:

```
Priority Order:
1. High relevance clause (>30 score) beats low relevance
2. If BOTH high relevance:
   a. If relevance differs by >15 → prefer higher relevance
   b. If similar relevance → PREFER RED (surface problems!)
3. If both low relevance → prefer GREEN (traditional)
4. Same score → use confidence as tiebreaker
```

**Why prefer RED?** Talent managers need to see problems, not incidental matches. A fee clause showing RED ($2k vs $3.5k agreed) is more valuable than a timing clause showing GREEN (14-30 days matches).
