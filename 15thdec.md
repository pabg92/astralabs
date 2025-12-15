# ContractBuddy Updates - December 15th, 2025

## Branch: `feat/deals-overview-enhancements`

---

## 1. Deals Overview Page (`/deals`)

### Column View Presets
- **Manager View**: Simplified view with Deal Name, Contract Status, Workflow Status, Actions
- **Ops View**: Full view with all columns (Date Added, Version, Talent, Brand, Fee)
- Toggle buttons in header with localStorage persistence
- Columns conditionally render based on selected preset

### New Workflow Status Column
| Status | Color | Description |
|--------|-------|-------------|
| Internal | Slate | Initial draft, not yet sent |
| With Us | Blue | Contract being reviewed internally |
| With Brand | Amber | Contract sent to brand for review |
| Signed | Emerald | Contract fully executed |

- Derived client-side from deal status and document presence
- Tooltips explaining each status on hover

### Row Selection & Bulk Operations
- Checkbox column for selecting individual deals
- "Select all" checkbox in header (selects visible/filtered deals)
- Bulk action toolbar appears when 1+ rows selected
- Shows selection count with "Clear selection" option
- **Bulk Archive** button with confirmation dialog

### Quick Filter Presets
- **Needs Upload**: Deals without a document attached
- **Redlining > 50%**: In-progress deals past halfway
- **Signed 30 days**: Recently signed deals (last 30 days)
- Click to apply, click again to toggle off
- Clear filter link when preset is active

### Enhanced Actions Column
- Inline upload button (always visible, not hidden in dropdown)
- Reorganized dropdown menu:
  - "Start/Continue Reconciliation" as primary action (top)
  - View Details, Edit Deal, Version History
  - Upload Document
  - Archive Deal (with confirmation dialog)

### Archive Functionality
- Single-row archive with AlertDialog confirmation
- Bulk archive with confirmation showing count
- Calls DELETE API endpoint (soft-delete)
- Toast notifications on success/failure
- Auto-refresh after archiving

---

## 2. Deal Edit Page (`/deals/[dealId]/edit`)

### Workflow Status Editor
- Replaced generic "Status" dropdown with "Workflow Status" selector
- Options with color-coded icons:
  - Internal (FileText - slate)
  - With Us (Building - blue)
  - With Brand (Send - amber)
  - Signed (CheckCircle2 - emerald)
- Helper text: "Where is this contract in the review process?"
- Maps to database status on save:
  - `internal` / `with_us` → `draft`
  - `with_brand` → `in_review`
  - `signed` → `signed`

### Contract Document Section
- New card between Deal Information and Pre-agreed Terms
- **If document exists:**
  - Shows file name, upload date, file type
  - "Replace" button to upload new version
  - Tooltip explaining the action
- **If no document:**
  - Drag-drop style upload area
  - Click to upload prompt
  - Accepts PDF, DOC, DOCX
- Loading state during upload
- Error display if upload fails

---

## Files Changed

| File | Changes |
|------|---------|
| `hooks/use-column-preset.ts` | **NEW** - Column visibility preset hook with localStorage |
| `app/deals/page.tsx` | Column presets, workflow column, bulk ops, filter presets, archive |
| `app/deals/[dealId]/edit/page.tsx` | Workflow status editor, contract upload/replace |

---

## Commits

```
7c2bacd feat: Add workflow status editor and contract replacement to deal edit
a6c7fd2 feat: Enhanced Deals Overview with column presets, bulk ops, and workflow status
```

---

## 3. PAT Term Category Dropdown (`feat/pat-dropdown-versioning`)

### Shared Constants
- **New file**: `/lib/constants/pat-categories.ts`
- 5 predefined categories:
  - Compensation & Payment Timing
  - Deliverables & Posting Requirements
  - Usage Rights & Licensing
  - Content Approval & Revisions
  - Content Retention & Non-Removal
- Each category has label and description for UI guidance

### Edit Page PAT Dropdown
- Replaced free text `<Input>` with `<Select>` dropdown
- Shows description below selected category
- Matches new deal page behavior exactly
- Ensures consistent data for reconciliation matching

### Contract Versioning System
- **Version increments on document upload**:
  - v1 → v2 → v3 etc.
- **Upload API changes** (`/api/deals/[dealId]/upload`):
  - Fetches current deal version
  - Increments version by 1
  - Clears old `clause_match_results` for fresh reconciliation
  - Tags document with version number
- **Edit page UI updates**:
  - Version badge in Contract Document header (v1/v2/v3+)
  - Warning text: "Uploading a new contract will create vX and reset reconciliation progress"
  - Tooltip on Replace button shows next version

---

## Files Changed (Updated)

| File | Changes |
|------|---------|
| `hooks/use-column-preset.ts` | **NEW** - Column visibility preset hook with localStorage |
| `lib/constants/pat-categories.ts` | **NEW** - Shared PAT category definitions |
| `app/deals/page.tsx` | Column presets, workflow column, bulk ops, filter presets, archive |
| `app/deals/[dealId]/edit/page.tsx` | Workflow status, contract upload, PAT dropdown, version display |
| `app/deals/new/page.tsx` | Import PAT_CATEGORIES from shared constants |
| `app/api/deals/[dealId]/upload/route.ts` | Version increment, clear clauses, tag document |

---

## Commits (Updated)

```
945c72c Merge feat/pat-dropdown-versioning into main
972537e feat: PAT dropdown in edit page + contract versioning
4fa342c docs: Add December 15th changelog
d08fe69 Merge feat/home-page-enhancements into main
8837c25 feat: Home page enhancements with layout toggle and improved UX
87cd0e5 Merge feat/deals-overview-enhancements into main
7c2bacd feat: Add workflow status editor and contract replacement to deal edit
a6c7fd2 feat: Enhanced Deals Overview with column presets, bulk ops, and workflow status
```

---

## Technical Notes

- **No database changes required** - Workflow status is derived client-side
- **Versioning**: Version increments on document upload, resets reconciliation
- **PAT Categories**: Shared constants ensure consistency between create/edit
- **Bulk operations**: Archive only for v1 (skip assign/start reconciliation)
- **Long-press preview**: Deferred to future iteration
- All features use existing shadcn/ui components (Checkbox, AlertDialog, Tooltip, Select)
- localStorage keys:
  - `contractbuddy-deals-column-preset` - Manager/Ops view preference
