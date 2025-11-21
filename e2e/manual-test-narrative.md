# Manual E2E Test Narrative: Talent Manager Story

**Test Date:** 2025-11-16
**Tester Role:** Talent Manager (Mat)
**Scenario:** Diptyque Influencer Campaign Contract Review
**Objective:** Validate complete deal workflow from creation through reconciliation and export

---

## Test Scenario Background

Mat is a talent manager at a digital agency. They've received a new influencer partnership brief from Diptyque (luxury fragrance brand) for their client @beautybychloe. The brand has sent a standard influencer agreement PDF that needs to be reviewed before signing.

**Prerequisites:**
- Access to ContractBuddy application (localhost:3000 or deployed environment)
- Valid user account with tenant_id association in user_profiles table
- Supabase backend running with worker processing enabled
- Test contract PDF file (e.g., C14.pdf or C19.pdf from e2e/test-pdfs/)

---

## Step 1: Create New Deal

**Actions:**
1. Navigate to http://localhost:3000/deals
2. Click "New Deal" button (top-right)
3. Fill in deal creation form:
   - **Talent Name:** Chloe Martinez
   - **Talent Handle:** @beautybychloe
   - **Agency:** Digital Talent Collective
   - **Brand:** Diptyque
   - **Deliverables:** 3 Instagram posts, 5 Stories, 1 Reel
   - **Fee:** $15,000
   - **Currency:** USD
   - **Status:** In Review
4. Click "Create Deal" button

**Expected Results:**
- Success toast notification: "Deal created successfully"
- Redirect to /deals/new with deal_id in URL
- Deal form pre-populated with entered data

**Verification Queries:**
```sql
-- Capture the deal_id from the URL and verify creation
SELECT id, talent_name, brand, fee, status, tenant_id, created_at
FROM deals
WHERE talent_handle = '@beautybychloe'
ORDER BY created_at DESC
LIMIT 1;
```

**Evidence to Capture:**
- [ ] Screenshot of filled deal form
- [ ] Screenshot of success toast
- [ ] Deal ID from URL: `___________________`
- [ ] Database query result showing deal record
- [ ] Timestamp of creation: `___________________`

---

## Step 2: Upload Contract Document

**Actions:**
1. On the deal creation page, locate the "Upload Contract Document" section
2. Click "Choose file" or drag-and-drop PDF
3. Select test contract (e.g., `e2e/test-pdfs/C14.pdf`)
4. Wait for upload progress indicator
5. Verify upload success message

**Expected Results:**
- Upload progress bar appears
- File size and name displayed below upload area
- Success message: "Document uploaded successfully"
- Document metadata visible (filename, size, mime_type)

**Verification Queries:**
```sql
-- Verify document was stored in document_repository
SELECT id, deal_id, original_filename, mime_type, file_size, object_path, created_at
FROM document_repository
WHERE deal_id = '<DEAL_ID_FROM_STEP_1>'
ORDER BY created_at DESC
LIMIT 1;

-- Check that storage object exists
SELECT name, bucket_id, owner, metadata, created_at
FROM storage.objects
WHERE bucket_id = 'contracts'
AND name LIKE '%<DEAL_ID>%'
ORDER BY created_at DESC
LIMIT 1;
```

**Evidence to Capture:**
- [ ] Screenshot of file upload UI
- [ ] Document ID from database: `___________________`
- [ ] Object path in storage: `___________________`
- [ ] File size in bytes: `___________________`
- [ ] MIME type: `___________________`

---

## Step 3: Trigger Reconciliation Processing

**Actions:**
1. After document upload, click "Continue to Reconciliation" button
2. Observe processing status indicators
3. Wait for AI extraction and matching (typically 15-45 seconds)
4. Monitor progress bar or loading state

**Expected Results:**
- Redirect to /reconciliation?deal_id=<DEAL_ID>
- Loading state shows "Processing contract..."
- Worker processes document through pgmq queues
- Reconciliation data appears when complete

**Backend Process Flow:**
1. Document uploaded → `document_processing` queue message created
2. Worker picks up message → calls `generate-embeddings` edge function
3. Embeddings stored → `reconciliation_pending` queue message created
4. Worker calls `match-and-reconcile` edge function
5. Clauses with matches stored in database
6. Frontend polls API until complete

