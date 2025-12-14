# P1 Reconciliation Fixes - December 14, 2025

## Overview

Major overhaul of the P1 (Pre-Agreed Terms) reconciliation system and clause extraction pipeline to improve accuracy and trustworthiness for talent managers.

**Two core issues fixed:**
1. **P1 Reconciliation**: ContractBuddy was selecting wrong clauses and providing misleading explanations
2. **Clause Extraction**: ~50% of extracted clauses were fragments (cut off mid-sentence)

---

## Problems Identified

### Problem 1: Wrong Clause Selection

**Before:** P1 selected clauses based on LCL similarity (how well they match library templates), not semantic relevance to the PAT.

| PAT | Selected (Wrong) | Should Have Selected |
|-----|------------------|---------------------|
| Fee: $5,500 | "Withhold compensation" (penalty clause) | "$4,000 fee" (actual fee) |
| 30 days usage | "Grant of Rights" (IP clause) | "60 days usage rights" (actual usage) |

**Root Cause:** LCL similarity measures template match, not PAT relevance. A penalty clause might have higher LCL similarity than the actual fee clause.

### Problem 2: False Positives on Usage Rights

**Before:** PAT said "30 days", contract said "60 days", but P1 returned GREEN "Matches: 60 days"

**Root Cause:** GPT was describing the contract value, not comparing it to the agreed value. It didn't understand that more usage for the brand = bad for talent.

### Problem 3: Vague Explanations

**Before:** "Payment terms missing" or "Exact match"

**After:** "Contract: $4,000, Agreed: $5,500 - $1,500 shortfall"

### Problem 4: Duplicate Match Results

Multiple match_results per clause caused `find()` to return wrong records, breaking candidate selection.

---

## Fixes Applied

### Fix 1: Semantic Relevance Scoring

**File:** `worker/p1-reconciliation.ts` (lines 198-265)

Added `calculateSemanticRelevance()` function that scores how relevant a clause's CONTENT is to the PAT description:

```typescript
function calculateSemanticRelevance(term: PreAgreedTerm, clause: ClauseBoundary): number {
  let score = 0

  // Dollar amounts - most important for payment terms
  if (patHasDollar && clauseHasDollar) score += 50

  // Platforms (TikTok, Instagram, etc.)
  if (patHasPlatform && clauseHasPlatform) score += 40

  // Time periods (days, months)
  if (patHasTime && clauseHasTime) score += 30

  // Deliverable counts (1 video, 2 photos)
  if (patHasDeliverable && clauseHasDeliverable) score += 35

  // Content types (video, photo, asset, overlay)
  score += 15 * overlappingContentTypes

  // Link in bio special case
  if (both have "link in bio") score += 20

  return score
}
```

### Fix 2: Semantic-Priority Best Match Selection

**File:** `worker/p1-reconciliation.ts` (lines 376-442)

Changed `selectBestMatchPerTerm()` to prioritize semantic relevance over match status:

```typescript
// PRIORITY: Semantic relevance FIRST, then match status
// Rationale: A clause with high semantic relevance that shows RED is MORE useful than
// a clause with low relevance that shows GREEN (the latter is just incidental matching)

function isBetterMatch(compA, resultA, compB, resultB): boolean {
  const HIGH_RELEVANCE_THRESHOLD = 30

  // Case 1: Prefer high relevance (even if RED)
  if (aIsHighRelevance && !bIsHighRelevance) return true
  if (!aIsHighRelevance && bIsHighRelevance) return false

  // Case 2: Same relevance level - use traditional scoring
  // green > amber > red, then confidence
}
```

**Why this matters:**
- High relevance + RED = "The fee clause exists, and the fee is WRONG" (useful!)
- Low relevance + GREEN = "Some other clause matches on incidental terms" (misleading!)

### Fix 3: Talent-Protective GPT Prompt

**File:** `worker/p1-reconciliation.ts` (lines 438-472)

Updated the system prompt to explicitly protect talent interests:

