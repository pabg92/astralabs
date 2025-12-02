-- LCL Backfill: Influencer Agreement Clauses (Option 3 Namespace)
-- Generated: 2025-11-26
-- Total: 38 clauses grouped into 21 base types with variants
-- Compatible with Migration 100 CBA Architecture

BEGIN;

-- ============================================================================
-- LC-001: INTELLECTUAL PROPERTY / WORK PRODUCT (3 variants)
-- ============================================================================

-- LC-001-a: Base IP - Work Made for Hire
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-001-a',
  'work_for_hire',
  'information_protection',
  'The Content and any other materials created by Influencer pursuant to this Agreement (collectively, the "Work Product") will be considered a "work made for hire" as defined by the Copyright Act of 1976, as amended. If the Work Product does not qualify as a work made for hire, Influencer hereby assigns to Brand all right, title, and interest in and to the Work Product, including all intellectual property rights therein.',
  'critical',
  'All content you create belongs to the brand as work-for-hire; if not, you assign all rights to them',
  ARRAY['ip', 'work-for-hire', 'copyright', 'assignment', 'work-product'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- LC-001-b: IP Variant - Brand Ownership Rights
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-001-b',
  'intellectual_property',
  'information_protection',
  'Brand will own all right, title, and interest in and to the Content, including all intellectual property rights therein. Influencer agrees to execute any documents and take any actions reasonably requested by Brand to effectuate Brand''s ownership.',
  'critical',
  'Brand owns all content and IP; influencer must sign any paperwork to confirm this',
  ARRAY['ip', 'ownership', 'brand-rights', 'content'],
  true,
  true,
  'b',
  'LC-001-a',
  1,
  NOW()
);

-- LC-001-c: IP Variant - License Grant
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-001-c',
  'intellectual_property',
  'information_protection',
  'Influencer grants to Brand a perpetual, irrevocable, worldwide, royalty-free license to use, reproduce, modify, distribute, and display Influencer''s name, likeness, image, voice, and biographical information in connection with the Content and Brand''s marketing and promotional activities.',
  'high',
  'You give the brand permanent free rights to use your name, image, and likeness for marketing',
  ARRAY['ip', 'license', 'name-likeness', 'perpetual', 'royalty-free'],
  true,
  true,
  'c',
  'LC-001-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-002: INDEMNIFICATION (2 variants)
-- ============================================================================

