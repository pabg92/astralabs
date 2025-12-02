# Database Schema
**Version:** 1.1 (Two-Tier Architecture + PII & Audit)
**Last Updated:** November 8, 2025

---

## Current State

**Status:** ✅ All migrations applied (001-008)
**Extensions:** pgvector, pgmq, pg_trgm, uuid-ossp
**Tables:** 15 core tables + 4 views (added: clause_update_history, pii_entities)

## Core Tables

### Multi-Tenancy (2 tables)

**`tenants`**
- Organization/agency accounts
- Monday.com integration settings
- Billing plan tracking

**`user_profiles`**
- Links to Clerk authentication
- Role-based access (talent_manager | admin)
- Tenant isolation

### Deals & Terms (2 tables)

**`deals`**
- Influencer contracts with brands
- Links to Monday.com items
- Version tracking

**`pre_agreed_terms`**
- What was agreed before contract
- Used for reconciliation comparison
- Mandatory vs optional flags

### Documents (2 tables)

**`contracts`**
- Contract versions (v1.0, v2.0, v3.0)
- RAG summary counts (green/amber/red)
- Links to document_repository

**`document_repository`**
- PDF/DOCX storage references
- Processing status tracking
- Auto-enqueues via pgmq trigger

### Clause Processing (4 tables)

**`legal_clause_library` (LCL - Tier 1)**
- 300+ standard clause templates
- Vector embeddings (1024 dimensions)
- **NEW:** `factual_correctness_score` (0-1)
- **NEW:** `new_clause_flag` (AI-drafted marker)
- **NEW:** `parent_clause_id` + `variation_letter` for variant system
- See [4-LCL-CLAUSE-ID-SCHEMA.md](./4-LCL-CLAUSE-ID-SCHEMA.md) for ID naming conventions

**`legal_clause_standardization` (LCSTX - Tier 2)**
- Canonical clause definitions
- Links multiple LCL variants
- Variation tolerance rules
- Plain English summaries

**`clause_boundaries`**
- Clauses extracted from contracts
- LLM-extracted text content
- Clause type classification

**`clause_match_results`**
- Reconciliation output
- RAG status (green/amber/red)
- Similarity scores
- Three-way comparison results

### Review & Learning (3 tables)

**`discrepancies`**
- Conflicts found during reconciliation
- Severity levels (info/warning/error/critical)
- Resolution tracking

**`clause_reviews`**
- User decisions (approved/rejected/escalated)
- Risk acceptance flags (`risk_accepted` boolean)
- `approved_at` timestamp for audit trail
- Comments and suggested changes
- Unique constraint on (document_id, clause_boundary_id)

**`admin_review_queue`**
- HITL review system
- Tiered priority (auto/review/escalate)
- New clause approval workflow

**`parsing_lessons`**
- Continuous learning feedback
- User corrections captured
- Weekly batch retraining

**`clause_deduplication_clusters`** ⭐ NEW
- Duplicate detection system
- Auto-merge for ≥0.92 similarity
- Review queue for 0.85-0.92 range

## Views (Admin Dashboards)

**`v_new_clauses_pending_review`**
- AI-drafted clauses awaiting approval
- Sorted by factual_correctness_score

**`v_dedup_review_queue`**
- Pending duplicate clusters
- Priority scoring by similarity spread

**`v_embedding_statistics`**
- Embedding coverage monitoring
- Migration progress tracking

## Key Functions

**`find_similar_clauses(embedding, threshold, max_results, tenant_id)`**
- Semantic search against LCL
- Returns match_category (auto_merge/review_required/unique)

**`match_clause_to_standardization(text, embedding, clause_type)`**
- Find best LCSTX match for a clause
- Returns standardization with variation tolerance

**`auto_merge_duplicates()`**
- Auto-merges clusters with ≥0.92 similarity
- Deactivates duplicate clauses

**`enqueue_document_processing()`** (trigger)
- Auto-enqueues uploads to pgmq
- Fires on INSERT to document_repository

## Migrations Applied

### Migration 001: LCL Field Enhancements
**Date:** Nov 3, 2025
**Status:** ✅ Applied

Added:
- `factual_correctness_score NUMERIC(4,3)` - GPT confidence (0-1)
- `new_clause_flag BOOLEAN` - Marks AI-drafted clauses
- 2 indexes for HITL queries
- `v_new_clauses_pending_review` view

### Migration 002: Deduplication System
**Date:** Nov 3, 2025
**Status:** ✅ Applied

Added:
- `clause_deduplication_clusters` table
- `auto_merge_duplicates()` function
- `generate_cluster_id()` helper
- `v_dedup_review_queue` view
- Auto-update trigger for timestamps

### Migration 003: pgmq Setup
**Date:** Nov 3, 2025
**Status:** ✅ Applied

Added:
- pgmq extension enabled
- `document_processing_queue` created
- `document_processing_dlq` created
- `enqueue_document_processing()` trigger

