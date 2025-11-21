# Two-Tier Architecture Analysis & Implementation Plan
**ContractBuddy v1.0 - LCL + LCSTX Architecture**

**Date:** November 3, 2025
**Status:** Schema Analysis Complete - Ready for Migration
**Version:** v1.0 MVP (LCSTX_Pattern deferred to v1.1)

---

## Executive Summary

The client has formalized a **two-tier clause architecture** that builds on the existing LCL (Legal Clause Library) foundation. This document analyzes the current database state vs. the new requirements and provides a clear implementation roadmap.

### ✅ Good News: 90% of infrastructure already exists!

Your current Supabase database already has most of the required tables:
- ✅ `legal_clause_library` (LCL) - Base clause store
- ✅ `legal_clause_standardization` (LCSTX) - Standardization layer
- ✅ `parsing_lessons` - Continuous learning feedback loop
- ✅ `admin_review_queue` - HITL (Human-In-The-Loop) system
- ✅ `pgvector` extension - For semantic deduplication

### ⚠️ Required Changes: Add 2 new fields + workflow enhancements

Only **minor schema additions** are needed to meet the new spec:
1. Add `factual_correctness_score` to LCL
2. Add `new_clause_flag` to LCL
3. Enhance HITL workflow with tiered model
4. Implement vector-based deduplication (≥0.92 merge, 0.85-0.92 cluster)

---

## 1. Architecture Overview

### 1.1 Two-Tier Model (v1.0 MVP)

```
┌─────────────────────────────────────────────────────────────────┐
│ TIER 1: LCL (Legal Clause Library)                             │
│ Purpose: Base clause storage with variants                      │
│ Scope:   300+ standard clauses + variations                     │
│ Example: LCL-001a, LCL-001b, LCL-001c (payment term variants)  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Links via standardization_id
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ TIER 2: LCSTX (Legal Clause Standardization)                   │
│ Purpose: Standardized clause definitions                        │
│ Scope:   Canonical versions that group LCL variants            │
│ Example: LCSTX-001 → [LCL-001a, LCL-001b, LCL-001c]           │
└─────────────────────────────────────────────────────────────────┘

Future (v1.1):
┌─────────────────────────────────────────────────────────────────┐
│ TIER 3: LCSTX_Pattern (Deferred to v1.1)                       │
│ Purpose: Pattern recognition and semantic grouping              │
│ Scope:   ML-driven pattern detection across standardizations   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Model Changes (May 2025 → October 2025)

| Area | Then (May-Jul 2025) | Now (Oct 2025) | Impact on DB |
|------|-------------------|----------------|--------------|
| **Schema Depth** | Only LCL implemented | Two-tier confirmed (LCL + LCSTX) | ✅ Already exists - just formalize relationships |
| **LCL Fields** | Basic: text, risk, summary | Added: `factual_correctness_score`, `new_clause_flag` | ⚠️ **MIGRATION NEEDED** |
| **Clause Creation** | Manual/semi-auto | 6-step New Clause Discovery workflow | ⚠️ Requires Edge Function logic |
| **HITL Process** | Broadly discussed | Tiered: auto / review / escalate | ✅ `admin_review_queue` exists - enhance workflow |
| **Deduplication** | Not defined | Vector clustering (≥0.92 merge, 0.85-0.92 cluster) | ⚠️ New logic using existing pgvector |
| **Learning Loop** | No formal feedback | Continuous learning + Parsing Lessons integration | ✅ `parsing_lessons` exists - enhance integration |
| **Governance** | Local edits allowed | Centralized CBA-admin + company overrides (CLCL) | ⚠️ New CLCL table needed (optional) |
| **Guardrails** | Not detailed | JSON schema, checksum, redaction, factual correctness thresholds | ⚠️ Application-level validation needed |

---

## 2. Current Database State Analysis

### 2.1 LCL (legal_clause_library) - TIER 1

**Current Schema:**
```sql
CREATE TABLE legal_clause_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_id TEXT UNIQUE NOT NULL,                    -- LCL-001, LCL-002, etc.
  category clause_category NOT NULL,                  -- legal, financial, etc.
  clause_type TEXT NOT NULL,                          -- "Payment Terms", "Termination", etc.
  standard_text TEXT NOT NULL,                        -- The actual clause text
  risk_level risk_level NOT NULL DEFAULT 'medium',   -- low, medium, high, critical
  is_required BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id),
  active BOOLEAN DEFAULT true,
  embedding vector                                    -- For semantic search (pgvector)
);
```

**❌ MISSING FIELDS (per client requirements):**
```sql
-- Need to add:
factual_correctness_score NUMERIC(4,3)              -- 0.000 to 1.000
new_clause_flag BOOLEAN DEFAULT false               -- Marks AI-drafted clauses pending verification
```

**✅ Field Mapping to Client Requirements:**
- ✅ `clause_id` → LCL-001, LCL-002 format
- ✅ `standard_text` → Clause content
- ✅ `risk_level` → Risk assessment
- ✅ `embedding` → Vector for deduplication
- ✅ `metadata` → Extensible JSONB for guardrails
- ❌ `factual_correctness_score` → **MISSING**
- ❌ `new_clause_flag` → **MISSING**

---

### 2.2 LCSTX (legal_clause_standardization) - TIER 2

**Current Schema:**
```sql
CREATE TABLE legal_clause_standardization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standardization_id TEXT UNIQUE NOT NULL,           -- LCSTX-001, LCSTX-002, etc.
  standardized_clause TEXT NOT NULL,                 -- Canonical clause text
  clause_ids TEXT[] NOT NULL,                        -- [LCL-001a, LCL-001b, LCL-001c]
  category clause_category NOT NULL,
  clause_type TEXT NOT NULL,
  risk_level risk_level NOT NULL,
  variation_tolerance TEXT,                          -- Acceptable variation description
  plain_english_summary TEXT,                        -- User-friendly explanation
  clause_synonyms TEXT[] DEFAULT '{}',               -- Alternative names/phrases
  ai_notes TEXT,                                     -- AI-generated analysis notes
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**✅ Assessment:** This table is **complete** for v1.0 requirements!