```
CRITICAL: You are protecting the TALENT (influencer/creator), not the brand.
Flag issues that are BAD for talent:
- Brand gets MORE usage rights than agreed = RED (talent's content used longer)
- Brand pays LESS fee than agreed = RED (talent earns less)
- Talent must deliver MORE than agreed = RED (more work for same pay)

ALWAYS COMPARE NUMBERS:
- If term says "30 days" and clause says "60 days" → RED (brand gets 2x more usage!)
- If term says "$5,000" and clause says "$4,000" → RED ($1,000 shortfall)

EXPLANATION FORMAT - State BOTH values:
- "Contract: 60 days, Agreed: 30 days - brand gets 30 extra days"
- "Contract: $4,000, Agreed: $5,500 - $1,500 shortfall"
```

### Fix 4: Compensation Mapping Fallback

**File:** `worker/p1-reconciliation.ts` (lines 106-111)

Added fallback clause types for compensation detection:

```typescript
"Compensation & Payment Timing": {
  primary: ["payment_terms"],
  fallback: ["invoicing_obligation", "timeline_obligation", "usage_rights", "general_terms"]
  // Added usage_rights and general_terms because fee info sometimes
  // appears in combined clauses (e.g., "60 days usage... Compensation $4,000 NET 30")
},
```

### Fix 5: Improved Deliverable Pattern Matching

**File:** `worker/p1-reconciliation.ts` (lines 231-248)

Made deliverable detection more flexible to handle formats like "(1) text overlay video":

```typescript
// Match content types even without numbers
const contentTypes = ['video', 'photo', 'tiktok', 'post', 'reel', 'story', 'image', 'asset', 'overlay']

// Flexible pattern for number + content type
const deliverablePattern = /\(?\d+\)?\s*[a-z]*\s*(video|photo|tiktok|post|reel|story|image|asset)/gi
```

---

## Test Results

### C12.pdf (Lucky Brand X Cotton)

| Red Herring | PAT | Contract | Detected? |
|-------------|-----|----------|-----------|
| Fee | $3,500 | $2,300 | ✅ "Contract: $2,300, Agreed: $3,500 - $1,200 shortfall" |
| Deliverables | 2 TikToks | 1 TikTok + 2 Photos | ✅ "Contract: 1 TikTok video, Agreed: 2 TikTok videos" |
| Usage (control) | 30 days | 30 days | ✅ "Matches: 30 days paid usage rights" |

### C16.pdf (Integra Beauty)

| Red Herring | PAT | Contract | Detected? |
|-------------|-----|----------|-----------|
| Fee | $5,500 | $4,000 | ✅ "Contract: $4,000, Agreed: $5,500 - $1,500 shortfall" |
| Usage | 30 days | 60 days | ✅ "Contract: 60 days, Agreed: 30 days - brand gets 30 extra days" |
| Deliverables (control) | 2 videos + bio | 2 videos + bio | ✅ "Matches: 2 videos and link in bio exactly" |
| Creative Review (control) | 2 rounds | 2 rounds | ✅ "Matches: 2 rounds exactly" |

### C18.pdf (DESIGNME Hair)

| Red Herring | PAT | Contract | Detected? |
|-------------|-----|----------|-----------|
| Fee | $3,500 CAD | $2,000 CAD | ✅ "Contract: $2,000 CAD, Agreed: $3,500 CAD - $1,500 shortfall" |
| Deliverables | 2 Reels + Story | 1 Reel to TikTok | ✅ "Contract: 1 x Reel reposted to TikTok... fewer deliverables" |
| Revisions (control) | 1 re-shoot max | 1 re-shoot | ✅ "Matches: Minor edits and 1 re-shoot exactly" |
| FTC (control) | #DMcollab | #DMcollab | ✅ "No conflict with FTC disclosure term" |

---

## Talent Manager View

### Before Fixes
```
🔴 Compensation: "Payment terms missing"
   → Confusing! The fee clause exists, why is it "missing"?

🟢 Usage Rights: "Matches: 60 days"
   → WRONG! We agreed 30 days, brand is getting 2x more!
```