**Verification Queries:**
```sql
-- Check pgmq queue processing (if accessible)
SELECT msg_id, read_ct, enqueued_at, vt, message
FROM pgmq.q_document_processing
WHERE (message->>'deal_id')::text = '<DEAL_ID>'
ORDER BY enqueued_at DESC
LIMIT 5;

-- Verify clause extraction occurred
SELECT COUNT(*) as total_clauses,
       SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as clauses_with_embeddings
FROM clause_boundaries
WHERE document_id = '<DOCUMENT_ID_FROM_STEP_2>';

-- Check edge function logs for extraction
SELECT id, function_name, event_type, duration_ms, metadata, created_at
FROM edge_function_logs
WHERE (metadata->>'deal_id')::text = '<DEAL_ID>'
ORDER BY created_at DESC
LIMIT 10;
```

**Evidence to Capture:**
- [ ] Screenshot of processing/loading state
- [ ] Queue message ID: `___________________`
- [ ] Total clauses extracted: `___________________`
- [ ] Clauses with embeddings: `___________________`
- [ ] Edge function log entries (count): `___________________`
- [ ] Processing duration (from logs): `___________________` ms

---

## Step 4: Review Reconciliation Results

**Actions:**
1. Once reconciliation loads, review the clause-by-clause breakdown
2. Observe the three-column layout:
   - Left: Clause list with RAG status colors
   - Middle: Clause details and full text
   - Right: PDF viewer (if available)
3. Note the progress indicators at top:
   - Total clauses count
   - Green/Amber/Red/Blue distribution
   - Completion percentage

**Expected Results:**
- Reconciliation page displays with deal_id in URL
- Clauses organized by status with color coding:
  - **GREEN**: Exact or close match with high confidence (≥85%)
  - **AMBER**: Partial match or moderate confidence (60-84%)
  - **RED**: No match or low confidence (<60%)
  - **BLUE**: Accepted with risk flag
- Each clause shows:
  - Clause type (e.g., "Payment Terms", "Usage Rights")
  - Confidence score (0-100)
  - Summary text
  - Full clause text
  - Match excerpt (if found)

**RAG Status Distribution:**
```sql
-- Calculate RAG distribution
SELECT
  COUNT(*) as total_clauses,
  COUNT(*) FILTER (WHERE status = 'match') as green_count,
  COUNT(*) FILTER (WHERE status = 'review') as amber_count,
  COUNT(*) FILTER (WHERE status = 'issue') as red_count,
  COUNT(*) FILTER (WHERE status = 'accepted') as blue_count,
  ROUND(AVG(confidence), 2) as avg_confidence
FROM clause_boundaries cb
LEFT JOIN reconciliation_status rs ON cb.id = rs.clause_id
WHERE cb.document_id = '<DOCUMENT_ID>';
```

**Expected Clause Types:**
- Payment Terms
- Deliverable Requirements
- Usage Rights
- Exclusivity Clauses
- Termination Conditions
- Liability Limitations
- Force Majeure
- Governing Law

**Evidence to Capture:**
- [ ] Screenshot of reconciliation page (full view)
- [ ] Screenshot of clause list with RAG colors
- [ ] Total clauses: `___________________`
- [ ] Green (match) count: `___________________`
- [ ] Amber (review) count: `___________________`
- [ ] Red (issue) count: `___________________`
- [ ] Blue (accepted) count: `___________________`
- [ ] Average confidence score: `___________________`
- [ ] Completion percentage: `___________________`%

---

## Step 5: Interact with Reconciliation UI

**Actions:**
1. Click through different clauses in the list
2. For an AMBER clause:
   - Click "Accept" button → observe status change to GREEN
3. For a RED clause:
   - Click "Flag Risk" button → observe status change to BLUE
   - Add note in risk acceptance text area
4. Verify progress bar updates after each action
5. Test keyboard navigation (arrow keys to move between clauses)

**Expected Results:**
- Clicking clause in list updates middle panel with full details
- Accept action:
  - Status changes from AMBER → GREEN
  - Clause border color updates
  - Progress percentage increases
- Flag Risk action:
  - Status changes from RED → BLUE
  - Risk flag icon appears
  - Note is saved and displayed
- Progress bar reflects updated counts in real-time

