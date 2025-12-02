-- =============================================================================
-- LCL Backfill: UK Agency Contract (Cleaning Products / 1001 Carpet Care)
-- Block: LC-700 → LC-799
-- Total: 72 clauses (71 base, 1 variant)
-- Generated: 2025-11-27
-- Note: UK-based contract using ASA (not FTC) compliance standards
-- =============================================================================
-- Topic Blocks:
--   700-709: Scope of Work / Deliverables
--   710-719: Territory / Governing Law / General
--   720-728: IP / Communication / Compliance
--   729-742: Payment / Deliverables / Approvals / General
--   743-756: Compliance / Usage / Analytics / Confidentiality
--   770-782: Analytics / Compliance / IP / Termination
-- =============================================================================

INSERT INTO legal_clause_library (
  clause_id, parent_clause_id, clause_type, category, standard_text,
  risk_level, plain_english_summary, tags, is_required, is_approved,
  variation_letter, version, created_at
) VALUES

-- =============================================================================
-- SCOPE OF WORK / DELIVERABLES (700-709)
-- =============================================================================
('LC-700-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall provide the following Services: one (1) Instagram post and one (1) Instagram story set (three frames) across designated accounts. All content must be submitted for approval before going live.',
 'medium',
 'Talent must create one post and a three-frame story and submit all content for approval before posting.',
 ARRAY['services','deliverables','approval'], true, true, 'a', 1, NOW()),

('LC-701-a', NULL, 'payment_terms', 'financial',
 '[PARTY A] shall pay [AMOUNT] plus applicable VAT. Payment is due 100 percent on content approval, with fourteen (14) day payment terms. Late payments will incur a late payment charge.',
 'medium',
 'Full fee is payable on approval with 14-day terms; late fees apply.',
 ARRAY['payment','approval','late_fee'], true, true, 'a', 1, NOW()),

('LC-702-a', NULL, 'scope_of_work', 'contract_lifecycle',
 'The Term runs from November 2022 to December 2022.',
 'low',
 'Contract term is November to December 2022.',
 ARRAY['term'], true, true, 'a', 1, NOW()),

('LC-703-a', NULL, 'exclusivity', 'relationship',
 '[PARTY B] shall not promote any competitor brands within seven (7) days of the content going live.',
 'medium',
 'Talent cannot promote competitors for 7 days post-launch.',
 ARRAY['exclusivity','competitors'], true, true, 'a', 1, NOW()),

('LC-704-a', NULL, 'intellectual_property', 'information_protection',
 'The content is owned by [PARTY B]. [PARTY A] may re-post or re-gram the content but must tag or reference [PARTY B].',
 'medium',
 'Talent retains IP; brand may repost with credit.',
 ARRAY['ip','ownership','repost'], true, true, 'a', 1, NOW()),

('LC-705-a', NULL, 'scope_of_work', 'operational',
 '[PARTY A] shall have a maximum of one (1) round of reasonable approval for Social Media Posts. Approval must be given within forty-eight (48) hours of receipt.',
 'low',
 'Brand gets one approval round within 48 hours.',
 ARRAY['approval','editorial'], true, true, 'a', 1, NOW()),

('LC-706-a', NULL, 'intellectual_property', 'operational',
 'Any additional use of [PARTY B]''s name, image, voice, biography, likeness, or recordings requires prior written approval from [PARTY B].',
 'medium',
 'Brand must seek written approval for additional usage.',
 ARRAY['usage','rights','approval'], true, true, 'a', 1, NOW()),

('LC-707-a', NULL, 'compliance', 'compliance',
 '[PARTY B] shall comply with the Advertising Standards Authority guidance on social media throughout the Services.',
 'medium',
 'Talent must follow ASA rules.',
 ARRAY['asa','compliance','advertising'], true, true, 'a', 1, NOW()),

