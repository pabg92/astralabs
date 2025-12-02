# LCL Clause ID Schema & Extraction Standards
**Version:** 1.0
**Last Updated:** November 26, 2025
**Status:** Canonical Standard for CBA

---

## Executive Summary

This document defines the **Legal Clause Library (LCL) Clause ID Schema** - the canonical naming and organization standard for all clause extraction in ContractBuddy.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **ID Format** | `LC-XXX-y` | Matches Migration 100 regex validation |
| **Block Allocation** | 100-block per brand | Zero collision, easy audit trail |
| **Topic Grouping** | X00-X09 = IP, X10-X19 = Services, etc. | ML clustering, cross-contract comparison |
| **Variant System** | Parent-child with variation letters | CBA deduplication architecture |

### Quick Reference

```
LC-001-a  →  Base clause (first in Contract #1)
LC-001-b  →  Variant of LC-001-a
LC-100-a  →  First IP clause in Dior block
LC-150-a  →  First warranty clause in Dior block
```

---

## 1. Clause ID Format Specification

### 1.1 Base Format

```
LC-XXX-y

Components:
├── LC     = Legal Clause prefix (fixed, required)
├── XXX    = Numeric identifier (001-999)
└── y      = Variation letter (a-z)
```

### 1.2 Format Rules

| Component | Format | Valid Examples | Invalid Examples |
|-----------|--------|----------------|------------------|
| Prefix | `LC-` | `LC-` | `LCL-`, `CL-`, `L-` |
| Number | 3 digits, zero-padded | `001`, `042`, `199` | `1`, `42`, `1000` |
| Separator | `-` | `-` | `_`, `.`, none |
| Variation | Single lowercase letter | `a`, `b`, `z` | `A`, `1`, `aa` |

### 1.3 Regex Validation (Migration 100)

The database enforces these patterns via PL/pgSQL:

```sql
-- Detect if clause is a variant (not base)
p_clause_id ~ '-[b-z]$'

-- Extract parent clause ID from variant
SUBSTRING(p_clause_id FROM '^(LC-[0-9]+-)[b-z]$') || 'a'
-- Example: 'LC-001-b' → 'LC-001-a'
```

### 1.4 Examples

| Clause ID | Type | Parent | Description |
|-----------|------|--------|-------------|
| `LC-001-a` | Base | NULL | First clause, base version |
| `LC-001-b` | Variant | `LC-001-a` | First variant of LC-001 |
| `LC-001-c` | Variant | `LC-001-a` | Second variant of LC-001 |
| `LC-042-a` | Base | NULL | 42nd clause type, base version |
| `LC-100-a` | Base | NULL | First clause in 100-series block |

---

## 2. Block Allocation by Contract/Brand

### 2.1 Reserved Blocks

| Block Range | Contract/Brand | Status | Notes |
|-------------|---------------|--------|-------|
| `LC-001` → `LC-099` | Contract #1 (Generic Influencer Agreement) | ✅ Allocated | 38 clauses, 21 base types |
| `LC-100` → `LC-199` | Dior | Reserved | Pending extraction |
| `LC-200` → `LC-299` | Available | - | Next brand |
| `LC-300` → `LC-399` | Available | - | Next brand |
| `LC-400` → `LC-499` | Available | - | Next brand |
| ... | ... | - | Expand as needed |

### 2.2 Block Allocation Rules

1. **New contract = new 100-block**
   - First brand gets 001-099
   - Second brand gets 100-199
   - Pattern: `(N × 100)` to `(N × 100) + 99`

2. **Block size: 100 IDs per brand**
   - 10 topic groups × ~10 clauses each
   - Sufficient for complex contracts

3. **Never reuse blocks**
   - Even if a brand is removed, keep block reserved
   - Maintains audit trail integrity

### 2.3 Why Block Allocation?

| Benefit | Explanation |
|---------|-------------|
| **Zero collision risk** | Each brand isolated in its own namespace |
| **Easy audit trail** | `LC-1XX` = Dior, `LC-2XX` = Next brand |
| **CBScale v2.0 ready** | Multi-tenant architecture supported |
| **Cross-contract comparison** | Compare `LC-001-a` (generic) vs `LC-100-a` (Dior) for same topic |

---

## 3. Topic Block Grouping

### 3.1 Standard Topic Ranges

Within each 100-block, clauses are organized by topic:

