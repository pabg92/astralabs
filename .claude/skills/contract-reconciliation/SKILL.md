---
name: contract-reconciliation
description: Fully automated contract reconciliation workflow for ContractBuddy. Use when users ask to "reconcile a contract", "analyze contract terms", "auto-review contract", "process contract", or provide a path to a contract file (PDF/DOCX). Processes contracts end-to-end: reads contract, extracts terms via AI, creates deals with pre-agreed terms, uploads to ContractBuddy, and auto-processes clauses by status (approve green, reject red, flag amber).
---

# Contract Reconciliation Skill

Automates the complete contract reconciliation workflow from a local contract file through ContractBuddy.

## Trigger Phrases

- "Reconcile this contract: /path/to/file.pdf"
- "Analyze and reconcile /path/to/contract.docx"
- "Process contract file for reconciliation"
- "Auto-review contract at [path]"
- "Run contract through reconciliation"

## Prerequisites

1. **ContractBuddy running**: Application must be running at `localhost:3000`
   ```bash
   cd /Users/work/Desktop/developer/ContractBuddy && pnpm dev
   ```

2. **Dev-browser skill**: The dev-browser plugin must be installed for browser automation

## Complete Workflow

### Step 1: Validate Input File

First, verify the contract file exists and is a supported type:

```bash
# Check file exists
ls -la /path/to/contract.pdf

# Supported types: .pdf, .docx
```

If file not found, report error and stop.

### Step 2: Read Contract Text

**For PDF files**, use the Read tool to view the PDF content:
```
Read the PDF file at /path/to/contract.pdf
```

**For DOCX files**, the Read tool can extract text directly.

Store the extracted text for AI analysis.

### Step 3: AI Term Extraction (Generate Pre-Agreed Terms)

Analyze the contract text to extract key commercial and legal terms. For each term found, identify:

- **term_category**: One of the supported categories (see mapping below)
- **term_description**: Concise description of the specific term/obligation
- **expected_value**: The actual value/details from the contract

**PAT Category Mapping:**

| Term Category | Maps to Clause Types |
|---------------|---------------------|
| Payment | `payment_terms` |
| Usage/Rights | `usage_rights` |
| Deliverables | `scope_of_work`, `deliverables` |
| Exclusivity | `exclusivity` |
| Confidentiality | `confidentiality` |
| Termination | `term_and_termination` |
| IP | `intellectual_property` |
| Compliance | `compliance` |
| Indemnification | `indemnification` |
| Warranties | `warranties` |
| Assignment | `assignment` |

**What to extract:**
- Payment amounts, currency, payment schedules
- Usage rights duration, territories, platforms
- Deliverable descriptions, deadlines, quantities
- Exclusivity periods and scope
- Confidentiality obligations and duration
- Termination conditions and notice periods
- IP ownership and license terms
- Compliance requirements (FTC, platform policies)
- Indemnification scope
- Warranty terms

See [prompts/term-extraction.md](prompts/term-extraction.md) for the full extraction prompt.

### Step 4: Start Dev-Browser Server

Invoke the dev-browser skill to ensure the browser server is running:

```
Use the dev-browser skill to start the browser server
```

Or manually:
```bash
cd ~/.claude/plugins/cache/dev-browser-marketplace/dev-browser/*/skills/dev-browser
./server.sh &
```

Wait for the server to be ready on port 9222.

### Step 5: Navigate to Create Deal Page

Using dev-browser, navigate to the deal creation page:

```typescript
// Connect to dev-browser
const client = await connect("http://localhost:9222");
const page = await client.page("contract-recon");

// Navigate to deals/new
await page.goto("http://localhost:3000/deals/new");
await waitForPageLoad(page);

// Get ARIA snapshot to identify form elements
const snapshot = await client.getAISnapshot("contract-recon");
```

### Step 6: Fill Deal Form

Using the ARIA snapshot, identify and fill form fields:

**Required fields:**
- **Deal Name**: Use contract filename or "Contract - [Brand] x [Talent]"
- **Talent Name**: Extract from contract parties (influencer/creator name)
- **Brand/Client Name**: Extract from contract parties (company name)
- **Fee Amount**: Extract from payment terms
- **Currency**: Extract from payment terms (default: USD)

**Fill using dev-browser:**
```typescript
// Find form fields by their labels/refs in ARIA snapshot
await page.fill('[name="dealName"]', dealName);
await page.fill('[name="talentName"]', talentName);
await page.fill('[name="brandName"]', brandName);
await page.fill('[name="fee"]', feeAmount);
```

### Step 7: Add Pre-Agreed Terms

For each extracted term from Step 3:

1. **Click "Add Term" button** to create a new PAT row
2. **Select Clause Type** from the dropdown (matches term_category)
3. **Fill "Expected Term"** textarea with term_description
4. **Fill "Notes"** with expected_value (optional)

```typescript
// For each term
for (const term of extractedTerms) {
  // Click Add Term button
  await page.click('button:has-text("Add Term")');
  await waitForPageLoad(page);

  // Get fresh snapshot after adding term
  const snapshot = await client.getAISnapshot("contract-recon");

  // Find the new term row and fill it
  // Select clause type from dropdown
  // Fill expected term textarea
}
```

### Step 8: Upload Contract File

Upload the original contract file:

```typescript
// Find file input (may be hidden behind drag-drop zone)
const fileInput = await page.$('input[type="file"]');
await fileInput.setInputFiles(contractFilePath);

// Wait for upload confirmation
await waitForPageLoad(page);
```

### Step 9: Submit and Wait for Processing