-- LC-002-a: Base Indemnification - Influencer indemnifies Brand
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-002-a',
  'indemnification',
  'liability',
  'Influencer agrees to indemnify, defend, and hold harmless Brand and its affiliates, officers, directors, employees, and agents from and against any and all claims, damages, losses, costs, and expenses (including reasonable attorneys'' fees) arising out of or relating to: (a) Influencer''s breach of any representation, warranty, or obligation under this Agreement; (b) any claim that the Content infringes or misappropriates any third party''s intellectual property rights; or (c) Influencer''s gross negligence or willful misconduct.',
  'critical',
  'You protect the brand from lawsuits if you breach the contract, infringe IP, or act negligently',
  ARRAY['indemnification', 'liability', 'defense', 'hold-harmless', 'ip-infringement'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- LC-002-b: Indemnification Variant - Mutual
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-002-b',
  'indemnification',
  'liability',
  'Each party agrees to indemnify, defend, and hold harmless the other party from and against any claims, damages, and expenses arising from the indemnifying party''s breach of this Agreement or negligent acts.',
  'high',
  'Both sides protect each other from lawsuits caused by their own breaches or negligence',
  ARRAY['indemnification', 'mutual', 'liability', 'defense'],
  false,
  true,
  'b',
  'LC-002-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-003: CONFIDENTIALITY (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-003-a',
  'confidentiality',
  'information_protection',
  'Influencer agrees to keep confidential and not disclose to any third party any Confidential Information of Brand. "Confidential Information" means any non-public information disclosed by Brand to Influencer, including but not limited to business plans, marketing strategies, product information, and the terms of this Agreement. This obligation will survive termination of this Agreement for a period of [DURATION] years.',
  'high',
  'Keep all brand secrets confidential during and after the contract ends',
  ARRAY['confidentiality', 'nda', 'trade-secrets', 'non-disclosure'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-004: TERMINATION (2 variants)
-- ============================================================================

-- LC-004-a: Termination for Convenience
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-004-a',
  'termination_for_convenience',
  'contract_lifecycle',
  'Either party may terminate this Agreement upon [NOTICE_PERIOD] days'' prior written notice to the other party for any reason or no reason.',
  'medium',
  'Either side can end the contract with advance written notice, no reason needed',
  ARRAY['termination', 'convenience', 'notice', 'exit'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- LC-004-b: Termination for Cause/Breach
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-004-b',
  'termination_for_cause',
  'contract_lifecycle',
  'Either party may terminate this Agreement immediately upon written notice if the other party materially breaches any provision of this Agreement and fails to cure such breach within [CURE_PERIOD] days after receiving written notice thereof.',
  'high',
  'Either side can end immediately if the other breaks the contract and doesn''t fix it',
  ARRAY['termination', 'breach', 'cure-period', 'material-breach'],
  true,
  true,
  'b',
  'LC-004-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-005: PAYMENT TERMS (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-005-a',
  'payment_terms',
  'financial',
  'In consideration of the services rendered hereunder, Brand agrees to pay Influencer the Fee set forth in Exhibit A. Payment will be made within [PAYMENT_DAYS] days of [PAYMENT_TRIGGER]. All payments will be made in [CURRENCY].',
  'medium',
  'Brand pays the agreed fee within specified days after the payment trigger event',
  ARRAY['payment', 'fee', 'compensation', 'net-terms'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-006: LIMITATION OF LIABILITY (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-006-a',
  'limitation_of_liability',
  'liability',
  'IN NO EVENT WILL EITHER PARTY BE LIABLE TO THE OTHER FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO THIS AGREEMENT, REGARDLESS OF WHETHER SUCH DAMAGES WERE FORESEEABLE OR WHETHER EITHER PARTY WAS ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. EACH PARTY''S TOTAL LIABILITY UNDER THIS AGREEMENT WILL NOT EXCEED THE TOTAL FEES PAID OR PAYABLE TO INFLUENCER UNDER THIS AGREEMENT.',
  'medium',
  'Neither side pays indirect damages; total liability capped at the contract fee amount',
  ARRAY['liability', 'cap', 'consequential-damages', 'limitation'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-007: WARRANTIES & REPRESENTATIONS (4 variants)
-- ============================================================================

-- LC-007-a: Base Warranty - Authority & Capacity
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-007-a',
  'representations',
  'liability',
  'Influencer represents and warrants that: (a) Influencer has the full right, power, and authority to enter into this Agreement and to perform Influencer''s obligations hereunder; (b) Influencer is at least 18 years of age.',
  'medium',
  'You confirm you have authority to sign and are at least 18 years old',
  ARRAY['warranty', 'representation', 'authority', 'capacity', 'age'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- LC-007-b: Warranty Variant - No Conflicts
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-007-b',
  'representations',
  'liability',
  'Influencer represents and warrants that the execution and performance of this Agreement will not violate any agreement or obligation between Influencer and any third party.',
  'high',
  'You confirm this deal doesn''t conflict with any other contracts you have',
  ARRAY['warranty', 'representation', 'no-conflicts', 'third-party'],
  true,
  true,
  'b',
  'LC-007-a',
  1,
  NOW()
);

-- LC-007-c: Warranty Variant - Original Content
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-007-c',
  'representations',
  'liability',
  'Influencer represents and warrants that the Content will be original, will not infringe or misappropriate any third party''s intellectual property rights, and will not contain any defamatory, obscene, or unlawful material.',
  'critical',
  'You guarantee content is original, doesn''t steal IP, and isn''t defamatory or illegal',
  ARRAY['warranty', 'representation', 'original', 'non-infringement', 'content'],
  true,
  true,
  'c',
  'LC-007-a',
  1,
  NOW()
);

-- LC-007-d: Warranty Variant - FTC Compliance
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-007-d',
  'compliance',
  'compliance',
  'Influencer represents and warrants that all Content will comply with all applicable laws, rules, and regulations, including but not limited to the Federal Trade Commission''s Guidelines Concerning the Use of Endorsements and Testimonials in Advertising (the "FTC Guidelines"). Influencer agrees to include all disclosures required by the FTC Guidelines in the Content.',
  'high',
  'You guarantee content follows FTC rules and includes required sponsorship disclosures',
  ARRAY['warranty', 'compliance', 'ftc', 'disclosure', 'advertising'],
  true,
  true,
  'd',
  'LC-007-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-008: INDEPENDENT CONTRACTOR (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-008-a',
  'independent_contractor',
  'relationship',
  'Influencer is an independent contractor and not an employee, agent, joint venturer, or partner of Brand. Influencer will not be entitled to any employee benefits from Brand. Influencer is solely responsible for all taxes arising from compensation received under this Agreement.',
  'medium',
  'You''re a contractor not an employee; no benefits and you handle your own taxes',
  ARRAY['independent-contractor', 'employment', 'taxes', 'benefits'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-009: GOVERNING LAW (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-009-a',
  'governing_law',
  'dispute_resolution',
  'This Agreement will be governed by and construed in accordance with the laws of the State of [STATE], without regard to its conflict of laws principles.',
  'low',
  'The contract follows the laws of the specified state',
  ARRAY['governing-law', 'jurisdiction', 'choice-of-law', 'state'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-010: DISPUTE RESOLUTION / INJUNCTIVE RELIEF (2 variants)
-- ============================================================================

-- LC-010-a: Base - Jurisdiction & Venue
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-010-a',
  'dispute_resolution',
  'dispute_resolution',
  'Any dispute arising out of or relating to this Agreement will be resolved exclusively in the state or federal courts located in [JURISDICTION], and each party hereby consents to the personal jurisdiction of such courts.',
  'medium',
  'Disputes go to court in the specified location; both sides agree to that court''s authority',
  ARRAY['dispute', 'jurisdiction', 'venue', 'courts'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- LC-010-b: Injunctive Relief
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-010-b',
  'dispute_resolution',
  'dispute_resolution',
  'Influencer acknowledges that any breach of this Agreement may cause irreparable harm to Brand for which monetary damages would be inadequate. Accordingly, Brand will be entitled to seek injunctive or other equitable relief to prevent or remedy any breach or threatened breach of this Agreement, without the necessity of proving actual damages or posting any bond.',
  'high',
  'Brand can get a court order to stop you from breaching without proving money damages',
  ARRAY['injunctive-relief', 'equitable', 'breach', 'remedy'],
  false,
  true,
  'b',
  'LC-010-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-011: ASSIGNMENT (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-011-a',
  'assignment',
  'relationship',
  'Influencer may not assign or transfer this Agreement or any rights or obligations hereunder without Brand''s prior written consent. Brand may assign this Agreement to any affiliate or successor without Influencer''s consent. Any attempted assignment in violation of this section will be void.',
  'medium',
  'You can''t transfer this contract without permission; brand can transfer it freely',
  ARRAY['assignment', 'transfer', 'consent', 'successor'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-012: ENTIRE AGREEMENT (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-012-a',
  'entire_agreement',
  'general',
  'This Agreement, including all exhibits and schedules attached hereto, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior and contemporaneous agreements, representations, and understandings, whether written or oral.',
  'low',
  'This document is the complete deal; previous discussions don''t count',
  ARRAY['entire-agreement', 'integration', 'merger', 'supersedes'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-013: AMENDMENT (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-013-a',
  'amendment',
  'general',
  'This Agreement may not be amended or modified except by a written instrument signed by both parties.',
  'low',
  'Changes to this contract must be in writing and signed by both sides',
  ARRAY['amendment', 'modification', 'written', 'signed'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-014: NOTICE (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-014-a',
  'notice',
  'general',
  'All notices required or permitted under this Agreement will be in writing and will be deemed given when delivered personally, sent by confirmed email, or sent by certified mail, return receipt requested, to the addresses set forth in this Agreement or to such other address as either party may designate in writing.',
  'low',
  'Official notices must be written and delivered by email, mail, or in person',
  ARRAY['notice', 'communication', 'email', 'certified-mail'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-015: SEVERABILITY (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-015-a',
  'severability',
  'general',
  'If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions will continue in full force and effect, and the invalid or unenforceable provision will be modified to the minimum extent necessary to make it valid and enforceable.',
  'low',
  'If one part is invalid, the rest still applies; bad parts get fixed minimally',
  ARRAY['severability', 'enforceability', 'invalid', 'modification'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-016: WAIVER (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-016-a',
  'waiver',
  'general',
  'The failure of either party to enforce any right or provision of this Agreement will not constitute a waiver of such right or provision. Any waiver must be in writing and signed by the waiving party.',
  'low',
  'Not enforcing a rule once doesn''t mean giving up that rule forever',
  ARRAY['waiver', 'enforcement', 'rights', 'written'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-017: COUNTERPARTS / EXECUTION (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-017-a',
  'other',
  'general',
  'This Agreement may be executed in counterparts, each of which will be deemed an original, and all of which together will constitute one and the same instrument. Electronic signatures will be deemed valid and binding.',
  'low',
  'Can sign separate copies; electronic signatures count as valid',
  ARRAY['counterparts', 'execution', 'electronic-signature', 'original'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-018: INTERPRETATION RULES (1 clause)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-018-a',
  'other',
  'general',
  'The headings in this Agreement are for convenience only and will not affect the interpretation of this Agreement. The word "including" means "including without limitation." This Agreement will not be construed against the drafter.',
  'low',
  'Section titles don''t change meaning; "including" isn''t exhaustive; no bias against who wrote it',
  ARRAY['interpretation', 'headings', 'construction', 'drafter'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-019: DELIVERABLES / CONTENT REQUIREMENTS (3 variants)
-- ============================================================================

-- LC-019-a: Base Deliverables - January
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-019-a',
  'deliverables',
  'operational',
  'Influencer shall deliver the following Content during [MONTH/PERIOD]: [NUMBER] Instagram In-Feed Post(s), [NUMBER] Instagram Story frame(s), [NUMBER] TikTok video(s). All Content must be approved by Brand prior to posting.',
  'medium',
  'You must deliver specified posts/stories/videos during the period, all need brand approval',
  ARRAY['deliverables', 'content', 'instagram', 'tiktok', 'approval'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- LC-019-b: Deliverables Variant - Requirements
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-019-b',
  'deliverables',
  'operational',
  'The Content must incorporate the following requirements: mention or tag [BRAND_HANDLE], use hashtags [HASHTAGS], include [PRODUCT/SERVICE] in a positive and authentic manner, comply with platform terms of service.',
  'medium',
  'Content must tag brand, use required hashtags, show product positively, follow platform rules',
  ARRAY['deliverables', 'requirements', 'hashtags', 'tagging', 'mentions'],
  true,
  true,
  'b',
  'LC-019-a',
  1,
  NOW()
);

-- LC-019-c: Deliverables Variant - Approval Process
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-019-c',
  'acceptance',
  'operational',
  'Influencer shall submit all Content to Brand for approval at least [DAYS] business days prior to the scheduled posting date. Brand shall approve or request revisions within [REVIEW_DAYS] business days of receipt. Influencer shall make reasonable revisions as requested by Brand.',
  'medium',
  'Submit content for approval X days before posting; brand reviews within Y days; make requested changes',
  ARRAY['deliverables', 'approval', 'review', 'revisions', 'timeline'],
  true,
  true,
  'c',
  'LC-019-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-020: USAGE RIGHTS / LICENSE TERMS (3 variants)
-- ============================================================================

-- LC-020-a: Base Usage - Primary Term
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-020-a',
  'intellectual_property',
  'information_protection',
  'Brand shall have the right to use, reproduce, and distribute the Content across Brand''s owned and operated channels for a period of [USAGE_TERM] from the date of first posting ("Usage Term").',
  'medium',
  'Brand can use your content on their channels for the specified usage period',
  ARRAY['usage', 'license', 'term', 'owned-channels', 'distribution'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- LC-020-b: Usage Variant - Organic Social
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-020-b',
  'intellectual_property',
  'information_protection',
  'During the Usage Term, Brand may repost, reshare, or otherwise redistribute the Content on Brand''s social media channels without additional compensation to Influencer.',
  'medium',
  'Brand can repost your content on their social media during the usage period at no extra cost',
  ARRAY['usage', 'organic', 'social-media', 'repost', 'reshare'],
  false,
  true,
  'b',
  'LC-020-a',
  1,
  NOW()
);

-- LC-020-c: Usage Variant - Archival Rights
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-020-c',
  'intellectual_property',
  'information_protection',
  'Influencer agrees to keep the Content live on Influencer''s social media channels for a minimum of [ARCHIVAL_PERIOD] from the date of posting. Influencer shall not delete, archive, or make private the Content during this period without Brand''s prior written consent.',
  'medium',
  'You must keep posted content visible for the minimum period; no deleting without permission',
  ARRAY['usage', 'archival', 'retention', 'delete', 'live'],
  false,
  true,
  'c',
  'LC-020-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-021: PAID MEDIA / WHITELISTING (2 variants)
-- ============================================================================

-- LC-021-a: Base - Paid Media Rights
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-021-a',
  'intellectual_property',
  'information_protection',
  'Brand shall have the right to use the Content in paid media, including but not limited to social media advertising, display advertising, and programmatic advertising, for a period of [PAID_MEDIA_TERM] from the date of first posting. Paid media usage is [INCLUDED IN FEE / SUBJECT TO ADDITIONAL FEE OF $X].',
  'high',
  'Brand can use your content in paid ads for specified period; may or may not include extra payment',
  ARRAY['paid-media', 'advertising', 'whitelisting', 'boosting', 'ads'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- LC-021-b: Whitelisting / Spark Ads
INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-021-b',
  'intellectual_property',
  'information_protection',
  'Influencer agrees to provide Brand with whitelisting/partnership ad access to Influencer''s social media accounts for the purpose of running paid advertisements using the Content. Influencer shall grant access codes within [DAYS] days of request.',
  'high',
  'You give brand access to run ads from your account; must provide access codes when asked',
  ARRAY['whitelisting', 'spark-ads', 'partnership-ads', 'access', 'boosting'],
  false,
  true,
  'b',
  'LC-021-a',
  1,
  NOW()
);

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Count total clauses
SELECT COUNT(*) as total_clauses FROM legal_clause_library WHERE clause_id LIKE 'LC-0%';

-- Count by base type (parent_clause_id IS NULL)
SELECT COUNT(*) as base_clauses FROM legal_clause_library
WHERE clause_id LIKE 'LC-0%' AND parent_clause_id IS NULL;

-- Count variants
SELECT COUNT(*) as variant_clauses FROM legal_clause_library
WHERE clause_id LIKE 'LC-0%' AND parent_clause_id IS NOT NULL;

-- List all clause families
SELECT
  COALESCE(parent_clause_id, clause_id) as family,
  COUNT(*) as variants,
  array_agg(clause_id ORDER BY variation_letter) as members
FROM legal_clause_library
WHERE clause_id LIKE 'LC-0%'
GROUP BY COALESCE(parent_clause_id, clause_id)
ORDER BY family;

-- Check category distribution
SELECT category, COUNT(*) as count
FROM legal_clause_library
WHERE clause_id LIKE 'LC-0%'
GROUP BY category
ORDER BY count DESC;

-- Check risk level distribution
SELECT risk_level, COUNT(*) as count
FROM legal_clause_library
WHERE clause_id LIKE 'LC-0%'
GROUP BY risk_level
ORDER BY count DESC;
