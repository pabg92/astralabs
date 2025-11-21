# ContractBuddy: Project Goals & Database Architecture

**Version:** 2.0 Planning Document
**Date:** November 3, 2025
**Status:** Pre-Development Assessment
**Purpose:** Define project goals and critical database components for new backend

---

## 1. Project Overview

### What is ContractBuddy?

**ContractBuddy** is a contract reconciliation platform for influencer marketing agencies that:

1. **Imports deals** from Monday.com (or manual entry)
2. **Receives draft contracts** from brands (Word/PDF)
3. **Reconciles contracts** against pre-agreed deal terms using AI
4. **Highlights discrepancies** with red/amber/green (RAG) status
5. **Facilitates review** with brand/agency until 100% match achieved
6. **Tracks versions** as contracts iterate (v1.0 → v2.0 → signed)

### Core User Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. DEAL ENTRY                                               │
│    Monday.com → CBA OR Manual entry in CBA                  │
│    Store: Influencer name, brand, deliverables,             │
│           payment terms, usage rights, timeline             │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CONTRACT UPLOAD (v1.0)                                   │
│    Brand sends draft contract (Word/PDF)                    │
│    Upload to CBA → Auto-enqueue for processing              │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. AI RECONCILIATION                                        │
│    Extract clauses (LLM)                                    │
│    Match against:                                           │
│    ├── Pre-agreed terms (deal)                             │
│    ├── Legal clause library (300+ templates)               │
│    └── Standard risk rules                                 │
│    Assign RAG status per clause                            │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. REVIEW & REDLINING                                       │
│    Show contract with highlighted clauses:                  │
│    🟢 Green: Matches terms (21 clauses)                     │
│    🟠 Amber: Minor deviations (3 clauses)                   │
│    🔴 Red: Conflicts with deal (2 clauses)                  │
│    User adds comments, generates redline PDF                │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. BRAND REVISION (v2.0, v3.0...)                          │
│    Brand uploads revised contract                           │
│    Re-run reconciliation → Expect 100% match                │
│    Repeat until all clauses green                           │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. FINAL APPROVAL                                           │
│    100% match achieved OR risks accepted                    │
│    Store final signed contract                              │
│    Track for compliance/audit                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Product Goals

### Primary Goals

| Goal | Description | Database Impact |
|------|-------------|----------------|
| **1. Multi-Tenant SaaS** | Multiple agencies use platform, data isolated | `tenants` table + RLS on all tables |
| **2. Deal Tracking** | Store pre-agreed terms for each deal | `deals` + `pre_agreed_terms` tables |
| **3. Contract Versioning** | Track v1.0 → v2.0 → v3.0 revisions | `contracts` with version history |
| **4. AI Reconciliation** | Extract + match clauses automatically | Clause extraction + matching tables |
| **5. Visual Highlighting** | Show RAG status on PDF | Clause text + coordinates/offsets |
| **6. Library Matching** | Compare against 300+ standard clauses | `legal_clause_library` + embeddings |
| **7. Review Workflow** | Users comment, accept risks, track progress | Review/comment tables |
| **8. Monday.com Sync** | Import deals from Monday.com | Deal import metadata |

### Secondary Goals

| Goal | Description | Priority |
|------|-------------|----------|
| **Admin Review Queue** | Admins review flagged contracts | Medium |
| **Comment Templates** | Pre-written comments (CT-001 to CT-007) | Low |
| **Parsing Lessons** | Learn from corrections (ML feedback loop) | Low (v2.0) |
| **Analytics Dashboard** | Compliance scores, trends | Medium |
| **Export/Reporting** | Generate reports, redlines | Medium |

---

## 3. Critical Database Components

### 🔴 CRITICAL - Must Keep (Core Functionality)

#### 3.1 Multi-Tenancy & Authentication

**Why Critical:** Foundation of SaaS - data isolation between agencies

