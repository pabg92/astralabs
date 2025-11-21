# ContractBuddy Architecture
**Version:** 1.0
**Last Updated:** November 3, 2025

---

## Overview

ContractBuddy is a contract reconciliation platform for influencer marketing using a **two-tier clause architecture** (LCL + LCSTX) with AI-powered extraction and semantic matching.

## Core Architecture

### Two-Tier Clause Model

```
┌─────────────────────────────────────┐
│ TIER 1: LCL (Legal Clause Library) │
│ - 300+ base clauses with variants  │
│ - Vector embeddings for matching   │
│ - Example: LCL-001a, LCL-001b      │
└─────────────┬───────────────────────┘
              │ Links via clause_ids[]
              ▼
┌─────────────────────────────────────┐
│ TIER 2: LCSTX (Standardization)    │
│ - Canonical clause definitions     │
│ - Variation tolerance rules        │
│ - Plain English summaries          │
└─────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- Next.js 15.5.4 (App Router)
- React 19 with TypeScript 5
- shadcn/ui components
- Tailwind CSS 4

**Backend:**
- Supabase (PostgreSQL 15)
- pgvector for semantic search
- pgmq for async processing
- Edge Functions (Deno)

**AI Services:**
- OpenAI GPT-4o (clause extraction)
- Cohere embed-english-v3.0 (embeddings)

## Processing Flow

### Contract Reconciliation Pipeline

```
1. Deal Creation
   ↓ Store pre-agreed terms

2. Contract Upload (v1.0)
   ↓ Auto-enqueue via pgmq

3. LLM Extraction (OpenAI)
   ↓ Extract clauses with [GREEN][AMBER][RED] markup
   ↓ Compare against pre-agreed terms

4. Embedding Generation (Cohere)
   ↓ Generate 1024-dim vectors (batched: 25 per call)

5. Library Matching (pgvector)
   ↓ find_similar_clauses() → Top 3 matches

6. Three-Way Comparison
   ↓ Contract vs Pre-Agreed vs Library
   ↓ Determine final RAG status

7. Store Results
   ↓ clause_boundaries + clause_match_results

8. Display in UI
   ↓ Text-based PDF highlighting
   ↓ Clickable clauses with detail panel
```

## Key Design Decisions

### LLM Markup vs Coordinate-Based Highlighting

**Decision:** Text-based markup with `[GREEN]...[/GREEN]` tags

**Rationale:**
- 98% cost reduction ($0.03 vs $1.50 per contract)
- Simpler implementation (no coordinate mapping)
- More robust (works across page boundaries)
- Better accuracy (semantic understanding vs layout)

**Trade-offs:**
- Requires fuzzy text matching (90%+ threshold)
- Slightly less pixel-perfect than coordinates
- **Verdict:** Trade-offs acceptable for massive benefits

### Three-Way Reconciliation Priority

**Priority 1:** Contract vs Pre-Agreed Terms (HIGHEST)
- Payment differs from agreed? → RED (even if standard)
- Timeline differs? → AMBER/RED based on severity

**Priority 2:** Library Match Similarity
- ≥95% match to standard template → GREEN
- 75-95% match → Use LLM initial assessment
- <75% match → Escalate risk

**Priority 3:** General Risk Assessment
- Missing required clause → RED
- Unusual/vague language → AMBER

### New Clause Discovery Workflow

```
Extract Clause
    ↓
Check Duplicates (vector similarity)
    ├─ ≥0.92: Auto-merge to existing
    ├─ 0.85-0.92: Queue for review
    └─ <0.85: Draft new clause
         ↓
    GPT-4 generates standardized text
         ↓
    Validate (guardrails)
         ↓
    Queue for HITL review
         ↓
    Admin approves/rejects
         ↓
    Add to LCL library
```

### Contract Versioning

**Flow:** v1.0 (conflicts) → Redline → v2.0 (improved) → v3.0 (final)

**Database Tracking:**
- Each version = separate row in `contracts` table
- All versions link to same `deal_id`
- RAG counts tracked per version
- Shows improvement over iterations

## Multi-Tenancy

**Isolation:** RLS policies on all tables
**Sharing:** Global library clauses visible to all tenants
**Overrides:** Optional company-specific library (CLCL - deferred to v1.1)

## Scalability Profile

**Current Capacity:**
- 100 concurrent users: ✅ 0.2% of rate limits
- 300 contracts/month: ✅ $33/month cost
- 2-3 tenants: ✅ Full isolation via RLS

**Growth Capacity:**
- 1,000 users: ✅ 2% of rate limits
- 3,000 contracts/month: ✅ $108/month
- 10+ tenants: ✅ No architectural changes needed

---

**See Also:**
- [2-DATABASE-SCHEMA.md](./2-DATABASE-SCHEMA.md) - Database structure
- [3-IMPLEMENTATION-GUIDE.md](./3-IMPLEMENTATION-GUIDE.md) - Build instructions
- [CHANGELOG.md](./CHANGELOG.md) - Change history