### Migration 004: Vector Functions
**Date:** Nov 3, 2025
**Status:** ✅ Applied

Added:
- `find_similar_clauses()` function
- `find_duplicate_clusters()` function
- `match_clause_to_standardization()` function
- `batch_generate_embeddings()` helper
- `v_embedding_statistics` view

### Migration 005: RAG Parsing & Risk Separation ⭐ NEW
**Date:** Nov 8, 2025
**Status:** ✅ Applied

Added to `clause_match_results`:
- `rag_parsing` - Parsing quality indicator (green/amber/red)
- `rag_risk` - Risk assessment indicator (green/amber/red)

Added to `clause_boundaries`:
- `parsing_quality NUMERIC(4,3)` - Confidence score 0-1
- `parsing_issues JSONB` - Array of parsing problems
- Index on `parsing_quality` for <0.7 queries

**Impact:** Separates parsing quality from risk assessment for better clause tracking

### Migration 006: Version Control & Audit Trail ⭐ NEW
**Date:** Nov 8, 2025
**Status:** ✅ Applied

Added to `clause_match_results`:
- `version INTEGER` - Auto-increments on status change
- `updated_by UUID` - User who made the change
- `update_reason TEXT` - Reason code for change
- `previous_rag_status` - Previous status before update

Added:
- `clause_update_history` table - Complete audit trail
- `increment_clause_version()` trigger - Auto-logging
- 3 indexes for audit queries

**Impact:** Full change tracking with reason codes (user_override, risk_accepted, etc.)

### Migration 007: Auto-Flag Low Confidence Triggers ⭐ NEW
**Date:** Nov 8, 2025
**Status:** ✅ Applied

Added:
- `auto_flag_low_confidence()` function - Flags similarity <0.7
- `auto_flag_low_parsing_quality()` function - Flags parsing <0.7
- 2 triggers on `clause_match_results` and `clause_boundaries`
- Priority levels: critical (<0.5), high (<0.6), medium (<0.7)

**Impact:** Automatic population of `admin_review_queue` for low-confidence clauses

### Migration 008: PII Detection & Secure Storage ⭐ NEW
**Date:** Nov 8, 2025
**Status:** ✅ Applied

Added:
- `pii_entities` table with RLS policies
- 10 PII entity types (PERSON_NAME, EMAIL, SSN, etc.)
- `redaction_token` system for re-identification
- Access logging (accessed_at, accessed_by, access_count)

Added to `document_repository`:
- `pii_detected BOOLEAN`
- `pii_redacted BOOLEAN`
- `pii_scan_completed_at TIMESTAMPTZ`
- `pii_entity_count INTEGER`

Added:
- `v_pii_summary` view - Safe PII summary without values
- 4 indexes for PII queries

**Impact:** Secure PII storage with admin-only access and full audit trail

---

### Migration 009: Edge Function Execution Logs ⭐ NEW
**Date:** Nov 16, 2025
**Status:** ✅ Applied

Added:
- `edge_function_logs` table with JSONB payload storage
- Tracks extract/embed/match stages with success/error/fallback status
- 3 indexes for document_id, created_at, stage+status queries

**Impact:** Permanent audit trail for debugging edge function issues without relying on ephemeral console logs

### Migration 010: Deduplication Statistics Function ⭐ NEW
**Date:** Nov 16, 2025
**Status:** ✅ Applied

Added:
- `get_dedup_stats()` RPC function
- Returns aggregated statistics from `v_dedup_review_queue`
- Breaks down clusters by priority (high/medium/low) and status (pending/merged/reviewed)

**Impact:** Powers admin dashboard for library governance metrics

### Migration 011: Section Title for Clause Boundaries
**Date:** Nov 2025
**Status:** ✅ Applied

Added `section_title` field to `clause_boundaries` table.

### Migration 012: Clause Review Persistence ⭐ NEW
**Date:** Nov 21, 2025
**Status:** ✅ Applied

Added to `clause_reviews`:
- `risk_accepted BOOLEAN` - User explicitly accepted risk
- `approved_at TIMESTAMPTZ` - When clause was approved
- `tenant_id UUID` - Multi-tenant isolation (references tenants)
- Unique constraint on (document_id, clause_boundary_id) for upsert
- 3 indexes: risk_accepted, decision, tenant_id

**Security Notes:**
- API endpoint verifies user's tenant matches deal's tenant
- RLS policy scaffolded (commented) for future full implementation

**Impact:** Enables persisting reviewer decisions with proper user/tenant tracking

---

**See Also:**
- [1-ARCHITECTURE.md](./1-ARCHITECTURE.md) - System design
- [3-IMPLEMENTATION-GUIDE.md](./3-IMPLEMENTATION-GUIDE.md) - Build instructions
- [4-LCL-CLAUSE-ID-SCHEMA.md](./4-LCL-CLAUSE-ID-SCHEMA.md) - Clause ID naming & extraction standards
- [CHANGELOG.md](./CHANGELOG.md) - Change history