```sql
-- Table: tenants
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,  -- URL-safe identifier
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: user_profiles
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),  -- ← Isolates users
  clerk_user_id TEXT UNIQUE NOT NULL,      -- ← Clerk auth
  email TEXT NOT NULL,
  role user_role NOT NULL,  -- talent_manager | admin
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Example (applies to ALL tables)
CREATE POLICY "tenant_isolation" ON deals
  FOR ALL USING (tenant_id = current_user_tenant_id());
```

**What Makes This Critical:**
- Every table needs `tenant_id` for isolation
- RLS policies enforce security at database level
- User authentication tied to Clerk
- Role-based access control

**Migration Strategy:** Copy directly to new backend

---

#### 3.2 Deals & Pre-Agreed Terms

**Why Critical:** The "source of truth" for what was agreed

```sql
-- Table: deals
CREATE TABLE deals (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  deal_name TEXT NOT NULL,
  influencer_name TEXT NOT NULL,
  brand_name TEXT NOT NULL,

  -- Deal metadata
  deal_value NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  status TEXT,  -- active | completed | cancelled

  -- Monday.com integration
  monday_item_id TEXT,
  monday_board_id TEXT,
  last_synced_at TIMESTAMPTZ,

  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: pre_agreed_terms
CREATE TABLE pre_agreed_terms (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,

  -- Term details
  term_category TEXT NOT NULL,  -- payment_amount | payment_terms | deliverables
  term_description TEXT NOT NULL,
  expected_value TEXT,  -- What we agreed on

  -- Metadata
  is_mandatory BOOLEAN DEFAULT false,
  related_clause_types TEXT[],  -- For matching

  -- Audit trail
  agreed_by UUID REFERENCES user_profiles(id),
  agreed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**What Makes This Critical:**
- Pre-agreed terms are what AI reconciles AGAINST
- Without this, you're just doing generic risk assessment
- Monday.com sync depends on this structure
- Deal lifecycle tracking

**Migration Strategy:** Keep structure, maybe simplify fields

---

#### 3.3 Contracts & Document Storage

**Why Critical:** Stores uploaded contracts and their versions

```sql
-- Table: contracts
CREATE TABLE contracts (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  deal_id UUID REFERENCES deals(id),  -- ← Links to deal

  -- Contract metadata
  title TEXT NOT NULL,
  version TEXT DEFAULT 'v1.0',  -- v1.0, v2.0, v3.0
  status TEXT,  -- draft | review | approved | rejected

  -- Document reference
  document_id UUID,  -- Links to document_repository

  -- Reconciliation results
  total_clauses INTEGER,
  green_count INTEGER,
  amber_count INTEGER,
  red_count INTEGER,
  compliance_score NUMERIC(5,2),  -- 0-100%

  -- Audit
  uploaded_by UUID REFERENCES user_profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: document_repository
CREATE TABLE document_repository (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),

  -- Storage
  object_path TEXT NOT NULL,  -- Supabase Storage path
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,

  -- Processing
  processing_status TEXT,  -- pending | processing | completed | failed
  processed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**What Makes This Critical:**
- Tracks contract versions (iteration workflow)
- Links contracts to deals
- Stores compliance scores
- References uploaded PDFs

**Migration Strategy:** Keep, simplify status enums

---

#### 3.4 Legal Clause Library + Embeddings

**Why Critical:** 300+ standard templates for matching

```sql
-- Table: legal_clause_library
CREATE TABLE legal_clause_library (
  id UUID PRIMARY KEY,
  tenant_id UUID,  -- NULL = global, or tenant-specific

  -- Clause definition
  clause_id TEXT UNIQUE,  -- LCL-001, LCL-002, etc.
  clause_type TEXT NOT NULL,  -- payment_terms | indemnification | etc.
  category TEXT NOT NULL,  -- financial | legal | ip | etc.
  standard_text TEXT NOT NULL,  -- Template clause

  -- Risk metadata
  risk_level TEXT,  -- low | medium | high | critical
  required BOOLEAN DEFAULT false,

  -- Semantic search
  embedding VECTOR(1024),  -- Cohere embed-english-v3.0

  -- Metadata (JSONB)
  metadata JSONB,  -- { trigger_if_exceeds: 2000, max_net_days: 30 }

  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector search function
CREATE OR REPLACE FUNCTION find_similar_clauses(
  p_embedding VECTOR(1024),
  p_threshold FLOAT DEFAULT 0.4,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  clause_id UUID,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    id,
    1 - (embedding <=> p_embedding) AS similarity
  FROM legal_clause_library
  WHERE
    active = true
    AND 1 - (embedding <=> p_embedding) > p_threshold
  ORDER BY embedding <=> p_embedding
  LIMIT p_limit;
END;
$$;
```

**What Makes This Critical:**
- Semantic search requires pgvector extension
- 300+ clauses with pre-computed embeddings
- Threshold-based matching (0.4 = 40% similar)
- JSONB metadata for risk rules

**Migration Strategy:**
- Copy table structure
- Keep embeddings (don't regenerate - costs money)
- May need to update metadata structure

---

#### 3.5 Clause Extraction & Matching

**Why Critical:** Results of AI reconciliation

```sql
-- Table: clause_boundaries (extracted from contract)
CREATE TABLE clause_boundaries (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  document_id UUID REFERENCES document_repository(id),

  -- Extracted clause
  clause_text TEXT NOT NULL,
  clause_type TEXT,  -- Classified by LLM

  -- Location in PDF
  start_page INTEGER,
  end_page INTEGER,
  char_offset INTEGER,  -- NEW: for text-based highlighting
  char_length INTEGER,  -- NEW: for text-based highlighting

  -- Confidence
  confidence_score NUMERIC(5,4),

  -- Hash for deduplication
  content_hash TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: clause_match_results (reconciliation output)
CREATE TABLE clause_match_results (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  document_id UUID REFERENCES document_repository(id),
  clause_boundary_id UUID REFERENCES clause_boundaries(id),

  -- Matching
  matched_template_id UUID REFERENCES legal_clause_library(id),
  similarity_score NUMERIC(5,4),  -- 0-1 from Cohere

  -- RAG status
  rag_status TEXT NOT NULL,  -- green | amber | red | blue

  -- Three-way comparison
  matches_pre_agreed BOOLEAN,
  matches_library BOOLEAN,

  -- Discrepancies
  discrepancies JSONB,  -- Array of { type, severity, description }

  -- Risk metadata
  risk_assessment JSONB,  -- { match_risk, clause_risk, final_risk }

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**What Makes This Critical:**
- Stores extracted clauses from LLM
- Links to library matches via similarity
- RAG status for visual highlighting
- Three-way comparison results

**Migration Strategy:**
- Remove Azure-specific fields (bounding_boxes)
- Add LLM-specific fields (char_offset, paraphrasing validation)
- Simplify JSONB structures

---

#### 3.6 Queue System (pgmq)

**Why Critical:** Async document processing at scale

```sql
-- pgmq tables (auto-created by extension)
-- Queue: document_processing_queue

-- Trigger: Auto-enqueue on document upload
CREATE OR REPLACE FUNCTION enqueue_document_processing()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pgmq.send(
    'document_processing_queue',
    jsonb_build_object(
      'document_id', NEW.id,
      'tenant_id', NEW.tenant_id,
      'object_path', NEW.object_path
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enqueue_on_upload
AFTER INSERT ON document_repository
FOR EACH ROW
EXECUTE FUNCTION enqueue_document_processing();
```

**What Makes This Critical:**
- Prevents timeouts on large PDFs
- Enables background processing
- Reliable retry logic
- Dead letter queue for failures

**Migration Strategy:** Copy directly - works well

---

### 🟡 IMPORTANT - Keep but Simplify

#### 3.7 Discrepancies Table

**Current structure is over-engineered:**

```sql
-- Current (too complex)
CREATE TABLE discrepancies (
  id UUID PRIMARY KEY,
  clause_match_result_id UUID,
  type TEXT,
  severity TEXT,
  description TEXT,
  suggested_action TEXT,
  affected_text TEXT,
  coordinates JSONB,  -- ← Remove (Azure-specific)
  resolved BOOLEAN,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ
);

-- Simplified (recommended)
CREATE TABLE discrepancies (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  contract_id UUID REFERENCES contracts(id),
  clause_id UUID REFERENCES clause_boundaries(id),

  -- What's wrong
  type TEXT NOT NULL,  -- missing | modified | additional | conflict
  severity TEXT NOT NULL,  -- info | warning | error | critical
  description TEXT NOT NULL,

  -- Resolution
  status TEXT DEFAULT 'open',  -- open | accepted | resolved
  resolution_comment TEXT,
  resolved_by UUID REFERENCES user_profiles(id),
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration:** Simplify, remove coordinates

---

### 🟢 OPTIONAL - Nice to Have

#### 3.8 Review Workflow Tables

```sql
-- Table: clause_reviews (for user comments)
CREATE TABLE clause_reviews (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  clause_id UUID REFERENCES clause_boundaries(id),

  comment TEXT,
  comment_template_id TEXT,  -- CT-001 to CT-007
  risk_accepted BOOLEAN DEFAULT false,

  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: comment_templates
CREATE TABLE comment_templates (
  id TEXT PRIMARY KEY,  -- CT-001, CT-002, etc.
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  active BOOLEAN DEFAULT true
);
```

**Migration:** Keep if review workflow important, otherwise defer to v2.0

---

#### 3.9 Admin Review Queue

```sql
-- Table: admin_review_queue
CREATE TABLE admin_review_queue (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  contract_id UUID REFERENCES contracts(id),

  priority TEXT,  -- low | medium | high | urgent
  status TEXT,  -- pending | in_review | completed
  assigned_to UUID REFERENCES user_profiles(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration:** Defer to v2.0 unless already using

---

### ⚪ NOT NEEDED - Remove

#### 3.10 Azure-Specific Tables

```sql
-- Remove these (Azure Document Intelligence artifacts)
document_pages (obsolete with LLM)
document_chunks (not needed for LLM approach)
parsing_lessons (deferred to v2.0)
legal_clause_standardization (unused?)
```

**Reason:** LLM extraction doesn't need page-level chunking

---

## 4. Data Flow Through System

### Simplified Flow (New Architecture)

```
1. Deal Entry
   ↓ INSERT INTO deals
   ↓ INSERT INTO pre_agreed_terms (multiple rows)

2. Contract Upload
   ↓ INSERT INTO document_repository
   ↓ Trigger → pgmq.send('document_processing_queue')

3. Edge Function Processing (async)
   ↓ Download PDF from storage
   ↓ Extract text (pdf-parse)
   ↓ LLM extraction → 25 clauses with markup
   ↓ INSERT INTO clause_boundaries (25 rows)
   ↓ For each clause:
       ├─ Generate Cohere embedding
       ├─ find_similar_clauses() → top 3 library matches
       ├─ Compare against pre_agreed_terms
       ├─ Determine RAG status (green/amber/red)
       └─ INSERT INTO clause_match_results
   ↓ UPDATE contracts SET green_count=21, amber_count=3, red_count=1

4. User Views Reconciliation
   ↓ SELECT * FROM clause_match_results WHERE contract_id = ?
   ↓ JOIN clause_boundaries, legal_clause_library, pre_agreed_terms
   ↓ Display in UI with highlighting

5. User Adds Comments
   ↓ INSERT INTO clause_reviews

6. User Accepts Risks
   ↓ UPDATE discrepancies SET status='accepted', resolved_by=user_id

7. Brand Uploads v2.0
   ↓ INSERT INTO contracts (version='v2.0', deal_id=same)
   ↓ Re-run steps 2-4
   ↓ Compare: v1.0 had 3 amber → v2.0 has 0 amber (improved!)
```

---

## 5. Critical Requirements for New Backend

### Must Have (No Compromise)

1. ✅ **Multi-Tenancy with RLS**
   - Every table has `tenant_id`
   - RLS policies enforce isolation
   - No data leakage between tenants

2. ✅ **Pre-Agreed Terms Storage**
   - Deal → Pre-agreed terms (1:many)
   - Structured format for comparison
   - Must support Monday.com import

3. ✅ **Contract Versioning**
   - Track v1.0 → v2.0 → v3.0
   - Link all versions to same deal
   - Show improvement over time

4. ✅ **Legal Clause Library + Vector Search**
   - 300+ templates with embeddings
   - pgvector for semantic search
   - Threshold-based matching

5. ✅ **Clause Extraction Storage**
   - Store LLM-extracted clauses
   - Link to library matches
   - RAG status per clause

6. ✅ **Async Processing Queue**
   - pgmq for reliability
   - Auto-enqueue on upload
   - Retry logic for failures

### Should Have (Important)

7. ✅ **Discrepancy Tracking**
   - What conflicts were found
   - Severity levels
   - Resolution tracking

8. ✅ **User Comments/Reviews**
   - Per-clause feedback
   - Risk acceptance
   - Audit trail

### Nice to Have (v2.0)

9. ⏳ **Admin Review Queue**
10. ⏳ **Comment Templates**
11. ⏳ **Analytics/Reporting**
12. ⏳ **Export Features**

---

## 6. Schema Simplification Opportunities

### Current: 18+ Tables
### Recommended: 12 Core Tables

**Core (6 tables):**
1. `tenants` - Multi-tenancy
2. `user_profiles` - Auth
3. `deals` - Deal tracking
4. `pre_agreed_terms` - What was agreed
5. `contracts` - Contract versions
6. `document_repository` - PDF storage

**Processing (4 tables):**
7. `clause_boundaries` - Extracted clauses
8. `clause_match_results` - Reconciliation results
9. `legal_clause_library` - 300+ templates
10. `discrepancies` - Found issues

**Optional (2 tables):**
11. `clause_reviews` - User comments
12. `comment_templates` - Pre-written comments

**Remove:**
- ❌ `document_pages` (not needed)
- ❌ `document_chunks` (not needed)
- ❌ `clause_comparisons` (redundant with clause_match_results)
- ❌ `parsing_lessons` (defer to v2.0)
- ❌ `admin_review_queue` (defer to v2.0)
- ❌ `reconciliation_comments` (use clause_reviews)

---

## 7. Migration Strategy

### Option A: Fresh Start with Critical Components

**Week 1: Core Infrastructure**
```sql
-- Copy these migrations directly:
001_initial_setup.sql (tenants, user_profiles, RLS)
002_multi_tenant_and_deals.sql (deals, pre_agreed_terms)
003_document_repository_and_queue.sql (storage, pgmq)
006_legal_clause_library.sql (library + embeddings)

-- Skip Azure-specific migrations:
004_azure_document_intelligence.sql ❌
007_add_bounding_boxes_array.sql ❌
```

**Week 2: New Extraction Tables**
```sql
-- Write fresh migrations for LLM approach:
NEW_001_llm_clause_extraction.sql
  ├── clause_boundaries (with char_offset instead of coordinates)
  └── clause_match_results (simplified JSONB)

NEW_002_discrepancies_simplified.sql
  └── discrepancies (no coordinates field)
```

### Option B: Migrate Existing Data

**Only if you have real users/contracts**

```sql
-- Migration script: old → new
INSERT INTO new_backend.deals
SELECT id, tenant_id, /* ... */ FROM old_backend.deals;

INSERT INTO new_backend.pre_agreed_terms
SELECT id, tenant_id, deal_id, /* ... */ FROM old_backend.pre_agreed_terms;

-- Embeddings: COPY directly (don't regenerate!)
INSERT INTO new_backend.legal_clause_library
SELECT * FROM old_backend.legal_clause_library;
-- Saves $$ on Cohere re-embedding
```

---

## 8. New Frontend Requirements (Unknown)

### Questions to Answer

Before finalizing schema, determine:

1. **What data does new frontend need?**
   - Same deal/contract structure?
   - New fields?
   - Different relationships?

2. **What views/screens exist?**
   - Deal list view?
   - Contract comparison view?
   - Analytics dashboard?

3. **What workflows changed?**
   - Still version-based (v1.0 → v2.0)?
   - New approval process?
   - Different user roles?

4. **What's the UI structure?**
   - Table-based (like Monday.com)?
   - Kanban boards?
   - Timeline view?

**Action:** Share new frontend designs → I'll map to database needs

---

## 9. Success Criteria

### Database Must Support:

✅ **100 concurrent users** across 2-3 tenants
✅ **300 contracts/month** processing volume
✅ **Sub-second** clause matching queries
✅ **Zero data leakage** between tenants
✅ **Version history** for audit trail
✅ **99.9% uptime** (Supabase SLA)

### Database Should Enable:

✅ **Real-time updates** (Supabase subscriptions)
✅ **Full-text search** on contracts/clauses
✅ **Analytics queries** (aggregate stats)
✅ **Export functionality** (JSON/CSV/PDF)

---

## 10. Next Steps

### Immediate Actions (This Week)

1. **Share New Frontend Designs**
   - Screenshots or Figma link
   - List all screens/views
   - Identify data needs per screen

2. **Confirm Workflow**
   - Still Monday.com → Deal → Contract → Reconcile?
   - Any changes to version flow?
   - New user roles?

3. **Decide on Migration**
   - Fresh start OR migrate existing data?
   - Have real users/contracts in current DB?

### Planning (Next Week)

4. **Design New ERD**
   - Map frontend needs → database tables
   - Simplify where possible
   - Document relationships

5. **Write Migration Plan**
   - What to keep from current DB
   - What to rebuild fresh
   - Data migration scripts if needed

6. **Create Documentation**
   - SCHEMA.md with all tables
   - ERD diagram
   - JSONB field structures

---

## 11. Critical Decisions Needed

### Decision 1: Tenant Model
- **Current:** `tenant_id` on every table, strict RLS
- **Alternative:** Separate database per tenant?
- **Recommendation:** Keep current (scales to 100s of tenants)

### Decision 2: Contract Versioning
- **Current:** Separate row per version (v1.0, v2.0, v3.0)
- **Alternative:** JSONB history array on single row?
- **Recommendation:** Keep current (easier to query)

### Decision 3: Clause Storage
- **Current:** Normalized (clause_boundaries + clause_match_results)
- **Alternative:** Denormalized JSONB on contracts table?
- **Recommendation:** Keep normalized (better for analytics)

### Decision 4: Queue System
- **Current:** pgmq (PostgreSQL message queue)
- **Alternative:** External queue (Redis, RabbitMQ)?
- **Recommendation:** Keep pgmq (simpler, fewer dependencies)

---

## Summary

### Critical Components (MUST Keep)
1. ✅ Multi-tenancy (tenants, RLS policies)
2. ✅ Deals + pre-agreed terms
3. ✅ Contract versioning
4. ✅ Legal clause library (300+ templates + embeddings)
5. ✅ Queue system (pgmq)
6. ✅ Clause extraction storage

### Simplify (Keep but Redesign)
7. ✅ Discrepancies (remove coordinates)
8. ✅ Clause matching results (simplify JSONB)
9. ✅ User reviews/comments

### Remove (Not Needed)
10. ❌ Azure-specific tables
11. ❌ Page/chunk tables
12. ❌ Parsing lessons (defer)

### Unknown (Need Frontend Input)
- New data requirements?
- Changed workflows?
- Different user roles?

---

**Ready for next step:** Share new frontend designs and I'll create the new database schema!