('LC-708-a', NULL, 'notice', 'general',
 'All correspondence with [PARTY B] must go through the Agency. The Client may not contact [PARTY B] directly unless authorised by the Agency.',
 'low',
 'Client cannot contact Talent directly without approval.',
 ARRAY['communication','agency','notice'], true, true, 'a', 1, NOW()),

('LC-709-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall provide all analytics for all content created.',
 'low',
 'Talent must share analytics for all posts.',
 ARRAY['analytics','reporting'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- TERRITORY / GOVERNING LAW / GENERAL (710-719)
-- =============================================================================
('LC-710-a', NULL, 'other', 'general',
 'The Territory for this Agreement is the United Kingdom.',
 'low',
 'Contract applies in the UK.',
 ARRAY['territory','uk'], true, true, 'a', 1, NOW()),

('LC-711-a', NULL, 'governing_law', 'dispute_resolution',
 'This Agreement is governed by and construed in accordance with the laws of England and Wales. Parties submit to the exclusive jurisdiction of the English courts.',
 'medium',
 'English law and courts govern the agreement.',
 ARRAY['law','jurisdiction','uk'], true, true, 'a', 1, NOW()),

('LC-712-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 'Either party may terminate immediately upon written notice if the other party materially breaches the Agreement and fails to remedy within fourteen (14) calendar days, excluding UK weekends and public holidays.',
 'medium',
 'Material breach with 14-day remedy window.',
 ARRAY['termination','breach','remedy_period'], true, true, 'a', 1, NOW()),

('LC-713-a', NULL, 'intellectual_property', 'information_protection',
 'The Social Media Posts and Images shall be owned by [PARTY B] for the full period of copyright and any extension.',
 'medium',
 'Talent retains copyright ownership fully.',
 ARRAY['ip','copyright','ownership'], true, true, 'a', 1, NOW()),

('LC-714-a', NULL, 'compliance', 'operational',
 '[PARTY B] shall use the paid partnership tool and include #ad and all required hashtags and handles provided by [PARTY A] in all social content.',
 'medium',
 'Talent must use #ad and partnership tool with required tags.',
 ARRAY['hashtags','disclosure','paid_partnership'], true, true, 'a', 1, NOW()),

('LC-715-a', NULL, 'scope_of_work', 'operational',
 'All Social Media Posts must be submitted to [PARTY A] for approval prior to posting.',
 'low',
 'Talent must get content approved before posting.',
 ARRAY['approval','pre_approval'], true, true, 'a', 1, NOW()),

('LC-716-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall use the required channels: Instagram and Instagram Stories through specified accounts, using all provided links and hashtags.',
 'low',
 'Talent must post on specified channels with required tags.',
 ARRAY['channels','posting','deliverables'], true, true, 'a', 1, NOW()),

('LC-717-a', NULL, 'intellectual_property', 'operational',
 '[PARTY A] may re-post or re-gram the content on its channels, provided [PARTY B] is tagged or referenced.',
 'low',
 'Brand may repost but must credit Talent.',
 ARRAY['usage','repost','credit'], true, true, 'a', 1, NOW()),

('LC-718-a', NULL, 'independent_contractor', 'general',
 '[PARTY A] and [PARTY B] acknowledge their relationship is that of independent contractors and not employees, partners, or agents.',
 'low',
 'Defines independent contractor relationship.',
 ARRAY['independent_contractor','relationship'], true, true, 'a', 1, NOW()),

('LC-719-a', NULL, 'compliance', 'compliance',
 '[PARTY B] shall familiarise themselves with and comply with all applicable advertising regulations relating to social media.',
 'medium',
 'Talent must follow advertising laws and regulations.',
 ARRAY['compliance','advertising_regulations'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- IP / COMMUNICATION / COMPLIANCE (720-728)
-- =============================================================================
('LC-720-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall provide all analytics and performance metrics for all created content.',
 'low',
 'Talent must supply analytics for all content.',
 ARRAY['analytics','reporting','metrics'], true, true, 'a', 1, NOW()),

('LC-721-a', NULL, 'other', 'general',
 'All correspondence must go through the Agency and the Client may not contact [PARTY B] directly without Agency authorisation.',
 'low',
 'Client must communicate only through Agency.',
 ARRAY['correspondence','agency','communication'], true, true, 'a', 1, NOW()),

('LC-722-a', NULL, 'governing_law', 'dispute_resolution',
 'This Agreement shall be governed by the laws of England and Wales, with all disputes subject to exclusive jurisdiction of the English courts.',
 'medium',
 'English governing law and exclusive jurisdiction.',
 ARRAY['law','jurisdiction','england_wales'], true, true, 'a', 1, NOW()),

('LC-723-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY B] owns the Social Media Posts and images for the full copyright period and any extension thereof.',
 'medium',
 'Talent retains full IP ownership.',
 ARRAY['ip','ownership','copyright'], true, true, 'a', 1, NOW()),

('LC-724-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 'Either party may terminate the Agreement immediately for material breach if the breach is not remedied within fourteen (14) calendar days, excluding weekends and public holidays in the UK.',
 'medium',
 'Either side can terminate for unremedied breach within 14 days.',
 ARRAY['termination','breach','remedy'], true, true, 'a', 1, NOW()),

('LC-725-a', NULL, 'other', 'general',
 'This Agreement is not binding without the signature of the Agency.',
 'low',
 'Contract is invalid without Agency signature.',
 ARRAY['signature','binding_effect'], true, true, 'a', 1, NOW()),

('LC-726-a', NULL, 'scope_of_work', 'operational',
 '[PARTY A] shall send cleaning and freshening products to [PARTY B] for content creation.',
 'low',
 'Client provides product for Talent to use.',
 ARRAY['product_provision','deliverables'], false, true, 'a', 1, NOW()),

('LC-727-a', NULL, 'exclusivity', 'relationship',
 '[PARTY B] shall not promote any competitor products within seven (7) days after posting the contracted content.',
 'medium',
 'A 7-day exclusivity window on competitor promotions.',
 ARRAY['exclusivity','competitors','window'], true, true, 'a', 1, NOW()),

('LC-728-a', NULL, 'notice', 'general',
 'Any notice or approval obligations specified herein must be completed within the stated timelines, including 48-hour editorial approval windows.',
 'low',
 'Reinforces specific timing for notices and approvals.',
 ARRAY['notice','timelines','approval'], false, true, 'a', 1, NOW()),

-- =============================================================================
-- PAYMENT / DELIVERABLES / APPROVALS (729-742)
-- =============================================================================
('LC-729-a', NULL, 'payment_terms', 'financial',
 '[PARTY A] shall pay the Fee of £2,000 + VAT within fourteen (14) days of content approval.',
 'medium',
 'Client must pay Talent within 14 days after content approval.',
 ARRAY['payment','net_14','fee'], true, true, 'a', 1, NOW()),

('LC-729-b', 'LC-729-a', 'payment_terms', 'financial',
 'Late payments will incur a late payment charge.',
 'high',
 'Late payment fees apply if Client misses payment deadline.',
 ARRAY['late_fee','payment_terms'], true, true, 'b', 1, NOW()),

('LC-730-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall deliver one (1) Instagram post and one (1) Instagram Story set of three (3) frames.',
 'medium',
 'Sets the required deliverables: 1 post + 3-frame story.',
 ARRAY['deliverables','instagram','story'], true, true, 'a', 1, NOW()),

('LC-731-a', NULL, 'scope_of_work', 'operational',
 '[PARTY A] shall have one (1) round of reasonable editorial approval, to be issued within forty-eight (48) hours of receipt.',
 'low',
 'Client gets one round of edits and must reply within 48 hours.',
 ARRAY['approval','edits','timelines'], true, true, 'a', 1, NOW()),

('LC-732-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY A] may only re-post or re-gram Social Media Posts and may not use Talent''s name, image, voice, or likeness for any other purpose without written approval.',
 'medium',
 'Brand can repost but cannot use Talent''s likeness in advertising.',
 ARRAY['usage','rights','ip'], true, true, 'a', 1, NOW()),

('LC-733-a', NULL, 'exclusivity', 'relationship',
 '[PARTY B] shall not promote competitor brands for seven (7) days after posting the contracted content.',
 'medium',
 'Competitor exclusivity enforced for 7 days.',
 ARRAY['exclusivity','competitors','cooldown'], true, true, 'a', 1, NOW()),

('LC-734-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] must ensure all content is provided for approval prior to posting on any platform.',
 'low',
 'Talent must submit content before posting.',
 ARRAY['content_submission','approval'], true, true, 'a', 1, NOW()),

('LC-735-a', NULL, 'other', 'relationship',
 'All correspondence between [PARTY A] and [PARTY B] shall be conducted exclusively via the Agency unless written permission is given.',
 'low',
 'Reinforces agency-only communication.',
 ARRAY['communication','agency','process'], true, true, 'a', 1, NOW()),

('LC-736-a', NULL, 'compliance', 'compliance',
 '[PARTY B] must comply with ASA guidance and all applicable advertising regulations.',
 'high',
 'Talent must follow ASA rules.',
 ARRAY['asa','compliance','advertising'], true, true, 'a', 1, NOW()),

('LC-737-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall provide complete analytics for each item of content produced.',
 'low',
 'Talent must supply analytics for all deliverables.',
 ARRAY['analytics','insights','metrics'], true, true, 'a', 1, NOW()),

('LC-738-a', NULL, 'other', 'general',
 'The Territory for this Agreement is strictly the United Kingdom.',
 'low',
 'Defines UK-only territory.',
 ARRAY['territory','uk'], false, true, 'a', 1, NOW()),

('LC-739-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY B] shall retain ownership of all Social Media Posts and associated images, including full copyright.',
 'medium',
 'Talent keeps all IP rights.',
 ARRAY['ip','copyright','ownership'], true, true, 'a', 1, NOW()),

('LC-740-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 'Either party may terminate immediately for material breach if such breach is not cured within fourteen (14) calendar days after written notice (excluding weekends and public holidays in the UK).',
 'medium',
 'Standard 14-day cure period for breach.',
 ARRAY['termination','breach','notice'], true, true, 'a', 1, NOW()),

('LC-741-a', NULL, 'other', 'general',
 'This Agreement is not valid unless signed by the Agency.',
 'low',
 'Reiterates signature requirement.',
 ARRAY['signature','validity'], true, true, 'a', 1, NOW()),

('LC-742-a', NULL, 'other', 'general',
 '[PARTY A] shall provide all relevant campaign information including hashtags, handles, links, and creative direction.',
 'low',
 'Client must provide necessary campaign materials.',
 ARRAY['campaign_materials','requirements'], false, true, 'a', 1, NOW()),

-- =============================================================================
-- COMPLIANCE / USAGE / ANALYTICS (743-756)
-- =============================================================================
('LC-743-a', NULL, 'compliance', 'compliance',
 '[PARTY B] shall use the paid partnership tool and #ad on all required social content.',
 'medium',
 'Requires use of paid partnership tool and #ad on every sponsored post.',
 ARRAY['disclosure','paid_partnership','asa'], true, true, 'a', 1, NOW()),

('LC-744-a', NULL, 'deliverables', 'operational',
 '[PARTY B] must use the campaign hashtags, handles, and URLs exactly as provided by [PARTY A].',
 'low',
 'Talent must follow the campaign metadata requirements.',
 ARRAY['hashtags','handles','metadata'], true, true, 'a', 1, NOW()),

('LC-745-a', NULL, 'scope_of_work', 'operational',
 '[PARTY A] shall only receive one (1) round of reasonable edits and no additional approval rounds unless mutually agreed.',
 'low',
 'Client receives only one round of edits.',
 ARRAY['edits','approval'], true, true, 'a', 1, NOW()),

('LC-746-a', NULL, 'intellectual_property', 'information_protection',
 'Any further use of [PARTY B]''s name, image, likeness, voice, biography, or recordings requires prior written approval from [PARTY B].',
 'high',
 'Restricts extended usage of Talent''s likeness without approval.',
 ARRAY['likeness','usage','ip_rights'], true, true, 'a', 1, NOW()),

('LC-747-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall provide full analytics for each Social Media Post created under the Agreement.',
 'low',
 'Talent must share analytics for all campaign content.',
 ARRAY['analytics','metrics','reporting'], true, true, 'a', 1, NOW()),

('LC-748-a', NULL, 'independent_contractor', 'relationship',
 'The relationship between the parties is that of independent contractors, and neither party may bind the other.',
 'medium',
 'Clarifies that the parties are independent and cannot bind each other.',
 ARRAY['independent_contractor','relationship'], true, true, 'a', 1, NOW()),

('LC-749-a', NULL, 'confidentiality', 'information_protection',
 'Neither party shall disclose the terms of the Agreement except to advisors who need the information or when required by law.',
 'medium',
 'Confidentiality of contract terms unless legally required.',
 ARRAY['confidentiality','non_disclosure'], true, true, 'a', 1, NOW()),

('LC-750-a', NULL, 'non_disparagement', 'relationship',
 'Neither party shall disparage or demean the other, their affiliates, products, or services.',
 'high',
 'Mutual non-disparagement requirement.',
 ARRAY['non_disparagement','conduct'], true, true, 'a', 1, NOW()),

('LC-751-a', NULL, 'governing_law', 'dispute_resolution',
 'This Agreement is governed by the laws of England and Wales and disputes shall be brought exclusively before the English courts.',
 'medium',
 'Defines governing law and jurisdiction.',
 ARRAY['governing_law','jurisdiction','uk'], true, true, 'a', 1, NOW()),

('LC-752-a', NULL, 'entire_agreement', 'general',
 'This Agreement contains the entire understanding between the parties and may only be amended in writing signed by both parties.',
 'low',
 'Defines the entire agreement and amendment rules.',
 ARRAY['entire_agreement','amendment'], true, true, 'a', 1, NOW()),

('LC-753-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 'If either party materially breaches the Agreement and does not cure within fourteen (14) calendar days after written notice, the non-breaching party may terminate the Agreement immediately.',
 'medium',
 '14-day cure for breach with right to immediate termination.',
 ARRAY['termination','breach','notice'], true, true, 'a', 1, NOW()),

('LC-754-a', NULL, 'intellectual_property', 'information_protection',
 'The Social Media Posts and Images are owned by [PARTY B] for the full period of copyright and any extensions.',
 'medium',
 'Talent retains all IP rights indefinitely.',
 ARRAY['ip','ownership','copyright'], true, true, 'a', 1, NOW()),

('LC-755-a', NULL, 'other', 'relationship',
 'The Client shall not contact [PARTY B] directly unless expressly authorised by the Agency.',
 'low',
 'Ensures agency-controlled communication.',
 ARRAY['communication','agency','workflow'], true, true, 'a', 1, NOW()),

('LC-756-a', NULL, 'compliance', 'compliance',
 '[PARTY B] shall familiarise themselves with and comply with UK Advertising Standards Authority rules for social media.',
 'medium',
 'Requires ASA compliance.',
 ARRAY['asa','compliance','advertising_rules'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- ANALYTICS / COMPLIANCE / IP / TERMINATION (770-782)
-- =============================================================================
('LC-770-a', NULL, 'deliverables', 'operational',
 '[PARTY B] must provide analytics for all content created, including reach, impressions, and engagement metrics.',
 'medium',
 'Talent must deliver full analytics for all posts.',
 ARRAY['analytics','metrics','reporting'], true, true, 'a', 1, NOW()),

('LC-771-a', NULL, 'compliance', 'compliance',
 '[PARTY B] must use the paid partnership tool and include #ad on all sponsored content.',
 'high',
 '#ad and paid partnership tool are mandatory for compliance.',
 ARRAY['disclosure','asa','paid_partnership'], true, true, 'a', 1, NOW()),

('LC-772-a', NULL, 'deliverables', 'operational',
 'All content must follow the Client''s visual guidelines, caption rules, and the approved mood board or concept.',
 'medium',
 'Content must match brand guidelines and approved creative direction.',
 ARRAY['brand_guidelines','creative_brief'], true, true, 'a', 1, NOW()),

('LC-773-a', NULL, 'scope_of_work', 'operational',
 'The Client shall have one (1) round of reasonable approval for Social Media Posts, to be given within forty-eight (48) hours after receiving them.',
 'low',
 'Client gets one 48-hour approval round.',
 ARRAY['approvals','timeline'], true, true, 'a', 1, NOW()),

('LC-774-a', NULL, 'intellectual_property', 'information_protection',
 'Any additional use of [PARTY B]''s name, likeness, image, voice, biography, or recordings beyond re-posting requires prior written approval from [PARTY B].',
 'medium',
 'Client cannot use talent likeness outside re-posting without written consent.',
 ARRAY['likeness','usage','consent'], true, true, 'a', 1, NOW()),

('LC-775-a', NULL, 'other', 'relationship',
 'All correspondence with [PARTY B] must go through the Agency. Direct contact with [PARTY B] by [PARTY A] is prohibited unless authorised by the Agency.',
 'low',
 'Client must communicate via the Agency, not directly with Talent.',
 ARRAY['agency','communication'], true, true, 'a', 1, NOW()),

('LC-776-a', NULL, 'deliverables', 'operational',
 '[PARTY B] must send all content to [PARTY A] for approval before it goes live on social media.',
 'medium',
 'Mandatory pre-approval before publishing.',
 ARRAY['content_review','preapproval'], true, true, 'a', 1, NOW()),

('LC-777-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall include the required hashtags and handles in all posts, including #letitsnow #cleanwithme #carpetstains #1001carpetcare and tagging @1001CarpetCare.',
 'low',
 'Defines mandatory hashtags and @mentions.',
 ARRAY['hashtags','handles','social_media'], true, true, 'a', 1, NOW()),

('LC-778-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall create the Services using products provided by [PARTY A], including Carpet Freshening and Cleaning Products.',
 'low',
 'Confirms product usage requirements.',
 ARRAY['product_usage','deliverables'], true, true, 'a', 1, NOW()),

('LC-779-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 'Either party may terminate immediately if the other fails to remedy a material breach within fourteen (14) days of written notice.',
 'high',
 'Termination for uncured breach within 14 days.',
 ARRAY['termination','material_breach','cure_period'], true, true, 'a', 1, NOW()),

('LC-780-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY B] retains ownership of all Social Media Posts and Images for the full period of copyright and any possible extensions.',
 'medium',
 'Talent retains full copyright.',
 ARRAY['ip','ownership','copyright'], true, true, 'a', 1, NOW()),

('LC-781-a', NULL, 'compliance', 'compliance',
 '[PARTY B] shall familiarise themselves with and comply with ASA guidance on social media advertising.',
 'high',
 'Requires compliance with UK ASA rules.',
 ARRAY['asa','advertising','compliance'], true, true, 'a', 1, NOW()),

('LC-782-a', NULL, 'governing_law', 'dispute_resolution',
 'This Agreement is governed by the laws of England and Wales and subject to exclusive jurisdiction of the English courts.',
 'medium',
 'Reaffirms governing law and jurisdiction rules.',
 ARRAY['governing_law','jurisdiction'], true, true, 'a', 1, NOW());

-- =============================================================================
-- Summary:
--   72 clauses total (71 base, 1 variant)
--   UK-based contract using ASA compliance (not FTC)
--   Notable: Agency-mediated communication, 14-day cure periods,
--            Talent retains full IP ownership
--   Gap: LC-757 to LC-769 unused (reserved)
-- =============================================================================