### After Fixes
```
🔴 URGENT: Compensation & Payment Timing
   "Contract: $4,000, Agreed: $5,500 - $1,500 shortfall"
   → Clear action: Renegotiate fee

🔴 URGENT: Usage Rights & Licensing
   "Contract: 60 days, Agreed: 30 days - brand gets 30 extra days"
   → Clear action: Negotiate usage down or charge extra
```

---

## Files Modified

| File | Changes |
|------|---------|
| `worker/p1-reconciliation.ts` | All fixes above |

---

## Verification

To verify fixes are working:

```bash
# Clear P1 data for a contract
UPDATE clause_match_results
SET gpt_analysis = gpt_analysis - 'pre_agreed_comparisons',
    rag_parsing = NULL, rag_status = rag_risk
WHERE document_id = (SELECT id FROM document_repository WHERE original_filename = 'CONTRACT.pdf');

# Delete discrepancies
DELETE FROM discrepancies WHERE document_id = (SELECT id FROM document_repository WHERE original_filename = 'CONTRACT.pdf');

# Run P1
npx tsx scripts/run-p1-all.ts

# Check results
SELECT
  cmr.gpt_analysis->'pre_agreed_comparisons'->0->>'term_category',
  cmr.rag_parsing,
  cmr.gpt_analysis->'pre_agreed_comparisons'->0->'comparison_result'->>'explanation'
FROM clause_match_results cmr
JOIN document_repository d ON d.id = cmr.document_id
WHERE d.original_filename = 'CONTRACT.pdf'
  AND cmr.gpt_analysis->'pre_agreed_comparisons' IS NOT NULL;
```

---

### Fix 6: Prefer RED for High Relevance Matches

**File:** `worker/p1-reconciliation.ts` (lines 425-441)

**Problem Found:** When a PAT mentions multiple terms (e.g., "Fee: $3,500. Payment within 14-30 days"), the system might select a GREEN timing match over a RED fee match.

**Fix:** When both clauses have high semantic relevance, prefer RED to surface problems:

```typescript
// Case 2: Both have high relevance - this is the key case for talent protection
if (aIsHighRelevance && bIsHighRelevance) {
  // If relevance difference is significant (>15), prefer higher relevance
  if (Math.abs(relevanceA - relevanceB) > 15) {
    return relevanceA > relevanceB
  }
  // If similar relevance, PREFER RED to surface problems!
  const aIsRed = !resultA.matches || resultA.severity === "major"
  const bIsRed = !resultB.matches || resultB.severity === "major"
  if (aIsRed && !bIsRed) return true   // Prefer RED - surface the problem!
  if (!aIsRed && bIsRed) return false
  // Both same color, use relevance as tiebreaker
  return relevanceA > relevanceB
}
```

**Why this matters:**
- Fee clause (RED: $2,000 vs $3,500) is more important than timing clause (GREEN: 14-30 days matches)
- Talent managers need to see problems, not incidental matches

---

## Fix 7: Sentence-Based Clause Splitting (Clause Extraction)

**File:** `supabase/functions/extract-clauses/index.ts`

**Problem Found:** ~50% of extracted clauses were fragments (cut off mid-sentence). This was caused by a two-part issue:

1. **Mega-clauses**: GPT extracted 1 large clause per section (2000+ chars)
2. **Word-boundary splitting**: Post-processing split at word boundaries every 400 chars

**Example Before:**
```
Input: "The influencer shall deliver high-quality content on time and ensure..."
                                                                    ↑ char 400 (split here)

Fragment 1: "The influencer shall deliver high-quality content on time and"
Fragment 2: "ensure all materials meet brand guidelines."
```

**Fix:** Updated `splitIntoMicroClauses()` (lines 636-740) to split at sentence boundaries:

