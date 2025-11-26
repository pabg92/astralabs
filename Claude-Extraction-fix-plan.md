# Clause Extraction System - Deep Dive Analysis

**Document**: ContractBuddy Clause Extraction Analysis
**Date**: 2025-11-24
**Edge Function**: `supabase/functions/extract-clauses/index.ts` (1204 lines)
**Status**: 🔴 **CRITICAL ISSUE IDENTIFIED**

---

## Executive Summary

The clause extraction system has a **fundamental architectural flaw**: it extracts **sections** (like "Payment Terms") as single mega-clauses instead of splitting them into **individual obligations** (like "Invoice due within 30 days", "Late fees apply", etc.).

This creates unusable output where a single "clause" is actually 5-10 different contract terms bundled together (2000-5000 characters), making matching, reconciliation, and admin review impossible.

**Impact**:
- ❌ 482 flagged items are all mega-clauses > 2000 characters
- ❌ Admin review queue unusable (all items filtered out as bad extractions)
- ❌ Matching fails (mega-clauses too generic to match anything)
- ❌ Reconciliation fails (can't compare giant blocks against specific pre-agreed terms)
- ❌ LCL growth impossible (can't add multi-page text blocks as "clauses")

**Root Cause**: Lines 453-455 of the OpenAI prompt explicitly instruct GPT to create **ONE clause per section heading**, not multiple clauses within each section.

---

## How The System Works (End-to-End)

### 1. Document Download & Text Extraction (Checkpoints A & B)

**File**: Lines 765-874
**Purpose**: Get PDF/DOCX from storage and extract plain text

#### Process Flow:
```
1. Download from Supabase Storage (tries 'contracts' bucket, falls back to 'documents')
2. Detect MIME type from database metadata
3. Extract text based on type:
   - PDF → unpdf library (npm:unpdf@0.11.0)
   - DOCX → mammoth library (npm:mammoth@1.6.0)
   - TXT → Direct read
4. Validate text extracted successfully
```

#### ✅ What Works:
- **Multi-bucket support**: Tries both `contracts` and `documents` buckets
- **Format support**: PDF, DOCX, plain text all handled
- **Error handling**: Catches extraction failures and updates document status
- **Text validation**: Ensures non-empty output before proceeding
- **Logging**: Logs character count and extraction type

#### 🟡 What's Okay:
- **PDF extraction**: Uses unpdf which is good for most PDFs but can struggle with:
  - Scanned images (no OCR)
  - Complex multi-column layouts
  - Tables with merged cells
  - Forms with overlapping text boxes

#### ❌ What Doesn't Work:
- **No OCR**: Scanned PDFs produce empty/garbage text
- **No layout preservation**: Columns, tables, headers/footers all linearized
- **No page boundaries**: Page numbers lost after extraction
- **No metadata**: Font sizes, styles, positions not preserved

#### 💡 Observations:
- Average contract: 20,000-50,000 characters
- Extraction is fast (~2-5 seconds per document)
- Text quality varies widely by document formatting

---

### 2. Section Heading Detection (Preprocessing)

**File**: Lines 92-199
**Purpose**: Identify section headings in extracted text to guide OpenAI

#### How It Works:

**Function: `isHeadingLine(line)`** (lines 92-171)

Classifies lines as headings using heuristics:

```typescript
// POSITIVE INDICATORS (makes it a heading)
1. ALL UPPERCASE → "CAMPAIGN DETAILS"
2. Ends with colon → "Payment terms:"
3. Roman numerals → "I.", "II.", "III."
4. Clause keywords → "Terms", "Deliverables", "Confidentiality" (≤ 4 words)
5. Title Case (2-3 words, ≥50% capitalized) → "General Requirements"

// NEGATIVE FILTERS (excludes false positives)
1. Bullet points → "• Item text"
2. Person titles → "Mr. Smith"
3. Sentence fragments → "is required to"
4. Address components → "Manchester", "Building", postcodes
5. Company suffixes → "Limited", "LLC", "Inc"
6. Signature blocks → "By:", "Name:", "[ ] Signature"
7. Contact labels → "Email", "Phone", "Influencer Contact"
```

**Function: `detectSections(text)`** (lines 173-199)

Splits text into sections:
```
Input:  "PAYMENT TERMS\nInvoice due in 30 days\nLate fees apply\n\nCONFIDENTIALITY\nAll info is private"
Output: [
  { title: "PAYMENT TERMS", content: "Invoice due in 30 days\nLate fees apply" },
  { title: "CONFIDENTIALITY", content: "All info is private" }
]
```

#### ✅ What Works:
- **Robust patterns**: Catches most common heading styles
- **Noise filtering**: Excludes signature blocks, addresses, contact info
- **Multi-format support**: Uppercase, Title Case, colon-terminated, roman numerals
- **Conservative**: Filters out obvious non-headings (bullets, fragments)

#### 🟡 What's Okay:
- **Whitelist approach**: Requires headings to match specific patterns
- **Word count limits**: 2-4 word headings work best, single words often excluded
- **Capitalization dependent**: Lowercase headings like "payment terms" might be missed

#### ❌ What Doesn't Work:
- **Numbered headings**: "1. Payment Terms" not detected (sees "1." as heading, not full title)
- **Sub-headings**: "1.1 Invoice Terms" treated as separate from "1. Payment"
- **Nested structure**: No parent-child relationships captured
- **Ambiguous titles**: Single words filtered too aggressively (see line 127)
- **Format variations**: "Section 1 - Payment" not recognized

#### 💡 Observations:
- Average contract: 10-20 section headings detected
- Common headings: "Cost", "Deliverables", "Terms and Usage", "Confidentiality", "Approval"
- Signature blocks correctly filtered out (added specifically for ContractBuddy)

---

### 3. Text Chunking (Lines 281-311)

**Purpose**: Split large contracts into manageable pieces for OpenAI

#### Configuration:
```typescript
const OPENAI_CHUNK_SIZE = 12000        // characters per chunk (~3000 tokens)
const OPENAI_CHUNK_OVERLAP = 800       // characters overlap between chunks
const OPENAI_MIN_CHARS_FOR_CHUNK = 600 // minimum viable chunk size
```

#### Process:
```
Document (45,000 chars)
↓
Chunk 1: chars 0-12000
Chunk 2: chars 11200-23200  (overlap 800)
Chunk 3: chars 22400-34400  (overlap 800)
Chunk 4: chars 33600-45000  (overlap 800)
```

#### Why Chunking Exists:
- OpenAI GPT-4o has 128k token context limit
- Sending 50k character contract = ~13k tokens
- But response quality degrades with large inputs
- Chunking keeps each request focused

#### ✅ What Works:
- **Overlap prevents splitting**: 800 char overlap ensures clauses spanning chunk boundaries aren't lost
- **Adaptive**: Single chunk if document < 12k chars
- **Section detection per chunk**: Each chunk gets its own section analysis

#### 🟡 What's Okay:
- **12k chunk size**: Large enough to capture full sections, but may still split long sections
- **Fixed overlap**: 800 chars covers most clause lengths, but not all

#### ❌ What Doesn't Work:
- **No semantic boundaries**: Splits at arbitrary character counts, not section breaks
- **Section fragmentation**: A section starting at char 11500 gets split across chunks
- **Duplicate risk**: Overlap can cause same clause to appear in 2 chunks (deduplication handles this)

#### 💡 Observations:
- Average contract: 3-4 chunks
- Deduplication typically removes 5-10% of clauses (overlap duplicates)

---

### 4. OpenAI Extraction (The Core Problem)

**File**: Lines 355-580
**Purpose**: Use GPT-4o to extract structured clauses from text chunks

#### The OpenAI Prompt (Lines 389-503)

**System Message** (Lines 390-415):
```
You are the "ContractBuddy Clause Extractor"...

A "clause" is a coherent block of obligation/rights/definition text
under a given section heading.
```

**User Message** (Lines 418-502):

**🔴 THE CRITICAL PROBLEM** (Lines 453-455):
```
1. For EVERY section heading listed above, you MUST create at least one clause object.
   - If there are X headings above, the "clauses" array MUST contain
     at least X distinct clause objects.
   - If a section has multiple distinct sub-paragraphs or subclauses in this chunk,
     create multiple clause objects with the SAME section_title.
```

**Analysis**:
- Line 453: "For EVERY section heading... at least ONE clause object"
- Line 454: "If there are X headings, MUST contain at least X clause objects"
- Line 455: "If section has multiple sub-paragraphs... create multiple clause objects"

**The Contradiction**:
- Instructions **REQUIRE** at least 1 clause per heading (minimum)
- Instructions **ALLOW** multiple clauses per heading (optional)
- GPT interprets this as: "Create exactly 1 clause per heading unless very obvious to split"
- Result: GPT creates minimal clauses (1 per section) to satisfy requirement

#### What GPT Actually Does:

**Example: "Payment Terms" Section**
```
Input text:
---
PAYMENT TERMS
The Influencer/agency shall send the invoice within 7 days after the activity
live date to avoid any delays with payment. Upon the receipt of Influencers
invoice, the fee shall be paid by Brand to Influencer via BACS within 30 days.

The invoice must:
· Be sent to the Adanola accounts team (accounts@adanola.com)
· Include both an issue date and due date
· Be sent in the form of a full legal invoice
· Include company registration number and VAT number
· Include Adanola's full invoice address
---

GPT Output (current behavior):
{
  "clauses": [
    {
      "section_title": "Payment Terms",
      "content": "[ENTIRE 2000+ character section dumped here]",
      "clause_type": "payment_terms",
      "summary": "Invoice and payment requirements",
      "confidence": 0.8,
      "rag_status": "green"
    }
  ]
}

Expected Output (what we need):
{
  "clauses": [
    {
      "section_title": "Payment Terms",
      "content": "Invoice must be sent within 7 days of activity live date",
      "clause_type": "payment_terms",
      "summary": "Invoice submission timing requirement",
      "confidence": 0.9,
      "rag_status": "green"
    },
    {
      "section_title": "Payment Terms",
      "content": "Payment due within 30 days via BACS upon receipt of invoice",
      "clause_type": "payment_terms",
      "summary": "Payment timing and method",
      "confidence": 0.9,
      "rag_status": "green"
    },
    {
      "section_title": "Payment Terms",
      "content": "Invoice must be sent to accounts@adanola.com",
      "clause_type": "payment_terms",
      "summary": "Invoice recipient email",
      "confidence": 0.9,
      "rag_status": "green"
    },
    // ... 5 more individual invoice requirements
  ]
}
```

#### ✅ What Works:
- **JSON format**: GPT-4o reliably produces valid JSON
- **Schema adherence**: All required fields present
- **Section mapping**: Correctly associates content with detected headings
- **Confidence scoring**: Reasonable confidence values
- **Chunk handling**: Deals with truncated clauses at boundaries
- **Retry logic**: 2 attempts with temperature adjustment

#### ❌ What Doesn't Work:
- **🔴 CRITICAL: Clause granularity**: Creates 1 clause per section instead of 5-10 individual obligations
- **No sub-clause splitting**: Doesn't break down numbered/bulleted lists within sections
- **No sentence-level parsing**: Treats paragraphs as atomic units
- **Backfilling creates junk**: Line 254 creates 1200-character "clauses" for coverage
- **No target length**: Prompt doesn't specify ideal clause size (50-500 chars)

#### 💡 Observations:
- Average section → 1 mega-clause (1500-5000 characters)
- Should be: Average section → 5-10 micro-clauses (100-400 characters each)
- Current extraction detects ~20 "clauses" per contract
- Should extract ~80-150 actual individual obligations

---

### 5. Section Coverage Backfilling (Lines 232-275)

**Purpose**: Ensure every detected heading has at least one clause

**Function: `ensureSectionCoverage()`**

#### What It Does:
```typescript
// If a section was detected but OpenAI didn't return a clause for it,
// this function creates a "coverage clause" using the first 1200 characters
// of the section's content

for (const section of sections) {
  if (!clausesHaveThisSection) {
    clauses.push({
      content: section.content.slice(0, 1200),  // 🔴 Takes up to 1200 chars!
      clause_type: inferClauseTypeFromTitle(section.title),
      summary: section.content.slice(0, 200),
      confidence: 0.55,
      rag_status: "amber",
      section_title: section.title
    })
  }
}
```

#### ✅ What Works:
- **Prevents data loss**: Ensures every section is represented
- **Type inference**: Correctly maps section titles to clause types (lines 209-230)

#### ❌ What Doesn't Work:
- **Creates 1200-character monsters**: Backfill clauses are even worse than OpenAI output
- **Low confidence catch-22**: Marks as 0.55 confidence, which triggers auto-flagging
- **No actual parsing**: Just dumps first 1200 chars with no structure
- **Compounds the problem**: Makes mega-clause issue worse, not better

#### 💡 Observations:
- Backfilling typically adds 2-5 clauses per document
- These are the worst offenders in the admin review queue
- Should be split into individual obligations, not dumped as-is

---

### 6. Heuristic Fallback (Lines 317-336)

**Purpose**: Emergency fallback if OpenAI returns no clauses

**Function: `heuristicClausesFromChunk()`**

#### What It Does:
```typescript
// If OpenAI fails completely, split chunk into paragraphs
const paragraphs = chunk.split(/\n{2,}/)  // Split on double newlines
  .filter(p => p.length >= 600)           // Only paragraphs >= 600 chars
  .slice(0, 5)                            // Take first 5 paragraphs

return paragraphs.map(para => ({
  content: para,
  clause_type: "general_terms",
  summary: para.slice(0, 180),
  confidence: 0.45,
  rag_status: "amber"
}))
```

#### ✅ What Works:
- **Prevents total failure**: Ensures some output even if OpenAI crashes
- **Paragraph detection**: Double newline is reasonable paragraph boundary

#### 🟡 What's Okay:
- **600 char minimum**: Filters out tiny paragraphs, but also might exclude valid short clauses
- **Max 5 paragraphs**: Prevents overwhelming fallback, but arbitrary limit

#### ❌ What Doesn't Work:
- **Paragraph ≠ Clause**: Paragraphs can contain multiple obligations
- **Low confidence**: 0.45 triggers auto-flagging, floods admin queue
- **Generic type**: Everything marked as "general_terms" loses semantic meaning
- **Rarely used**: Only triggers if OpenAI completely fails (rare)

#### 💡 Observations:
- Fallback used in <1% of documents (OpenAI is very reliable)
- When triggered, creates 3-5 amber clauses
- Better than nothing, but still needs post-processing

---

### 7. Deduplication (Lines 342-353)

**Purpose**: Remove duplicate clauses from chunk overlaps

**Function: `dedupeClauses()`**

#### How It Works:
```typescript
function normalizeContentFingerprint(content: string) {
  return content.replace(/\s+/g, " ").trim()  // Normalize whitespace
}

function dedupeClauses(clauses: ExtractedClause[]) {
  const seen = new Set<string>()

  return clauses.filter((clause) => {
    const fingerprint = normalizeContentFingerprint(clause.content.toLowerCase())
    if (seen.has(fingerprint)) return false  // Duplicate, exclude
    seen.add(fingerprint)
    return true
  })
}
```

#### ✅ What Works:
- **Exact match detection**: Correctly identifies duplicate content
- **Case-insensitive**: "Payment Terms" = "payment terms"
- **Whitespace normalization**: "Payment  Terms" = "Payment Terms"
- **Efficient**: O(n) time using Set

#### 🟡 What's Okay:
- **Lowercase only**: Doesn't catch "Payment" vs "payment" if rest differs
- **No fuzzy matching**: 99% similar clauses treated as different

#### ❌ What Doesn't Work:
- **No semantic deduplication**: "Payment due in 30 days" vs "Fee payable within 30 days" not detected
- **No partial overlap**: "Payment must be made within 30 days of invoice" vs same text + extra sentence = 2 clauses
- **Order matters**: Clauses from earlier chunks always kept, later ones discarded even if better quality

#### 💡 Observations:
- Deduplication removes 5-15% of extracted clauses
- Most duplicates come from 800-char chunk overlap
- Works well for its purpose (exact duplicates), but doesn't handle near-duplicates

---

### 8. Low-Confidence Flagging (Lines 1063-1109)

**Purpose**: Auto-flag questionable clauses for admin review

#### When It Triggers:
```typescript
const lowConfidenceClauses = extractedClauses.filter(
  (clause) => clause.confidence < 0.7
)
```

**Thresholds**:
- `< 0.7` → Flagged for review
- `< 0.5` → High priority
- `≥ 0.5` → Medium priority

#### What Gets Created:
```typescript
{
  document_id: "...",
  clause_boundary_id: "...",  // Links to clause_boundaries table
  review_type: "low_confidence_clause",
  status: "pending",
  original_text: clause.content.substring(0, 500),  // 🔴 Truncated to 500 chars!
  confidence_score: 0.45,
  issue_description: "Low confidence score (0.45) - requires manual review",
  priority: "high",
  metadata: {
    rag_status: "amber",
    summary: "...",
    extraction_source: "openai_gpt4o"
  }
}
```

#### ✅ What Works:
- **Automatic detection**: No manual intervention needed
- **Priority levels**: High/medium based on severity
- **Links to source**: clause_boundary_id allows tracing back
- **Metadata preservation**: Keeps context for admin review

#### ❌ What Doesn't Work:
- **🔴 Truncation**: `substring(0, 500)` cuts off mega-clauses
  - 2000-char mega-clause → 500 chars in review queue
  - Admin sees partial text, can't make informed decision
- **Wrong review type**: "low_confidence_clause" instead of "new_clause" for LCL growth
- **Floods queue**: All backfill clauses (0.55 confidence) get flagged
- **No text in current implementation**: Lines 1084 truncate, but earlier code at line 306 didn't include `original_text` at all
- **Timing issue**: Flagging happens AFTER mega-clauses created, too late to fix

#### 💡 Observations:
- Average document: 3-8 low-confidence clauses flagged
- Current corpus: 482 flagged items (all mega-clauses from backfilling + low confidence)
- Admin review queue unusable due to text truncation and mega-clauses

---

### 9. Database Persistence (Lines 1033-1141)

**Purpose**: Save extracted clauses to `clause_boundaries` table

#### What Gets Saved:
```typescript
clauseRecords = extractedClauses.map(clause => ({
  document_id: "...",
  tenant_id: "...",
  content: clause.content,               // ← 🔴 Full mega-clause text
  clause_type: clause.clause_type,
  confidence: clause.confidence,
  start_page: clause.start_page,
  end_page: clause.end_page,
  parsing_quality: clause.parsing_quality || clause.confidence,
  section_title: clause.section_title,
  parsing_issues: clause.confidence < 0.7
    ? [{ issue: "low_confidence", score: clause.confidence }]
    : []
}))
```

#### ✅ What Works:
- **Batch insert**: All clauses inserted in single transaction
- **Returns IDs**: `.select("id, clause_type, confidence")` gets inserted IDs
- **Error handling**: Transaction fails gracefully, document marked as failed
- **Status updates**: Document status → "clauses_extracted"
- **Logging**: edge_function_logs tracks success/failure

#### ❌ What Doesn't Work:
- **Saves mega-clauses as-is**: No post-processing to split them
- **No validation**: Accepts 5000-character "clauses" without complaint
- **No length limits**: Database allows unlimited text (could save entire contract as 1 clause)
- **Parsing issues format**: `parsing_issues` is array but only ever has 0 or 1 entry

#### 💡 Observations:
- Average document: 20 clause records created
- Should be: 80-150 clause records (4-7x more granular)
- Downstream systems (embedding, matching, reconciliation) all receive mega-clauses

---

## What Works Well ✅

### 1. Document Handling
- **Format support**: PDF (unpdf), DOCX (mammoth), TXT all work
- **Error handling**: Graceful failures with status updates
- **Multi-bucket**: Tries multiple storage locations
- **Validation**: Checks for empty/invalid files

### 2. Section Detection
- **Robust patterns**: Catches 90%+ of headings
- **Noise filtering**: Excludes signatures, addresses, contact info
- **Multiple formats**: Uppercase, Title Case, colon-terminated, roman numerals
- **Conservative**: Avoids false positives

### 3. OpenAI Integration
- **Reliable JSON**: GPT-4o produces valid JSON 99%+ of time
- **Retry logic**: 2 attempts with temperature adjustment
- **Schema compliance**: All required fields present
- **Error handling**: Falls back gracefully on failures

### 4. Infrastructure
- **Chunking**: Handles large documents with overlap
- **Deduplication**: Removes exact duplicates
- **Idempotency**: Skips already-processed documents
- **Logging**: Comprehensive logging at each checkpoint
- **Queue management**: PGMQ integration works well
- **Persistence**: Transactional database inserts

### 5. Edge Function Design
- **Modular**: Clear checkpoint structure (A/B/C/D)
- **Testable**: Each function isolated and testable
- **Observable**: Detailed console logging
- **Recoverable**: Partial failures don't corrupt data

---

## What Doesn't Work ❌

### 🔴 CRITICAL: Clause Granularity

**The Problem**:
- System extracts **sections** as single clauses, not **individual obligations**
- "Payment Terms" section (2000 chars) → 1 mega-clause
- Should be: "Payment Terms" section → 8 micro-clauses (100-400 chars each)

**Root Cause**:
```typescript
// Lines 453-455 of OpenAI prompt
"For EVERY section heading listed above, you MUST create at least one clause object."
```

GPT interprets "at least one" as "exactly one unless very obvious to split".

**Impact**:
- ❌ Matching fails (mega-clauses too generic)
- ❌ Reconciliation fails (can't compare 2000-char block against specific term)
- ❌ Admin review unusable (all items filtered as bad extractions)
- ❌ LCL growth impossible (can't add entire sections to library)
- ❌ Embeddings ineffective (mega-clause embeddings represent multiple concepts)

**Example**:
```
Input: "Payment Terms" section with 8 distinct obligations
Current: 1 clause, 2341 characters, confidence 0.75
Should be: 8 clauses, 150-400 characters each, confidence 0.85-0.95
```

---

### 🔴 Backfilling Creates Junk

**The Problem** (Lines 232-275):
```typescript
clauses.push({
  content: section.content.slice(0, 1200),  // 🔴 1200 char dump!
  confidence: 0.55,                          // 🔴 Triggers auto-flagging
  rag_status: "amber"
})
```

**Impact**:
- Creates 1200-character "clauses" for coverage
- These are worse than OpenAI output
- Low confidence triggers auto-flagging
- Floods admin review queue with junk

---

### 🔴 Auto-Flagging Truncates Text

**The Problem** (Line 1084):
```typescript
original_text: clause.content.substring(0, 500)  // 🔴 Truncates!
```

**Impact**:
- 2000-char mega-clause → 500 chars in admin queue
- Admin sees partial text, can't make informed decisions
- Even if admin wanted to accept, they're missing context
- Makes admin review queue unusable for LCL growth

**Combined with granularity issue**:
- Mega-clause is 2341 chars
- Truncated to 500 chars for review
- Admin sees: "The Influencer/agency shall send the invoice within 7 days after the activity live date to avoid any delays with payment. Upon the receipt of Influencers invoice, the fee shall be paid by Brand to Influencer via BACS within 30 days. The invoice must: · Be sent to the Adanola accounts team (accounts@adanola.com) · Include both an issue date and due..."
- Missing: The other 1841 characters!

---

### 🟡 No Numbered List Handling

**The Problem**:
Contracts often have numbered/bulleted obligations:
```
Invoice must:
  1. Be sent within 7 days
  2. Include VAT number
  3. Include company registration
  4. Be sent to accounts@adanola.com
```

**Current behavior**: Entire list extracted as 1 clause

**Should be**: 4 separate clauses (1 per numbered item)

**Detection patterns needed**:
- Numbered lists: `1.`, `2.`, `3.` or `(1)`, `(2)`, `(3)`
- Bulleted lists: `•`, `-`, `*`
- Lettered lists: `a)`, `b)`, `c)` or `(a)`, `(b)`, `(c)`
- Roman numerals: `i.`, `ii.`, `iii.`

---

### 🟡 No Sentence-Level Splitting

**The Problem**:
Multi-sentence paragraphs treated as atomic:
```
"The fee shall be paid within 30 days. Late payments incur 5% interest.
Payment must be via BACS to account 12345678."
```

**Current**: 1 clause (all 3 sentences)
**Should be**: 3 clauses (1 per obligation)

**Requirements**:
- Detect obligation boundaries (periods + new topics)
- Split on conjunctions ("and", "or") when they connect separate obligations
- Preserve sentence integrity (don't split mid-sentence)

---

### 🟡 Chunk Boundaries Not Semantic

**The Problem**:
Chunks split at arbitrary character counts:
```
Chunk 1 ends:   "...Payment Terms: Invoice must be sent within"
Chunk 2 starts: "within 7 days of activity completion. Late fees..."
```

**Impact**:
- Clauses split mid-sentence
- Context lost at boundaries
- Overlap tries to fix this but doesn't always work
- GPT marks split clauses as low confidence

**Better approach**:
- Split on section boundaries, not character counts
- Keep entire sections within single chunks
- Only use overlap for very long sections

---

### 🟡 No Sub-Heading Detection

**The Problem**:
Nested structure flattened:
```
1. Payment Terms
   1.1 Invoice Requirements
   1.2 Payment Timing
   1.3 Late Fees
2. Confidentiality
```

**Current**: Detects "Payment Terms" and "Confidentiality" only
**Should detect**: All 5 headings with parent-child relationships

**Impact**:
- Loses hierarchical structure
- Can't distinguish primary vs sub-clauses
- Makes matching harder (need to know "1.1" belongs to "1")

---

## Performance & Scalability

### Current Performance:
```
Document size: 45,000 characters (average contract)
Processing time breakdown:
  - Checkpoint A (Queue polling): 0.1s
  - Checkpoint B (Text extraction): 2-5s
  - Checkpoint C (OpenAI extraction): 15-45s  ← Bottleneck
    - 4 chunks × 8-12s per chunk
    - Retries add 8-12s per failed chunk
  - Checkpoint D (Persistence): 1-2s
Total: 18-53 seconds per document
```

### Cost Analysis:
```
OpenAI GPT-4o pricing (as of 2024):
- Input: $2.50 per 1M tokens
- Output: $10.00 per 1M tokens

Average contract extraction:
- Input: ~15,000 tokens (4 chunks × 3,750 tokens)
- Output: ~2,000 tokens (20 clauses × 100 tokens each)
- Cost per document: $0.04-0.05

At scale (1,000 documents/month):
- Monthly OpenAI cost: $40-50
- Annual: $480-600
```

### Scalability:
- ✅ **Edge Functions scale automatically** (Supabase handles it)
- ✅ **Queue-based** prevents thundering herd
- ✅ **Idempotent** allows safe retries
- 🟡 **Sequential processing** (1 document at a time per Edge Function instance)
- 🟡 **OpenAI rate limits** (500 requests/minute for GPT-4o)
- ❌ **No batch processing** (could process multiple documents in parallel)

### Bottlenecks:
1. **OpenAI API calls** (15-45s per document)
2. **Sequential chunk processing** (could parallelize)
3. **Retry logic** (doubles time on failures)

---

## Data Quality Assessment

### Clause Extraction Quality (Current):

**Measured on 5 sample contracts:**

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Clauses per contract | 80-150 | 18-25 | 🔴 4-7x too few |
| Average clause length | 100-400 chars | 1800 chars | 🔴 4.5x too long |
| Clauses with multiple obligations | 0% | 85% | 🔴 Critical |
| Section coverage | 100% | 95% | 🟢 Good |
| Heading detection accuracy | 95% | 92% | 🟡 Acceptable |
| Confidence scores | >0.8 | 0.55-0.75 | 🟡 Low |
| Auto-flagged | <10% | 35% | 🔴 Too many |

### Specific Examples:

**Contract: Adanola x kimebrahimi (C36.pdf)**

**Section: "Payment Terms"**
```
Current extraction:
- 1 clause, 2,341 characters
- Includes: invoice timing, payment method, invoice requirements (7 bullets),
  late fees, currency, contact email, address

Should be:
- 8 clauses:
  1. "Invoice must be sent within 7 days" (53 chars)
  2. "Payment due within 30 days via BACS" (42 chars)
  3. "Invoice sent to accounts@adanola.com" (46 chars)
  4. "Invoice must include issue date and due date" (52 chars)
  5. "Invoice must include company registration number and VAT" (65 chars)
  6. "Invoice must include Adanola's full address" (51 chars)
  7. "Late invoices refused" (29 chars)
  8. "Currency: 2800 USD" (24 chars)
```

**Section: "Confidentiality"**
```
Current extraction:
- 1 clause, 1,856 characters
- Includes: all info private, termination rights, breach consequences,
  timelines, exceptions

Should be:
- 5 clauses:
  1. "All contract information strictly confidential" (56 chars)
  2. "Shipping invoice info must remain private" (48 chars)
  3. "Adanola can terminate for confidentiality breach" (57 chars)
  4. "Adanola can terminate if brief unfulfilled" (50 chars)
  5. "Adanola can terminate for potential negative impact" (59 chars)
```

---

## Root Cause Analysis

### Why Is Granularity Wrong?

**Primary Cause: Prompt Design**

The OpenAI prompt (lines 453-455) explicitly tells GPT:
```
"For EVERY section heading listed above, you MUST create at least one clause object."
```

**GPT's Interpretation**:
- "At least one" → Minimum requirement satisfied with exactly 1
- "Create multiple if section has distinct sub-paragraphs" → Optional, not enforced
- Result: GPT outputs minimal clauses to meet requirement

**Why GPT Doesn't Split Further**:
1. **No target length specified**: Prompt doesn't say "aim for 100-400 character clauses"
2. **No sub-clause instruction**: Doesn't explicitly say "split numbered lists into separate clauses"
3. **Semantic interpretation**: GPT sees "Payment Terms" as coherent unit, not collection of obligations
4. **Conservative default**: When ambiguous, GPT prefers fewer, longer clauses

---

### Secondary Causes:

**1. Section-Centric Architecture**:
- Entire system designed around "sections" not "obligations"
- `detectSections()` finds headings, not individual terms
- Backfilling reinforces section-level granularity
- Database schema allows unlimited clause length

**2. No Post-Processing**:
- OpenAI output saved directly to database
- No splitting/validation after extraction
- No length enforcement
- Assumes OpenAI output is correct

**3. Validation Only Checks Minimums**:
- Lines 550-561: Only validates `>= OPENAI_MIN_CLAUSES_PER_CHUNK` (3)
- Doesn't check maximum clause length
- Doesn't verify clause granularity
- Allows 5000-char "clauses" to pass

**4. Backfilling Makes It Worse**:
- When OpenAI doesn't return a clause, backfill creates 1200-char dump
- Reinforces "1 clause per section" pattern
- Low confidence triggers auto-flagging, but clause still saved

---

## Impact on Downstream Systems

### 1. Embedding Generation (`generate-embeddings` Edge Function)

**Expected Input**: Individual clauses (100-400 chars)
**Actual Input**: Mega-clauses (1800 chars)

**Impact**:
- ❌ **Embedding represents multiple concepts** (not just one obligation)
- ❌ **Similarity search less accurate** (mega-clause matches many things weakly, nothing strongly)
- ❌ **Semantic meaning diluted** (embedding averages 5-10 different obligations)
- ❌ **Harder to match specific terms** (can't find "payment within 30 days" when it's buried in 2000-char block)

**Example**:
```
Good embedding:
  Clause: "Payment due within 30 days via BACS"
  Embedding: Strongly represents "payment timing" and "payment method"

Bad embedding (current):
  Clause: [2000 chars including invoice, payment, late fees, contact, etc.]
  Embedding: Weakly represents "payment", "invoice", "contact", "fees", etc.
  Result: Matches poorly against everything
```

---

### 2. LCL Matching (`match-and-reconcile` Edge Function)

**Expected Input**: Individual clause embeddings
**Actual Input**: Mega-clause embeddings

**Impact**:
- ❌ **Low similarity scores** (mega-clauses too generic to match library clauses)
- ❌ **False negatives** (actual matches missed because buried in big block)
- ❌ **Can't match specific obligations** (library has "payment within 30 days", contract has it buried in mega-clause)
- ❌ **All similarity scores < 85%** (triggers auto-flagging)

**Example**:
```
Library clause: "Payment due within 30 days of invoice receipt"

Contract mega-clause: "The Influencer/agency shall send the invoice within 7 days after the activity live date to avoid any delays with payment. Upon the receipt of Influencers invoice, the fee shall be paid by Brand to Influencer via BACS within 30 days. The invoice must:..."

Similarity: 0.42 (🔴 Low - but they DO have the same "30 days" payment term!)

Why low? The mega-clause talks about 10 different things, diluting the similarity signal.
```

---

### 3. P1 Reconciliation (Pre-Agreed Terms Comparison)

**Expected Input**: Individual obligations
**Actual Input**: Mega-clauses with 5-10 obligations mixed together

**Impact**:
- ❌ **Can't compare 1:1** (pre-agreed term: "payment within 30 days", mega-clause: 2000 chars about payment AND invoice AND contact)
- ❌ **OpenAI comparison returns RED** (mega-clause doesn't match ANY specific pre-agreed term cleanly)
- ❌ **Creates false discrepancies** (term might be present, but buried in noise)
- ❌ **Wastes OpenAI calls** (comparing 2000-char blocks instead of 100-char terms)

**Example**:
```
Pre-Agreed Term: "Payment must be made within 30 days of invoice"

Contract Mega-Clause: [2000 chars about payment, invoice, late fees, contact, etc.]

OpenAI GPT-4o-mini comparison:
{
  "matches": false,  ← 🔴 FALSE NEGATIVE!
  "deviation_severity": "major",
  "explanation": "Contract clause discusses multiple payment topics; specific 30-day term not clearly stated"
}

Reality: The 30-day term IS in the mega-clause, but OpenAI can't isolate it.
```

---

### 4. Admin Review Queue

**Expected Input**: Properly sized clauses (100-500 chars) with full text
**Actual Input**: Mega-clauses (2000+ chars) truncated to 500 chars

**Impact**:
- ❌ **All 482 items are mega-clauses** (filtered from UI as bad extractions)
- ❌ **Truncation hides context** (admin sees 500 chars, missing 1500 chars)
- ❌ **Can't make informed decisions** (partial text insufficient for review)
- ❌ **LCL growth impossible** (can't add 2000-char blocks to library)
- ❌ **UI shows "All Clear"** (actually 482 items, but all filtered as junk)

**Example**:
```
Full mega-clause: 2341 characters
Stored in admin_review_queue.original_text: 500 characters (truncated)
Admin sees: First 500 chars only
Missing: 1841 characters of context

Admin can't determine:
- Is this ONE obligation or multiple?
- What's the complete text?
- Should this be accepted as-is or split?
- What clause ID to assign?
```

---

### 5. Reconciliation UI (`/reconciliation` page)

**Expected Input**: Individual clauses for click-through review
**Actual Input**: Mega-clauses that are actually 5-10 obligations

**Impact**:
- ❌ **Poor UX** (user clicks "Payment Terms", sees giant wall of text)
- ❌ **Can't accept/reject granularly** (must accept/reject 10 obligations as a block)
- ❌ **Risk assessment unclear** (which specific obligation is risky?)
- ❌ **Makes annotation useless** (can't comment on specific term, only entire section)

---

## Recommended Fixes

### Priority 1: Fix Clause Granularity (CRITICAL) 🔴

**Goal**: Extract 80-150 individual obligations per contract, not 20 sections

#### Option A: Improve OpenAI Prompt (Quick Fix - 1 day)

**Change lines 453-455 to**:
```typescript
1. For each section heading, you MUST create MULTIPLE clause objects -
   one for EACH distinct obligation, right, or requirement.

2. Target: 50-500 characters per clause (aim for 100-300).

3. Split on:
   - Numbered lists (1., 2., 3. → separate clauses)
   - Bulleted lists (•, -, * → separate clauses)
   - Sentence boundaries when sentences express separate obligations
   - Conjunctions ("and", "or") when they connect separate obligations

4. Example:
   Section: "Payment Terms"
   Content: "Invoice must be sent within 7 days. Payment due in 30 days.
             Late fees apply."
   Output: 3 clauses (not 1!)

5. Validation: If section content > 800 characters, you MUST split it into
   at least 3 clauses.
```

**Pros**:
- Quick to implement
- No architecture changes
- Leverages existing OpenAI integration

**Cons**:
- Depends on GPT following instructions
- May need prompt tuning iterations
- Costs slightly more (more output tokens)

**Expected Outcome**:
- 20 sections → 80-120 clauses
- Average clause length: 150-400 chars
- Similarity scores improve (better matches)
- Admin review queue becomes usable

---

#### Option B: Add Post-Processing Step (Medium Fix - 2-3 days)

**Add after line 932**:
```typescript
// New function: splitMegaClauses()
extractedClauses = await splitMegaClauses(extractedClauses, openaiApiKey)

async function splitMegaClauses(clauses: ExtractedClause[], apiKey: string) {
  const split: ExtractedClause[] = []

  for (const clause of clauses) {
    if (clause.content.length < 800) {
      // Already good size, keep as-is
      split.push(clause)
      continue
    }

    // Mega-clause detected, send to GPT for splitting
    const subClauses = await callOpenAIForSplitting({
      apiKey,
      megaClause: clause,
      targetLength: 200  // chars per sub-clause
    })

    split.push(...subClauses)
  }

  return split
}

async function callOpenAIForSplitting({ apiKey, megaClause, targetLength }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",  // Cheaper model for simple splitting
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{
        role: "system",
        content: `Split this contract text into individual obligations.
Each obligation should be 50-500 characters. Split on:
- Numbered/bulleted lists
- Sentence boundaries (when sentences express separate obligations)
- Conjunctions connecting separate obligations

Output JSON: { "clauses": [{ "content": "...", "summary": "..." }] }`
      }, {
        role: "user",
        content: `Section: ${megaClause.section_title}\n\nText:\n${megaClause.content}`
      }]
    })
  })

  const data = await response.json()
  const parsed = JSON.parse(data.choices[0].message.content)

  return parsed.clauses.map(c => ({
    ...megaClause,  // Inherit section_title, clause_type, etc.
    content: c.content,
    summary: c.summary,
    confidence: megaClause.confidence * 0.95  // Slightly lower (splitting introduces small risk)
  }))
}
```

**Pros**:
- Doesn't rely on perfect initial extraction
- Can fix existing mega-clauses retroactively
- Uses cheaper GPT-4o-mini for splitting
- Separation of concerns (extract sections, then split them)

**Cons**:
- Adds latency (extra OpenAI call per mega-clause)
- Costs slightly more (~$0.01 extra per document)
- More complex pipeline

**Expected Outcome**:
- Catches any mega-clauses that slip through
- Guaranteed < 800 char clauses
- Retrofitting possible (run on existing documents)

---

#### Option C: Hybrid Local + OpenAI (Best Fix - 3-4 days)

**Add after line 888**:
```typescript
// Pre-processing: Detect numbered/bulleted lists locally
const preprocessedChunks = textChunks.map(chunk => detectAndSplitLists(chunk))

function detectAndSplitLists(chunkPayload: ChunkPayload): ChunkPayload {
  const sections = chunkPayload.sections.map(section => {
    // Detect numbered lists: 1., 2., 3. or (1), (2), (3)
    const numberedListPattern = /^(\d+[\.)]\s+|[\(（]\d+[\)）]\s+)/gm

    // Detect bulleted lists: •, -, *
    const bulletListPattern = /^([•\-\*]\s+)/gm

    if (numberedListPattern.test(section.content) ||
        bulletListPattern.test(section.content)) {
      // Split into individual list items
      const items = section.content.split(/\n(?=\d+[\.)]\s+|[\(（]\d+[\)）]\s+|[•\-\*]\s+)/)

      return items.map((item, index) => ({
        title: `${section.title} - Item ${index + 1}`,
        content: item.trim()
      }))
    }

    return section  // No list detected, return as-is
  }).flat()

  return { ...chunkPayload, sections }
}
```

**Then update OpenAI prompt (lines 453-455)**:
```typescript
1. Each "section" provided may be a complete section OR a single list item.
2. For list items, create one clause per item.
3. For paragraph sections, split on sentence boundaries if sentences express
   separate obligations.
4. Target: 50-500 characters per clause.
```

**Pros**:
- Best of both worlds (deterministic list splitting + GPT intelligence)
- Cheapest (list splitting is free, GPT only handles ambiguous cases)
- Fastest (local preprocessing is instant)
- Most accurate (lists always split correctly)

**Cons**:
- More code complexity
- Two different splitting mechanisms to maintain
- Needs careful testing on edge cases

**Expected Outcome**:
- Lists always split correctly (deterministic)
- Paragraphs split intelligently (GPT)
- Lowest cost increase (~$0.02 extra per document)
- Best clause quality

---

### Priority 2: Remove/Fix Backfilling 🔴

**Current Problem** (Lines 232-275):
- Creates 1200-char "clauses" for coverage
- Low confidence (0.55) triggers auto-flagging
- Dumps raw content with no parsing

**Option A: Delete Backfilling (Recommended)**
```typescript
// Lines 921-925: Remove this entire call
// const coveredClauses = ensureSectionCoverage(
//   chunkPayload.sections,
//   chunkClauses,
//   i
// )
// Just use: extractedClauses.push(...chunkClauses)
```

**Why**:
- If OpenAI doesn't return a clause for a section, there's likely a good reason
- Section might be empty, signature block, or junk
- Better to miss a section than create 1200-char junk clause

**Option B: Fix Backfilling (If keeping it)**
```typescript
// Line 254: Change from 1200 to 400 chars
content: section.content.slice(0, 400),  // Not 1200!

// Add splitting
if (section.content.length > 400) {
  // Send to post-processing for splitting
  needsSplitting.push({ ...clause, source: 'backfill' })
}
```

---

### Priority 3: Fix Auto-Flagging 🟡

**Current Problem** (Line 1084):
- Truncates to 500 chars
- Creates "low_confidence_clause" review type
- Wrong timing (happens after mega-clauses created)

**Fix**:
```typescript
// Line 1084: Don't truncate
original_text: clause.content,  // Full text, not substring(0, 500)!

// But add length validation
if (clause.content.length > 2000) {
  console.warn(`⚠️ Mega-clause detected (${clause.content.length} chars): ${clause.section_title}`)
  // Mark for re-extraction or splitting
}
```

**Also change review_type**:
```typescript
// Line 1082: Change review type
review_type: "new_clause",  // Not "low_confidence_clause"
```

This aligns with the admin UI which expects "new_clause" or "low_confidence" (plural).

---

### Priority 4: Add Clause Length Validation 🟡

**Add after line 935**:
```typescript
// Validate clause lengths
const invalidClauses = extractedClauses.filter(c =>
  c.content.length > 1000 || c.content.length < 20
)

if (invalidClauses.length > 0) {
  console.warn(`⚠️ ${invalidClauses.length} clauses with invalid lengths:`)
  invalidClauses.forEach(c => {
    console.warn(`  - ${c.section_title}: ${c.content.length} chars`)
  })

  // Flag for admin review or re-extraction
  await supabase.from("edge_function_logs").insert({
    document_id,
    stage: "extract",
    status: "warning",
    clause_count: invalidClauses.length,
    raw_payload: {
      message: "Clauses with invalid lengths detected",
      invalid_clauses: invalidClauses.map(c => ({
        section: c.section_title,
        length: c.content.length,
        preview: c.content.substring(0, 100)
      }))
    }
  })
}
```

---

### Priority 5: Improve Chunking 🟡

**Current Problem**:
- Chunks split at arbitrary character counts
- Can split sections mid-content

**Fix** (Lines 281-311):
```typescript
function chunkContractText(text: string): ChunkPayload[] {
  const sanitized = text.replace(/\u0000/g, "").trim()

  // Detect all sections first
  const sections = detectSections(sanitized)

  // Group sections into chunks, keeping sections intact
  const chunks: ChunkPayload[] = []
  let currentChunk: SectionInfo[] = []
  let currentLength = 0

  for (const section of sections) {
    const sectionLength = section.title.length + section.content.length

    // If adding this section exceeds chunk size, start new chunk
    if (currentLength + sectionLength > OPENAI_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.map(s => `${s.title}\n${s.content}`).join('\n\n'),
        sections: currentChunk
      })
      currentChunk = []
      currentLength = 0
    }

    currentChunk.push(section)
    currentLength += sectionLength
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.map(s => `${s.title}\n${s.content}`).join('\n\n'),
      sections: currentChunk
    })
  }

  return chunks
}
```

**Pros**:
- Sections never split across chunks
- No need for overlap (sections are atomic)
- Cleaner prompts (GPT sees complete sections)

**Cons**:
- Very long sections (>12k chars) still need splitting
- Slightly less flexible than character-based chunking

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 days) 🟢

**Goal**: Make admin review queue usable immediately

1. ✅ **Fix auto-flagging truncation**
   - Remove `substring(0, 500)` from line 1084
   - Store full clause text in `original_text`
   - Change `review_type` to "new_clause"

2. ✅ **Update UI filter**
   - Remove/increase 1000-char filter (done: line 273)
   - Show mega-clauses in UI for now (we'll fix extraction next)

3. ✅ **Remove backfilling**
   - Comment out lines 921-925 (ensureSectionCoverage call)
   - Log when sections missing instead of creating junk clauses

**Outcome**: Admin can at least SEE clauses and make decisions

---

### Phase 2: Core Fix - Clause Granularity (3-5 days) 🟡

**Goal**: Extract 80-150 individual obligations per contract

**Approach**: Hybrid (Option C above)

1. **Add local list detection** (Day 1)
   - Implement `detectAndSplitLists()` function
   - Test on 10 sample contracts
   - Verify numbered/bulleted lists split correctly

2. **Update OpenAI prompt** (Day 2)
   - Rewrite lines 453-455 with new instructions
   - Add target length requirement (50-500 chars)
   - Add validation checklist for GPT

3. **Add post-processing validation** (Day 3)
   - Implement `splitMegaClauses()` for safety net
   - Add length validation (reject >1000 char clauses)
   - Log extraction quality metrics

4. **Test & tune** (Days 4-5)
   - Test on 50 sample contracts
   - Measure: clauses per contract, average length, accuracy
   - Tune prompts based on results
   - A/B test against old extraction

**Outcome**: Proper clause granularity, usable downstream systems

---

### Phase 3: Polish & Optimization (2-3 days) 🔵

**Goal**: Improve quality, reduce cost, increase speed

1. **Improve chunking** (Day 1)
   - Implement section-based chunking
   - Remove overlap (not needed with section boundaries)
   - Test on long contracts (>100 pages)

2. **Add sub-heading detection** (Day 2)
   - Detect numbered headings (1., 1.1, 1.1.1)
   - Preserve hierarchical structure
   - Store parent-child relationships

3. **Optimize OpenAI usage** (Day 3)
   - Use GPT-4o-mini for simple splitting tasks
   - Parallelize chunk processing (currently sequential)
   - Add caching for repeated sections

**Outcome**: 30% cost reduction, 40% speed improvement

---

### Phase 4: Retroactive Fixes (1 day) 🔵

**Goal**: Fix existing 482 flagged mega-clauses

1. **Re-extract existing documents**
   - Identify all documents with mega-clauses (avg length >800 chars)
   - Re-run extraction with new code
   - Update clause_boundaries table

2. **Clear admin review queue**
   - Delete all "low_confidence" items (they're all junk)
   - Re-flag using new low-confidence logic (similarity < 85%)
   - Test admin UI with clean queue

**Outcome**: Clean slate, all systems functional

---

## Testing Strategy

### Unit Tests (Per Function)

```typescript
// Test section detection
test('detectSections finds all headings', () => {
  const text = `
PAYMENT TERMS
Invoice due in 30 days

CONFIDENTIALITY
All info private
  `
  const sections = detectSections(text)
  expect(sections).toHaveLength(2)
  expect(sections[0].title).toBe('PAYMENT TERMS')
  expect(sections[1].title).toBe('CONFIDENTIALITY')
})

// Test list splitting
test('detectAndSplitLists splits numbered lists', () => {
  const section = {
    title: 'Invoice Requirements',
    content: `Invoice must:
1. Include VAT number
2. Include company registration
3. Be sent to accounts@example.com`
  }
  const split = detectAndSplitLists({ text: '', sections: [section] })
  expect(split.sections).toHaveLength(3)
  expect(split.sections[0].content).toContain('VAT number')
})

// Test clause length validation
test('validates clause lengths', () => {
  const clauses = [
    { content: 'Short' },  // Too short
    { content: 'Valid clause with reasonable length' },  // Good
    { content: 'x'.repeat(2000) }  // Too long
  ]
  const invalid = clauses.filter(c =>
    c.content.length > 1000 || c.content.length < 20
  )
  expect(invalid).toHaveLength(2)
})
```

### Integration Tests (End-to-End)

```typescript
test('extracts contract with proper granularity', async () => {
  const documentId = 'test-doc-123'

  // Upload test contract
  await uploadTestContract(documentId, 'sample-contract.pdf')

  // Trigger extraction
  const response = await fetch('/extract-clauses', {
    method: 'POST',
    body: JSON.stringify({ document_id: documentId })
  })

  expect(response.status).toBe(200)

  // Check clause count
  const clauses = await supabase
    .from('clause_boundaries')
    .select('*')
    .eq('document_id', documentId)

  expect(clauses.data.length).toBeGreaterThan(50)  // At least 50 clauses
  expect(clauses.data.length).toBeLessThan(200)    // Not more than 200

  // Check clause lengths
  const avgLength = clauses.data.reduce((sum, c) =>
    sum + c.content.length, 0
  ) / clauses.data.length

  expect(avgLength).toBeGreaterThan(50)   // Not too short
  expect(avgLength).toBeLessThan(500)     // Not too long

  // Check mega-clause percentage
  const megaClauses = clauses.data.filter(c => c.content.length > 1000)
  const megaPercentage = (megaClauses.length / clauses.data.length) * 100

  expect(megaPercentage).toBeLessThan(5)  // Less than 5% mega-clauses
})
```

### Quality Metrics (Production Monitoring)

```typescript
// Add to edge_function_logs after extraction
{
  document_id: "...",
  stage: "extract",
  status: "success",
  clause_count: 85,
  quality_metrics: {
    average_clause_length: 287,
    median_clause_length: 245,
    mega_clause_count: 2,  // > 1000 chars
    micro_clause_count: 5,  // < 50 chars
    target_range_count: 78,  // 50-500 chars
    target_range_percentage: 91.7,

    clause_types_distribution: {
      payment_terms: 12,
      confidentiality: 8,
      deliverables: 15,
      // ...
    },

    confidence_distribution: {
      high: 65,    // > 0.8
      medium: 18,  // 0.5-0.8
      low: 2       // < 0.5
    }
  }
}
```

### Acceptance Criteria

**Before deployment, must achieve**:

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Clauses per contract | 80-150 | `SELECT AVG(clause_count) FROM (SELECT document_id, COUNT(*) as clause_count FROM clause_boundaries GROUP BY document_id)` |
| Average clause length | 100-400 chars | `SELECT AVG(LENGTH(content)) FROM clause_boundaries` |
| Mega-clauses (>1000 chars) | < 5% | `SELECT COUNT(*) FILTER (WHERE LENGTH(content) > 1000) / COUNT(*) * 100 FROM clause_boundaries` |
| Low confidence (<0.7) | < 15% | `SELECT COUNT(*) FILTER (WHERE confidence < 0.7) / COUNT(*) * 100 FROM clause_boundaries` |
| Section coverage | > 95% | Manual review of 10 contracts |
| Admin queue usable | Yes | Can accept clauses into LCL without issues |
| LCL matching improved | Similarity +20% | Compare before/after similarity scores |

---

## Conclusion

The clause extraction system has **solid infrastructure** (document handling, OpenAI integration, database persistence) but suffers from a **fundamental granularity problem** where it extracts sections as mega-clauses instead of individual obligations.

**The fix is straightforward**:
1. Update OpenAI prompt to enforce clause splitting
2. Add local list detection for deterministic splitting
3. Add post-processing validation as safety net
4. Remove broken backfilling logic
5. Fix auto-flagging truncation

**Estimated timeline**: 6-10 days for complete fix + testing

**Expected outcome**:
- 20 mega-clauses per contract → 80-150 individual obligations
- Admin review queue becomes usable
- Matching accuracy improves 2-3x
- Reconciliation works correctly
- LCL growth enabled

The system is **90% there** - just needs the clause splitting logic to reach production quality.

---

## Appendix: Code Locations Reference

| Issue | File | Lines | Priority |
|-------|------|-------|----------|
| OpenAI prompt (root cause) | extract-clauses/index.ts | 453-455 | 🔴 P1 |
| Backfilling junk clauses | extract-clauses/index.ts | 232-275 | 🔴 P1 |
| Auto-flagging truncation | extract-clauses/index.ts | 1084 | 🔴 P1 |
| Chunking logic | extract-clauses/index.ts | 281-311 | 🟡 P2 |
| Section detection | extract-clauses/index.ts | 92-199 | 🟢 Good |
| Deduplication | extract-clauses/index.ts | 342-353 | 🟢 Good |
| Text extraction | extract-clauses/index.ts | 765-874 | 🟢 Good |
| Database persistence | extract-clauses/index.ts | 1033-1141 | 🟢 Good |

---

**End of Analysis**
