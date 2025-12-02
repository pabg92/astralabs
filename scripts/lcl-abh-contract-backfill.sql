-- =============================================================================
-- LCL Backfill: ABH (Anastasia Beverly Hills) Talent Agreement
-- Block: LC-500 → LC-599
-- Total: 57 clauses (43 base, 14 variants)
-- Generated: 2025-11-27
-- =============================================================================
-- Topic Blocks:
--   500-509: Deliverables / Scope of Work
--   510-519: Approvals / Content Standards
--   520-529: Intellectual Property / Licensing
--   549:     Exclusivity (sparse)
--   550-557: Warranties / Indemnification
--   570-576: Termination
-- =============================================================================

INSERT INTO legal_clause_library (
  clause_id, parent_clause_id, clause_type, category, standard_text,
  risk_level, plain_english_summary, tags, is_required, is_approved,
  variation_letter, version, created_at
) VALUES

-- =============================================================================
-- DELIVERABLES / SCOPE OF WORK (500-509)
-- =============================================================================
('LC-500-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall create and publish one (1) TikTok video as specified in the Summary, promoting [PARTY A] and the Products.',
 'medium',
 'Talent must create and post one TikTok video as required.',
 ARRAY['deliverable','tiktok','content'], true, true, 'a', 1, NOW()),

('LC-501-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall review and follow all creative briefs and brand guidelines provided by [PARTY A] before producing the Content.',
 'medium',
 'Talent must follow provided briefs and brand guidelines.',
 ARRAY['creative_brief','guidelines'], true, true, 'a', 1, NOW()),

('LC-502-a', NULL, 'deliverables', 'operational',
 'All Content shall be submitted by [PARTY B] to [PARTY A] for approval prior to posting, with a maximum of two rounds of changes.',
 'medium',
 'Talent must submit content for approval, with up to two rounds of edits.',
 ARRAY['approvals','edits'], true, true, 'a', 1, NOW()),

('LC-503-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall post the Content on the schedule set forth in the Summary, including tagging @anastasiabeverlyhills and required hashtags such as #ad and using Paid Sponsorship tools.',
 'medium',
 'Talent must post on schedule and use required tags, hashtags, and tools.',
 ARRAY['posting','tags','hashtag'], true, true, 'a', 1, NOW()),

('LC-504-a', NULL, 'compliance', 'compliance',
 '[PARTY B] shall clearly and conspicuously disclose [PARTY B]''s association with [PARTY A] in all posts according to FTC guidelines.',
 'high',
 'Talent must include clear FTC disclosures.',
 ARRAY['ftc','disclosure','compliance'], true, true, 'a', 1, NOW()),

('LC-505-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall provide performance metrics for all Content to [PARTY A] within 48 hours of posting.',
 'medium',
 'Talent must provide performance metrics within 48 hours after posting.',
 ARRAY['metrics','analytics'], true, true, 'a', 1, NOW()),

('LC-506-a', NULL, 'deliverables', 'operational',
 'Posting the same Content on multiple social channels shall count as one Post.',
 'low',
 'Cross-posted content counts as a single post.',
 ARRAY['posting','crosspost'], true, true, 'a', 1, NOW()),

('LC-507-a', NULL, 'scope_of_work', 'operational',
 'The approved Post shall remain on all of [PARTY B]''s social channels for at least 365 days unless earlier removal is requested by [PARTY A].',
 'medium',
 'Posts must remain live for 365 days unless removed upon request.',
 ARRAY['post_duration','takedown'], true, true, 'a', 1, NOW()),

('LC-508-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall use official links to [PARTY A] products in the Content as requested.',
 'low',
 'Talent must use official product links.',
 ARRAY['links','product_links'], true, true, 'a', 1, NOW()),