1. **Click "Create & Start Reconciliation"** button:
```typescript
await page.click('button:has-text("Create & Start Reconciliation")');
```

2. **Wait for redirect** to `/reconciliation?dealId={id}`

3. **Poll for processing completion**:
   - Clause extraction takes 30-90 seconds
   - Embedding generation takes 5-15 seconds
   - Match and reconcile takes 5-10 seconds
   - P1 reconciliation takes 10-30 seconds

4. **Timeout after 5 minutes** with error

```typescript
// Wait for URL to change to reconciliation page
await page.waitForURL('**/reconciliation**', { timeout: 300000 });

// Extract deal ID from URL
const url = page.url();
const dealId = new URL(url).searchParams.get('dealId');

// Wait for clauses to appear (processing complete)
await page.waitForSelector('[data-clause-highlight-id]', { timeout: 300000 });
```

### Step 10: Auto-Process Clauses

Iterate through all clauses and auto-approve/reject based on status:

```typescript
// Get ARIA snapshot to find clause cards
const snapshot = await client.getAISnapshot("contract-recon");

// Track statistics
let approved = 0, rejected = 0, flagged = 0;

// Process each clause
for (const clause of clauses) {
  // Get clause status from UI (green/amber/red indicator)
  const status = await getClauseStatus(clause);

  if (status === "green" || status === "match") {
    // AUTO-APPROVE: Click approve button (ThumbsUp)
    await clickApproveButton(clause);
    approved++;
  } else if (status === "red" || status === "issue") {
    // AUTO-REJECT: Click reject button (ThumbsDown)
    await clickRejectButton(clause);
    rejected++;
  } else if (status === "amber" || status === "review") {
    // FLAG FOR HUMAN REVIEW: Skip or add comment
    console.log(`HUMAN REVIEW NEEDED: ${clause.clauseType}`);
    flagged++;
  }

  // Wait for UI to update before next clause
  await waitForPageLoad(page);
}
```

**Status color mapping:**
- `emerald/green` = Match (auto-approve)
- `amber/yellow` = Review needed (flag for human)
- `red` = Issue (auto-reject)

### Step 11: Generate Report

After processing all clauses, report results:

```
## Reconciliation Complete

**Deal ID:** {dealId}
**Deal URL:** http://localhost:3000/reconciliation?dealId={dealId}

### Statistics
- **Total Clauses:** {total}
- **Auto-Approved (Green):** {approved}
- **Auto-Rejected (Red):** {rejected}
- **Flagged for Review (Amber):** {flagged}

### Clauses Needing Human Review
{list of amber clauses with their types and content snippets}

### Next Steps
1. Review flagged clauses at the URL above
2. Make manual decisions on amber items
3. Navigate to completion page when done
```

## Error Handling

### File Not Found
```
Error: Contract file not found at {path}
Please verify the file path and try again.
Supported formats: PDF, DOCX
```

### ContractBuddy Not Running
```
Error: ContractBuddy is not running at localhost:3000
Please start the application:
  cd /Users/work/Desktop/developer/ContractBuddy && pnpm dev
```

### Dev-Browser Not Started
```
Error: Dev-browser server is not running on port 9222
Starting server automatically...
```

### Processing Timeout
```
Error: Contract processing timed out after 5 minutes.
The document may be too large or the backend may be unresponsive.

Debug steps:
1. Check Supabase logs: mcp__supabase__get_logs service=edge-function
2. Check document status in database
3. Try re-uploading a smaller document
```

### Element Not Found
```
Error: Could not find {element} in page
Current URL: {url}

Taking debug screenshot...
Please check the ARIA snapshot and retry with correct element reference.
```

## Example Usage

**User Request:**
```
Reconcile the contract at ~/Documents/Adanola-Influencer-Contract.pdf
```

**Skill Execution:**
1. Reads ~/Documents/Adanola-Influencer-Contract.pdf
2. Extracts text (3 pages, 2400 words)
3. AI identifies 6 key terms:
   - Payment: $2,800 USD within 30 days
   - Deliverables: 2 Instagram posts, 1 TikTok
   - Usage Rights: 12 months, social media only
   - Exclusivity: 30 days in fitness category
   - Termination: 14 days written notice
   - Compliance: FTC disclosure required
4. Creates deal "Adanola x [Talent Name]" with 6 PATs
5. Uploads contract file
6. Waits for processing (45 seconds)
7. Auto-processes 15 clauses:
   - 10 green → approved
   - 2 red → rejected
   - 3 amber → flagged
8. Reports completion with deal URL

**Output:**
```
## Reconciliation Complete

**Deal ID:** f5f6e692-b9c4-4aab-8c33-59177df31c2c
**Deal URL:** http://localhost:3000/reconciliation?dealId=f5f6e692-b9c4-4aab-8c33-59177df31c2c

### Statistics
- Total Clauses: 15
- Auto-Approved (Green): 10
- Auto-Rejected (Red): 2
- Flagged for Review (Amber): 3

### Clauses Needing Human Review
1. **invoicing_obligation** - Payment timing differs from PAT (96% match)
2. **usage_rights** - Extended territory clause detected
3. **compliance** - Platform-specific requirements

### Next Steps
1. Review 3 flagged clauses at the URL above
2. Make manual decisions on amber items
3. Click "Complete Review" when done
```

## See Also

- [prompts/term-extraction.md](prompts/term-extraction.md) - AI prompt for term extraction
- [reference.md](reference.md) - API reference and troubleshooting
- Dev-browser skill documentation for browser automation details
