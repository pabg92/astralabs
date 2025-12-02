# ContractBuddy Worker

Standalone document processing worker for ContractBuddy. Designed to run on a VM without the full Next.js application.

## Setup

```bash
cd worker
npm install
```

## Environment Variables

Create a `.env.local` in the parent directory or set these environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key
```

## Running

```bash
npm start
```

## What it does

1. Polls `document_processing_queue` via pgmq
2. For each document:
   - Extracts clauses via `extract-clauses` Edge Function (GPT-5.1)
   - Generates embeddings via `generate-embeddings` Edge Function (Cohere)
   - Matches against Legal Clause Library via `match-and-reconcile` Edge Function
   - Runs P1 reconciliation (batched GPT comparison against pre-agreed terms)
3. Updates document status to `completed`

## P1 Optimization

The P1 reconciliation step has been optimized to use **batched GPT calls** instead of sequential calls:

- **Before**: 131 sequential API calls taking ~5 minutes
- **After**: 2-3 batched calls taking ~15-30 seconds

Model selection is automatic:
- **GPT-4o** (128k context): Default for most contracts
- **GPT-5.1** (400k context): Used for very large contracts (>100k estimated tokens)
