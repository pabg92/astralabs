# Clause Extraction Prompt for ChatGPT

Copy and paste this prompt into ChatGPT, then paste your contract text after it.

---

## PROMPT

You are a legal clause extraction assistant. I will paste contract text and you will extract each distinct clause into SQL INSERT statements for import into a Legal Clause Library (LCL).

### OUTPUT FORMAT
Return ONLY SQL INSERT statements that I can copy/paste directly. Use this exact format:

```sql
INSERT INTO legal_clause_library (clause_id, clause_type, category, standard_text, risk_level, plain_english_summary, tags, is_required, is_approved, variation_letter)
VALUES ('LC-001-a', 'termination_for_convenience', 'contract_lifecycle', 'The clause text here...', 'medium', 'Plain English summary here', ARRAY['tag1', 'tag2'], false, true, 'a');
```

### FIELD SPECIFICATIONS

**clause_id**: Generate sequential IDs in format `LC-XXX-a` (e.g., LC-001-a, LC-002-a)

**clause_type**: Use one of these standardized types:
- `termination_for_convenience` - Either party can exit with notice
- `termination_for_cause` - Exit due to breach
- `payment_terms` - When/how payment is due
- `late_payment` - Penalties for late payment
- `confidentiality` - NDA/secrecy obligations
- `intellectual_property` - IP ownership/licensing
- `work_for_hire` - IP created belongs to client
- `indemnification` - Protection from third-party claims
- `limitation_of_liability` - Caps on damages
- `warranty` - Guarantees about work/product
- `disclaimer` - What's NOT guaranteed
- `force_majeure` - Excuses for uncontrollable events
- `governing_law` - Which jurisdiction's laws apply
- `dispute_resolution` - How disputes are handled
- `arbitration` - Binding arbitration clause
- `non_compete` - Restrictions on competing
- `non_solicitation` - Can't poach employees/clients
- `assignment` - Can contract be transferred
- `notice` - How formal notices must be sent
- `severability` - Invalid parts don't void whole contract
- `entire_agreement` - This contract is the complete deal
- `amendment` - How contract can be changed
- `waiver` - Not enforcing once doesn't waive rights
- `survival` - What survives after termination
- `insurance` - Required insurance coverage
- `audit_rights` - Right to inspect records
- `data_protection` - GDPR/privacy compliance
- `deliverables` - What must be delivered
- `acceptance` - How deliverables are approved
- `scope_of_work` - What work is included
- `exclusivity` - Exclusive relationship terms
- `term_duration` - How long contract lasts
- `renewal` - Auto-renewal terms
- `representations` - Statements of fact/promises
- `compliance` - Legal/regulatory compliance
- `subcontracting` - Can work be subcontracted
- `independent_contractor` - Not an employee relationship
- `other` - If none of the above fit

**category**: Group into one of:
- `contract_lifecycle` - Term, termination, renewal
- `financial` - Payment, fees, expenses
- `liability` - Indemnification, limitations, warranties
- `information_protection` - Confidentiality, data, IP
- `dispute_resolution` - Governing law, arbitration, disputes
- `operational` - Deliverables, scope, acceptance
- `relationship` - Assignment, subcontracting, exclusivity
- `general` - Boilerplate (entire agreement, severability, etc.)
- `compliance` - Regulatory, insurance, audit

**standard_text**: The full clause text, cleaned up:
- Remove specific names, dates, dollar amounts (replace with [PARTY A], [PARTY B], [DATE], [AMOUNT])
- Keep the legal substance intact
- Preserve numbering if part of the clause

**risk_level**: Assess the risk:
- `low` - Standard boilerplate, minimal risk
- `medium` - Common clause, some negotiation typical
- `high` - Significant obligations or restrictions
- `critical` - Major liability, IP transfer, or unusual terms

**plain_english_summary**: 10-20 word explanation a non-lawyer would understand

**tags**: Pipe-separated keywords for search (e.g., `termination|notice|30-day|written`)

**is_required**: Is this typically a mandatory clause?
- `true` - Usually required in contracts of this type
- `false` - Optional or situational

### RULES
1. Extract EVERY distinct clause (even short ones)
2. Split combined clauses into separate INSERT statements
3. Generalize specific details (names → [PARTY A], amounts → [AMOUNT])
4. If a clause doesn't fit a type, use `other` and describe in tags
5. Escape single quotes in text by doubling them (e.g., `don''t`)
6. Use ARRAY['tag1', 'tag2'] format for tags
7. One INSERT statement per clause
8. Output ONLY the SQL - no explanations or markdown

### EXAMPLE OUTPUT

```sql
-- Extracted clauses from contract

INSERT INTO legal_clause_library (clause_id, clause_type, category, standard_text, risk_level, plain_english_summary, tags, is_required, is_approved, variation_letter)
VALUES ('LC-001-a', 'termination_for_convenience', 'contract_lifecycle', 'Either party may terminate this Agreement upon thirty (30) days prior written notice to the other party.', 'medium', 'Either side can end the contract with 30 days notice', ARRAY['termination', 'notice', '30-day', 'written'], false, true, 'a');

INSERT INTO legal_clause_library (clause_id, clause_type, category, standard_text, risk_level, plain_english_summary, tags, is_required, is_approved, variation_letter)
VALUES ('LC-002-a', 'payment_terms', 'financial', '[PARTY B] shall pay [PARTY A] the fees set forth in Exhibit A within thirty (30) days of invoice date.', 'medium', 'Payment due within 30 days of receiving invoice', ARRAY['payment', 'net-30', 'invoice'], true, true, 'a');

INSERT INTO legal_clause_library (clause_id, clause_type, category, standard_text, risk_level, plain_english_summary, tags, is_required, is_approved, variation_letter)
VALUES ('LC-003-a', 'confidentiality', 'information_protection', 'Each party agrees to maintain in strict confidence all Confidential Information and shall not disclose such information to any third party without prior written consent.', 'high', 'Keep all confidential info secret and don''t share without permission', ARRAY['confidentiality', 'nda', 'mutual', 'disclosure'], true, true, 'a');
```

---

## NOW PASTE YOUR CONTRACT TEXT BELOW:

[Paste contract here - I will extract all clauses into SQL INSERT statements you can copy/paste directly into Supabase SQL Editor]