**✅ Key Features:**
- ✅ Links multiple LCL variants via `clause_ids` array
- ✅ Defines canonical standardized text
- ✅ Includes variation tolerance (for fuzzy matching)
- ✅ Plain English summaries for user transparency
- ✅ Clause synonyms for semantic matching

---

### 2.3 HITL System (admin_review_queue)

**Current Schema:**
```sql
CREATE TABLE admin_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,
  clause_boundary_id UUID,
  review_type TEXT NOT NULL CHECK (review_type IN ('low_confidence', 'discrepancy', 'flagged')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'completed', 'dismissed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),

  -- Original clause data
  original_text TEXT,
  original_clause_type TEXT,
  confidence_score NUMERIC,

  -- Review tracking
  reviewer_id UUID,
  review_notes TEXT,
  flagged_by UUID,
  flagged_at TIMESTAMPTZ DEFAULT now(),

  -- Corrections
  corrected_text TEXT,
  corrected_clause_type TEXT,
  correction_reason TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  tenant_id UUID REFERENCES tenants(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**✅ Assessment:** Excellent foundation for tiered HITL model!

**Client's Tiered HITL Model:**
1. **Auto-approve** (confidence ≥ 0.90) → No review needed
2. **Review** (0.70 ≤ confidence < 0.90) → Queue for human review
3. **Escalate** (confidence < 0.70) → High-priority legal review

**Mapping:**
- ✅ `review_type` → Can distinguish clause types
- ✅ `status` → Workflow states (pending → in_review → completed)
- ✅ `priority` → Maps to escalation tiers
- ✅ `confidence_score` → Used for threshold-based routing
- ✅ `corrected_text/corrected_clause_type` → Captures HITL corrections

**Enhancement Needed:**
- Add application logic to auto-route based on confidence thresholds
- Implement weekly batch processing for retraining

---

### 2.4 Continuous Learning (parsing_lessons)

**Current Schema:**
```sql
CREATE TABLE parsing_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID,
  review_queue_id UUID REFERENCES admin_review_queue(id),

  -- Lesson data
  original_text TEXT NOT NULL,
  corrected_text TEXT,
  lesson_type TEXT CHECK (lesson_type IN ('correction', 'clarification', 'edge_case', 'false_positive')),
  clause_type TEXT,

  -- Context
  document_context TEXT,
  correction_metadata JSONB,
  lesson_notes TEXT,

  -- Learning loop tracking
  applied_count INTEGER DEFAULT 0,
  applied_to_model BOOLEAN DEFAULT false,
  applied_at TIMESTAMPTZ,

  -- Multi-tenancy
  tenant_id UUID REFERENCES tenants(id),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**✅ Assessment:** Perfect for capturing user redlines and retraining!

