# ContractBuddy Multi-Audience Wiki

## Architecture

### Executive Overview
- ContractBuddy pairs a two-tier clause model (Legal Clause Library + Standardization layer) with AI extraction so every deal is checked against vetted language instead of opaque automation, keeping agencies confident in the outcomes (`Documentation/1-ARCHITECTURE.md:13`).
- The stack blends Next.js 15, Supabase, OpenAI GPT-4o, and Cohere to deliver the upload → AI reconciliation → export flow in seconds while containing per-contract costs near $0.03 (`README.md:37`, `Documentation/1-ARCHITECTURE.md:46`).
- Trust and safety fundamentals—private `contracts` storage, PII redaction tables, and tenant-scoped access—are already wired so clients can rely on the platform for regulated work (`plan.md:130`, `Documentation/2-DATABASE-SCHEMA.md:223`).

### Developer Guide
- App Router APIs live in `app/api/deals/route.ts` and `app/api/reconciliation/[dealId]/route.ts`, both using the service-role Supabase client in `lib/supabase/server.ts` to transact on deals, terms, documents, clauses, and exports (`app/api/deals/route.ts:18`, `app/api/reconciliation/[dealId]/route.ts:44`, `lib/supabase/server.ts:4`).
- Client pages (`/deals`, `/deals/new`, `/reconciliation`) consume those APIs instead of hitting Supabase directly, preserving RLS rules in the browser (`app/deals/page.tsx:169`, `app/deals/new/page.tsx:192`, `app/reconciliation/page.tsx:391`).
- Core schema objects span deals, pre_agreed_terms, document_repository, clause_boundaries, clause_match_results, the two-tier clause library, and governance tables (`Documentation/2-DATABASE-SCHEMA.md:29`, `Documentation/2-DATABASE-SCHEMA.md:53`, `Documentation/2-DATABASE-SCHEMA.md:98`).

### Senior Engineer Deep Dive
- SQL helpers (`find_similar_clauses`, `match_clause_to_standardization`, `auto_merge_duplicates`, `dequeue_document_processing`) underpin semantic search, deduplication, and queue orchestration; keep these functions in sync with migrations before editing edge functions (`Documentation/2-DATABASE-SCHEMA.md:117`, `plan.md:479`).
- Multi-tenancy combines tenant/user tables with storage-path policies, yet dev-wide “allow all” RLS policies remain active and must be replaced before production (`Documentation/2-DATABASE-SCHEMA.md:17`, `Documentation/CHANGELOG.md:149`).
- The LLM markup approach (text tags instead of coordinates) trades pixel precision for a 98% cost reduction; plan to mitigate fuzzy matches via admin review queues and clause governance (`Documentation/1-ARCHITECTURE.md:85`).

## Data Flow

### Executive Overview
- Teams follow a simple storyboard: create a deal, upload the contract, let ContractBuddy reconcile clauses against agreed terms/templates, then review a color-coded report—all validated by the last smoke test cycle (`plan.md:403`, `smoke-test-results.md:21`).
- Upcoming milestones (edge functions, governance UI, richer exports) aim to keep turnaround fast while preserving human oversight.

### Developer Guide
- `/deals/new` serializes form data + file uploads into `FormData` and POSTs to `/api/deals`, which persists the deal, inserts terms, uploads to the private `contracts` bucket, and relies on a database trigger to enqueue pgmq jobs (`app/deals/new/page.tsx:192`, `app/api/deals/route.ts:94`, `plan.md:479`).
- `/deals` reduces each deal’s document history to the latest file for status badges, while `/reconciliation` maps nested Supabase data (clauses, matches, terms, templates) into UI state with graceful fallbacks (`app/deals/page.tsx:169`, `app/api/reconciliation/[dealId]/route.ts:125`, `app/reconciliation/page.tsx:421`).
- `/api/reconciliation/[dealId]/export` delivers text/JSON exports with `[GREEN]/[AMBER]/[RED]/[BLUE]` markup until the PDF generator lands (Phase 9) (`app/api/reconciliation/[dealId]/export/route.ts:7`, `plan.md:609`).

### Senior Engineer Deep Dive
- The ingestion pipeline is staged: pgmq queues (`document_processing_queue`, DLQ) receive storage triggers, edge functions poll via `dequeue_document_processing`, and helper RPCs (`delete_queue_message`) must only run after persistence to avoid ghost jobs (`plan.md:498`).
- Clause governance hinges on similarity thresholds (≥0.92 auto-merge, 0.85–0.92 manual review) plus auto-flag triggers that push low-confidence clauses into `admin_review_queue` (`Documentation/2-DATABASE-SCHEMA.md:98`, `Documentation/2-DATABASE-SCHEMA.md:211`).
- Success criteria stay firm: upload → extract → embed → reconcile → export in <60s, per-contract cost ≈ $0.03, and every UI view backed by Supabase data (`plan.md:638`).

