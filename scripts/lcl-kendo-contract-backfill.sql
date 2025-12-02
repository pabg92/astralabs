-- =============================================================================
-- LCL Backfill: Kendo Contract (Fenty Beauty)
-- Block: LC-300 → LC-399
-- Total: 34 clauses (26 base, 8 variants)
-- Generated: 2025-11-26
-- =============================================================================
-- Topic Blocks:
--   300-309: Deliverables
--   310-319: Scope of Work
--   320-329: Payment Terms
--   330-339: Exclusivity
--   340-349: Termination
--   350-359: Warranties
--   360-369: Confidentiality
--   370-379: Indemnification / Liability
--   380-389: Compliance (incl. DEI, Anti-corruption)
--   390-399: General / Boilerplate
-- =============================================================================

INSERT INTO legal_clause_library (
  clause_id, parent_clause_id, clause_type, category, standard_text,
  risk_level, plain_english_summary, tags, is_required, is_approved,
  variation_letter, version, created_at
) VALUES

-- =============================================================================
-- DELIVERABLES (300-309)
-- =============================================================================
('LC-300-a', NULL, 'deliverables', 'operational',
 'Influencer shall create four TikTok videos syndicated to Reels during the Term, subject to Company approval, and reshoot up to two times at no extra fee if the brief is not followed.',
 'medium',
 'Influencer must create four approved TikTok/Reels posts and reshoot if needed.',
 ARRAY['deliverables','content'], true, true, 'a', 1, NOW()),

('LC-301-a', NULL, 'deliverables', 'operational',
 'Influencer shall disclose affiliation with Company in all Influencer Content in a clear and conspicuous manner in accordance with the FTC Endorsement Guides.',
 'medium',
 'Influencer must include clear FTC disclosures on all posts.',
 ARRAY['ftc','disclosure','compliance'], true, true, 'a', 1, NOW()),

('LC-302-a', NULL, 'deliverables', 'operational',
 'Influencer shall include official links, tags, and required hashtags including #FentyBeautyPartner and tag @fentybeauty in each Influencer Content execution.',
 'low',
 'Influencer must include required tags and hashtags.',
 ARRAY['tags','hashtags'], true, true, 'a', 1, NOW()),