| Relative Range | Topic Category | Example (Dior) |
|----------------|----------------|----------------|
| `X00–X09` | IP & Content Rights | `LC-100` to `LC-109` |
| `X10–X19` | Services / Deliverables / Social Media | `LC-110` to `LC-119` |
| `X20–X29` | Fees / Payments / Reimbursements | `LC-120` to `LC-129` |
| `X30–X39` | Exclusivity / Non-Disparagement / Conduct | `LC-130` to `LC-139` |
| `X40–X49` | Termination & Survival | `LC-140` to `LC-149` |
| `X50–X59` | Representations & Warranties | `LC-150` to `LC-159` |
| `X60–X69` | Confidentiality | `LC-160` to `LC-169` |
| `X70–X79` | Indemnity | `LC-170` to `LC-179` |
| `X80–X89` | Arbitration / Governing Law / Dispute Resolution | `LC-180` to `LC-189` |
| `X90–X99` | Miscellaneous (Severability, Assignment, Notices, etc.) | `LC-190` to `LC-199` |

### 3.2 Topic Grouping Benefits

| Benefit | How It Helps |
|---------|--------------|
| **ML Clustering** | Similar topics land in nearby vector space |
| **Admin UI** | Predictable grouping in review queue |
| **Cross-Contract Analysis** | Compare `LC-X00` (IP) across all brands |
| **CBScale Ontology** | Aligns with planned clause taxonomy grid |

### 3.3 Contract #1 Topic Mapping (LC-001 to LC-021)

| ID Range | Topic | Clauses |
|----------|-------|---------|
| LC-001 | IP / Work Product | LC-001-a/b/c (3 variants) |
| LC-002 | Indemnification | LC-002-a/b (2 variants) |
| LC-003 | Confidentiality | LC-003-a |
| LC-004 | Termination | LC-004-a/b |
| LC-005 | Payment Terms | LC-005-a |
| LC-006 | Limitation of Liability | LC-006-a |
| LC-007 | Warranties | LC-007-a/b/c/d (4 variants) |
| LC-008 | Independent Contractor | LC-008-a |
| LC-009 | Governing Law | LC-009-a |
| LC-010 | Dispute Resolution | LC-010-a/b |
| LC-011 | Assignment | LC-011-a |
| LC-012 | Entire Agreement | LC-012-a |
| LC-013 | Amendment | LC-013-a |
| LC-014 | Notice | LC-014-a |
| LC-015 | Severability | LC-015-a |
| LC-016 | Waiver | LC-016-a |
| LC-017 | Counterparts | LC-017-a |
| LC-018 | Interpretation | LC-018-a |
| LC-019 | Deliverables | LC-019-a/b/c |
| LC-020 | Usage Rights | LC-020-a/b/c |
| LC-021 | Paid Media | LC-021-a/b |

---

## 4. Variant System (Parent-Child Relationships)

### 4.1 Database Schema

```sql
-- From Migration 100: CBA Clause Architecture
ALTER TABLE legal_clause_library
  ADD COLUMN parent_clause_id VARCHAR(50),    -- Links variations: LC-001-b → LC-001-a
  ADD COLUMN variation_letter CHAR(1);        -- 'a', 'b', 'c' for variations

COMMENT ON COLUMN legal_clause_library.parent_clause_id IS
  'For variations: LC-001-b parent is LC-001-a. NULL for base clauses.';

COMMENT ON COLUMN legal_clause_library.variation_letter IS
  'Letter suffix for variations: a=base, b/c/d=variants';
```

### 4.2 Variant Rules

| Rule | Base Clause | Variant Clause |
|------|-------------|----------------|
| `variation_letter` | `'a'` | `'b'`, `'c'`, `'d'`, ... |
| `parent_clause_id` | `NULL` | Points to base (e.g., `'LC-001-a'`) |
| Maximum variants | - | 25 per base (b-z) |

### 4.3 When to Create Variants vs New Base

| Scenario | Action | Example |
|----------|--------|---------|
| Same topic, different wording | Create variant | IP clause with different assignment language |
| Same topic, different scope | Create variant | Indemnity with/without cap |
| Same topic, different terms | Create variant | 30-day vs 60-day termination notice |
| Different topic entirely | Create new base | Termination vs Payment |
| Cosine similarity ≥ 0.85 | Likely variant | AI-suggested grouping |
| Cosine similarity < 0.85 | Likely new base | Semantically distinct |

