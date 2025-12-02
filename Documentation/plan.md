# ContractBuddy Development Plan

**Version:** 2.0
**Last Updated:** November 30, 2025
**Status:** Active Development

---

## Executive Summary

ContractBuddy is a legal operations platform for influencer marketing contract reconciliation. The system uses AI-powered clause extraction (GPT-5.1/GPT-4o), semantic matching (Cohere embeddings + pgvector), and a two-tier Legal Clause Library (LCL + LCSTX) to provide Red/Amber/Green (RAG) risk assessment on contracts.

---

## Project Timeline

### Phase 0: Initial Setup (October 2025)
- [x] Next.js 15 App Router setup
- [x] shadcn/ui component library (56+ components)
- [x] Tailwind CSS 4 styling
- [x] Initial database schema design
- [x] Frontend prototype with mock data

### Phase 1-4: Database Foundation (November 1-3, 2025)
- [x] Migration 001: LCL field enhancements (factual_correctness_score, new_clause_flag)
- [x] Migration 002: Deduplication clusters system
- [x] Migration 003: pgmq async processing queue
- [x] Migration 004: Vector similarity functions
- [x] Frontend-database integration (Supabase client)
- [x] RLS policy fixes (infinite recursion resolved)

### Phase 5-8: AI Pipeline (November 8-13, 2025)
- [x] Migration 005: RAG parsing/risk separation
- [x] Migration 006: Version control & audit trail
- [x] Migration 007: Auto-flag low confidence triggers
- [x] Migration 008: PII detection & secure storage
- [x] Edge Function: `extract-clauses` (GPT-4o chunked extraction)
- [x] Edge Function: `generate-embeddings` (Cohere 1024-dim)
- [x] Edge Function: `match-and-reconcile` (pgvector similarity)

### Phase 9-10: Worker Pipeline (November 14-16, 2025)
- [x] Migration 009: Edge function logs table
- [x] Migration 010: Dedup stats function
- [x] Migration 011: Section title to clause boundaries
- [x] Document processing worker (pgmq polling)
- [x] Worker → Edge Function orchestration
- [x] Queue helper functions (enqueue/dequeue)

### Phase 11: Collaboration Features (November 18-21, 2025)
- [x] Migration 012: risk_accepted to clause_reviews
- [x] Migration 013: Redlines, comments, share tokens
- [x] Clause approval persistence API
- [x] Redline/comment modal UI
- [x] Share token generation for external review

### Phase 12: GPT-5.1 & Quality Gates (November 25-28, 2025)
- [x] Migration 015: Extraction comparisons table
- [x] Migration 016: Code review fixes
- [x] Migration 017: Schema integrity followup
- [x] GPT-5.1 single-pass extraction (400K context)
- [x] Quality gates (mega-clause detection, min clause validation)
- [x] Automatic fallback to chunked GPT-4o on context overflow

### Phase 13: CBA Clause Architecture (November 29, 2025)
- [x] Migration 099: Manual enqueue function
- [x] Migration 100: CBA clause architecture (LCL schema overhaul)
- [x] Parent-child clause relationships (LC-XXX-a/b/c variants)
- [x] Admin review queue for new clause discovery
- [x] LCL backfill scripts (Dior, Fenty, Valentino, ABH - 202 clauses)

### Phase 14: P1 Reconciliation Worker (November 29-30, 2025)
- [x] Standalone Node.js worker (`/worker`)
- [x] Batched GPT comparison against pre-agreed terms
- [x] P1 reconciliation (Priority 1: contract vs pre-agreed)
- [x] Low-confidence flagging for LCL growth
- [x] New clause detection → admin review queue

### Phase 15: Authentication & E2E Testing (November 30, 2025)
- [x] Clerk authentication integration
- [x] Sign-in/sign-up pages with SSO callback
- [x] Middleware auth bypass for E2E testing
- [x] Playwright E2E test suite setup
- [x] Page Object Model (deals-list, new-deal)
- [ ] Fix React hydration issues in dev mode