('LC-303-a', NULL, 'deliverables', 'operational',
 'Influencer shall submit analytics upon Company request in accordance with Company''s schedule and guidelines.',
 'medium',
 'Influencer must send analytics when requested.',
 ARRAY['analytics','reporting'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- SCOPE OF WORK (310-319)
-- =============================================================================
('LC-310-a', NULL, 'scope_of_work', 'operational',
 'Influencer shall perform services using reasonable efforts, act in good faith, remain on approved key messages, and remove content upon Company request.',
 'medium',
 'Influencer must follow messaging rules and remove content if asked.',
 ARRAY['performance','messaging'], true, true, 'a', 1, NOW()),

('LC-310-b', 'LC-310-a', 'scope_of_work', 'operational',
 'Influencer shall comply with all applicable laws and the FTC Endorsement Guides in connection with this Agreement.',
 'medium',
 'Influencer must comply with FTC and legal requirements.',
 ARRAY['ftc','legal'], true, true, 'b', 1, NOW()),

-- =============================================================================
-- PAYMENT TERMS (320-329)
-- =============================================================================
('LC-320-a', NULL, 'payment_terms', 'financial',
 'Company shall pay Influencer a Fee of [AMOUNT], with 50% payable upon publication of the first two pieces of Influencer Content and 50% upon completion of all deliverables, Net 60.',
 'medium',
 'Payment split into two installments, Net 60.',
 ARRAY['fee','payment'], true, true, 'a', 1, NOW()),

('LC-320-b', 'LC-320-a', 'payment_terms', 'financial',
 'Company shall not be liable for any broker, agent, production company, or third-party fees owed by Influencer.',
 'low',
 'Influencer is responsible for its own third-party fees.',
 ARRAY['expenses','brokers'], true, true, 'b', 1, NOW()),

('LC-321-a', NULL, 'payment_terms', 'financial',
 'Influencer shall refund any prepaid unearned amounts if Company terminates for convenience.',
 'medium',
 'Influencer must return unused prepaid funds.',
 ARRAY['refund','termination'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- EXCLUSIVITY (330-339)
-- =============================================================================
('LC-330-a', NULL, 'exclusivity', 'relationship',
 'Influencer shall not display non-company-owned brand logos or products in video content, including clothing.',
 'medium',
 'No competitor brands may appear in content.',
 ARRAY['exclusivity','brand'], true, true, 'a', 1, NOW()),

('LC-331-a', NULL, 'non_disparagement', 'relationship',
 'Influencer Content shall not disparage Company or its competitors.',
 'medium',
 'No negative statements about the Company or competitors.',
 ARRAY['non_disparagement'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- TERMINATION (340-349)
-- =============================================================================
('LC-340-a', NULL, 'termination_for_convenience', 'contract_lifecycle',
 'Company may terminate this Agreement for any reason with thirty (30) days prior written notice.',
 'medium',
 'Company can terminate with 30 days notice.',
 ARRAY['termination','convenience'], true, true, 'a', 1, NOW()),

('LC-341-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 'Company may immediately terminate if Influencer dies, suffers disability, fails to perform, or an Event of Force Majeure occurs.',
 'high',
 'Company may terminate immediately for failure or force majeure.',
 ARRAY['force_majeure','termination'], true, true, 'a', 1, NOW()),

('LC-341-b', 'LC-341-a', 'termination_for_cause', 'contract_lifecycle',
 'Company may immediately terminate if Influencer commits or is accused of criminal acts, public scandal, offensive behavior, or breaches the Agreement.',
 'high',
 'Immediate termination for misconduct or breach.',
 ARRAY['misconduct','morals'], true, true, 'b', 1, NOW()),

('LC-342-a', NULL, 'survival', 'contract_lifecycle',
 'Company shall retain perpetual internal archival use rights for Materials, and posts made during the Term may remain accessible after termination.',
 'medium',
 'Posts may stay online; archival rights survive.',
 ARRAY['survival','archival'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- WARRANTIES (350-359)
-- =============================================================================
('LC-350-a', NULL, 'warranty', 'liability',
 'Influencer represents they are over the age of majority or have guardian consent, have no criminal record, and have the right to enter into this Agreement.',
 'medium',
 'Influencer warranties about eligibility and legal ability.',
 ARRAY['warranty','eligibility'], true, true, 'a', 1, NOW()),

('LC-350-b', 'LC-350-a', 'warranty', 'liability',
 'Influencer warrants they have not and will not acquire followers fraudulently and will make truthful claims based on honest opinion.',
 'medium',
 'No follower fraud; honest representations required.',
 ARRAY['followers','fraud'], true, true, 'b', 1, NOW()),

('LC-350-c', 'LC-350-a', 'warranty', 'liability',
 'Influencer warrants that Influencer Content will comply with all laws, industry standards, social platform policies, and the LVMH Supplier Code of Conduct.',
 'high',
 'Content must comply with legal and code-of-conduct rules.',
 ARRAY['lvmh','compliance'], true, true, 'c', 1, NOW()),

-- =============================================================================
-- CONFIDENTIALITY (360-369)
-- =============================================================================
('LC-360-a', NULL, 'confidentiality', 'information_protection',
 'Influencer shall not disclose any Company confidential information, including unreleased advertising content, compensation terms, or the relationship itself prior to public disclosure.',
 'high',
 'Influencer must keep Company information confidential.',
 ARRAY['confidentiality'], true, true, 'a', 1, NOW()),

('LC-361-a', NULL, 'confidentiality', 'information_protection',
 'All press inquiries regarding Influencer''s services shall be directed to Company, and Influencer shall not comment publicly without approval.',
 'medium',
 'Influencer cannot speak to media without permission.',
 ARRAY['press','confidentiality'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- INDEMNIFICATION / LIABILITY (370-379)
-- =============================================================================
('LC-370-a', NULL, 'indemnification', 'liability',
 'Each party shall indemnify, defend, and hold the other harmless from third-party claims arising from breaches or gross negligence.',
 'high',
 'Mutual indemnification for breach or negligence.',
 ARRAY['indemnity','breach'], true, true, 'a', 1, NOW()),

('LC-370-b', 'LC-370-a', 'indemnification', 'liability',
 'Company shall indemnify Influencer for third-party claims arising from Company products or services, except where caused by Influencer''s misconduct.',
 'high',
 'Company covers product liability claims.',
 ARRAY['product_liability'], true, true, 'b', 1, NOW()),

('LC-371-a', NULL, 'limitation_of_liability', 'liability',
 'Neither party shall be liable for indirect, incidental, special, consequential, exemplary, or punitive damages.',
 'critical',
 'No indirect or special damages allowed.',
 ARRAY['limitation','liability'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- COMPLIANCE (380-389) - Including DEI & Anti-corruption
-- =============================================================================
('LC-380-a', NULL, 'compliance', 'compliance',
 'Influencer shall comply with the LVMH Supplier Code of Conduct, including diversity, equity, and inclusion expectations.',
 'medium',
 'Influencer must follow DEI and supplier code.',
 ARRAY['dei','supplier_code'], true, true, 'a', 1, NOW()),

('LC-381-a', NULL, 'compliance', 'compliance',
 'Business partner shall prevent direct or indirect funding of hate groups or discriminatory organizations.',
 'high',
 'Prohibits supporting hate groups.',
 ARRAY['compliance','ethics'], true, true, 'a', 1, NOW()),

('LC-382-a', NULL, 'compliance', 'compliance',
 'Business partner shall notify Company of any acts or suspicions of corruption or influence peddling and may be terminated immediately for breach.',
 'high',
 'Anti-corruption compliance required.',
 ARRAY['anti_corruption'], true, true, 'a', 1, NOW()),

('LC-383-a', NULL, 'compliance', 'compliance',
 'Business partner must avoid conflicts of interest and disclose any potential conflict immediately.',
 'medium',
 'Must avoid and report conflicts of interest.',
 ARRAY['conflict_of_interest'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- GENERAL / BOILERPLATE (390-399)
-- =============================================================================
('LC-390-a', NULL, 'assignment', 'general',
 'Influencer may not assign or transfer this Agreement without Company consent.',
 'medium',
 'Influencer cannot assign contract without permission.',
 ARRAY['assignment'], true, true, 'a', 1, NOW()),

('LC-391-a', NULL, 'general', 'general',
 'Payments are subject to legal deductions. Parties are independent contractors, not employees or agents.',
 'low',
 'Clarifies contractor status and tax deductions.',
 ARRAY['independent_contractor'], true, true, 'a', 1, NOW()),

('LC-392-a', NULL, 'governing_law', 'dispute_resolution',
 'This Agreement shall be governed by the laws of California, and any enforcement action shall be brought exclusively in California courts.',
 'medium',
 'California governs; California courts have jurisdiction.',
 ARRAY['governing_law','jurisdiction'], true, true, 'a', 1, NOW()),

('LC-393-a', NULL, 'notice', 'general',
 'All notices shall be deemed given upon personal delivery, email during business hours, certified mail, or overnight courier to the listed addresses.',
 'low',
 'Defines how notices must be delivered.',
 ARRAY['notice'], true, true, 'a', 1, NOW()),

('LC-394-a', NULL, 'severability', 'general',
 'If any portion of this Agreement is held void or unenforceable, the remainder shall remain binding.',
 'low',
 'Invalid parts do not affect the rest.',
 ARRAY['severability'], true, true, 'a', 1, NOW()),

('LC-395-a', NULL, 'entire_agreement', 'general',
 'This Agreement contains the entire understanding between the parties and may only be modified in writing.',
 'low',
 'Agreement is entire and requires written changes.',
 ARRAY['entire_agreement'], true, true, 'a', 1, NOW()),

('LC-396-a', NULL, 'audit', 'compliance',
 'Company may audit Influencer''s accounts and books for seven years after termination, with rights to correct discrepancies and terminate for illegal payments.',
 'high',
 'Allows Company to audit books for 7 years.',
 ARRAY['audit','compliance'], true, true, 'a', 1, NOW());

-- =============================================================================
-- Summary:
--   34 clauses total (26 base, 8 variants)
--   New clause_types introduced: non_disparagement (LC-331-a)
--   New compliance clauses: DEI (LC-380-a), Anti-corruption (LC-382-a)
-- =============================================================================
