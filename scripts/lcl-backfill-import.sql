-- LCL Backfill Import Script
-- Usage: Fill in lcl-backfill-template.csv, then run this script
-- Or paste INSERT statements below

-- Example INSERT format (copy/paste from CSV):
/*
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
  version,
  created_at
) VALUES
(
  'LC-001-a',
  'termination_for_convenience',
  'contract_lifecycle',
  'Either party may terminate this Agreement upon thirty (30) days prior written notice to the other party.',
  'medium',
  'Standard 30-day termination notice allowing either party to exit without cause',
  ARRAY['termination', 'notice', '30-day'],
  false,
  true,
  'a',
  1,
  NOW()
);
*/

-- ============================================================================
-- PASTE YOUR CLAUSES BELOW (or use the template CSV)
-- ============================================================================



-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Count total clauses
-- SELECT COUNT(*) as total_clauses FROM legal_clause_library;

-- Count by category
-- SELECT category, COUNT(*) FROM legal_clause_library GROUP BY category ORDER BY COUNT(*) DESC;

-- Count by risk level
-- SELECT risk_level, COUNT(*) FROM legal_clause_library GROUP BY risk_level;

-- Find clauses without plain_english_summary
-- SELECT clause_id, clause_type FROM legal_clause_library WHERE plain_english_summary IS NULL;