### 4.4 Variant Naming Convention

```
Base:     LC-001-a  (Work-for-hire IP assignment)
Variant:  LC-001-b  (Brand ownership with cooperation clause)
Variant:  LC-001-c  (License grant for name/likeness)
```

---

## 5. Clause Type Taxonomy

### 5.1 Approved clause_type Values

These are the valid values for the `clause_type` field:

#### Contract Lifecycle
- `termination_for_convenience` - Either party can exit with notice
- `termination_for_cause` - Exit due to breach
- `term_duration` - How long contract lasts
- `renewal` - Auto-renewal terms
- `survival` - What survives after termination

#### Financial
- `payment_terms` - When/how payment is due
- `late_payment` - Penalties for late payment

#### Liability
- `indemnification` - Protection from third-party claims
- `limitation_of_liability` - Caps on damages
- `warranty` - Guarantees about work/product
- `disclaimer` - What's NOT guaranteed
- `representations` - Statements of fact/promises

#### Information Protection
- `confidentiality` - NDA/secrecy obligations
- `intellectual_property` - IP ownership/licensing
- `work_for_hire` - IP created belongs to client
- `data_protection` - GDPR/privacy compliance

#### Dispute Resolution
- `governing_law` - Which jurisdiction's laws apply
- `dispute_resolution` - How disputes are handled
- `arbitration` - Binding arbitration clause

#### Operational
- `deliverables` - What must be delivered
- `acceptance` - How deliverables are approved
- `scope_of_work` - What work is included

#### Relationship
- `assignment` - Can contract be transferred
- `subcontracting` - Can work be subcontracted
- `exclusivity` - Exclusive relationship terms
- `non_compete` - Restrictions on competing
- `non_solicitation` - Can't poach employees/clients
- `non_disparagement` - Can't speak negatively about other party
- `independent_contractor` - Not an employee relationship

#### General/Boilerplate
- `entire_agreement` - This contract is the complete deal
- `amendment` - How contract can be changed
- `waiver` - Not enforcing once doesn't waive rights
- `severability` - Invalid parts don't void whole contract
- `notice` - How formal notices must be sent
- `force_majeure` - Excuses for uncontrollable events

#### Compliance
- `compliance` - Legal/regulatory compliance
- `insurance` - Required insurance coverage
- `audit_rights` - Right to inspect records

#### Catch-all
- `other` - If none of the above fit (use sparingly)

### 5.2 Category Mappings

| Category | Clause Types |
|----------|-------------|
| `contract_lifecycle` | termination_for_convenience, termination_for_cause, term_duration, renewal, survival |
| `financial` | payment_terms, late_payment |
| `liability` | indemnification, limitation_of_liability, warranty, disclaimer, representations |
| `information_protection` | confidentiality, intellectual_property, work_for_hire, data_protection |
| `dispute_resolution` | governing_law, dispute_resolution, arbitration |
| `operational` | deliverables, acceptance, scope_of_work |
| `relationship` | assignment, subcontracting, exclusivity, non_compete, non_solicitation, non_disparagement, independent_contractor |
| `general` | entire_agreement, amendment, waiver, severability, notice, force_majeure |
| `compliance` | compliance, insurance, audit_rights |

### 5.3 Risk Level Guidelines

| Risk Level | When to Use | Examples |
|------------|-------------|----------|
| `low` | Standard boilerplate, minimal risk | Severability, Notices, Counterparts |
| `medium` | Common clause, some negotiation typical | Payment terms, Termination for convenience |
| `high` | Significant obligations or restrictions | Confidentiality, Indemnification, IP assignment |
| `critical` | Major liability, IP transfer, unusual terms | Unlimited indemnity, Full IP assignment, Non-compete |

---

## 6. Extraction Workflow Standards

### 6.1 ChatGPT Prompt Template

The canonical extraction prompt is located at:
```
scripts/clause-extraction-prompt.md
```

Key prompt instructions:
1. Output SQL INSERT statements directly (no CSV, no markdown)
2. One INSERT per atomic legal obligation
3. Use standardized clause_type values from taxonomy
4. Escape single quotes as `''`
5. Replace specific details with placeholders

### 6.2 SQL Output Format