**Verification Queries:**
```sql
-- Verify reconciliation status updates
SELECT
  clause_id,
  status,
  risk_accepted,
  risk_note,
  updated_at
FROM reconciliation_status
WHERE clause_id IN (
  SELECT id FROM clause_boundaries WHERE document_id = '<DOCUMENT_ID>'
)
ORDER BY updated_at DESC;
```

**Evidence to Capture:**
- [ ] Screenshot of clause detail panel (before action)
- [ ] Screenshot showing status change (after Accept)
- [ ] Screenshot showing risk flag (after Flag Risk)
- [ ] Risk note text entered: `___________________`
- [ ] Updated progress percentage: `___________________`%
- [ ] Database query showing status updates

---

## Step 6: View PDF in Viewer

**Actions:**
1. Click the "PDF" tab in the right panel
2. Wait for PDF viewer to load
3. Test zoom controls in main toolbar:
   - Click zoom in (+) button
   - Click zoom out (-) button
   - Verify zoom percentage updates
4. Test page navigation:
   - Click next page button
   - Click previous page button
   - Use keyboard arrows (left/right)
5. Verify PDF viewer toolbar shows:
   - Current page / total pages
   - Filename
   - (No duplicate zoom controls in viewer toolbar)

**Expected Results:**
- PDF viewer loads with signed URL from `/api/reconciliation/[dealId]/pdf`
- Signed URL API response includes:
  - `url`: Time-limited URL (1 hour expiry)
  - `expires_at`: ISO timestamp
  - `filename`: Original PDF filename
  - `mime_type`: "application/pdf"
  - `deal_id`: Deal identifier
- Zoom controls in main toolbar work correctly:
  - Zoom in: 50% → 75% → 100% → 125% → 150% → 200%
  - Zoom out: reverse progression
  - PDF renders at correct size
- Page navigation updates page counter
- Keyboard shortcuts functional
- PDF viewer toolbar only shows page nav + filename (no duplicate zoom)

**Verification Queries:**
```sql
-- Verify PDF metadata in reconciliation API response
SELECT
  d.id as deal_id,
  dr.original_filename,
  dr.mime_type,
  dr.object_path,
  (dr.mime_type LIKE 'application/pdf%') as has_pdf
FROM deals d
JOIN document_repository dr ON d.id = dr.deal_id
WHERE d.id = '<DEAL_ID>';
```

**API Testing:**
```bash
# Test signed URL endpoint (requires authentication cookie)
curl -X GET 'http://localhost:3000/api/reconciliation/<DEAL_ID>/pdf' \
  -H 'Cookie: <AUTH_COOKIE>' \
  -v

# Expected response (200 OK):
{
  "url": "https://<project>.supabase.co/storage/v1/object/sign/contracts/<path>?token=...",
  "expires_at": "2025-11-16T15:30:00.000Z",
  "filename": "C14.pdf",
  "mime_type": "application/pdf",
  "deal_id": "<DEAL_ID>"
}

# Test unauthenticated request (401 expected)
curl -X GET 'http://localhost:3000/api/reconciliation/<DEAL_ID>/pdf'
# Expected: {"error":"Unauthorized - authentication required"}

# Test wrong tenant access (403 expected - requires multi-tenant setup)
# Login as user from different tenant, attempt to access this deal_id
# Expected: {"error":"Forbidden - you do not have access to this deal"}
```

**Evidence to Capture:**
- [ ] Screenshot of PDF viewer (page 1)
- [ ] Screenshot showing zoom at 150%
- [ ] Screenshot of page navigation (page 2 of N)
- [ ] Signed URL API response (redact token): `___________________`
- [ ] URL expiry timestamp: `___________________`
- [ ] Filename from API: `___________________`
- [ ] 401 response for unauthenticated request: `___________________`
- [ ] Zoom percentage displayed: `___________________`

---

## Step 7: Export Text Report

**Actions:**
1. Click "View Text Only" button in toolbar (switches to Overview tab)
2. Scroll through text-only summary view
3. Click "Export Text" button
4. Observe loading state on button
5. Wait for file download
6. Open downloaded .txt file
7. Verify content formatting

**Expected Results:**
- Button shows loading spinner during export
- Success toast appears: "Export Successful - Text report downloaded successfully"
- File downloads with naming pattern: `reconciliation-{dealId}-{date}.txt`
- Text file contains:
  - Deal header (talent, brand, fee)
  - Clause-by-clause breakdown with RAG color markers
  - Clause wrapping format:
    - `[GREEN] Clause Type: <type>` for match status
    - `[AMBER] Clause Type: <type>` for review status
    - `[RED] Clause Type: <type>` for issue status
    - `[BLUE] Clause Type: <type>` for accepted with risk
  - Confidence scores
  - Full clause text
  - Match excerpts (where applicable)
  - Summary statistics at end

