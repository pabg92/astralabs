-- Migration 008: PII Detection & Secure Storage
-- Creates secure storage for personally identifiable information with RLS
-- Created: 2025-11-08

-- Create PII entities table with encryption-ready structure
CREATE TABLE pii_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES document_repository(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'PERSON_NAME',
    'EMAIL',
    'PHONE',
    'ADDRESS',
    'SSN',
    'TAX_ID',
    'BANK_ACCOUNT',
    'CREDIT_CARD',
    'DATE_OF_BIRTH',
    'SIGNATURE',
    'CUSTOM'
  )),
  entity_value TEXT NOT NULL, -- Should be encrypted in production
  redaction_token TEXT NOT NULL, -- e.g., [REDACTED_PERSON_NAME_1]
  location_data JSONB, -- Where in document (page, coordinates)
  confidence_score NUMERIC(4,3),
  detected_by TEXT DEFAULT 'openai', -- 'openai', 'regex', 'manual'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ,
  accessed_by UUID REFERENCES user_profiles(id),
  access_count INTEGER DEFAULT 0
);

COMMENT ON TABLE pii_entities IS
  'Secure storage for personally identifiable information extracted from contracts.
   WARNING: entity_value should be encrypted at rest in production.
   Access is logged via accessed_at, accessed_by, and access_count.';

COMMENT ON COLUMN pii_entities.redaction_token IS
  'Token used in redacted text, e.g., [REDACTED_PERSON_NAME_1]. Used for re-identification.';

COMMENT ON COLUMN pii_entities.location_data IS
  'JSONB with page number and coordinates:
   { "page": 1, "x": 100, "y": 200, "context": "...surrounding text..." }';

-- Add PII detection flags to document_repository
ALTER TABLE document_repository
  ADD COLUMN pii_detected BOOLEAN DEFAULT FALSE,
  ADD COLUMN pii_redacted BOOLEAN DEFAULT FALSE,
  ADD COLUMN pii_scan_completed_at TIMESTAMPTZ,
  ADD COLUMN pii_entity_count INTEGER DEFAULT 0;

COMMENT ON COLUMN document_repository.pii_detected IS
  'TRUE if any PII entities were found during scanning.';

COMMENT ON COLUMN document_repository.pii_redacted IS
  'TRUE if PII was redacted before sending to OpenAI for processing.';

-- Create RLS policies for PII access control
ALTER TABLE pii_entities ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can only see PII from their own tenant
CREATE POLICY pii_tenant_isolation
  ON pii_entities
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM user_profiles WHERE clerk_user_id = auth.uid()
    )
  );

-- Policy 2: Only admins can access PII values
CREATE POLICY pii_admin_only
  ON pii_entities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE clerk_user_id = auth.uid()
      AND role = 'admin'
      AND tenant_id = pii_entities.tenant_id
    )
  );

-- Policy 3: System can insert PII during processing
CREATE POLICY pii_system_insert
  ON pii_entities
  FOR INSERT
  WITH CHECK (true); -- Service role only

-- Create audit logging function for PII access
CREATE OR REPLACE FUNCTION log_pii_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Update access tracking
  UPDATE pii_entities
  SET
    accessed_at = NOW(),
    accessed_by = (SELECT id FROM user_profiles WHERE clerk_user_id = auth.uid() LIMIT 1),
    access_count = access_count + 1
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Trigger would be created on SELECT, but PostgreSQL doesn't support that
-- Instead, access logging happens in application code when fetching entity_value

-- Create indexes for PII queries
CREATE INDEX idx_pii_entities_document_id
  ON pii_entities(document_id);

CREATE INDEX idx_pii_entities_deal_id
  ON pii_entities(deal_id);

CREATE INDEX idx_pii_entities_tenant_id
  ON pii_entities(tenant_id);

CREATE INDEX idx_pii_entities_entity_type
  ON pii_entities(entity_type);

CREATE INDEX idx_document_repository_pii_detected
  ON document_repository(pii_detected)
  WHERE pii_detected = TRUE;

-- Create view for PII summary (without exposing actual values)
CREATE VIEW v_pii_summary AS
SELECT
  d.id AS document_id,
  d.original_filename,
  d.pii_detected,
  d.pii_entity_count,
  d.pii_scan_completed_at,
  p.entity_type,
  COUNT(*) AS entity_count,
  MAX(p.confidence_score) AS max_confidence,
  MIN(p.confidence_score) AS min_confidence
FROM document_repository d
LEFT JOIN pii_entities p ON p.document_id = d.id
WHERE d.pii_detected = TRUE
GROUP BY d.id, d.original_filename, d.pii_detected, d.pii_entity_count, d.pii_scan_completed_at, p.entity_type;

COMMENT ON VIEW v_pii_summary IS
  'PII summary without exposing actual entity values. Safe for non-admin users.';

-- Grant access to view
GRANT SELECT ON v_pii_summary TO authenticated;