---

## Current Architecture

### Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | Next.js (App Router) | 15.5.4 |
| UI Framework | React | 19.x |
| Styling | Tailwind CSS | 4.1.9 |
| Components | shadcn/ui (New York) | Latest |
| Auth | Clerk | 6.35.5 |
| Database | Supabase (PostgreSQL) | 15 |
| Vector Search | pgvector | 0.5+ |
| Message Queue | pgmq | Latest |
| AI Extraction | OpenAI GPT-5.1/GPT-4o | Latest |
| Embeddings | Cohere embed-english-v3.0 | 1024-dim |
| E2E Testing | Playwright | 1.56.1 |

### Database Schema (30 Tables)

#### Core Tables
| Table | Rows | Purpose |
|-------|------|---------|
| `tenants` | 1 | Multi-tenant isolation |
| `user_profiles` | 0 | Clerk-linked user accounts |
| `deals` | 45 | Deal/contract management |
| `contracts` | 0 | Contract metadata |
| `document_repository` | 73 | Uploaded documents |
| `pre_agreed_terms` | 52 | Deal-specific agreed terms |

#### Clause Processing
| Table | Rows | Purpose |
|-------|------|---------|
| `clause_boundaries` | 2,571 | Extracted clause segments |
| `clause_match_results` | 403 | RAG status per clause |
| `clause_reviews` | 0 | User decisions (approve/reject) |
| `clause_update_history` | 707 | Audit trail |
| `discrepancies` | 293 | Identified issues |

#### Legal Clause Library (LCL)
| Table | Rows | Purpose |
|-------|------|---------|
| `legal_clause_library` | 260 | Canonical clauses (LC-XXX-a format) |
| `legal_clause_standardization` | 0 | LCSTX Tier 2 |
| `legal_clause_standardisation` | 0 | LCSTX alternate schema |
| `clause_templates` | 0 | Clause variations |
| `clause_deduplication_clusters` | 0 | Duplicate detection |

#### Admin & Review
| Table | Rows | Purpose |
|-------|------|---------|
| `admin_review_queue` | 517 | HITL review items |
| `parsing_lessons` | 0 | ML feedback loop |
| `edge_function_logs` | 66 | Pipeline debugging |
| `extraction_comparisons` | 0 | Model A/B testing |

#### Collaboration
| Table | Rows | Purpose |
|-------|------|---------|
| `clause_comments` | 4 | Inline comments |
| `clause_redlines` | 0 | Proposed changes |
| `share_tokens` | 0 | External sharing |
| `reconciliation_comments` | 0 | Thread discussions |

### API Routes

```
app/api/
├── deals/
│   ├── route.ts                    # GET/POST deals
│   └── [dealId]/
│       ├── upload/route.ts         # Contract upload
│       └── history/route.ts        # Version history
├── reconciliation/
│   └── [dealId]/
│       ├── route.ts                # GET reconciliation data
│       ├── pdf/route.ts            # PDF streaming
│       ├── export/route.ts         # Report export
│       ├── share/route.ts          # Generate share token
│       ├── redlines/route.ts       # Redline CRUD
│       └── clauses/
│           └── [clauseBoundaryId]/
│               └── route.ts        # PATCH clause decision
├── admin/
│   ├── review-queue/
│   │   ├── route.ts                # GET queue items
│   │   ├── accept/route.ts         # Accept to LCL
│   │   └── reject/route.ts         # Reject item
│   ├── dedup/route.ts              # Deduplication
│   └── monitoring/
│       ├── health/route.ts         # System health
│       ├── alerts/route.ts         # Active alerts
│       └── stuck/route.ts          # Stuck documents
└── share/
    └── [token]/route.ts            # Public share access
```

### Edge Functions (Supabase)

| Function | Purpose | Status |
|----------|---------|--------|
| `extract-clauses` | GPT-5.1/4o clause extraction | ✅ Deployed |
| `generate-embeddings` | Cohere embedding generation | ✅ Deployed |
| `match-and-reconcile` | pgvector similarity matching | ✅ Deployed |