**Verification:**
```bash
# Check downloaded file exists
ls -lh ~/Downloads/reconciliation-*.txt

# Verify color markers in text
grep -E '\[(GREEN|AMBER|RED|BLUE)\]' ~/Downloads/reconciliation-<DEAL_ID>-*.txt | head -10

# Count clause markers by color
grep -c '\[GREEN\]' ~/Downloads/reconciliation-<DEAL_ID>-*.txt
grep -c '\[AMBER\]' ~/Downloads/reconciliation-<DEAL_ID>-*.txt
grep -c '\[RED\]' ~/Downloads/reconciliation-<DEAL_ID>-*.txt
grep -c '\[BLUE\]' ~/Downloads/reconciliation-<DEAL_ID>-*.txt

# Test export API directly (optional - for debugging)
curl -s "http://localhost:3000/api/reconciliation/<DEAL_ID>/export?format=text" | head -50
# Or with specific document:
curl -s "http://localhost:3000/api/reconciliation/<DEAL_ID>/export?format=text&document_id=<DOC_ID>" | head -50
```

**Evidence to Capture:**
- [ ] Screenshot of export button loading state
- [ ] Screenshot of success toast notification
- [ ] Downloaded filename: `___________________`
- [ ] File size in KB: `___________________`
- [ ] Sample text with color markers (first 5 clauses)
- [ ] GREEN marker count: `___________________`
- [ ] AMBER marker count: `___________________`
- [ ] RED marker count: `___________________`
- [ ] BLUE marker count: `___________________`

---

## Step 8: Export JSON Report

**Actions:**
1. Click "Export JSON" button in toolbar
2. Observe loading state
3. Wait for file download
4. Open downloaded .json file in text editor or JSON viewer
5. Validate JSON structure

**Expected Results:**
- Button shows loading spinner during export
- Success toast appears: "Export Successful - JSON report downloaded successfully"
- File downloads with naming pattern: `reconciliation-{dealId}-{date}.json`
- JSON file contains valid structure:
  ```json
  {
    "deal": {
      "id": "uuid",
      "title": "string",
      "client_name": "string",
      "talent_name": "string",
      "value": number,
      "currency": "string",
      "status": "string"
    },
    "document": {
      "id": "uuid",
      "filename": "string",
      "processing_status": "completed|pending|failed"
    },
    "pre_agreed_terms": [...],
    "rag_distribution": {
      "total": number,
      "green": number,
      "amber": number,
      "red": number,
      "blue": number
    },
    "clauses": [
      {
        "id": "uuid",
        "clause_type": "string",
        "content": "string",
        "page_range": "string",
        "confidence": 0-1,
        "rag_status": "green|amber|red|blue|unknown",
        "rag_parsing": "string|null",
        "rag_risk": "string|null",
        "similarity_score": number|null,
        "matched_template": {
          "clause_id": "string",
          "clause_type": "string",
          "standard_text": "string"
        } | null
      }
    ],
    "exported_at": "ISO timestamp"
  }
  ```

**Verification:**
```bash
# Validate JSON syntax
cat ~/Downloads/reconciliation-<DEAL_ID>-*.json | jq '.'

# Check RAG distribution statistics
cat ~/Downloads/reconciliation-<DEAL_ID>-*.json | jq '.rag_distribution'

# Count clauses by RAG status
cat ~/Downloads/reconciliation-<DEAL_ID>-*.json | jq '[.clauses[] | .rag_status] | group_by(.) | map({status: .[0], count: length})'

# Verify deal metadata
cat ~/Downloads/reconciliation-<DEAL_ID>-*.json | jq '.deal'

# Check document info
cat ~/Downloads/reconciliation-<DEAL_ID>-*.json | jq '.document'

# Test export API directly (optional - for debugging)
curl -s "http://localhost:3000/api/reconciliation/<DEAL_ID>/export?format=json" | jq '{rag_distribution, clauses: (.clauses | length)}'
# Or with specific document:
curl -s "http://localhost:3000/api/reconciliation/<DEAL_ID>/export?format=json&document_id=<DOC_ID>" | jq '.rag_distribution'
```