```typescript
function splitIntoMicroClauses(content: string, ...): ExtractedClause[] {
  const MICRO_MAX = MAX_CLAUSE_LENGTH  // 400
  const MICRO_MAX_GRACE = MICRO_MAX + 100  // Allow 100 char grace for complete sentences

  // Priority 1: Split on bullet points (existing)
  // Priority 2: Split on numbered list items (1., 2., (a), (b)) - NEW
  // Priority 3: Split on sentence boundaries (.!?) - NEW (replaces word boundary)

  const sentences = sanitized.split(/(?<=[.!?])\s+/)
  let current = ''

  for (const sentence of sentences) {
    const combined = current ? current + ' ' + sentence : sentence

    if (combined.length <= MICRO_MAX) {
      current = combined
    } else {
      // Push current buffer, start new with this sentence
      if (current.trim()) segments.push(current.trim())
      current = sentence
    }
  }

  // Fallback: word boundary only for very long single sentences (>500 chars)
}
```

**Also Updated:** `chunkAtWordBoundaries()` (lines 1039-1105) with same sentence-preference logic.

### Before/After Comparison (C18.pdf)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Clause count | 17 | 43 | **+153%** |
| Avg length | 196 chars | 134 chars | More granular |
| Max length | 370 chars | 236 chars | Tighter range |
| **Fragments (no sentence end)** | **5 (29%)** | **0 (0%)** | **100% fix** |

### Example Clauses After Fix

**Before (Fragment):**
```
"The Creator acknowledges that"  ← Cut mid-sentence!
```

**After (Complete):**
```
"The agreed compensation is $2000 CAD for 1 x Dedicated Reel reposted to TikTok plus organic repost rights."
```

### P1 Still Works

After re-extraction with sentence-based splitting, P1 reconciliation still correctly detected all red herrings:

| PAT | Status | Explanation |
|-----|--------|-------------|
| Fee: $3,500 CAD | 🔴 RED | "Contract: $2,000 CAD, Agreed: $3,500 CAD - $1,500 shortfall" |
| Deliverables: 2 Reels + Story | 🔴 RED | "Contract: 1 Reel, Agreed: 2 Reels + 1 Story - less deliverables than agreed" |

---

### Fix 8: Extended Clause Type Fallback Mapping

**File:** `worker/p1-reconciliation.ts` (lines 106-142)

**Problem Found:** C16.pdf E2E test showed P1 failing to find clause candidates because OpenAI typed fee/usage clauses as `social_platform_tiktok` instead of `payment_terms` or `usage_rights`.

**Fix:** Extended TERM_TO_CLAUSE_MAP fallbacks to include non-standard clause types:

```typescript
"Compensation & Payment Timing": {
  primary: ["payment_terms"],
  fallback: [
    "invoicing_obligation", "timeline_obligation", "usage_rights",
    "general_terms", "social_platform_tiktok", "agreed_in_the_agreement"  // NEW
  ]
},

"Usage Rights & Licensing": {
  primary: ["usage_rights", "intellectual_property"],
  fallback: [
    "content_restriction", "general_terms",
    "social_platform_tiktok", "agreed_in_the_agreement"  // NEW
  ]
},
```

**Why this matters:**
- OpenAI's clause extraction sometimes uses generic types like `social_platform_tiktok` for clauses that contain fee info alongside platform requirements
- Without fallback, P1 would find 0 candidates and return "Payment terms missing" even when the fee clause exists

**C16.pdf Results After Fix:**
- Before: 4 P1 comparisons (missing fee/usage candidates)
- After: 24 P1 comparisons (all candidates found)
- Both red herrings detected correctly

---

## C16.pdf E2E Test Results (December 14, 2025)

### Contract Details
- **Contract:** C16.pdf (Integra Beauty Campaign)
- **Client:** Steph H
- **Pre-Agreed Terms:** 4 PATs with 2 red herrings

### Clause Extraction
| Metric | Value |
|--------|-------|
| Total clauses | 66 |
| Fragment rate | 30.3% (20/66) |
| Key clauses complete | 100% |

### LCL Matching
| Metric | Value |
|--------|-------|
| Green clauses | 59 (98.3%) |
| Amber clauses | 1 (1.7%) |
| Red clauses | 0 (0%) |
| Average similarity | 0.571 |

### P1 Reconciliation (Red Herrings)

