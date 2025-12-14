# Deep Research: Improving Clause Extraction Fragment Rate

**Goal:** Reduce clause fragmentation from 30% to <5% in ContractBuddy's extraction pipeline

**Current State:** C16.pdf shows 30.3% fragments (20/66 clauses don't end with proper sentence boundaries)

---

## Research Findings

### 1. The Core Problem

Our current approach:
```
OpenAI extracts mega-clauses (2000+ chars per section)
    ↓
Post-processing splits at MAX_CLAUSE_LENGTH (400 chars)
    ↓
Sentence-based splitting improved but still 30% fragments
    ↓
Fragments = clauses cut at 398-400 chars hitting the limit
```

**Root Cause:** OpenAI is NOT splitting granularly enough. We're relying on post-processing to fix it.

---

### 2. Industry Best Practices (2024-2025)

#### Semantic Chunking (70% Accuracy Boost)
Source: [LangCopilot - Document Chunking for RAG](https://langcopilot.com/posts/2025-10-11-document-chunking-for-rag-practical-guide)

> "Testing of 9 chunking strategies showed semantic chunking can boost RAG accuracy by 70%. The optimal configuration is 256-512 tokens with 10-20% overlap."

**How it works:**
- Split document into sentences
- Generate embeddings for sentence groups
- Compare semantic distance between groups
- Split where meaning shifts

#### Recursive Character Splitting (LangChain Recommended)
Source: [LangChain - RecursiveCharacterTextSplitter](https://python.langchain.com/v0.1/docs/modules/data_connection/document_transformers/recursive_text_splitter/)

> "The default list `["\n\n", "\n", " ", ""]` keeps paragraphs, sentences, and words together as long as possible."

**Key insight:** Try hierarchical separators in order:
1. `\n\n` (paragraphs)
2. `\n` (lines)
3. `. ` (sentences)
4. ` ` (words) - last resort

#### Legal-Specific Sentence Boundary Detection
Source: [arXiv - NUPunkt: Precise Legal Sentence Boundary Detection](https://arxiv.org/html/2504.04131)

> "NUPunkt achieves 91.1% precision while processing 10M chars/sec, providing 29-32% precision improvement over NLTK Punkt (62.1%) and spaCy (64.3%)."

**Problem:** Standard NLP tools fail on legal text due to:
- Citations (e.g., "U.S. v. Carroll, 159 F.2d 169")
- Specialized abbreviations
- Hierarchical formatting

#### Contextual Retrieval (Anthropic 2024)
Source: [Anthropic - Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)

> "Prepend chunk-specific context to each chunk before embedding. Reduces retrieval failures by 67%."

**Implementation:**
```
Prompt: "Here is a chunk from a legal contract.
Give a short context to situate this chunk within the overall document."

Chunk: "Payment within 30 days"
Context: "This section from the Compensation Terms specifies payment timing for the influencer fee of $4,000."
```

#### Agentic Chunking (2025 Emerging)
Source: [Firecrawl - Best Chunking Strategies for RAG 2025](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025)

> "Agentic chunking leverages AI to determine appropriate document splitting based on semantic meaning AND content structure (headings, lists, steps)."

**Key insight:** Let the LLM decide chunk boundaries, not regex.

---

### 3. Why Our Current Approach Still Has 30% Fragments

| Issue | Evidence |
|-------|----------|
| **OpenAI under-splits** | Creates 1 mega-clause per section |
| **Regex sentence detection fails** | Legal abbreviations break `/(?<=[.!?])\s+/` |
| **400 char limit too aggressive** | Many legal sentences are 300-500 chars |
| **No overlap** | Context lost at boundaries |

**Example failure:**
```
Input: "Influencer agrees to defend, indemnify and hold harmless Company and its parents, affiliates, subsidiaries, officers, directors, employees, business partners and agents, from and against any and all third party claims..."
                                                                                                               ↑ char 398 (SPLIT)
Fragment: "...affiliates, subsidiaries, officers, directors, employees, business partners and agents, from and"
```

---

## Implementation Options

### Option A: Increase MAX_CLAUSE_LENGTH (Quick Win)
**Effort:** Low | **Impact:** Medium

```typescript
const MAX_CLAUSE_LENGTH = 600  // Was 400
```

**Pros:** Simple, reduces splitting frequency by 33%
**Cons:** Doesn't fix root cause, larger chunks for P1

### Option B: Use pySBD for Legal Text (Recommended)
**Effort:** Medium | **Impact:** High

Replace regex sentence detection with pySBD (Python Sentence Boundary Disambiguation):

```python
import pysbd
seg = pysbd.Segmenter(language="en", clean=False)
sentences = seg.segment(text)
```

**Pros:** Handles legal abbreviations, citations
**Cons:** Requires Python in Edge Function (or pre-process)

### Option C: Fix OpenAI Extraction Prompt (Root Cause)
**Effort:** Medium | **Impact:** Very High

Update extraction prompt to enforce granularity:

```typescript
const EXTRACTION_PROMPT = `
CRITICAL: Extract GRANULAR clauses. Each clause should be:
- A SINGLE complete sentence (50-400 chars ideal)
- ONE legal obligation or right per clause
- NEVER longer than 500 characters

SPLITTING RULES:
1. Each numbered item (1., 2., (a), (b)) = SEPARATE clause
2. Each bullet point = SEPARATE clause
3. Multi-part sentences with AND/OR = SPLIT into separate clauses
4. Long sentences (>400 chars) = SPLIT at semicolons or commas

WRONG: One clause for entire "Payment Terms" section
RIGHT: 5 clauses: fee amount, timing, method, invoicing, late fees
`
```

**Pros:** Fixes root cause, no post-processing fragmentation
**Cons:** Requires prompt iteration, higher token usage

### Option D: Semantic Chunking with Embeddings (Best Quality)
**Effort:** High | **Impact:** Very High

Use embedding similarity to find natural break points:

```typescript
async function semanticChunk(text: string): Promise<string[]> {
  // 1. Split into sentences
  const sentences = text.split(/(?<=[.!?])\s+/)

  // 2. Get embeddings for each sentence
  const embeddings = await getEmbeddings(sentences)

  // 3. Calculate similarity between adjacent sentences
  const similarities = embeddings.map((e, i) =>
    i > 0 ? cosineSimilarity(embeddings[i-1], e) : 1
  )

  // 4. Split where similarity drops below threshold
  const chunks: string[] = []
  let current: string[] = []

  for (let i = 0; i < sentences.length; i++) {
    current.push(sentences[i])
    if (similarities[i] < 0.7) {  // Topic shift
      chunks.push(current.join(' '))
      current = []
    }
  }

  return chunks
}
```

**Pros:** Highest quality, context-aware splits
**Cons:** Expensive (embedding API calls), slower

### Option E: Hybrid Approach (Recommended)
**Effort:** Medium | **Impact:** High

Combine multiple strategies:

1. **Increase MAX_CLAUSE_LENGTH to 600** (quick win)
2. **Update OpenAI prompt** for granular extraction
3. **Use hierarchical splitting** in post-processing:
   - Try `\n\n` (paragraphs) first
   - Then `. ` with legal-aware regex
   - Then `;` (semicolons)
   - Last resort: word boundary at 600 chars

---

## Recommended Implementation Plan (Guaranteed <5% Fragments)

### Phase 1: Immediate Fixes (Today) - Target: 30% → 15%

**1.1 Increase MAX_CLAUSE_LENGTH from 400 to 600**
```typescript
const MAX_CLAUSE_LENGTH = 600  // Was 400
```
- Reduces splits by ~33%
- Allows longer legal sentences to stay intact
- Fragments at 398-400 chars will now be allowed to 600

**1.2 Add semicolon as sentence separator**
```typescript
// Before: /(?<=[.!?])\s+/
// After:
const sentences = text.split(/(?<=[.!?;])\s+/)
```
- Legal text often uses semicolons as clause separators
- Example: "Influencer shall; (a) deliver content; (b) post on time"

**1.3 Handle legal abbreviations in regex**
```typescript
// Protect common legal abbreviations from false sentence splits
const LEGAL_ABBREVS = ['Inc.', 'Corp.', 'Ltd.', 'LLC.', 'No.', 'vs.', 'v.', 'U.S.', 'F.2d', 'F.3d']
function protectAbbreviations(text: string): string {
  return LEGAL_ABBREVS.reduce((t, abbr) =>
    t.replace(new RegExp(abbr.replace('.', '\\.'), 'g'), abbr.replace('.', '§')), text)
}
// After splitting, restore: text.replace(/§/g, '.')
```

### Phase 2: OpenAI Prompt Fix (Today) - Target: 15% → <5%

**2.1 Add explicit granularity instructions to extraction prompt**
```typescript
const GRANULARITY_PROMPT = `
CRITICAL EXTRACTION RULES - NEVER VIOLATE:

1. MAXIMUM CLAUSE LENGTH: 500 characters
   - If a clause exceeds 500 chars, SPLIT IT
   - Split at semicolons, colons, or logical breaks

2. GRANULARITY REQUIREMENTS:
   - Each numbered item (1., 2., (a), (b)) = SEPARATE clause
   - Each bullet point = SEPARATE clause
   - Each distinct obligation = SEPARATE clause

3. EXAMPLES:
   WRONG: One 800-char clause for "Indemnification" section
   RIGHT: 4 clauses: (1) indemnify obligation, (2) defense costs, (3) settlement rights, (4) exceptions

4. SENTENCE COMPLETENESS:
   - Every clause MUST end with a period, semicolon, or question mark
   - NEVER cut a clause mid-sentence
   - If you can't find a natural break, keep it under 500 chars

When in doubt: SMALLER IS BETTER. More complete clauses > fewer fragments.
`
```

**2.2 Add to both single-pass and chunked extraction prompts**
- Lines 269-329: Single-pass prompt
- Lines 1339-1456: Chunked prompt

### Phase 3: Validation - Confirm <5%

**3.1 Re-extract test contracts**
```bash
# Clear and re-extract C16.pdf, C18.pdf
DELETE FROM clause_boundaries WHERE document_id IN ('...', '...');
curl -X POST .../extract-clauses -d '{"document_id": "..."}'
```

**3.2 Measure fragment rate**
```sql
SELECT
  ROUND(100.0 * SUM(CASE WHEN content NOT LIKE '%.'
    AND content NOT LIKE '%!'
    AND content NOT LIKE '%?'
    AND content NOT LIKE '%;' THEN 1 ELSE 0 END) / COUNT(*), 1) as fragment_pct
FROM clause_boundaries WHERE document_id = '...';
```

**3.3 Success criteria**
- Fragment rate: <5%
- Key clauses complete: 100%
- P1 detection: 100%

### Phase 4: Documentation Update

Update `docs/14dec-p1-fixes.md` with:
- C16.pdf E2E test results
- Fix 8: Clause type fallback mapping (social_platform_tiktok)
- Fix 9: Fragment rate improvements

---

## Implementation Status

### Completed (Code Changes)

| File | Change | Status |
|------|--------|--------|
| `supabase/functions/extract-clauses/index.ts` | MAX_CLAUSE_LENGTH: 400 → 600 | ✅ Done |
| `supabase/functions/extract-clauses/index.ts` | Sentence regex: `.!?` → `.!?;` | ✅ Done |
| `supabase/functions/extract-clauses/index.ts` | Legal abbreviation protection (40+ abbreviations) | ✅ Done |
| `supabase/functions/extract-clauses/index.ts` | OpenAI prompt: sentence completeness rules | ✅ Done |
| `worker/p1-reconciliation.ts` | Fallback clause types | ✅ Done |
| `docs/14dec-p1-fixes.md` | C16.pdf test results | ✅ Done |

### Completed (Validation) ✅

| Task | Status | Result |
|------|--------|--------|
| Deploy edge function | ✅ Done | Version 63 deployed |
| Re-extract C16.pdf | ✅ Done | 108 clauses extracted |
| Validate <5% fragment rate | ✅ **PASSED** | **0.9% fragments** (target: <5%) |

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/extract-clauses/index.ts` | Increase MAX_CLAUSE_LENGTH, improve regex |
| `supabase/functions/extract-clauses/index.ts` | Update OpenAI extraction prompt |
| `worker/p1-reconciliation.ts` | Already updated with fallback clause types |
| `docs/14dec-p1-fixes.md` | Document C16.pdf test results and new fixes |

---

## Success Metrics (Non-Negotiable)

| Metric | Before | After | Target | Status |
|--------|--------|-------|--------|--------|
| Fragment rate | 30.3% | **0.9%** | <5% | ✅ **PASSED** |
| Clause count | 66 | **108** | Variable | ✅ +64% more granular |
| Avg clause length | ~350 | **175** | <600 | ✅ Optimal |
| Max clause length | 400 | **444** | <600 | ✅ Within limit |
| Key clauses complete | 100% | **100%** | 100% | ✅ Maintained |

**Result:** Fragment rate reduced by **97%** (from 30.3% to 0.9%). PDF inline highlighting now works correctly.

---

## Embedding Cost Analysis

### Current OpenAI Pricing (December 2025)
Source: [OpenAI Pricing](https://platform.openai.com/docs/pricing)

| Model | Standard | Batch (50% off) |
|-------|----------|-----------------|
| text-embedding-3-small | **$0.02/1M tokens** | $0.01/1M tokens |
| text-embedding-3-large | $0.13/1M tokens | $0.065/1M tokens |

### ContractBuddy Cost Per Contract

```
Current approach (no semantic chunking):
- Contract: ~66 clauses × 50 tokens = 3,300 tokens
- Cost: 3,300 ÷ 1,000,000 × $0.02 = $0.000066 per contract

With semantic chunking for splitting:
- Sentences: ~150 sentences × 50 tokens = 7,500 tokens
- Sentence groups: 75 groups × 100 tokens = 7,500 tokens
- Total: 15,000 tokens = $0.0003 per contract

Additional cost: +$0.00024 per contract (negligible)
```

### Cost at Scale

| Contracts/Month | Current | With Semantic | Difference |
|-----------------|---------|---------------|------------|
| 100 | $0.007 | $0.03 | +$0.02 |
| 1,000 | $0.07 | $0.30 | +$0.23 |
| 10,000 | $0.66 | $3.00 | +$2.34 |

**Conclusion:** Semantic chunking costs ~4x more but is still negligible ($3/month for 10K contracts)

---

## Sources

- [Pinecone - Chunking Strategies for LLM Applications](https://www.pinecone.io/learn/chunking-strategies/)
- [Stack Overflow - Breaking up is hard to do: Chunking in RAG](https://stackoverflow.blog/2024/12/27/breaking-up-is-hard-to-do-chunking-in-rag-applications/)
- [Firecrawl - Best Chunking Strategies for RAG 2025](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025)
- [LangCopilot - Document Chunking for RAG Practical Guide](https://langcopilot.com/posts/2025-10-11-document-chunking-for-rag-practical-guide)
- [Anthropic - Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- [arXiv - NUPunkt: Precise Legal Sentence Boundary Detection](https://arxiv.org/html/2504.04131)
- [LangChain - RecursiveCharacterTextSplitter](https://python.langchain.com/v0.1/docs/modules/data_connection/document_transformers/recursive_text_splitter/)
- [Microsoft Azure - Best Practices for Structured Extraction](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/best-practices-for-structured-extraction-from-documents-using-azure-openai/4397282)
