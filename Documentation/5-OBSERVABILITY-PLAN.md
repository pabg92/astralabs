# Observability System for ContractBuddy

> **Status**: Planned (not yet implemented)
> **Created**: 2026-01-12

## Goal

Add full observability to track contracts through the processing pipeline with:
- Distributed tracing via correlation IDs
- Persistent event logging per pipeline stage
- Business metrics dashboard
- Email alerting for stuck/failed contracts

## Architecture Overview

```
Contract Upload → Queue → Extract → Embed → Match → P1 Reconciliation → Complete
                    ↓        ↓        ↓        ↓           ↓              ↓
                pipeline_events table (all stage transitions logged)
                                      ↓
                         Dashboard Views + API Endpoints
                                      ↓
                    Admin UI: Journey View, Health, Metrics, Alerts
```

---

## Implementation Plan

### Phase 1: Database Schema

**New migration: `supabase/migrations/20260112000001_add_pipeline_events.sql`**

Create `pipeline_events` table with:
- `document_id`, `correlation_id` (UUID for tracing)
- `stage` enum: queued, dequeued, extract_start, extract_complete, embed_start, embed_complete, match_start, match_complete, p1_start, p1_complete, complete, failed, retry
- `status`: started, completed, failed, skipped
- `started_at`, `completed_at`, `duration_ms` (computed)
- `metadata` JSONB: clause_count, error_message, tokens_in/out, model, etc.
- `log_level`: debug, info, warn, error

Add `alert_history` table for tracking sent alerts.

Add `current_correlation_id` column to `document_repository`.

Create SQL views:
- `v_contract_journey` - All events for a document with step sequencing
- `v_pipeline_health` - Success rate, avg duration per stage (24h)
- `v_active_processing` - Documents currently in each stage
- `v_error_breakdown` - Errors grouped by stage/type (7 days)

---

### Phase 2: Structured Logging Utility

**New file: `worker/utils/logger.ts`**

Create `PipelineLogger` class that:
- Writes to both console AND `pipeline_events` table
- Includes correlation ID in all logs
- Has log levels (debug, info, warn, error)
- Provides `stageStart()` / `stageComplete()` methods for timing
- Maintains emoji prefixes for console compatibility

```typescript
// Usage pattern:
const logger = createLogger(supabase, documentId, correlationId)
await logger.stageStart('extract_start', { model: 'gemini-2.0-flash' })
// ... do extraction ...
await logger.stageComplete('extract_complete', { clause_count: 15 })
```

---

### Phase 3: Worker Integration

**Modify: `worker/worker.ts`**

1. Generate correlation ID at start of `processDocument()`
2. Store correlation ID on `document_repository.current_correlation_id`
3. Replace ~50 console.log calls with logger methods
4. Add stage timing around each pipeline step:
   - Clause extraction (extract_start/complete)
   - Embedding generation (embed_start/complete)
   - Library matching (match_start/complete)
   - P1 reconciliation (p1_start/complete)
   - Final completion (complete/failed)

**Modify: `worker/p1-reconciliation.ts`**

1. Accept correlation ID parameter
2. Log identity matching vs semantic matching separately
3. Include comparison counts and discrepancy counts in metadata

---

### Phase 4: API Endpoints

**New: `app/api/admin/monitoring/metrics/route.ts`**
- Documents processed per period (24h, 7d, 30d)
- Average end-to-end processing time
- RAG distribution (green/amber/red percentages)
- Daily volume chart data
- Estimated AI cost (tokens * pricing)

**New: `app/api/admin/monitoring/journey/[documentId]/route.ts`**
- Returns all pipeline_events for a document
- Ordered by timestamp with step numbers
- Includes timing between steps

**Extend: `app/api/admin/monitoring/health/route.ts`**
- Add pipeline_events-based metrics
- Include active processing counts per stage

---

### Phase 5: Email Alerting

**New Edge Function: `supabase/functions/send-alert/index.ts`**
- Uses Resend API for email delivery
- Alert types: stuck_document, failed_document, error_rate_spike, daily_summary
- Logs sent alerts to `alert_history` table

**pg_cron jobs (in migration):**
- `check-stuck-documents`: Every 15 min, alert if document stuck >1 hour
- `daily-pipeline-summary`: 9 AM UTC, send daily metrics email

**New environment variables:**
- `RESEND_API_KEY`
- `ALERT_EMAIL_TO` (comma-separated recipients)
- `ALERT_EMAIL_FROM`

---

### Phase 6: Dashboard UI

**New page: `app/admin/pipeline/page.tsx`**

Dashboard with:
1. **Health Summary Cards** - Pending, processing, errors, throughput
2. **Pipeline Stage Visualization** - Active documents per stage
3. **Metrics Charts** - Daily volume, processing time trends
4. **RAG Distribution** - Green/amber/red pie chart
5. **Error Log** - Recent failures with details
6. **Contract Journey Viewer** - Search by document ID, see full timeline

---

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `supabase/migrations/20260112000001_add_pipeline_events.sql` | Schema + views |
| Create | `worker/utils/logger.ts` | Structured logging utility |
| Modify | `worker/worker.ts` | Add logger integration |
| Modify | `worker/p1-reconciliation.ts` | Add logger integration |
| Create | `supabase/functions/send-alert/index.ts` | Email alerting |
| Create | `app/api/admin/monitoring/metrics/route.ts` | Business metrics API |
| Create | `app/api/admin/monitoring/journey/[documentId]/route.ts` | Journey API |
| Modify | `app/api/admin/monitoring/health/route.ts` | Extend with pipeline data |
| Create | `app/admin/pipeline/page.tsx` | Dashboard page |
| Create | `components/admin/PipelineDashboard.tsx` | Dashboard client component |
| Modify | `.env.example` | Add Resend config vars |

---

## Verification Plan

1. **Database migration**: Run migration, verify tables/views created
2. **Logger**: Process a test document, verify events in `pipeline_events`
3. **Journey API**: Query `/api/admin/monitoring/journey/{docId}` for test document
4. **Metrics API**: Query `/api/admin/monitoring/metrics?period=24h`
5. **Email alerts**: Manually trigger stuck document scenario, verify email received
6. **Dashboard**: Navigate to `/admin/pipeline`, verify all sections render
7. **End-to-end**: Upload contract, watch it flow through pipeline in real-time dashboard

---

## Current State (Before Implementation)

**What exists today:**
- 205+ scattered `console.log` calls (no structured logging)
- `edge_function_logs` table storing execution data per stage
- Admin monitoring page at `/admin/monitoring` with health/alerts/stuck endpoints
- `clause_update_history` audit table for clause changes
- `extraction_comparisons` table for A/B testing metrics
- Status fields on `document_repository`: `processing_status`, `p1_status`, etc.

**Key gaps this plan addresses:**
- No structured logging - just console.log scattered everywhere
- No distributed tracing - can't follow a contract across services
- No real-time metrics dashboard - current monitoring is query-based
- No pipeline visualization - can't see a contract's journey through stages
- No cost/token tracking - AI usage not metered
- Worker logs are ephemeral - only stdout, not persisted
- No alerting integration - alerts exist but no notifications (Slack, email)
