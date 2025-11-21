# ContractBuddy PDF Viewer & Export Plan (Phase 9 Subplan)

## Goal
Add a dual-pane experience to the reconciliation workspace so reviewers can see both the AI-generated clause cards and the original contract PDF with zoom/navigation, plus a secure signed-URL API that respects private storage.

## Scope
1. Secure delivery of original documents via signed URLs (no direct client keys)
2. Client-side PDF rendering with zoom, pagination, and graceful fallback
3. Toggleable layout: clause cards + PDF viewer side-by-side (desktop) or tabbed (mobile)
4. Testing + instrumentation to ensure performance and correctness

## Constraints
- Storage bucket `contracts` is private; signed URLs must expire (<= 1h) and include tenant validation
- No schema changes; metadata already lives in `document_repository`
- React server components must lazy-load PDF viewer to avoid SSR weight
- Playwright suite will not automate PDF viewer yet (document manual test steps)

## Work Breakdown

### 1. Backend: Signed URL API (`app/api/reconciliation/[dealId]/pdf/route.ts`)
- Fetch document row via service client, verify tenant/ownership
- Generate Supabase storage signed URL for `contracts/{tenant_id}/{deal_id}/{filename}` (1h expiry)
- Return JSON `{ url, expires_at, filename, mime_type }`
- Handle errors: 404 (missing doc), 403 (tenant mismatch), 500 (storage failure)
- Log access attempts for audit (later enhancement)

### 2. API Enhancements (`app/api/reconciliation/[dealId]/route.ts`)
- Include `document.object_path`, `mime_type`, `original_filename` so frontend knows what to request
- Add `has_pdf` boolean (`mime_type` starts with `application/pdf`)

### 3. PDF Viewer Component (`components/pdf-viewer.tsx`)
- Use `react-pdf` + `pdfjs-dist`
- Features: loading spinner, error state, page navigation, zoom controls (fit, +/-), keyboard shortcuts (optional)
- Accept props: `signedUrl`, `fileName`
- Lazy import via `next/dynamic` to avoid SSR issues
- Expose events for analytics (pages viewed, errors)

### 4. UI Integration (`app/reconciliation/page.tsx`)
- Replace placeholder PDF tab with `<PDFViewer>` when `has_pdf` true
- Add toolbar: download buttons (text/JSON), PDF zoom controls, fallback button “View Text Only”
- Ensure layout works on desktop (split pane) and mobile (tabs)
- Show fallback message if PDF fails (offer download link instead)

### 5. Export Buttons (existing requirement)
- Wire text/JSON export endpoints to download actual files with loading state
- Use `fetch` → blob → `URL.createObjectURL` for downloads

### 6. Testing & Validation
- Manual tests: 3 sample PDFs (single-page, multi-page, large file)
- Verify signed URL expires after 1h
- Confirm non-PDF documents fall back to text view
- Update Playwright runbook/manual verification steps in plan.md
- Bundle impact check (analyze `next build` stats)

### 7. Documentation & Logging
- Update `plan.md` Phase 9 with implementation details + test evidence
- Note signed URL access logs (future TODO) and any limitations (e.g., no annotation yet)

## Risks & Mitigations
- **Large PDFs** → Use `pdfjs` worker CDN, lazy load viewer, show progress indicator
- **Signed URL leakage** → Short expiry, scoped per tenant; consider per-request tokens in future
- **Bundle size** → Tree-shake `react-pdf`, dynamic import component, load only when tab active
- **Testing complexity** → Keep automated tests focused on existing flow; document manual steps with screenshots/logs

## Success Criteria
- Export buttons deliver real files (text/JSON) from API
- `/api/reconciliation/{dealId}/pdf` returns working signed URL with correct permissions
- PDF viewer renders real contract with zoom/page controls and fallback messaging
- plan.md updated with commands/tests proving functionality