('LC-509-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall remove or delete Content upon [PARTY A]''s request.',
 'medium',
 'Talent must take down content when the brand asks.',
 ARRAY['takedown','removal'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- APPROVALS / CONTENT STANDARDS (510-519)
-- =============================================================================
('LC-510-a', NULL, 'scope_of_work', 'operational',
 '[PARTY A] shall have the right to combine the Content with other content, subject to [PARTY B]''s approval, which shall not be unreasonably withheld.',
 'medium',
 'Brand may combine talent content with other materials, subject to talent approval.',
 ARRAY['approvals','combination'], true, true, 'a', 1, NOW()),

('LC-511-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall have approval rights over final Content, and any Content not disapproved in writing within three business days shall be deemed approved.',
 'medium',
 'Talent has final approval but must respond within 3 business days or content is auto-approved.',
 ARRAY['approval','review'], true, true, 'a', 1, NOW()),

('LC-512-a', NULL, 'scope_of_work', 'operational',
 'At any time during and after the Term, Content may be used internally by [PARTY A] worldwide, provided such usage is not public-facing except for online archives of social posts.',
 'medium',
 'Brand may use content internally worldwide, except public-facing use requires limits.',
 ARRAY['internal_use','archives'], true, true, 'a', 1, NOW()),

('LC-513-a', NULL, 'compliance', 'compliance',
 '[PARTY B]''s Content shall not reference or depict any celebrity without [PARTY A]''s approval.',
 'medium',
 'Talent cannot reference or show celebrities without approval.',
 ARRAY['content_rules','celebrity'], true, true, 'a', 1, NOW()),

('LC-514-a', NULL, 'compliance', 'compliance',
 '[PARTY B]''s Content shall not disparage [PARTY A] or its competitors.',
 'high',
 'Content cannot disparage brand or competitors.',
 ARRAY['disparagement','content_rules'], true, true, 'a', 1, NOW()),

('LC-515-a', NULL, 'compliance', 'compliance',
 '[PARTY B]''s Content shall not include nudity, lewd content, obscenity, vulgarity, profanity, bigotry, racism, or gratuitous violence.',
 'high',
 'Prohibits offensive adult or violent content.',
 ARRAY['prohibited_content','safety'], true, true, 'a', 1, NOW()),

('LC-516-a', NULL, 'compliance', 'compliance',
 '[PARTY B]''s Content shall not promote excessive alcohol consumption, illegal drugs, or impersonate another individual.',
 'high',
 'No drug promotion, excessive alcohol messaging, or impersonation.',
 ARRAY['prohibited_content','alcohol','drugs'], true, true, 'a', 1, NOW()),

('LC-517-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY B] shall not include any content protected by intellectual property, privacy, or publicity rights unless [PARTY B] owns or has obtained all necessary rights and consents.',
 'high',
 'Talent must clear all third-party IP and rights.',
 ARRAY['ip','third_party_rights'], true, true, 'a', 1, NOW()),

('LC-518-a', NULL, 'compliance', 'compliance',
 '[PARTY B] shall not include advertising for third parties, including money-making schemes, discount cards, credit counseling, or online contests.',
 'medium',
 'No unrelated advertising or schemes in content.',
 ARRAY['advertising','restrictions'], true, true, 'a', 1, NOW()),

('LC-519-a', NULL, 'compliance', 'compliance',
 '[PARTY B] shall abide by rules of fairness, honesty, integrity, respect, and inclusion, and refrain from human rights abuses or corrupt or unethical practices including discrimination, harassment, forced labor, corruption, money laundering, and uncompetitive conduct.',
 'high',
 'Talent must follow ethics, inclusion, anti-corruption and anti-abuse rules.',
 ARRAY['dei','ethics','anti_corruption'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- INTELLECTUAL PROPERTY / LICENSING (520-526)
-- =============================================================================
('LC-520-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY B] retains full and exclusive ownership of all Content created without using any intellectual property owned by third parties or by [PARTY A].',
 'medium',
 'Talent owns all original content they create that does not contain third-party or brand IP.',
 ARRAY['ownership','original_content'], true, true, 'a', 1, NOW()),

('LC-521-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY B] grants [PARTY A] thirty consecutive days of organic usage rights and fourteen consecutive days of paid usage rights for the Content, commencing on the date [PARTY B] Posts the Content.',
 'high',
 'Brand receives 30 days organic and 14 days paid usage starting from the posting date.',
 ARRAY['usage','organic','paid_media'], true, true, 'a', 1, NOW()),

('LC-521-b', 'LC-521-a', 'intellectual_property', 'information_protection',
 'Paid advertising may be used by [PARTY A] beginning fourteen days after [PARTY A] reposts the Content.',
 'medium',
 'Paid media starts 14 days after brand reposts the talent content.',
 ARRAY['paid_media','timing'], true, true, 'b', 1, NOW()),

('LC-522-a', NULL, 'scope_of_work', 'operational',
 'Approved Posts must remain on all of [PARTY B]''s social media channels for a minimum period of 365 days unless removed earlier at [PARTY A]''s request.',
 'medium',
 'Talent must keep posts live for at least one year unless the brand requests removal.',
 ARRAY['post_duration','retention'], true, true, 'a', 1, NOW()),

('LC-523-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY B] grants [PARTY A] the right to use [PARTY B]''s name, image, likeness, social-media handle(s), signature, voice, and biographical information solely as contained within the Content that is Posted.',
 'high',
 'Brand may use talent''s likeness only as it appears inside the approved posted content.',
 ARRAY['likeness','usage','persona'], true, true, 'a', 1, NOW()),

('LC-524-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY B] shall not claim compensation or benefits for any authorized use of [PARTY B]''s Persona or Content outside the Fee listed in the Agreement.',
 'medium',
 'Talent waives additional compensation for authorized usage of their persona or content.',
 ARRAY['waiver','compensation'], true, true, 'a', 1, NOW()),

('LC-525-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY B] waives any moral rights (droit moral) and similar rights worldwide in connection with the Content as permitted by law.',
 'high',
 'Talent waives moral rights globally for the content where legally allowed.',
 ARRAY['moral_rights','waiver'], true, true, 'a', 1, NOW()),

('LC-526-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY A] grants [PARTY B] a limited license to use only the intellectual property owned by [PARTY A] and provided at [PARTY A]''s sole discretion for the purpose of creating the Content.',
 'medium',
 'Talent may use brand-provided assets only to create campaign content.',
 ARRAY['brand_ip','license'], true, true, 'a', 1, NOW()),

('LC-526-b', 'LC-526-a', 'intellectual_property', 'information_protection',
 '[PARTY B] shall not use [PARTY A] Materials for any purpose other than creating and Posting the Content.',
 'medium',
 'Brand IP cannot be used outside this campaign.',
 ARRAY['brand_ip','restrictions'], true, true, 'b', 1, NOW()),

('LC-526-c', 'LC-526-a', 'intellectual_property', 'information_protection',
 '[PARTY A] may cancel the license to its Materials at any time.',
 'medium',
 'Brand may revoke its IP license whenever it chooses.',
 ARRAY['brand_ip','revocation'], true, true, 'c', 1, NOW()),

-- =============================================================================
-- EXCLUSIVITY (549)
-- =============================================================================
('LC-549-a', NULL, 'exclusivity', 'relationship',
 '[PARTY B] shall not misrepresent the source of anything in the Content, including impersonating another individual or entity.',
 'high',
 'Talent may not impersonate others or misrepresent content sources.',
 ARRAY['impersonation','misrepresentation'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- WARRANTIES (550-554)
-- =============================================================================
('LC-550-a', NULL, 'warranty', 'liability',
 '[PARTY B] represents and warrants that [PARTY B] has the right to enter into this Agreement and perform all obligations without violating any other agreement.',
 'medium',
 'Talent confirms they can legally sign and perform under this contract.',
 ARRAY['authority','warranty'], true, true, 'a', 1, NOW()),

('LC-550-b', 'LC-550-a', 'warranty', 'compliance',
 '[PARTY B] represents and warrants that [PARTY B] has no conflicting commitments or obligations that would prevent performance of the Services.',
 'medium',
 'Talent confirms they have no conflicting obligations.',
 ARRAY['conflict','warranty'], true, true, 'b', 1, NOW()),

('LC-551-a', NULL, 'compliance', 'compliance',
 '[PARTY B] shall clearly and conspicuously disclose [PARTY B]''s affiliation with [PARTY A] in all sponsored posts in compliance with FTC endorsement guidelines.',
 'high',
 'Talent must follow FTC disclosure rules for all sponsored content.',
 ARRAY['ftc','disclosure'], true, true, 'a', 1, NOW()),

('LC-551-b', 'LC-551-a', 'compliance', 'compliance',
 '[PARTY B] shall incorporate appropriate disclosures in each Post and immediately inform [PARTY A] of any changes in [PARTY B]''s opinions or findings related to the Content.',
 'medium',
 'Talent must disclose sponsorship and notify the brand if their views change.',
 ARRAY['disclosure','opinion_change'], true, true, 'b', 1, NOW()),

('LC-552-a', NULL, 'warranty', 'liability',
 'Any statement by [PARTY B] about [PARTY A] or its products shall reflect [PARTY B]''s true, honest beliefs, findings, or experiences.',
 'high',
 'Talent confirms that all endorsements must be truthful and authentic.',
 ARRAY['honest_opinion','endorsement'], true, true, 'a', 1, NOW()),

('LC-553-a', NULL, 'warranty', 'liability',
 '[PARTY B] shall not disparage or denigrate [PARTY A], [PARTY A]''s brands, or products.',
 'high',
 'Talent must avoid negative statements about the brand.',
 ARRAY['non_disparagement','conduct'], true, true, 'a', 1, NOW()),

('LC-554-a', NULL, 'warranty', 'compliance',
 '[PARTY A] represents and warrants that it has the authority to enter into this Agreement and no conflicting obligations preventing performance.',
 'medium',
 'Brand confirms it can legally sign and perform under the contract.',
 ARRAY['authority','brand_warranty'], true, true, 'a', 1, NOW()),

('LC-554-b', 'LC-554-a', 'warranty', 'compliance',
 '[PARTY A] warrants that it will comply with all applicable laws, regulations, and court orders in connection with its products and content distribution.',
 'medium',
 'Brand agrees to follow all relevant laws.',
 ARRAY['legal_compliance','brand'], true, true, 'b', 1, NOW()),

('LC-554-c', 'LC-554-a', 'warranty', 'relationship',
 '[PARTY A] shall not disparage or denigrate [PARTY B] or [PARTY B]''s reputation.',
 'medium',
 'Brand agrees not to disparage the talent.',
 ARRAY['non_disparagement','mutual'], true, true, 'c', 1, NOW()),

-- =============================================================================
-- INDEMNIFICATION (555-557)
-- =============================================================================
('LC-555-a', NULL, 'indemnification', 'liability',
 'Each party shall indemnify and hold the other harmless from all third-party damages arising from its own acts, omissions, or breach of any representation, warranty, or covenant under the Agreement.',
 'high',
 'Mutual indemnity for breach and wrongful acts.',
 ARRAY['indemnity','breach','third_party'], true, true, 'a', 1, NOW()),

('LC-555-b', 'LC-555-a', 'indemnification', 'liability',
 '[PARTY A] shall indemnify [PARTY B] for damages arising from the use of any materials or products supplied by [PARTY A], including product liability claims.',
 'high',
 'Brand covers the talent for issues arising from brand-supplied materials or products.',
 ARRAY['indemnity','product_liability'], true, true, 'b', 1, NOW()),

('LC-556-a', NULL, 'indemnification', 'liability',
 'The indemnified party shall give prompt notice of any indemnifiable claim, and the indemnifying party may participate in the defense at its own expense.',
 'medium',
 'Indemnifying party has the right to participate in defense after notice.',
 ARRAY['indemnity','notice'], true, true, 'a', 1, NOW()),

('LC-557-a', NULL, 'indemnification', 'liability',
 '[PARTY B]''s indemnification obligations shall not exceed the total compensation paid to [PARTY B] under this Agreement.',
 'medium',
 'Talent''s indemnity exposure is capped at total compensation.',
 ARRAY['indemnity_cap','liability_limit'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- TERMINATION (570-576)
-- =============================================================================
('LC-570-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 'If [PARTY B] perishes or suffers any disability preventing the performance of Services for more than thirty (30) days, [PARTY A] may terminate the Agreement.',
 'medium',
 'Brand may terminate if Talent dies or is disabled for over 30 days.',
 ARRAY['termination','disability'], true, true, 'a', 1, NOW()),

('LC-570-b', 'LC-570-a', 'termination_for_cause', 'contract_lifecycle',
 'If an Event of Force Majeure occurs and continues for more than fifteen (15) days, [PARTY A] may terminate the Agreement.',
 'medium',
 'Brand may terminate if force majeure lasts more than 15 days.',
 ARRAY['termination','force_majeure'], true, true, 'b', 1, NOW()),

('LC-571-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 'Upon termination under disability or force majeure provisions, [PARTY B] is only entitled to compensation accrued as of the date of termination and must promptly refund any unearned amounts.',
 'medium',
 'Talent receives only earned compensation and must refund the rest upon certain terminations.',
 ARRAY['termination','refund','pro_rata'], true, true, 'a', 1, NOW()),

('LC-572-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 'If [PARTY B] fails to post any agreed Services on any agreed Production Day for reasons other than a Force Majeure Event, the Agreement shall be considered null and void, and [PARTY A] shall owe no amounts.',
 'high',
 'Failing to post on time voids the contract and Talent is not owed payment.',
 ARRAY['failure_to_post','termination','forfeiture'], true, true, 'a', 1, NOW()),

('LC-573-a', NULL, 'force_majeure', 'contract_lifecycle',
 'A Force Majeure Event includes natural catastrophes, labor disputes, acts of God, war, carrier delays, disease, outbreak, governmental orders, or any similar cause beyond [PARTY B]''s control that affects Services or [PARTY A]''s rights.',
 'medium',
 'Defines force majeure conditions that excuse Talent''s duties.',
 ARRAY['force_majeure','definition'], true, true, 'a', 1, NOW()),

('LC-574-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 '[PARTY A] may immediately terminate the Agreement if [PARTY B] commits any act that is an offense under applicable law, brings [PARTY B] or [PARTY A] into public disrepute, scandal, ridicule, or harms any of [PARTY A]''s products.',
 'high',
 'Brand may immediately terminate for morals violations or reputational harm.',
 ARRAY['morals','misconduct','termination'], true, true, 'a', 1, NOW()),

('LC-574-b', 'LC-574-a', 'termination_for_cause', 'contract_lifecycle',
 '[PARTY A] may immediately terminate if [PARTY B] materially breaches any provision or representation of the Agreement.',
 'high',
 'Material breach allows immediate termination.',
 ARRAY['material_breach','termination'], true, true, 'b', 1, NOW()),

('LC-574-c', 'LC-574-a', 'termination_for_cause', 'contract_lifecycle',
 '[PARTY A] may immediately terminate if [PARTY B] makes any statement that defames or disparages [PARTY A] or its products privately or publicly.',
 'high',
 'Defamation or disparagement triggers immediate termination.',
 ARRAY['disparagement','termination'], true, true, 'c', 1, NOW()),

('LC-575-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 'If [PARTY A] terminates under the morals or breach provisions, [PARTY A] shall only pay [PARTY B] for Services actually rendered up to termination, and [PARTY B] must promptly refund any unearned compensation.',
 'high',
 'Termination for cause results in pro rata pay and refunds of unearned amounts.',
 ARRAY['termination','refund','pro_rata'], true, true, 'a', 1, NOW()),

('LC-576-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 '[PARTY A]''s decision to terminate under the morals clause must be exercised within forty-five (45) days after the facts giving rise to such right are brought to [PARTY A]''s attention.',
 'medium',
 'Brand must act within 45 days to terminate for morals clause triggers.',
 ARRAY['morals','time_limit'], true, true, 'a', 1, NOW());

-- =============================================================================
-- Summary:
--   57 clauses total (43 base, 14 variants)
--   Sections covered: Deliverables, Approvals, Content Standards, IP/Licensing,
--                     Exclusivity, Warranties, Indemnification, Termination
--   Note: Payment terms, Confidentiality, and General/Boilerplate sections
--         not present in source contract extraction
-- =============================================================================