```sql
INSERT INTO legal_clause_library (
  clause_id,
  clause_type,
  category,
  standard_text,
  risk_level,
  plain_english_summary,
  tags,
  is_required,
  is_approved,
  variation_letter,
  parent_clause_id,
  version,
  created_at
) VALUES (
  'LC-100-a',
  'intellectual_property',
  'information_protection',
  'Brand will own all right, title, and interest in and to the Content...',
  'critical',
  'Brand owns all content and IP created during engagement',
  ARRAY['ip', 'ownership', 'content', 'assignment'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);
```

### 6.3 Extraction Rules

| Rule | Description |
|------|-------------|
| **Atomic clauses** | One INSERT per distinct legal obligation |
| **Escape quotes** | Single quotes become `''` (two single quotes) |
| **ARRAY syntax** | Tags use `ARRAY['tag1', 'tag2']` format |
| **Placeholders** | Replace names with `[PARTY A]`, amounts with `[AMOUNT]`, etc. |
| **Split compound** | Multi-part clauses become multiple INSERTs |
| **No mega-clauses** | If clause > 2000 chars, likely needs splitting |

### 6.4 Placeholder Tokens

| Placeholder | Use For |
|-------------|---------|
| `[PARTY A]` | First named party (usually Brand) |
| `[PARTY B]` | Second named party (usually Influencer) |
| `[BRAND]` | Brand name specifically |
| `[INFLUENCER]` | Influencer name specifically |
| `[AMOUNT]` | Dollar amounts |
| `[DATE]` | Specific dates |
| `[DURATION]` | Time periods (e.g., "3 years") |
| `[NOTICE_PERIOD]` | Notice period days |
| `[STATE]` | Jurisdiction state |

---

## 7. Deduplication & HITL Integration

### 7.1 Similarity Thresholds

The `check_clause_duplicates` function uses these thresholds:

| Cosine Similarity | Classification | Action |
|-------------------|----------------|--------|
| ≥ 0.92 | **Exact duplicate** | Auto-merge to existing LCL entry |
| 0.85 – 0.92 | **Variant cluster** | Queue for HITL review |
| < 0.85 | **Unique** | Create new clause candidate |

### 7.2 Admin Review Queue Integration

When a new clause is flagged for review, these fields are populated:

```sql
-- From admin_review_queue table
suggested_parent_clause_id  -- AI suggestion: "LC-001-a"
suggested_variation_letter  -- AI suggestion: "d" (next available)
cluster_id                  -- Groups similar submissions
resolution_action           -- Admin choice: add_new, add_variant, merge_existing, reject
resulting_clause_id         -- Final clause ID after resolution
```

### 7.3 Resolution Actions

| Action | When to Use | Result |
|--------|-------------|--------|
| `add_new` | Truly novel clause type | New base clause (LC-XXX-a) |
| `add_variant` | Similar to existing base | New variant (LC-XXX-b/c/d) |
| `merge_existing` | Exact match found | No new entry, link to existing |
| `reject` | Invalid/duplicate submission | Discard, no LCL entry |

---

## 8. Quick Reference Cards

### 8.1 For GPT Extraction

```
CLAUSE ID SCHEMA - QUICK REFERENCE

Format:  LC-XXX-y
         LC = prefix (fixed)
         XXX = 3-digit number (001-999)
         y = variation letter (a-z)

Block Assignment:
  001-099 = Contract #1 (Generic)
  100-199 = Dior
  200-299 = Next brand

Topic Ranges (within block):
  X00-X09 = IP & Content
  X10-X19 = Services/Deliverables
  X20-X29 = Payments
  X30-X39 = Exclusivity/Conduct
  X40-X49 = Termination
  X50-X59 = Warranties
  X60-X69 = Confidentiality
  X70-X79 = Indemnity
  X80-X89 = Disputes
  X90-X99 = Miscellaneous

Variants:
  -a = base clause
  -b, -c, -d = variants (same topic, different wording)
  parent_clause_id = NULL for base, 'LC-XXX-a' for variants
```

### 8.2 For Admin Review

```
ADMIN REVIEW DECISION TREE

1. Is this clause already in LCL?
   ├─ Yes, exact match (≥0.92) → MERGE_EXISTING
   └─ No → Continue

2. Is this similar to existing clause (0.85-0.92)?
   ├─ Yes → ADD_VARIANT to suggested parent
   └─ No → Continue

3. Is this a valid legal clause?
   ├─ Yes → ADD_NEW with appropriate ID
   └─ No → REJECT

When adding new:
- Use next available ID in appropriate topic range
- Base clauses get -a suffix
- Variants get -b, -c, etc.
- Set parent_clause_id for variants
```

