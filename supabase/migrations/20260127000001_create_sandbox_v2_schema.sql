-- Migration: Create sandbox_v2 schema for three-tier clause architecture testing
-- This implements the PMS recommendations:
-- 1. Collapse LCSP into LCSTX (patterns as JSONB array)
-- 2. Two-table MVP schema (lcl + lcstx)
-- 3. "Highest risk wins" logic via RPC
-- 4. PAT override hierarchy support
-- 5. HITL queue before auto-discovery

-- Enable pgvector extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Create sandbox_v2 schema
CREATE SCHEMA IF NOT EXISTS sandbox_v2;

-- ============================================================================
-- TIER 1: LCL (Legal Clause Library - Concepts)
-- ============================================================================
CREATE TABLE sandbox_v2.lcl (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_code VARCHAR(20) UNIQUE NOT NULL,
    category TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for lcl
CREATE INDEX idx_lcl_concept_code ON sandbox_v2.lcl(concept_code);
CREATE INDEX idx_lcl_category ON sandbox_v2.lcl(category);
CREATE INDEX idx_lcl_is_active ON sandbox_v2.lcl(is_active);

COMMENT ON TABLE sandbox_v2.lcl IS 'Tier 1 - Legal Clause Library concepts (e.g., PAY, EXC, IP)';
COMMENT ON COLUMN sandbox_v2.lcl.concept_code IS 'Short code for the clause concept (e.g., PAY, EXC, IP, DEL, TRM)';
COMMENT ON COLUMN sandbox_v2.lcl.category IS 'Human-readable category (e.g., Payment, Exclusivity)';
COMMENT ON COLUMN sandbox_v2.lcl.display_name IS 'Full display name (e.g., Payment Terms)';

-- ============================================================================
-- TIER 2: LCSTX (Legal Clause Standardization - Meanings + Patterns)
-- ============================================================================
CREATE TABLE sandbox_v2.lcstx (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lcl_id UUID NOT NULL REFERENCES sandbox_v2.lcl(id) ON DELETE CASCADE,
    variant_code VARCHAR(30) UNIQUE NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    canonical_text TEXT NOT NULL,
    plain_english TEXT,
    suggested_rewrite TEXT,
    patterns JSONB DEFAULT '[]'::jsonb,
    embedding vector(1024),
    version INT DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for lcstx
CREATE INDEX idx_lcstx_lcl_id ON sandbox_v2.lcstx(lcl_id);
CREATE INDEX idx_lcstx_variant_code ON sandbox_v2.lcstx(variant_code);
CREATE INDEX idx_lcstx_risk_level ON sandbox_v2.lcstx(risk_level);
CREATE INDEX idx_lcstx_is_active ON sandbox_v2.lcstx(is_active);
CREATE INDEX idx_lcstx_embedding ON sandbox_v2.lcstx USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE sandbox_v2.lcstx IS 'Tier 2 - Standardized clause variants with risk levels and patterns';
COMMENT ON COLUMN sandbox_v2.lcstx.variant_code IS 'Unique variant identifier (e.g., PAY-001, PAY-002)';
COMMENT ON COLUMN sandbox_v2.lcstx.risk_level IS 'Risk classification: low, medium, or high';
COMMENT ON COLUMN sandbox_v2.lcstx.canonical_text IS 'Standard/canonical form of the clause';
COMMENT ON COLUMN sandbox_v2.lcstx.plain_english IS 'Plain English explanation of the clause';
COMMENT ON COLUMN sandbox_v2.lcstx.suggested_rewrite IS 'Suggested rewrite to reduce risk';
COMMENT ON COLUMN sandbox_v2.lcstx.patterns IS 'JSONB array of pattern objects: [{pattern: string, confidence: number}]';
COMMENT ON COLUMN sandbox_v2.lcstx.embedding IS '1024-dimensional vector embedding for similarity search';

-- ============================================================================
-- MATCH RESULTS (stores all matching results for analysis)
-- ============================================================================
CREATE TABLE sandbox_v2.match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    input_text TEXT NOT NULL,
    all_matches JSONB DEFAULT '[]'::jsonb,
    resolved_lcstx_id UUID REFERENCES sandbox_v2.lcstx(id) ON DELETE SET NULL,
    resolved_similarity FLOAT,
    resolved_risk_level TEXT,
    rag_library TEXT CHECK (rag_library IN ('GREEN', 'AMBER', 'RED')),
    rag_pat TEXT CHECK (rag_pat IN ('GREEN', 'AMBER', 'RED')),
    rag_final TEXT CHECK (rag_final IN ('GREEN', 'AMBER', 'RED')),
    pat_context JSONB,
    pat_override_applied BOOLEAN DEFAULT false,
    escalation_needed BOOLEAN DEFAULT false,
    escalation_type TEXT CHECK (escalation_type IN ('new_pattern', 'low_confidence', 'variant_candidate', 'pat_conflict')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for match_results
CREATE INDEX idx_match_results_resolved_lcstx_id ON sandbox_v2.match_results(resolved_lcstx_id);
CREATE INDEX idx_match_results_rag_final ON sandbox_v2.match_results(rag_final);
CREATE INDEX idx_match_results_escalation_needed ON sandbox_v2.match_results(escalation_needed);
CREATE INDEX idx_match_results_created_at ON sandbox_v2.match_results(created_at DESC);

COMMENT ON TABLE sandbox_v2.match_results IS 'Stores matching results for analysis and debugging';
COMMENT ON COLUMN sandbox_v2.match_results.all_matches IS 'All matches sorted by risk, then similarity';
COMMENT ON COLUMN sandbox_v2.match_results.resolved_lcstx_id IS 'Final resolved variant (highest risk wins)';
COMMENT ON COLUMN sandbox_v2.match_results.rag_library IS 'RAG status from library matching';
COMMENT ON COLUMN sandbox_v2.match_results.rag_pat IS 'RAG status from PAT comparison (null if no PAT context)';
COMMENT ON COLUMN sandbox_v2.match_results.rag_final IS 'Final combined RAG status';
COMMENT ON COLUMN sandbox_v2.match_results.escalation_type IS 'Type of escalation: new_pattern, low_confidence, variant_candidate, pat_conflict';

-- ============================================================================
-- PATTERN REVIEW QUEUE (HITL - Human In The Loop)
-- ============================================================================
CREATE TABLE sandbox_v2.pattern_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    input_text TEXT NOT NULL,
    proposed_lcstx_id UUID REFERENCES sandbox_v2.lcstx(id) ON DELETE SET NULL,
    similarity_score FLOAT,
    review_type TEXT NOT NULL CHECK (review_type IN ('new_pattern', 'variant_candidate', 'low_confidence', 'pat_conflict')),
    similar_patterns JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
    resolution_notes TEXT,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    match_result_id UUID REFERENCES sandbox_v2.match_results(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for pattern_review_queue
CREATE INDEX idx_pattern_review_status ON sandbox_v2.pattern_review_queue(status);
CREATE INDEX idx_pattern_review_type ON sandbox_v2.pattern_review_queue(review_type);
CREATE INDEX idx_pattern_review_proposed_lcstx ON sandbox_v2.pattern_review_queue(proposed_lcstx_id);
CREATE INDEX idx_pattern_review_created_at ON sandbox_v2.pattern_review_queue(created_at DESC);

COMMENT ON TABLE sandbox_v2.pattern_review_queue IS 'HITL queue for pattern review before auto-discovery';
COMMENT ON COLUMN sandbox_v2.pattern_review_queue.review_type IS 'Type: new_pattern, variant_candidate, low_confidence, pat_conflict';
COMMENT ON COLUMN sandbox_v2.pattern_review_queue.similar_patterns IS 'Nearby patterns for context during review';
COMMENT ON COLUMN sandbox_v2.pattern_review_queue.status IS 'Review status: pending, approved, rejected, merged';

-- ============================================================================
-- TEST CASES (for automated testing)
-- ============================================================================
CREATE TABLE sandbox_v2.test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id VARCHAR(50) UNIQUE NOT NULL,
    input_text TEXT NOT NULL,
    expected_lcstx_variant_code VARCHAR(30),
    expected_risk_level TEXT CHECK (expected_risk_level IN ('low', 'medium', 'high')),
    expected_rag_library TEXT CHECK (expected_rag_library IN ('GREEN', 'AMBER', 'RED')),
    pat_term_category TEXT,
    pat_expected_value TEXT,
    pat_is_mandatory BOOLEAN,
    expected_rag_final TEXT CHECK (expected_rag_final IN ('GREEN', 'AMBER', 'RED')),
    scenario TEXT NOT NULL CHECK (scenario IN ('exact_pattern', 'risk_resolution', 'pat_override', 'novel_escalation', 'multi_match')),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for test_cases
CREATE INDEX idx_test_cases_test_id ON sandbox_v2.test_cases(test_id);
CREATE INDEX idx_test_cases_scenario ON sandbox_v2.test_cases(scenario);
CREATE INDEX idx_test_cases_is_active ON sandbox_v2.test_cases(is_active);

COMMENT ON TABLE sandbox_v2.test_cases IS 'Test cases for automated sandbox testing';
COMMENT ON COLUMN sandbox_v2.test_cases.scenario IS 'Test scenario: exact_pattern, risk_resolution, pat_override, novel_escalation, multi_match';

-- ============================================================================
-- RPC FUNCTION: find_similar_with_risk_resolution
-- Implements "highest risk wins" logic
-- ============================================================================
CREATE OR REPLACE FUNCTION sandbox_v2.find_similar_with_risk_resolution(
    p_query_embedding vector(1024),
    p_similarity_threshold FLOAT DEFAULT 0.60,
    p_max_results INT DEFAULT 10
)
RETURNS TABLE (
    lcstx_id UUID,
    variant_code VARCHAR(30),
    risk_level TEXT,
    similarity FLOAT,
    match_rank INT,
    lcl_concept_code VARCHAR(20),
    lcl_category TEXT,
    canonical_text TEXT,
    plain_english TEXT,
    suggested_rewrite TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH similarity_matches AS (
        SELECT
            s.id AS lcstx_id,
            s.variant_code,
            s.risk_level,
            1 - (s.embedding <=> p_query_embedding) AS similarity,
            l.concept_code AS lcl_concept_code,
            l.category AS lcl_category,
            s.canonical_text,
            s.plain_english,
            s.suggested_rewrite
        FROM sandbox_v2.lcstx s
        JOIN sandbox_v2.lcl l ON s.lcl_id = l.id
        WHERE s.is_active = true
          AND l.is_active = true
          AND s.embedding IS NOT NULL
          AND 1 - (s.embedding <=> p_query_embedding) >= p_similarity_threshold
    ),
    ranked_matches AS (
        SELECT
            sm.*,
            ROW_NUMBER() OVER (
                ORDER BY
                    -- Priority 1: Risk level (high > medium > low)
                    CASE sm.risk_level
                        WHEN 'high' THEN 3
                        WHEN 'medium' THEN 2
                        WHEN 'low' THEN 1
                    END DESC,
                    -- Priority 2: Similarity score
                    sm.similarity DESC
            ) AS match_rank
        FROM similarity_matches sm
    )
    SELECT
        rm.lcstx_id,
        rm.variant_code,
        rm.risk_level,
        rm.similarity::FLOAT,
        rm.match_rank::INT,
        rm.lcl_concept_code,
        rm.lcl_category,
        rm.canonical_text,
        rm.plain_english,
        rm.suggested_rewrite
    FROM ranked_matches rm
    WHERE rm.match_rank <= p_max_results
    ORDER BY rm.match_rank;
END;
$$;

COMMENT ON FUNCTION sandbox_v2.find_similar_with_risk_resolution IS
'Finds similar clauses with "highest risk wins" resolution. Orders by risk_level DESC (high > medium > low), then similarity DESC.';

-- ============================================================================
-- RPC FUNCTION: get_sandbox_stats
-- Dashboard statistics
-- ============================================================================
CREATE OR REPLACE FUNCTION sandbox_v2.get_sandbox_stats()
RETURNS TABLE (
    total_concepts BIGINT,
    total_variants BIGINT,
    total_matches BIGINT,
    pending_reviews BIGINT,
    high_risk_variants BIGINT,
    medium_risk_variants BIGINT,
    low_risk_variants BIGINT,
    green_matches BIGINT,
    amber_matches BIGINT,
    red_matches BIGINT,
    escalation_rate FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_matches BIGINT;
    v_escalated_matches BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_total_matches FROM sandbox_v2.match_results;
    SELECT COUNT(*) INTO v_escalated_matches FROM sandbox_v2.match_results WHERE escalation_needed = true;

    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM sandbox_v2.lcl WHERE is_active = true) AS total_concepts,
        (SELECT COUNT(*) FROM sandbox_v2.lcstx WHERE is_active = true) AS total_variants,
        v_total_matches AS total_matches,
        (SELECT COUNT(*) FROM sandbox_v2.pattern_review_queue WHERE status = 'pending') AS pending_reviews,
        (SELECT COUNT(*) FROM sandbox_v2.lcstx WHERE risk_level = 'high' AND is_active = true) AS high_risk_variants,
        (SELECT COUNT(*) FROM sandbox_v2.lcstx WHERE risk_level = 'medium' AND is_active = true) AS medium_risk_variants,
        (SELECT COUNT(*) FROM sandbox_v2.lcstx WHERE risk_level = 'low' AND is_active = true) AS low_risk_variants,
        (SELECT COUNT(*) FROM sandbox_v2.match_results WHERE rag_final = 'GREEN') AS green_matches,
        (SELECT COUNT(*) FROM sandbox_v2.match_results WHERE rag_final = 'AMBER') AS amber_matches,
        (SELECT COUNT(*) FROM sandbox_v2.match_results WHERE rag_final = 'RED') AS red_matches,
        CASE WHEN v_total_matches > 0
            THEN (v_escalated_matches::FLOAT / v_total_matches::FLOAT)
            ELSE 0.0
        END AS escalation_rate;
END;
$$;

COMMENT ON FUNCTION sandbox_v2.get_sandbox_stats IS 'Returns dashboard statistics for the sandbox';

-- ============================================================================
-- TRIGGERS: Updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION sandbox_v2.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_lcl_updated_at
    BEFORE UPDATE ON sandbox_v2.lcl
    FOR EACH ROW
    EXECUTE FUNCTION sandbox_v2.update_updated_at_column();

CREATE TRIGGER update_lcstx_updated_at
    BEFORE UPDATE ON sandbox_v2.lcstx
    FOR EACH ROW
    EXECUTE FUNCTION sandbox_v2.update_updated_at_column();

CREATE TRIGGER update_pattern_review_queue_updated_at
    BEFORE UPDATE ON sandbox_v2.pattern_review_queue
    FOR EACH ROW
    EXECUTE FUNCTION sandbox_v2.update_updated_at_column();

CREATE TRIGGER update_test_cases_updated_at
    BEFORE UPDATE ON sandbox_v2.test_cases
    FOR EACH ROW
    EXECUTE FUNCTION sandbox_v2.update_updated_at_column();

-- ============================================================================
-- GRANTS (for service role access)
-- ============================================================================
GRANT USAGE ON SCHEMA sandbox_v2 TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA sandbox_v2 TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA sandbox_v2 TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sandbox_v2 TO service_role;

-- Grant to authenticated users (for UI access)
GRANT USAGE ON SCHEMA sandbox_v2 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sandbox_v2 TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sandbox_v2 TO authenticated;