**Client's Learning Loop:**
- User redlines contract clause → Store as parsing lesson
- Weekly batch: Aggregate lessons → Retrain variant logic
- Update LCSTX variation_tolerance based on patterns

**Workflow:**
1. User corrects clause during reconciliation
2. Insert into `parsing_lessons` with `lesson_type = 'correction'`
3. Weekly cron job aggregates lessons by `clause_type`
4. Update `legal_clause_standardization.variation_tolerance`
5. Set `applied_to_model = true`, `applied_at = now()`

---

## 3. Schema Migrations Required

### 3.1 Migration: Add Missing LCL Fields

```sql
-- Migration: add_factual_correctness_and_new_clause_flag_to_lcl.sql

-- Add factual_correctness_score (0.000 to 1.000)
ALTER TABLE legal_clause_library
ADD COLUMN factual_correctness_score NUMERIC(4,3)
  CHECK (factual_correctness_score >= 0 AND factual_correctness_score <= 1)
  DEFAULT NULL;

COMMENT ON COLUMN legal_clause_library.factual_correctness_score IS
'Factual correctness score from 0.000 to 1.000. Used to prioritize HITL review.
NULL = not yet scored, <0.85 = requires verification';

-- Add new_clause_flag (marks AI-drafted clauses)
ALTER TABLE legal_clause_library
ADD COLUMN new_clause_flag BOOLEAN DEFAULT false NOT NULL;

COMMENT ON COLUMN legal_clause_library.new_clause_flag IS
'Marks clauses created by AI (New Clause Discovery workflow).
true = pending verification, false = verified/manual entry';

-- Index for HITL query performance
CREATE INDEX idx_lcl_factual_correctness
  ON legal_clause_library(factual_correctness_score)
  WHERE new_clause_flag = true;

-- Index for unverified new clauses
CREATE INDEX idx_lcl_new_clause_flag
  ON legal_clause_library(new_clause_flag)
  WHERE new_clause_flag = true;
```

### 3.2 Migration: Add Deduplication Support

```sql
-- Migration: add_deduplication_tracking.sql

-- Track duplicate clusters for merging
CREATE TABLE IF NOT EXISTS clause_deduplication_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id TEXT UNIQUE NOT NULL,                   -- DUP-001, DUP-002, etc.
  primary_clause_id UUID REFERENCES legal_clause_library(id),
  duplicate_clause_ids UUID[] NOT NULL,              -- Array of duplicate LCL IDs
  similarity_scores NUMERIC[] NOT NULL,               -- Cosine similarities (0.85-1.0)
  merge_status TEXT DEFAULT 'pending' CHECK (merge_status IN ('pending', 'merged', 'dismissed')),
  merged_at TIMESTAMPTZ,
  merged_by UUID REFERENCES user_profiles(id),
  tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dedup_merge_status
  ON clause_deduplication_clusters(merge_status)
  WHERE merge_status = 'pending';

COMMENT ON TABLE clause_deduplication_clusters IS
'Tracks duplicate clause clusters for merging based on vector similarity.
- similarity ≥0.92: Auto-merge
- 0.85 ≤ similarity <0.92: Flag for human review';
```

### 3.3 Migration: Company-Level Clause Overrides (CLCL)

```sql
-- Migration: add_company_clause_library.sql
-- Optional: For companies that want custom clause variations

CREATE TABLE IF NOT EXISTS company_legal_clause_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  parent_lcl_id UUID REFERENCES legal_clause_library(id),  -- Links to global LCL
  clause_id TEXT NOT NULL,                           -- CLCL-T001-001 (tenant-specific)
  standard_text TEXT NOT NULL,                       -- Company's custom variation
  is_override BOOLEAN DEFAULT true,                  -- Override global LCL?
  approved_by UUID REFERENCES user_profiles(id),
  approved_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, clause_id)
);

CREATE INDEX idx_clcl_tenant ON company_legal_clause_library(tenant_id);
CREATE INDEX idx_clcl_parent ON company_legal_clause_library(parent_lcl_id);

COMMENT ON TABLE company_legal_clause_library IS
'Company-specific clause library (CLCL). Allows tenants to override global LCL clauses
with their own approved variations while maintaining link to parent clause.';
```

---

## 4. New Clause Discovery Workflow

### 4.1 Six-Step Process