### 8.3 For Developers

```sql
-- Check if clause ID is a variant
SELECT clause_id,
       clause_id ~ '-[b-z]$' AS is_variant,
       CASE WHEN clause_id ~ '-[b-z]$'
            THEN SUBSTRING(clause_id FROM '^(LC-[0-9]+-)[b-z]$') || 'a'
            ELSE NULL
       END AS parent_id
FROM legal_clause_library;

-- Find all variants of a base clause
SELECT * FROM legal_clause_library
WHERE parent_clause_id = 'LC-001-a';

-- Count clauses by topic block (first digit after LC-)
SELECT
  SUBSTRING(clause_id FROM 4 FOR 1) || '00-' ||
  SUBSTRING(clause_id FROM 4 FOR 1) || '09' AS topic_range,
  COUNT(*) as clause_count
FROM legal_clause_library
GROUP BY SUBSTRING(clause_id FROM 4 FOR 1);
```

---

## 9. Migration & Compatibility

### 9.1 Migration 100 Compatibility

This schema is fully compatible with Migration 100 (`100_add_cba_clause_architecture.sql`):

| Field | Migration 100 Spec | Schema Compliance |
|-------|-------------------|-------------------|
| `clause_id` | VARCHAR(50) | ✅ `LC-XXX-y` fits |
| `parent_clause_id` | VARCHAR(50), FK to clause_id | ✅ Points to `-a` base |
| `variation_letter` | CHAR(1), CHECK a-z | ✅ Single lowercase letter |

### 9.2 Regex Validation

```sql
-- Migration 100 regex patterns
-- Variant detection
IF p_clause_id ~ '-[b-z]$' THEN
  -- It's a variant, derive parent
  v_parent_id := SUBSTRING(p_clause_id FROM '^(LC-[0-9]+-)[b-z]$') || 'a';
ELSE
  -- It's a base clause
  v_parent_id := NULL;
END IF;
```

### 9.3 Breaking Changes

**None** - This schema is designed to be forward-compatible with:
- CBScale v2.0 (multi-tenant)
- CBEdge v3.0 (HITL overrides)
- Future clause ontology expansions

---

## 10. Appendix

### A. Full clause_type List

```
amendment
arbitration
assignment
audit_rights
compliance
confidentiality
data_protection
deliverables
disclaimer
dispute_resolution
entire_agreement
exclusivity
force_majeure
governing_law
indemnification
independent_contractor
insurance
intellectual_property
late_payment
limitation_of_liability
non_compete
non_disparagement
non_solicitation
notice
other
payment_terms
renewal
representations
scope_of_work
severability
subcontracting
survival
term_duration
termination_for_cause
termination_for_convenience
waiver
warranty
work_for_hire
```

### B. Sample SQL for New Brand Block

```sql
-- Template for new brand (e.g., Milk = LC-200 series)
-- Follows Topic Block Grouping standard

-- IP & Content (200-209)
INSERT INTO legal_clause_library (clause_id, clause_type, category, ...)
VALUES ('LC-200-a', 'work_for_hire', 'information_protection', ...);

-- Services (210-219)
INSERT INTO legal_clause_library (clause_id, clause_type, category, ...)
VALUES ('LC-210-a', 'deliverables', 'operational', ...);

-- Payments (220-229)
INSERT INTO legal_clause_library (clause_id, clause_type, category, ...)
VALUES ('LC-220-a', 'payment_terms', 'financial', ...);

-- ... continue for all topic blocks
```

### C. Related Documentation

- [1-ARCHITECTURE.md](./1-ARCHITECTURE.md) - System design overview
- [2-DATABASE-SCHEMA.md](./2-DATABASE-SCHEMA.md) - Full database schema
- [3-IMPLEMENTATION-GUIDE.md](./3-IMPLEMENTATION-GUIDE.md) - Development guide
- [scripts/clause-extraction-prompt.md](../scripts/clause-extraction-prompt.md) - ChatGPT extraction prompt
- [scripts/lcl-influencer-agreement-backfill.sql](../scripts/lcl-influencer-agreement-backfill.sql) - Contract #1 SQL

---

**Maintained by:** Development Team
**Last Review:** November 26, 2025
