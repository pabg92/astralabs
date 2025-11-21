# Implementation Guide
**Version:** 1.0
**Last Updated:** November 3, 2025

---

## Current Status

✅ **Database:** 100% complete - all migrations applied
✅ **pgmq:** Enabled and configured
✅ **Frontend:** Built (needs backend connection)
⏳ **Backend API:** Not started
⏳ **Edge Functions:** Not started
⏳ **Clause Library:** Empty (needs seeding)

---

## Recommended Build Order

### Phase 1: Frontend Integration (3-4 hours)

**Goal:** Connect existing UI to Supabase backend

**Tasks:**
1. Generate TypeScript types from database schema
2. Set up Supabase client with environment variables
3. Replace localStorage with Supabase queries in:
   - `/deals` page
   - `/reconciliation` page
   - `/deals/new` page
4. Test with empty database

**Deliverable:** UI connected, ready for real data

---

### Phase 2: Sample Data Testing (2-3 hours)

**Goal:** Prove RAG highlighting works visually

**Tasks:**
1. Manually insert 1 tenant + 1 user
2. Create 1 deal with 5 pre-agreed terms
3. Create 20 sample library clauses (with embeddings)
4. Insert 1 contract with 15 manual clauses
5. Set RAG statuses manually (5 green, 7 amber, 3 red)
6. View reconciliation page - validate colors render

**Deliverable:** Visual proof RAG system works

---

### Phase 3: Edge Functions (4-5 days)

**Goal:** Implement AI processing pipeline

**Tasks:**
1. Create `extract-clauses` function:
   - Dequeue from pgmq
   - Download PDF from storage
   - Extract text (pdf-parse)
   - Call OpenAI with pre-agreed terms
   - Parse markup tags
   - Store in clause_boundaries

2. Create `generate-embeddings` function:
   - Batch Cohere API calls (25 clauses per request)
   - Store embeddings
   - Call find_similar_clauses()

3. Create `match-and-reconcile` function:
   - Three-way comparison logic
   - Determine final RAG status
   - Store in clause_match_results
   - Create discrepancies if conflicts found

**Deliverable:** Full AI processing pipeline

---

### Phase 4: Clause Library Seeding (2-3 days)

**Goal:** Populate LCL with 300+ standard clauses

**Options:**

**A. Generate with GPT-4** (Recommended)
- Prompt GPT to generate standard clauses by category
- Cost: ~$5-10 for 300 clauses
- Time: 1-2 hours

**B. Import Existing Templates**
- If client has clause database
- Time: 3-4 hours (formatting + validation)

**C. Hybrid**
- 100 manual (high-priority categories)
- 200 GPT-generated (standard categories)

**Deliverable:** Populated legal_clause_library with embeddings

---

### Phase 5: Admin Dashboard (3-4 days)

**Goal:** UI for HITL review and management

**Pages:**
1. `/admin/new-clauses` - Review AI-drafted clauses
2. `/admin/deduplication` - Review duplicate clusters
3. `/admin/library` - Manage legal clause library

**Deliverable:** Admin tools for governance

---

## Environment Variables Required

```bash
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI (clause extraction)
OPENAI_API_KEY=sk-proj-...

# Cohere (embeddings)
COHERE_API_KEY=your-cohere-key
```

## Cost Estimate (300 contracts/month)

| Service | Cost |
|---------|------|
| Supabase Pro | $25/mo |
| OpenAI GPT-4o | $7.50/mo |
| Cohere Embeddings | $0.75/mo |
| **Total** | **$33.25/mo** |

---

## Quick Start

### 1. Set Up Environment
```bash
cd /Users/work/Desktop/developer/ContractBuddy

# Add environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# Install dependencies
pnpm install
```

### 2. Generate Types
```bash
npx supabase gen types typescript --linked > types/database.ts
```

### 3. Run Development Server
```bash
pnpm dev
```

### 4. Test Frontend
- Visit http://localhost:3000
- Navigate to /deals
- Should connect to empty Supabase database

---

**See Also:**
- [1-ARCHITECTURE.md](./1-ARCHITECTURE.md) - System design
- [2-DATABASE-SCHEMA.md](./2-DATABASE-SCHEMA.md) - Database structure
- [CHANGELOG.md](./CHANGELOG.md) - Change history