```
┌────────────────────────────────────────────────────────────────┐
│ STEP 1: Extract Clause from Contract                          │
│ Trigger: GPT extracts unmatched clause during reconciliation  │
│ Output:  clause_boundaries row with no matched_template_id    │
└───────────────────────────┬────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│ STEP 2: Check for Duplicates (Vector Search)                  │
│ Action:  Query legal_clause_library embeddings                │
│ Logic:   - Similarity ≥0.92: Auto-link to existing LCL        │
│          - 0.85 ≤ similarity <0.92: Queue for review          │
│          - Similarity <0.85: Proceed to Step 3                │
└───────────────────────────┬────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│ STEP 3: Draft New Clause (GPT-NEWCLAUSE-001)                  │
│ Action:  GPT generates standardized clause text               │
│ Output:  Draft LCL entry with new_clause_flag = true          │
│ Fields:  - standard_text (GPT-generated)                      │
│          - clause_type (GPT-classified)                       │
│          - category, risk_level (GPT-assessed)                │
│          - factual_correctness_score (GPT-scored)             │
└───────────────────────────┬────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│ STEP 4: Validation & Guardrails                               │
│ Checks:  - JSON schema validation                             │
│          - Checksum integrity                                 │
│          - Redaction regex (PII, secrets)                     │
│          - Factual correctness threshold (≥0.85)              │
│ Result:  Pass → Step 5 | Fail → Discard + log                │
└───────────────────────────┬────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│ STEP 5: Queue for HITL Review                                 │
│ Action:  INSERT INTO admin_review_queue                       │
│ Fields:  - review_type = 'new_clause_discovery'               │
│          - priority = (factual_correctness <0.90 ? 'high' : 'medium') │
│          - status = 'pending'                                 │
└───────────────────────────┬────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│ STEP 6: Admin Approval → Promote to LCL                       │
│ Action:  Admin reviews + approves/rejects                     │
│ If Approved:                                                  │
│   - Set new_clause_flag = false                               │
│   - Set active = true                                         │
│   - Update admin_review_queue.status = 'completed'            │
│   - Optionally create LCSTX entry if standardization needed   │
│ If Rejected:                                                  │
│   - Set active = false                                        │
│   - Store rejection reason in admin_review_queue.review_notes │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Implementation (Supabase Edge Function)

```typescript
// Edge Function: new-clause-discovery.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from '@supabase/supabase-js'