**Evidence to Capture:**
- [ ] Screenshot of export button loading state
- [ ] Screenshot of success toast notification
- [ ] Downloaded filename: `___________________`
- [ ] File size in KB: `___________________`
- [ ] JSON validation result (pass/fail): `___________________`
- [ ] RAG distribution from JSON:
  - Total clauses: `___________________`
  - Green count (approved): `___________________`
  - Amber count (review): `___________________`
  - Red count (issues): `___________________`
  - Blue count (new/unmatched): `___________________`
- [ ] Deal metadata present (id, title, client, talent, value): `___________________`
- [ ] Document info present (id, filename, processing_status): `___________________`
- [ ] Sample clause has similarity_score and matched_template: `___________________`

---

## Step 9: Navigate Back and Verify Persistence

**Actions:**
1. Click browser back button or navigate to /deals
2. Locate the created deal in deals table
3. Click on the deal row to re-open
4. Verify all data persists:
   - Deal metadata
   - Reconciliation status
   - User actions (accepts, risk flags)
   - Progress percentage

**Expected Results:**
- Deal appears in deals table with correct status
- Clicking deal navigates back to /reconciliation?deal_id=<DEAL_ID>
- All reconciliation data loads from database
- User actions from Step 5 are preserved:
  - Accepted clauses remain GREEN
  - Risk-flagged clauses remain BLUE with notes
  - Progress percentage matches last state

**Verification Queries:**
```sql
-- Verify deal record persists
SELECT id, talent_name, brand, status, created_at, updated_at
FROM deals
WHERE id = '<DEAL_ID>';

-- Verify reconciliation status persists
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'match') as green,
  COUNT(*) FILTER (WHERE status = 'review') as amber,
  COUNT(*) FILTER (WHERE status = 'issue') as red,
  COUNT(*) FILTER (WHERE status = 'accepted') as blue
FROM reconciliation_status rs
JOIN clause_boundaries cb ON rs.clause_id = cb.id
WHERE cb.document_id = '<DOCUMENT_ID>';

-- Verify risk notes persist
SELECT clause_id, risk_note, updated_at
FROM reconciliation_status
WHERE risk_accepted = true
AND clause_id IN (
  SELECT id FROM clause_boundaries WHERE document_id = '<DOCUMENT_ID>'
);
```

**Evidence to Capture:**
- [ ] Screenshot of deals table showing created deal
- [ ] Screenshot of re-loaded reconciliation page
- [ ] Database query confirming data persistence
- [ ] Risk notes still visible: (yes/no) `___________________`
- [ ] Progress percentage unchanged: (yes/no) `___________________`

---

## Step 10: Admin Review and Cleanup

**Actions:**
1. Query database to gather final test evidence
2. Review edge function logs for any errors
3. Check storage bucket for uploaded PDF
4. Optionally: Delete test deal and associated records

**Final Verification Queries:**
```sql
-- Complete deal summary
SELECT
  d.id as deal_id,
  d.talent_name,
  d.brand,
  d.fee,
  d.status,
  dr.original_filename,
  dr.file_size,
  COUNT(DISTINCT cb.id) as total_clauses,
  COUNT(DISTINCT rs.id) as reconciled_clauses,
  d.created_at,
  d.updated_at
FROM deals d
LEFT JOIN document_repository dr ON d.id = dr.deal_id
LEFT JOIN clause_boundaries cb ON dr.id = cb.document_id
LEFT JOIN reconciliation_status rs ON cb.id = rs.clause_id
WHERE d.id = '<DEAL_ID>'
GROUP BY d.id, dr.id;

-- Edge function performance metrics
SELECT
  function_name,
  event_type,
  MIN(duration_ms) as min_duration,
  MAX(duration_ms) as max_duration,
  AVG(duration_ms) as avg_duration,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE event_type = 'error') as error_count
FROM edge_function_logs
WHERE (metadata->>'deal_id')::text = '<DEAL_ID>'
GROUP BY function_name, event_type;

-- Storage verification
SELECT name, bucket_id, metadata->>'size' as size, created_at
FROM storage.objects
WHERE name LIKE '%<DEAL_ID>%';
```

