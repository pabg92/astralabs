# Monday Demo Runbook (Fast Path)

## 1) Env + Secrets
- `.env.local` must have: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `COHERE_API_KEY`, optional `DEMO_AUTHOR_ID` (defaults to seeded demo user).
- Supabase project secrets: set `OPENAI_API_KEY` and `COHERE_API_KEY` so edge functions can call AI.

## 2) Start Pipeline
- Terminal A: `pnpm dev` (or `PORT=4000 pnpm dev` if 3000 busy)
- Terminal B: `pnpm worker` (requires service key + OpenAI/Cohere; this moves docs out of `pending`)
- Verify worker logs: should show Extracting → Embeddings → Matching → P1.

## 3) Load/Refresh LCL (if matches look sparse)
- Run any of the `scripts/lcl-*-backfill.sql` files in Supabase SQL editor.
- After inserts, re-run `generate-embeddings` by reprocessing a document (upload again or enqueue).

## 4) Dry-Run Flow
- Upload real PDF in `/deals/new`, include pre-agreed terms, click Create & Start Reconciliation.
- Wait for worker to finish: `document_repository.processing_status` should become `completed` and `clause_match_results.rag_status` should be non-NULL.
- Open `/reconciliation?dealId=<id>`: clauses show matches; add a redline (now uses demo author by default); export text/JSON; optionally grab PDF tab.

## 5) Playwright (delegate to engineer 1/Claude)
- Preconditions: dev server + worker running, ports aligned with `playwright.config.ts`.
- Command: `pnpm test:e2e` (or `npx playwright test`) from repo root.
- Artifacts land in `e2e/reports/*` and `e2e/artifacts/*`.

## 6) Share/PDF reminders
- Share token API exists (`/api/share/[token]`); add UI button if needed.
- PDF signed URL route has a temporary `ALLOW_PDF_TESTING` bypass—remove before prod; keep for demo if auth isn’t set up.

If anything stalls (doc stuck in `pending`), re-check worker env keys and Supabase secrets, then re-upload.***