### Worker Pipeline

```
/worker
├── worker.ts           # pgmq polling orchestrator
├── p1-reconciliation.ts # Batched GPT pre-agreed term comparison
├── package.json
└── README.md
```

**Pipeline Flow:**
```
Document Upload → pgmq Queue
       ↓
Worker Polls Queue (3s interval)
       ↓
extract-clauses (GPT-5.1 single-pass or GPT-4o chunked)
       ↓
generate-embeddings (Cohere batched)
       ↓
match-and-reconcile (pgvector)
       ↓
P1 Reconciliation (pre-agreed terms GPT comparison)
       ↓
Admin Review Queue (low-confidence + new clauses)
       ↓
Document Status: completed
```

---

## Legal Clause Library (LCL) Schema

### Clause ID Format
```
LC-XXX-y
│  │   │
│  │   └─ variation_letter: a-z (a = base, b-z = variants)
│  └───── clause_number: 001-999 (3-digit, zero-padded)
└──────── prefix: "LC" (Legal Clause)
```

### Block Allocation
| Block | Contract Source | Clauses | Status |
|-------|-----------------|---------|--------|
| 100-199 | Dior Influencer Agreement | 38 | Complete |
| 200-299 | Fenty Beauty (LVMH) | 34 | Complete |
| 300-399 | Valentino Beauty (L'Oreal) | 54 | Complete |
| 400-499 | Anastasia Beverly Hills | 76 | Complete |
| 500-599 | Available | - | - |

### Topic Grouping (within each block)
| Range | Topic Category |
|-------|----------------|
| X00-X09 | IP & Content Rights |
| X10-X19 | Services / Deliverables |
| X20-X29 | Fees / Payments |
| X30-X39 | Exclusivity / Non-Disparagement |
| X40-X49 | Termination & Survival |
| X50-X59 | Representations & Warranties |
| X60-X69 | Confidentiality / Compliance |
| X70-X79 | Indemnity |
| X80-X89 | Dispute Resolution |
| X90-X99 | Miscellaneous |

---

## Current Status

### Completed Features

#### Core Functionality
- [x] Deal creation and management
- [x] Contract upload (PDF/DOCX)
- [x] AI clause extraction (GPT-5.1 single-pass + GPT-4o fallback)
- [x] Embedding generation (Cohere 1024-dim)
- [x] Semantic matching (pgvector cosine similarity)
- [x] Three-way reconciliation (Contract vs Pre-Agreed vs Library)
- [x] RAG status display (Green/Amber/Red)

#### Admin Features
- [x] Admin review queue UI
- [x] New clause discovery workflow
- [x] Low-confidence flagging
- [x] System monitoring dashboard

#### Collaboration
- [x] Clause approval/rejection
- [x] Risk acceptance tracking
- [x] Inline comments
- [x] Redline proposals
- [x] Share token generation

#### Infrastructure
- [x] Multi-tenant RLS policies
- [x] pgmq async processing
- [x] Worker-based pipeline
- [x] Edge function logging
- [x] Audit trail (clause_update_history)

### In Progress

| Feature | Status | Blocker |
|---------|--------|---------|
| E2E Test Suite | 1/8 passing | React hydration in dev mode |
| Clerk Auth Integration | Configured | Needs production keys |
| PDF Coordinate Highlighting | Designed | Bounding box extraction |

### Known Issues

1. **React Hydration Mismatch** - Next.js dev mode causes state resets during E2E tests
2. **Reconciliation Page SSR** - `clientReferenceManifest` error on direct navigation
3. **RLS Policies** - Development mode `allow_all` policies active (not production-ready)

---

## Upcoming Roadmap

### Phase 16: PDF Highlighting v2 (Next)
- [ ] Add bounding box fields to clause_boundaries
- [ ] Update extraction to capture PDF coordinates
- [ ] Implement coordinate-based highlighting
- [ ] Text-based fallback for non-coordinate clauses

### Phase 17: LCSTX Integration
- [ ] Populate legal_clause_standardisation table
- [ ] Link LCL clauses to LCSTX canonical forms
- [ ] Implement variation tolerance matching
- [ ] Plain English summary generation

### Phase 18: Production Hardening
- [ ] Replace dev RLS policies with tenant-scoped
- [ ] Production Clerk configuration
- [ ] Error monitoring (Sentry integration)
- [ ] Rate limiting on API routes
- [ ] PII encryption at rest

### Phase 19: Real-time Collaboration
- [ ] Supabase Realtime subscriptions
- [ ] User presence indicators
- [ ] Comment threading
- [ ] Live RAG status updates

### Phase 20: Reporting & Export
- [ ] PDF report generation
- [ ] Excel clause export
- [ ] Audit trail export
- [ ] Analytics dashboard

### Phase 21: Integrations
- [ ] Monday.com bi-directional sync
- [ ] Slack notifications
- [ ] Email alerts for review items
- [ ] Webhook support for external systems

---

## Testing Status

### E2E Test Suite (`/e2e`)

| Test | Status | Description |
|------|--------|-------------|
| TC01 | ❌ Failing | Basic deal creation with single term |
| TC02 | ❌ Failing | Comprehensive deal with 4 pre-agreed terms |
| TC03 | ❌ Failing | Save as draft flow |
| TC04 | ❌ Failing | Form validation testing |
| TC05 | ❌ Failing | Full flow with deals list verification |
| TC06 | ❌ Failing | API error handling simulation |
| TC07 | ✅ Passing | File type validation |
| TC08 | ❌ Failing | Navigation and back button testing |

**Root Cause:** React hydration mismatch in Next.js dev mode resets form state between Playwright interactions.

**Recommended Fix:** Run E2E tests against production build (`pnpm build && pnpm start`).

### Test Commands
```bash
pnpm test:e2e           # Run all E2E tests
pnpm test:e2e:full-flow # Run full deal flow tests
pnpm test:e2e:headed    # Run with browser visible
pnpm test:e2e:debug     # Debug mode
pnpm test:e2e:ui        # Playwright UI mode
```

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev                 # Start dev server (localhost:3000)
pnpm build               # Production build
pnpm start               # Start production server

# Worker
pnpm worker              # Start document processing worker
cd worker && npm start   # Alternative worker start

# Linting
pnpm lint                # ESLint check

# Database
supabase db push         # Push migrations
supabase db reset        # Reset local database
supabase functions deploy # Deploy edge functions
```

---

## Key Files Reference

### Configuration
- `next.config.ts` - Next.js configuration
- `playwright.config.ts` - E2E test configuration
- `components.json` - shadcn/ui configuration
- `middleware.ts` - Clerk auth middleware

### Documentation
- `Documentation/1-ARCHITECTURE.md` - System design
- `Documentation/2-DATABASE-SCHEMA.md` - Schema reference
- `Documentation/3-IMPLEMENTATION-GUIDE.md` - Build instructions
- `Documentation/4-LCL-CLAUSE-ID-SCHEMA.md` - LCL standards
- `Documentation/CHANGELOG.md` - Change history

### Core Application
- `app/deals/page.tsx` - Deals list
- `app/deals/new/page.tsx` - New deal creation
- `app/reconciliation/page.tsx` - Reconciliation workspace
- `app/admin/review-queue/page.tsx` - Admin review queue

---

## Cost Model

**300 contracts/month:** ~$35/month
- Supabase Pro: $25
- OpenAI (GPT-5.1): $8
- Cohere embeddings: $2

**98% cheaper than Azure Document Intelligence approach** ($450/month)

---

## Contributing

1. Create feature branch from `main`
2. Follow existing code patterns
3. Add tests for new features
4. Update relevant documentation
5. Create PR with description following template

---

**Maintained by:** Development Team
**Repository:** ContractBuddy
**Branch:** `feature/full-document-text-view` (current)