**Optional Cleanup:**
```sql
-- Delete test data (in correct order to respect foreign keys)
DELETE FROM reconciliation_status
WHERE clause_id IN (
  SELECT cb.id FROM clause_boundaries cb
  JOIN document_repository dr ON cb.document_id = dr.id
  WHERE dr.deal_id = '<DEAL_ID>'
);

DELETE FROM clause_boundaries
WHERE document_id IN (
  SELECT id FROM document_repository WHERE deal_id = '<DEAL_ID>'
);

DELETE FROM document_repository WHERE deal_id = '<DEAL_ID>';
DELETE FROM deals WHERE id = '<DEAL_ID>';

-- Delete from storage bucket (run via Supabase client)
-- await supabase.storage.from('contracts').remove(['<object_path>'])
```

**Evidence to Capture:**
- [ ] Complete deal summary query result
- [ ] Edge function performance metrics
- [ ] Storage object verification
- [ ] Any errors found in edge_function_logs: `___________________`
- [ ] Total processing time (upload to reconciliation complete): `___________________` seconds

---

## Test Completion Checklist

### Functional Requirements
- [ ] Deal creation works with all required fields
- [ ] Document upload stores file in contracts bucket
- [ ] Worker processes document through pgmq queues
- [ ] generate-embeddings edge function extracts clauses
- [ ] match-and-reconcile edge function finds matches
- [ ] Reconciliation UI displays all clauses with RAG colors
- [ ] User can accept clauses (AMBER → GREEN transition)
- [ ] User can flag risks (RED → BLUE transition with notes)
- [ ] Progress bar updates in real-time
- [ ] PDF viewer loads with signed URL
- [ ] Signed URL API authenticates via cookies
- [ ] Signed URL API validates tenant ownership
- [ ] PDF zoom controls work (main toolbar)
- [ ] PDF page navigation works (viewer toolbar)
- [ ] Text export downloads with color markers
- [ ] JSON export downloads with valid structure
- [ ] All data persists after navigation
- [ ] Error handling shows user-friendly toast notifications

### Security Requirements
- [ ] Unauthenticated PDF access returns 401
- [ ] Cross-tenant PDF access returns 403 (if multi-tenant data available)
- [ ] Signed URLs expire after 1 hour
- [ ] Tenant_id validation uses user_profiles table (not metadata)

### Performance Requirements
- [ ] Document upload completes in < 5 seconds
- [ ] Clause extraction completes in < 45 seconds
- [ ] Reconciliation page loads in < 2 seconds
- [ ] PDF viewer loads in < 3 seconds
- [ ] Export operations complete in < 5 seconds

### UX Requirements
- [ ] Loading states visible during async operations
- [ ] Success/error feedback via toast notifications (no alert())
- [ ] No duplicate zoom controls in PDF viewer
- [ ] Keyboard navigation works (arrow keys)
- [ ] Responsive layout on different screen sizes

---

## Known Limitations and Manual Test Notes

1. **PDF Viewer Testing**: Current plan excludes automated PDF viewer testing with Playwright. All PDF functionality must be verified manually using browser DevTools and visual inspection.

2. **Multi-Tenant Testing**: 403 tenant validation requires multiple tenant accounts. If testing with single tenant, skip cross-tenant access tests and note in evidence.

3. **Queue Visibility**: pgmq queue queries may require database superuser access. If unavailable, rely on edge_function_logs table for processing evidence.

4. **Timing Variability**: Processing times depend on PDF size and server load. Note actual times in evidence section for performance baseline.

5. **Export File Comparison**: Manual verification required to ensure text/JSON exports match database state. Automated tests will cover basic format validation only.

---

## Test Evidence Summary

**Tester:** `___________________`
**Date/Time:** `___________________`
**Environment:** `___________________` (localhost / staging / production)
**Test Duration:** `___________________` minutes

**Final Test Result:** ☐ PASS ☐ FAIL ☐ PARTIAL

**Deal ID Used:** `___________________`
**Document ID Used:** `___________________`
**Contract Filename:** `___________________`

**RAG Distribution:**
- Green (match): `___________________`
- Amber (review): `___________________`
- Red (issue): `___________________`
- Blue (accepted): `___________________`
- **Total Clauses:** `___________________`

**Export Files Generated:**
- Text report: `___________________` (filename)
- JSON report: `___________________` (filename)

**Issues Found:** `___________________`
**Notes:** `___________________`

---

**End of Manual Test Narrative**
