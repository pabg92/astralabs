-- Add PAT normalization cache columns
-- Issue #13: Cache normalized PAT values to avoid redundant GPT calls

ALTER TABLE pre_agreed_terms
ADD COLUMN IF NOT EXISTS normalized_value text,
ADD COLUMN IF NOT EXISTS normalized_at timestamptz;

-- Add index for cache lookup
CREATE INDEX IF NOT EXISTS idx_pre_agreed_terms_normalized_at
ON pre_agreed_terms(normalized_at)
WHERE normalized_at IS NOT NULL;

COMMENT ON COLUMN pre_agreed_terms.normalized_value IS 'Cached normalized term value from GPT normalization';
COMMENT ON COLUMN pre_agreed_terms.normalized_at IS 'Timestamp when term was last normalized';
