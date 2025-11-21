# ContractBuddy Development Plan

**Version:** 1.0
**Last Updated:** November 21, 2025

---

## Recent Implementations

### Clause Approval Persistence (November 2025)

**Status:** ✅ Implemented

Reviewer decisions are now persisted to Supabase:

**Schema Changes:**
- Added `risk_accepted` boolean to `clause_reviews` table
- Added `approved_at` timestamp
- Added `tenant_id` (UUID) for multi-tenant isolation
- Added unique constraint on (document_id, clause_boundary_id) for upsert
- Added indexes for tenant and decision queries
- RLS policy noted (TODO when fully integrated)

**API Endpoint:**
- `PATCH /api/reconciliation/[dealId]/clauses/[clauseBoundaryId]`
- Accepts: `{ decision, risk_accepted, comments }`
- **Authentication required** - uses `createServerClient().auth.getUser()`
- **Tenant verification** - checks user's tenant_id matches deal's tenant_id
- Stores `reviewer_id` (auth user ID) and `tenant_id` for audit trail
- Upserts into `clause_reviews` table

**Frontend Changes:**
- Reconciliation page initializes state from persisted reviews
- `handleApprove()` and `handleReject()` call the API
- Page refresh loads persisted status

**Migration:** `012_add_risk_accepted_to_clause_reviews.sql`

---

## Current Roadmap

### Phase 11: Enhanced Persistence

- [ ] Add audit trail for reviewer actions
- [ ] Bulk approval/rejection endpoints
- [ ] Export reviewer decisions to report

### Phase 12: PDF Highlight v2

See [pdf-rag.md](./pdf-rag.md) for detailed plan.

- [ ] Add bounding box fields to clause_boundaries
- [ ] Update extraction worker to capture coordinates
- [ ] Update frontend to use coordinate-based highlights

### Phase 13: Clause Explanations API

- [ ] Expose clause explanations via REST endpoint
- [ ] Enable chat/tooltip features using explanations
- [ ] Add explanation caching layer

### Phase 14: Collaborative Features

- [ ] Real-time updates via Supabase Realtime
- [ ] User presence indicators
- [ ] Comments threading on clauses

---

## Testing Checklist

### Approval Persistence Testing

1. **Single User Test:**
   - Navigate to reconciliation page for a deal
   - Approve a clause (should show confetti, status turns green)
   - Refresh the page
   - ✓ Clause should still be approved (green)

2. **Cross-User Same Tenant Test:**
   - User A approves a clause
   - User B (same tenant) opens the same deal
   - ✓ User B should see User A's approval

3. **Cross-Tenant Access Test:**
   - User from Tenant A tries to access Tenant B's deal
   - ✓ Should receive 403 Forbidden

4. **API Test (requires auth cookie):**
   ```bash
   # Approve a clause (needs valid session cookie)
   curl -X PATCH http://localhost:3000/api/reconciliation/{dealId}/clauses/{clauseBoundaryId} \
     -H "Content-Type: application/json" \
     -H "Cookie: sb-access-token=..." \
     -d '{"decision": "approved", "risk_accepted": false}'

   # Verify in database
   # SELECT reviewer_id, tenant_id, decision FROM clause_reviews WHERE clause_boundary_id = '{id}'
   ```

5. **Reject Test:**
   - Click reject on a clause
   - Refresh page
   - ✓ Clause should show as issue (red)

6. **PDF Highlights Test:**
   - Approve/reject clauses
   - Switch to PDF tab
   - ✓ Highlights should render with correct RAG colors

---

## Architecture Notes

### State Flow

```
API Response (clause_reviews)
    ↓
Initialize clauseStatuses & riskAcceptedClauses
    ↓
User approves/rejects → saveClauseReview() → PATCH API
    ↓
Database updated → Next page load reflects state
```

### Key Files

- `app/api/reconciliation/[dealId]/route.ts` - GET with reviews
- `app/api/reconciliation/[dealId]/clauses/[clauseBoundaryId]/route.ts` - PATCH reviews
- `app/reconciliation/page.tsx` - UI and state management
- `supabase/migrations/012_*.sql` - Schema changes