## Schema

### Executive Overview
- The database tracks promises (pre-agreed terms), the contract reality (documents + extracted clauses), AI assessments (match results + RAG statuses), and governance actions (review queues, dedup clusters, audit history) so account teams can answer “why” for every recommendation (`Documentation/2-DATABASE-SCHEMA.md:29`, `Documentation/2-DATABASE-SCHEMA.md:98`).
- PII safeguards (dedicated table + access logging) allow talent data to stay private even as documents move through AI pipelines (`Documentation/2-DATABASE-SCHEMA.md:223`).

### Developer Guide
- Multi-tenancy: `tenants` + `user_profiles` tables map Clerk IDs to roles and drive future RLS policies (`Documentation/2-DATABASE-SCHEMA.md:17`).
- Deals & expectations: `deals` stores high-level metadata while `pre_agreed_terms` lists mandatory/optional clauses and expected values (`Documentation/2-DATABASE-SCHEMA.md:29`).
- Document + clause tracking: `document_repository` logs storage objects and processing status, `clause_boundaries` stores extracted spans + confidence, `clause_match_results` captures RAG parsing/risk + similarity scores, and Tier-1/Tier-2 clause tables anchor comparisons (`Documentation/2-DATABASE-SCHEMA.md:40`, `Documentation/2-DATABASE-SCHEMA.md:53`).
- Governance: `admin_review_queue`, `clause_deduplication_clusters`, `clause_update_history`, `pii_entities`, and monitoring views feed the upcoming admin dashboard (`Documentation/2-DATABASE-SCHEMA.md:88`, `Documentation/2-DATABASE-SCHEMA.md:103`).

### Senior Engineer Deep Dive
- Recent migrations added `rag_parsing`, `rag_risk`, parsing quality metadata, version-control triggers, low-confidence auto-flags, and PII storage—keep generated types (`types/database.ts`) synced after each change to prevent runtime drift (`Documentation/2-DATABASE-SCHEMA.md:183`, `plan.md:142`).
- Development RLS shortcuts (`allow_all_reads_for_dev`) are still enabled on deals/user_profiles/pre_agreed_terms and must be replaced before launch (`Documentation/CHANGELOG.md:149`).
- Storage paths follow `contracts/{tenant_id}/{deal_id}/{filename}` with private bucket policies; ensure service-role operations remain server-side only (`plan.md:130`).

## Pipelines

### Executive Overview
- AI automation is rolling out in checkpoints: queue polling + text extraction are done, clause interpretation + persistence are next, followed by embeddings and reconciliation—each step adds transparency before the platform fully automates review (`supabase/functions/extract-clauses/index.ts:46`, `plan.md:475`).
- Governance UI (Phase 8) will keep humans in the loop for clause approvals, dedup merges, and queue health, reinforcing trust as automation increases (`Documentation/ADMIN-DASHBOARD-PLAN.md:40`).

### Developer Guide
- `extract-clauses`: already polls pgmq and extracts text via `unpdf`/`mammoth`, updating `document_repository.processing_status`; finish Checkpoint C (GPT-4o prompt) and D (inserts + queue cleanup) next (`supabase/functions/extract-clauses/index.ts:205`).
- `generate-embeddings`: fetch clauses with NULL embeddings, batch Cohere requests (≤25), write vectors, then call `find_similar_clauses` for matches (`plan.md:560`).
- `match-and-reconcile`: combine contract clauses, pre-agreed terms, and library matches to compute RAG parsing/risk, populate `clause_match_results`, update deal/document summaries, and enqueue discrepancies/alerts (`plan.md:574`).
- Testing: use `test-edge-function.js` to call deployed functions with service-role auth before pushing changes (`test-edge-function.js:1`).

### Senior Engineer Deep Dive
- Ensure edge functions are idempotent: store processing checkpoints per document, guard against duplicate clause inserts, and delete pgmq messages only after persistence (`supabase/functions/extract-clauses/index.ts:212`).
- Clause governance pipeline: similarity ≥0.92 triggers `auto_merge_duplicates()`, 0.85–0.92 routes to review queues, and <0.85 drafts new clauses flagged with `new_clause_flag` + `factual_correctness_score` for admin decisions (`Documentation/2-DATABASE-SCHEMA.md:98`, `Documentation/2-DATABASE-SCHEMA.md:57`).
- Observability backlog: add Supabase log drains/metrics for edge functions, track queue depth, and monitor PII access as part of Phase 10 ops (`plan.md:617`).

