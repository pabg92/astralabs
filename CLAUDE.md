# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ContractBuddy is an AI-powered contract reconciliation platform for influencer marketing agencies. It uses a **two-tier clause architecture** (LCL + LCSTX) with AI-powered extraction, semantic matching via pgvector, and three-way comparison (Contract vs Pre-Agreed Terms vs Library).

## Development Commands

```bash
pnpm install              # Install dependencies
pnpm dev                  # Run dev server (http://localhost:3000)
pnpm build                # Production build
pnpm lint                 # Run ESLint

# Worker (document processing)
pnpm worker               # Run document processing worker (from root)
cd worker && npm start    # Alternative: run from worker directory

# E2E Tests (Playwright)
pnpm test:e2e             # Run all E2E tests
pnpm test:e2e:full-flow   # Run full deal flow tests only
pnpm test:e2e:deals       # Run deals tests only
pnpm test:e2e:headed      # Run with visible browser
pnpm test:e2e:debug       # Run in debug mode
pnpm test:e2e:ui          # Open Playwright UI
pnpm test:e2e:report      # View HTML report
```

## Architecture

### Technology Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Backend**: Supabase (PostgreSQL 15 with pgvector, pgmq)
- **AI**: OpenAI GPT-4o (clause extraction), Cohere (embeddings)
- **Auth**: Clerk
- **Edge Functions**: Deno (Supabase)

### Two-Tier Clause Model

```
┌─────────────────────────────────────┐
│ TIER 1: LCL (Legal Clause Library)  │
│ - 300+ base clauses with variants   │
│ - Vector embeddings (1024-dim)      │
│ - Example: LCL-001a, LCL-001b       │
└─────────────┬───────────────────────┘
              │ Links via clause_ids[]
              ▼
┌─────────────────────────────────────┐
│ TIER 2: LCSTX (Standardization)     │
│ - Canonical clause definitions      │
│ - Variation tolerance rules         │
│ - Plain English summaries           │
└─────────────────────────────────────┘
```

### Contract Processing Pipeline

1. **Deal Creation** → Store pre-agreed terms
2. **Contract Upload** → Auto-enqueue via pgmq trigger
3. **Worker Processing** (polls queue, invokes Edge Functions):
   - `extract-clauses` → LLM extracts clauses with [GREEN][AMBER][RED] markup
   - `generate-embeddings` → Cohere 1024-dim vectors
   - `match-and-reconcile` → pgvector similarity search (top 3 matches)
   - P1 Reconciliation → GPT comparison against pre-agreed terms
4. **UI Display** → Text-based highlighting, clause detail panel

### P1 Reconciliation: Two-Tier Term Comparison

P1 reconciliation (`worker/p1-reconciliation.ts`) compares extracted contract clauses against pre-agreed terms (PATs). It uses a **two-tier approach**:

#### Tier 1: Identity Terms (String Matching)
Identity terms verify that expected party names appear in the contract:
- **Categories**: Brand Name, Talent Name, Agency, Client Name, Company, Influencer
- **Method**: Direct string presence check against full contract text
- **Benefit**: Bypasses GPT for faster, more accurate results (no false negatives from semantic comparison)

```
Identity Term Flow:
PAT: "Brand Name = Nike" → Check: "nike" in contract_text → GREEN (exact match)
PAT: "Talent Name = John Smith" → Check: "john smith" in contract_text → GREEN
PAT: "Agency = XYZ Inc" → Check: "xyz inc" NOT in contract_text → RED (mandatory) or AMBER (optional)
```

#### Tier 2: Semantic Terms (GPT Comparison)
Semantic terms require GPT to compare contractual obligations:
- **Categories**: Payment Terms, Exclusivity, Usage Rights, Deliverables, etc.
- **Method**: Batched GPT comparison with GREEN/AMBER/RED classification
- **Mapping**: `TERM_TO_CLAUSE_MAP` links PAT categories to clause types

```
Semantic Term Flow:
PAT: "Payment Terms = 30 days" → Find payment_terms clauses → GPT comparison → GREEN/AMBER/RED
```

#### RAG Status Determination
| Term Type | Match Result | Mandatory | RAG Status |
|-----------|--------------|-----------|------------|
| Identity | Exact/Normalized | Any | GREEN |
| Identity | Partial | Any | AMBER |
| Identity | Absent | Yes | RED |
| Identity | Absent | No | AMBER |
| Semantic | matches=true, severity=none | Any | GREEN |
| Semantic | matches=true, severity=minor | Any | AMBER |
| Semantic | matches=false | Any | RED |

### Key Components

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js pages (all use "use client") |
| `app/api/` | API routes (deals, reconciliation, admin) |
| `components/ui/` | shadcn/ui components (60+) |
| `lib/supabase/` | Supabase clients (browser + server) |
| `worker/` | Document processing worker (pgmq poller) |
| `supabase/functions/` | Edge Functions (extract, embed, match) |
| `supabase/migrations/` | Database migrations (000-100+) |
| `e2e/` | Playwright E2E tests |
| `types/database.ts` | Supabase generated types |

### Main Routes

- `/` - Dashboard with KPIs and recent deals
- `/deals` - Deal management with filtering/search
- `/deals/new` - Contract upload workflow
- `/reconciliation?dealId=X` - Clause-by-clause review
- `/reconciliation/complete` - Post-reconciliation summary
- `/admin/review-queue` - HITL clause review queue
- `/admin/monitoring` - System health monitoring

### API Structure

- `GET/POST /api/deals` - Deal CRUD
- `GET /api/deals/[dealId]` - Single deal with clauses
- `POST /api/deals/[dealId]/upload` - Contract upload
- `GET /api/reconciliation/[dealId]` - Full reconciliation data
- `PATCH /api/reconciliation/[dealId]/clauses/[clauseBoundaryId]` - Update clause status
- `POST /api/reconciliation/[dealId]/redlines/generate` - AI redline suggestions
- `GET /api/admin/review-queue` - New clauses pending review

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI Services (Edge Functions / Worker)
OPENAI_API_KEY=
COHERE_API_KEY=
```

## Database

- **Migrations**: `supabase/migrations/` (applied 000-017+)
- **Key tables**: `deals`, `pre_agreed_terms`, `contracts`, `document_repository`, `legal_clause_library`, `legal_clause_standardization`, `clause_boundaries`, `clause_match_results`, `clause_reviews`
- **Queue**: pgmq `document_processing_queue` (auto-enqueues uploads)
- **Types**: Regenerate with `npx supabase gen types typescript --local > types/database.ts`

See `Documentation/2-DATABASE-SCHEMA.md` for full schema details.

## E2E Testing

Tests use Playwright with auth bypass (E2E_TESTING=true). Configuration in `playwright.config.ts`:
- Screenshots on every step
- Video recording for all tests
- Trace capture enabled
- HTML reports at `e2e/reports/html`

```bash
# Run specific test file
E2E_TESTING=true PLAYWRIGHT_TEST=true npx playwright test e2e/specs/deals/full-deal-flow.spec.ts
```

## Build Configuration

- ESLint and TypeScript errors are ignored during builds (`ignoreDuringBuilds: true`)
- Images are unoptimized (Next.js optimization disabled)
- Path alias: `@/*` maps to project root

## Documentation

Detailed docs in `Documentation/`:
- `1-ARCHITECTURE.md` - System design and decisions
- `2-DATABASE-SCHEMA.md` - Full schema with migrations
- `3-IMPLEMENTATION-GUIDE.md` - Build instructions
- `4-LCL-CLAUSE-ID-SCHEMA.md` - Clause ID naming conventions
- `CHANGELOG.md` - Change history