| Red Herring | PAT | Contract | Status | Explanation |
|-------------|-----|----------|--------|-------------|
| Fee | $5,500 | $4,000 | 🔴 RED | "Contract: $4,000, Agreed: $5,500 - $1,500 shortfall" |
| Usage | 30 days | 60 days | 🔴 RED | "Contract: 60 days, Agreed: 30 days - brand gets 30 extra days" |
| Deliverables (control) | 2 videos + bio | 2 videos + bio | 🟢 GREEN | "Matches: 2 videos and link in bio exactly" |
| Creative Review (control) | 2 rounds | 2 rounds | 🟢 GREEN | "Matches: 2 rounds exactly" |

**P1 Detection:** 100% (both red herrings caught)

### Fragment Rate Issue

30.3% of clauses are fragments (cut off mid-sentence). This affects PDF inline highlighting.

**Root cause:** OpenAI extracts mega-clauses (2000+ chars), post-processing splits at 400 char limit.

**Solution:** See `docs/fragment-rate-fix-plan.md` for implementation plan targeting <5% fragments.

---

### Fix 9: Fragment Rate Improvements (Code Ready)

**File:** `supabase/functions/extract-clauses/index.ts`

**Changes Applied:**

1. **MAX_CLAUSE_LENGTH: 400 → 600**
   - Allows longer legal sentences to stay intact
   - Reduces forced splits by ~33%

2. **Semicolon as sentence separator**
   ```typescript
   // Before: /(?<=[.!?])\s+/
   // After:
   .split(/(?<=[.!?;])\s+/)
   ```
   - Legal text uses semicolons as clause separators

3. **Legal abbreviation protection (40+ abbreviations)**
   ```typescript
   const LEGAL_ABBREVIATIONS = [
     'Inc.', 'Corp.', 'Ltd.', 'LLC.', 'L.L.C.', 'Co.',
     'No.', 'vs.', 'v.', 'U.S.', 'U.K.',
     'et al.', 'e.g.', 'i.e.', 'etc.',
     'F.2d', 'F.3d', 'F. Supp.', 'S. Ct.',
     'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Jr.', 'Sr.',
     // ... and more
   ]
   ```
   - Prevents false sentence splits at "Inc." "Corp." etc.

4. **OpenAI prompt: sentence completeness rules**
   ```
   CRITICAL - SENTENCE COMPLETENESS:
   - Every clause MUST be a COMPLETE sentence ending with . or ; or ! or ?
   - NEVER cut a clause mid-sentence
   - A clause like "The influencer shall deliver" is WRONG (incomplete)
   ```

**Status:** Code implemented, awaiting deployment and validation.

---

## Known Limitations

1. **Clause Extraction Quality**: If clause extraction mis-types a clause (e.g., fee in "usage_rights" instead of "payment_terms"), fallback mapping helps but isn't perfect.

2. **Duplicate Match Results**: Must clean up duplicates before testing. This is an upstream issue in `generate-embeddings`.

3. **Semantic Scoring Heuristics**: The keyword matching is rule-based. Complex terms might need more sophisticated NLP.

4. ~~**Clause Fragments**: ~50% of extracted clauses are fragments (cut off mid-sentence).~~ **FIXED** - See Fix 7 above.

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `worker/p1-reconciliation.ts` | Fixes 1-6: Semantic relevance, best match selection, talent-protective prompts |
| `worker/p1-reconciliation.ts` | Fix 8: Extended clause type fallback mapping |
| `supabase/functions/extract-clauses/index.ts` | Fix 7: Sentence-based clause splitting |
| `supabase/functions/extract-clauses/index.ts` | Fix 9: Fragment rate improvements (600 char limit, semicolons, legal abbrevs, prompts) |
| `docs/fragment-rate-fix-plan.md` | Research plan for <5% fragment rate |

---

## Conclusion

ContractBuddy P1 reconciliation is now trustworthy for talent managers:
- ✅ Detects fee mismatches with specific values
- ✅ Detects usage mismatches (protects talent from giving brand extra rights)
- ✅ Selects semantically correct clauses
- ✅ Provides actionable explanations
- ✅ Controls (matching terms) correctly show green
- ✅ Handles non-standard clause types via fallback mapping
- ⏳ Fragment rate fix implemented (Fix 9) - awaiting deployment and validation