## Frontend & API Flow

### Executive Overview
- Users interact with three main surfaces—deal creation, deal list, reconciliation dashboard—each backed by Supabase data so status chips and color bars reflect reality, not mockups (`plan.md:365`).
- Exports already provide text/JSON snapshots; richer PDF annotations remain on the roadmap, ensuring stakeholders can share contract insights outside the app (`app/api/reconciliation/[dealId]/export/route.ts:7`, `plan.md:609`).

### Developer Guide
- `/api/deals` GET joins deals, pre_agreed_terms, and document history; POST handles FormData, validation, storage uploads, and queue triggers, returning the full deal payload (`app/api/deals/route.ts:24`, `app/api/deals/route.ts:94`).
- `/api/reconciliation/[dealId]` fetches deal + terms, latest document, clause boundaries, match results, and top library templates to minimize client-side fetching (`app/api/reconciliation/[dealId]/route.ts:58`).
- UI hooks: `/deals` fetches in `useEffect`, `/deals/new` uses two handlers (save draft vs create-and-reconcile), and `/reconciliation` maps API results to clause cards while offering mock fallbacks for empty states (`app/deals/page.tsx:169`, `app/deals/new/page.tsx:192`, `app/reconciliation/page.tsx:391`).
- Export endpoint supports `format=text|json` and streams `[GREEN]/[AMBER]/[RED]/[BLUE]` tags for each clause, ready to plug into a download button on the reconciliation page (`app/api/reconciliation/[dealId]/export/route.ts:14`).

### Senior Engineer Deep Dive
- After the FK fix (`document_repository_deal_id_fkey`), PostgREST can resolve relationships cleanly; keep foreign keys up to date to avoid PGRST200 errors (`smoke-test-results.md:60`).
- Next.js 15 console warnings about async params in `/api/reconciliation/[dealId]` should be addressed during cleanup to stay ahead of deprecations (`smoke-test-results.md:130`).
- Replace remaining mock fallbacks once edge functions populate real clauses, and add progress indicators tied to document `processing_status` so users see when AI work completes (Phase 5+).

## Operations & Roadmap

### Executive Overview
- Phases 0–4 are signed off (schema verified, sample data, APIs, frontend wiring), smoke tests passed, and the platform is ready for the AI automation push (`plan.md:57`, `smoke-test-results.md:173`).
- Next story to tell: completing edge functions (Phases 5–7), launching the governance UI (Phase 8), delivering richer exports (Phase 9), and wrapping ops/monitoring (Phase 10) to reach GA.

### Developer Guide
- Local workflow: `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm lint`; configure `.env.local` using `.env.example`, then rely on the documented `curl` + smoke test steps for regression checks (`README.md:9`, `.env.example:1`, `plan.md:319`, `smoke-test-results.md:21`).
- MCP-first discipline: log every migration, bucket, or queue change back into `plan.md` so future contributors see the audit trail (`plan.md:1`, `dev.agent:1`).
- Highlighted TODOs: finish Phase 5 checkpoints, build `/admin` dashboards, tighten RLS, integrate Clerk auth, wire the export download button, and expand automated smoke tests (`plan.md:475`, `Documentation/ADMIN-DASHBOARD-PLAN.md:40`).

### Senior Engineer Deep Dive
- Immediate priorities: RLS hardening (remove dev-wide policies), complete edge-function checkpoints C/D, seed the clause library (300+ entries), deliver admin governance workflows, and add observability + cost tracking per Phase 10 (`Documentation/CHANGELOG.md:149`, `plan.md:555`, `Documentation/3-IMPLEMENTATION-GUIDE.md:81`, `Documentation/ADMIN-DASHBOARD-PLAN.md:44`, `plan.md:617`).
- Monitor success metrics: processing latency (<60s), per-contract cost (~$0.03), RAG accuracy, and governance throughput; feed learnings back into `Documentation/CHANGELOG.md` for each milestone (`plan.md:638`).
- Before GA, replace hardcoded tenant/user IDs in API routes with real Clerk identity, ensure Supabase policies enforce tenant isolation across tables/storage, and document the runbook for clause pipeline recovery (queue stuck, OpenAI/Cohere errors).

---
*Maintainer: ContractBuddy Dev Team*