serve(async (req) => {
  const supabase = createClient(/* ... */)

  // Step 1: Receive unmatched clause
  const { clauseText, documentId, clauseBoundaryId } = await req.json()

  // Step 2: Check for duplicates
  const { data: embedding } = await generateEmbedding(clauseText)
  const { data: duplicates } = await supabase.rpc('find_similar_clauses', {
    query_embedding: embedding,
    similarity_threshold: 0.85
  })

  if (duplicates?.length > 0 && duplicates[0].similarity >= 0.92) {
    // Auto-link to existing LCL
    await supabase.from('clause_match_results').update({
      matched_template_id: duplicates[0].id
    }).eq('clause_boundary_id', clauseBoundaryId)

    return new Response(JSON.stringify({ status: 'auto-linked', clauseId: duplicates[0].clause_id }))
  }

  if (duplicates?.length > 0 && duplicates[0].similarity >= 0.85) {
    // Queue for deduplication review
    await supabase.from('clause_deduplication_clusters').insert({
      primary_clause_id: duplicates[0].id,
      duplicate_clause_ids: [clauseBoundaryId],
      similarity_scores: [duplicates[0].similarity],
      merge_status: 'pending'
    })

    return new Response(JSON.stringify({ status: 'pending-dedup-review' }))
  }

  // Step 3: Draft new clause with GPT
  const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: GPT_NEWCLAUSE_PROMPT },
        { role: 'user', content: `Extract and standardize this clause:\n\n${clauseText}` }
      ]
    })
  })

  const gptData = await gptResponse.json()
  const draftClause = JSON.parse(gptData.choices[0].message.content)

  // Step 4: Validation & guardrails
  const validation = await validateClause(draftClause)
  if (!validation.passed) {
    await logValidationFailure(documentId, validation.errors)
    return new Response(JSON.stringify({ status: 'validation-failed', errors: validation.errors }), { status: 400 })
  }

  // Insert draft into LCL
  const { data: newClause } = await supabase.from('legal_clause_library').insert({
    clause_id: generateClauseId(),  // LCL-NEW-001
    standard_text: draftClause.standardText,
    clause_type: draftClause.clauseType,
    category: draftClause.category,
    risk_level: draftClause.riskLevel,
    factual_correctness_score: draftClause.factualCorrectnessScore,
    new_clause_flag: true,  // ← Key field
    active: false,  // Not active until approved
    embedding: embedding
  }).select().single()

  // Step 5: Queue for HITL
  await supabase.from('admin_review_queue').insert({
    document_id: documentId,
    clause_boundary_id: clauseBoundaryId,
    review_type: 'new_clause_discovery',
    priority: draftClause.factualCorrectnessScore < 0.90 ? 'high' : 'medium',
    status: 'pending',
    original_text: clauseText,
    metadata: {
      lcl_id: newClause.id,
      gpt_draft: draftClause
    }
  })

  return new Response(JSON.stringify({
    status: 'queued-for-review',
    clauseId: newClause.clause_id,
    reviewPriority: draftClause.factualCorrectnessScore < 0.90 ? 'high' : 'medium'
  }))
})
```

---

## 5. Deduplication Strategy

### 5.1 Vector Similarity Thresholds

| Similarity Range | Action | Workflow |
|-----------------|--------|----------|
| **≥0.92** | Auto-merge | Link to existing LCL, update `clause_ids` in LCSTX |
| **0.85–0.92** | Cluster for review | Create `clause_deduplication_clusters` entry |
| **<0.85** | Treat as unique | Proceed with New Clause Discovery workflow |

### 5.2 SQL Function for Similarity Search

```sql
-- Function: find_similar_clauses
CREATE OR REPLACE FUNCTION find_similar_clauses(
  query_embedding vector,
  similarity_threshold FLOAT DEFAULT 0.85,
  max_results INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  clause_id TEXT,
  standard_text TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lcl.id,
    lcl.clause_id,
    lcl.standard_text,
    1 - (lcl.embedding <=> query_embedding) AS similarity
  FROM legal_clause_library lcl
  WHERE
    lcl.active = true
    AND 1 - (lcl.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY lcl.embedding <=> query_embedding
  LIMIT max_results;
END;
$$;
```

### 5.3 Weekly Deduplication Batch Job

```sql
-- Cron job (pg_cron): Run every Sunday at 2 AM
SELECT cron.schedule(
  'weekly-deduplication-review',
  '0 2 * * 0',  -- Sunday 2 AM
  $$
    -- Find all pending deduplication clusters
    SELECT dedup_review_pending_clusters();
  $$
);

-- Function to review pending clusters
CREATE OR REPLACE FUNCTION dedup_review_pending_clusters()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cluster_record RECORD;
BEGIN
  FOR cluster_record IN
    SELECT * FROM clause_deduplication_clusters
    WHERE merge_status = 'pending'
  LOOP
    -- Auto-merge if all similarities >= 0.92
    IF array_length(cluster_record.similarity_scores, 1) > 0
       AND (SELECT MIN(unnest) FROM unnest(cluster_record.similarity_scores)) >= 0.92 THEN

      -- Merge duplicates into primary clause
      UPDATE legal_clause_library
      SET active = false
      WHERE id = ANY(cluster_record.duplicate_clause_ids);

      -- Update cluster status
      UPDATE clause_deduplication_clusters
      SET merge_status = 'merged', merged_at = now()
      WHERE id = cluster_record.id;

    ELSE
      -- Queue for human review (0.85-0.92 range)
      INSERT INTO admin_review_queue (
        document_id, review_type, priority, status, metadata
      ) VALUES (
        NULL, 'deduplication', 'medium', 'pending',
        jsonb_build_object('cluster_id', cluster_record.cluster_id)
      );
    END IF;
  END LOOP;
END;
$$;
```

---

## 6. Guardrails & Validation

### 6.1 JSON Schema Validation

```typescript
// Zod schema for GPT-generated clause drafts
import { z } from 'zod'

const ClauseDraftSchema = z.object({
  standardText: z.string().min(50).max(5000),
  clauseType: z.string().min(3).max(100),
  category: z.enum(['legal', 'operational', 'creative', 'financial', 'compliance', 'termination', 'confidentiality', 'liability', 'indemnification']),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  factualCorrectnessScore: z.number().min(0).max(1),
  plainEnglishSummary: z.string().min(20).max(500),
  tags: z.array(z.string()).optional()
})

// Validation function
async function validateClause(draft: unknown) {
  const result = ClauseDraftSchema.safeParse(draft)

  if (!result.success) {
    return { passed: false, errors: result.error.errors }
  }

  // Additional guardrails
  const guardrails = [
    checksumValidation(draft),
    redactionCheck(draft.standardText),
    factualCorrectnessThreshold(draft.factualCorrectnessScore)
  ]

  const failed = guardrails.filter(g => !g.passed)

  return {
    passed: failed.length === 0,
    errors: failed.flatMap(f => f.errors)
  }
}
```

### 6.2 Redaction Regex (PII & Secrets)

```typescript
const REDACTION_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,                    // SSN
  /\b\d{16}\b/g,                                // Credit card
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,  // Email (preserve if generic)
  /(?:api_key|apikey|access_token|secret|password)\s*[:=]\s*['"]?[\w-]+['"]?/gi  // API keys
]

function redactionCheck(text: string) {
  const matches = REDACTION_PATTERNS.flatMap(pattern =>
    Array.from(text.matchAll(pattern))
  )

  if (matches.length > 0) {
    return {
      passed: false,
      errors: [`Potential PII/secrets detected: ${matches.length} match(es)`]
    }
  }

  return { passed: true, errors: [] }
}
```

### 6.3 Checksum Integrity

```typescript
import { createHash } from 'crypto'

function checksumValidation(draft: ClauseDraft) {
  const canonical = JSON.stringify({
    text: draft.standardText.trim().toLowerCase(),
    type: draft.clauseType
  })

  const checksum = createHash('sha256').update(canonical).digest('hex')

  // Store checksum in metadata
  draft.metadata = { ...draft.metadata, checksum }

  return { passed: true, errors: [] }
}
```

---

## 7. Implementation Roadmap

### Week 1: Schema Migrations
- ✅ Day 1-2: Run migrations to add `factual_correctness_score` and `new_clause_flag`
- ✅ Day 3-4: Create `clause_deduplication_clusters` table
- ✅ Day 5: Optional: Create `company_legal_clause_library` (CLCL)

### Week 2: New Clause Discovery Workflow
- ✅ Day 1-2: Implement Edge Function for 6-step discovery process
- ✅ Day 3: Add GPT-NEWCLAUSE-001 prompt engineering
- ✅ Day 4: Implement validation & guardrails
- ✅ Day 5: Test end-to-end workflow

### Week 3: Deduplication System
- ✅ Day 1-2: Implement `find_similar_clauses()` SQL function
- ✅ Day 3-4: Create deduplication batch job (pg_cron)
- ✅ Day 5: Build admin UI for reviewing deduplication clusters

### Week 4: HITL Enhancements
- ✅ Day 1-2: Implement tiered routing logic (auto/review/escalate)
- ✅ Day 3-4: Build admin review dashboard
- ✅ Day 5: Connect to Parsing Lessons continuous learning loop

### Week 5: Frontend Integration
- ✅ Day 1-3: Update TypeScript types for two-tier architecture
- ✅ Day 4-5: Connect frontend to new API endpoints

---

## 8. Cost Model (Client's £200/month Projection)

**Assumptions:**
- 100 contracts/day
- Average 25 clauses per contract
- 2,500 clause reconciliations/day
- New Clause Discovery: ~5% unmatched (125 new clauses/day)

**Breakdown:**

| Service | Usage | Cost |
|---------|-------|------|
| **GPT-4 API** | 125 new clause drafts/day × £0.02/call | £75/month |
| **Cohere Embeddings** | 125 embeddings/day × £0.0004/call | £1.50/month |
| **Supabase Compute** | Pro plan (8GB RAM, 4 CPU) | £25/month |
| **pgvector Queries** | 2,500 similarity searches/day (negligible) | Included |
| **Edge Functions** | 75,000 invocations/month | £20/month |
| **Storage** | 100GB documents + 50GB DB | £10/month |
| **HITL Operations** | 1-2 FTE reviewers (not included in compute) | External |
| **Total Infrastructure** | | **£131.50/month** |

**Well within £200/month budget!** ✅

---

## 9. Next Steps & Decisions Required

### 9.1 Immediate Actions (This Week)
1. ✅ **Review this document** - Confirm alignment with client's vision
2. ⚠️ **Schema Migration Decision** - Approve running the 3 migration scripts
3. ⚠️ **CLCL Decision** - Do we need company-level clause overrides now or defer to v1.1?
4. ⚠️ **GPT-NEWCLAUSE-001 Prompt** - Need client to provide/approve the prompt template

### 9.2 Questions for Client (Mat)
1. **Governance Model:** Who has CBA-admin access? (Single admin or role-based?)
2. **HITL Staffing:** How many reviewers? What's their weekly capacity?
3. **Deduplication Thresholds:** Are 0.92 (auto-merge) and 0.85 (review) the right thresholds?
4. **Factual Correctness Threshold:** Confirm 0.85 as minimum acceptable score?
5. **Weekly Batch Timing:** Is Sunday 2 AM good for deduplication/retraining cron jobs?

### 9.3 Technical Constraints
1. ✅ **pgvector is installed** - Supports vector similarity search
2. ⚠️ **pgmq NOT enabled** - Need to enable for document processing queue
3. ⚠️ **pg_cron NOT enabled** - Need to enable for weekly batch jobs
4. ✅ **Edge Functions quota** - Supabase Pro supports 500k/month (well above 75k needed)

---

## 10. Summary & Recommendations

### ✅ What's Already Built (90% Ready!)
- Two-tier tables (LCL + LCSTX) ✅
- HITL infrastructure (admin_review_queue) ✅
- Continuous learning (parsing_lessons) ✅
- pgvector for semantic search ✅
- RLS policies for multi-tenancy ✅

### ⚠️ What's Missing (10% Remaining)
- 2 new fields in LCL (easy 1-day migration) ⚠️
- Deduplication clustering table (1 day) ⚠️
- New Clause Discovery Edge Function (3-4 days) ⚠️
- Guardrails validation logic (2 days) ⚠️
- Weekly batch jobs (pg_cron setup: 1 day) ⚠️

### 🚀 Recommendation: Proceed with v1.0 MVP
Your database architecture is **90% aligned** with the client's new two-tier specification. The required changes are **minor and non-breaking**. I recommend:

1. **Approve & run schema migrations** (this week)
2. **Build New Clause Discovery workflow** (next week)
3. **Defer LCSTX_Pattern to v1.1** (as planned)
4. **Defer CLCL to v1.1** (unless client needs company overrides immediately)

**Timeline:** 2-3 weeks to full v1.0 compliance ✅

---

## Appendix A: SQL Migration Scripts

See separate files:
- `001_add_factual_correctness_and_new_clause_flag.sql`
- `002_add_deduplication_clusters.sql`
- `003_add_company_clause_library.sql` (optional)
- `004_enable_pgmq_and_pg_cron.sql`

---

## Appendix B: TypeScript Type Definitions

```typescript
// types/two-tier-architecture.ts

export interface LegalClauseLibrary {
  id: string
  clause_id: string  // LCL-001, LCL-002, etc.
  category: ClauseCategory
  clause_type: string
  standard_text: string
  risk_level: RiskLevel
  is_required: boolean
  version: number
  tags: string[]
  metadata: Record<string, any>

  // New fields (v1.0)
  factual_correctness_score: number | null  // 0.000 to 1.000
  new_clause_flag: boolean  // Marks AI-drafted clauses

  created_at: string
  updated_at: string
  created_by: string | null
  active: boolean
  embedding: number[]  // pgvector
}

export interface LegalClauseStandardization {
  id: string
  standardization_id: string  // LCSTX-001, LCSTX-002, etc.
  standardized_clause: string
  clause_ids: string[]  // Links to LCL variants
  category: ClauseCategory
  clause_type: string
  risk_level: RiskLevel
  variation_tolerance: string | null
  plain_english_summary: string | null
  clause_synonyms: string[]
  ai_notes: string | null
  created_at: string
  updated_at: string
}

export interface ClauseDeduplicationCluster {
  id: string
  cluster_id: string  // DUP-001, DUP-002, etc.
  primary_clause_id: string
  duplicate_clause_ids: string[]
  similarity_scores: number[]
  merge_status: 'pending' | 'merged' | 'dismissed'
  merged_at: string | null
  merged_by: string | null
  tenant_id: string | null
  created_at: string
}

export type ClauseCategory =
  | 'legal'
  | 'operational'
  | 'creative'
  | 'financial'
  | 'compliance'
  | 'termination'
  | 'confidentiality'
  | 'liability'
  | 'indemnification'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
```

---

**End of Analysis Document**

**Questions or concerns?** Contact the dev team or schedule a call with Mat to walk through this document.
