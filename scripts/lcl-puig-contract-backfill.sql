-- =============================================================================
-- LCL Backfill: Puig / Carolina Herrera Influencer Agreement
-- Block: LC-600 → LC-699
-- Total: 38 clauses (32 base, 6 variants)
-- Generated: 2025-11-27
-- =============================================================================
-- Topic Blocks:
--   600-609: Deliverables
--   610-619: Approvals / Scope of Work
--   620-629: Compliance / IP / Payment / Termination
-- =============================================================================

INSERT INTO legal_clause_library (
  clause_id, parent_clause_id, clause_type, category, standard_text,
  risk_level, plain_english_summary, tags, is_required, is_approved,
  variation_letter, version, created_at
) VALUES

-- =============================================================================
-- DELIVERABLES (600-609)
-- =============================================================================
('LC-600-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall create original social and digital content for the Program according to the specifications mutually agreed during the Term.',
 'medium',
 '[PARTY B] must create original social content aligned with Program expectations.',
 ARRAY['deliverables','original_content'], true, true, 'a', 1, NOW()),

('LC-601-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall issue one pre-approved Instagram Carousel Post of at least three frames following all image and video guidelines provided by [PARTY A].',
 'medium',
 '[PARTY B] must publish one approved three-frame Instagram carousel.',
 ARRAY['instagram','carousel','deliverables'], true, true, 'a', 1, NOW()),

('LC-602-a', NULL, 'deliverables', 'operational',
 '[PARTY B] must submit two edited image options per carousel frame for [PARTY A]''s review.',
 'medium',
 '[PARTY B] must provide two edited options for each carousel frame.',
 ARRAY['instagram','options','review'], true, true, 'a', 1, NOW()),

('LC-603-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall issue one pre-approved TikTok Video Post of 15 to 30 seconds following image and video guidelines provided by [PARTY A].',
 'medium',
 '[PARTY B] must publish one 15–30 second TikTok video following brand guidelines.',
 ARRAY['tiktok','video','deliverables'], true, true, 'a', 1, NOW()),

('LC-604-a', NULL, 'deliverables', 'operational',
 '[PARTY B] must submit two edited video options for the TikTok Post for [PARTY A]''s review.',
 'medium',
 '[PARTY B] must provide two edited TikTok video options.',
 ARRAY['tiktok','options','review'], true, true, 'a', 1, NOW()),

('LC-605-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall issue one multi-frame Instagram Story Set of at least three frames, each approved in advance by [PARTY A].',
 'medium',
 '[PARTY B] must publish a three-frame Instagram Story set with prior approval.',
 ARRAY['instagram_story','deliverables'], true, true, 'a', 1, NOW()),

('LC-606-a', NULL, 'deliverables', 'operational',
 'One Instagram Story frame must include a link sticker or swipe-up link and additional Social Messages provided by [PARTY A].',
 'medium',
 '[PARTY B] must include a required link sticker or swipe-up link in one Story frame.',
 ARRAY['instagram_story','link_sticker'], true, true, 'a', 1, NOW()),

('LC-607-a', NULL, 'deliverables', 'operational',
 '[PARTY B] must submit two edited image options per Instagram Story frame for [PARTY A]''s approval.',
 'medium',
 '[PARTY B] must provide two edited options for each Story frame.',
 ARRAY['instagram_story','options','review'], true, true, 'a', 1, NOW()),

('LC-608-a', NULL, 'scope_of_work', 'operational',
 '[PARTY A] shall be permitted up to two rounds of edits or cuts for any submitted content options.',
 'medium',
 '[PARTY A] may request up to two rounds of edits.',
 ARRAY['edits','approvals'], true, true, 'a', 1, NOW()),

('LC-609-a', NULL, 'scope_of_work', 'operational',
 'If [PARTY B] is requested to reshoot due to not following the brief, mood board, or creative direction, [PARTY B] must submit new reshoot options.',
 'high',
 '[PARTY B] must reshoot content if they deviate from approved creative direction.',
 ARRAY['reshoot','creative_direction'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- APPROVALS / SCOPE OF WORK (610-619)
-- =============================================================================
('LC-610-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall submit one detailed mood board outlining creative concept, product integration, wardrobe, proposed settings, and image references for [PARTY A]''s approval prior to shooting.',
 'medium',
 '[PARTY B] must deliver and obtain approval for a detailed mood board before filming.',
 ARRAY['mood_board','approvals','creative_direction'], true, true, 'a', 1, NOW()),

('LC-611-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] must obtain [PARTY A]''s advance approval for the date, time, and text of all Social Messages.',
 'medium',
 'All posting dates, times, and captions require prior approval.',
 ARRAY['approvals','posting_schedule'], true, true, 'a', 1, NOW()),

('LC-612-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall follow all image and video guidelines and creative direction provided by [PARTY A] for every piece of Content.',
 'medium',
 '[PARTY B] must adhere to brand visual and creative guidelines for all deliverables.',
 ARRAY['creative_guidelines','visual_standards'], true, true, 'a', 1, NOW()),

('LC-613-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall ensure that all Content and captions are free of typographical errors, incorrect grammar, or non-functioning links.',
 'medium',
 'Content must contain no errors or broken links.',
 ARRAY['quality_control','caption_standards'], true, true, 'a', 1, NOW()),

('LC-613-b', 'LC-613-a', 'scope_of_work', 'operational',
 'If a post is published with an incorrect caption, [PARTY B] must delete and repost it with the correct approved caption.',
 'medium',
 'Incorrect captions require deletion and reposting.',
 ARRAY['caption_error','reposting_requirement'], true, true, 'b', 1, NOW()),

('LC-614-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall follow all brand visual and caption guidelines for sponsored Content and ensure any revisions or reshoots reflect the original request.',
 'medium',
 'Revisions and reshoots must meet brand guidelines and the original brief.',
 ARRAY['reshoots','brand_guidelines'], true, true, 'a', 1, NOW()),

('LC-615-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall deliver high-resolution images and videos with text overlay, royalty-free audio or voiceover, and the corresponding captions for [PARTY A]''s approval.',
 'high',
 '[PARTY B] must deliver high-quality, rights-cleared final assets with captions.',
 ARRAY['hi_res','audio_rights','final_assets'], true, true, 'a', 1, NOW()),

('LC-615-b', 'LC-615-a', 'deliverables', 'operational',
 'Following approval, [PARTY B] must also provide all approved content in both versions: with text overlay and without text overlay.',
 'medium',
 'Approved content must be delivered in two versions—one with overlays and one clean.',
 ARRAY['clean_assets','overlay_version'], true, true, 'b', 1, NOW()),

('LC-616-a', NULL, 'deliverables', 'operational',
 '[PARTY B] shall provide screenshots of analytics for each post, including reach, impressions, engagement, and link clicks, within one week of publication.',
 'medium',
 'Analytics screenshots must be provided within one week.',
 ARRAY['analytics','metrics','reporting'], true, true, 'a', 1, NOW()),

('LC-617-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall not publish additional in-feed TikTok or Instagram posts of any kind for six hours before or after posting Program Content.',
 'medium',
 'Posting freeze: six hours before and after sponsored posts.',
 ARRAY['posting_blackout','schedule_control'], true, true, 'a', 1, NOW()),

('LC-618-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] may not delete any Program-related posts from TikTok or Instagram without written approval from [PARTY A].',
 'high',
 'Posts cannot be removed without written brand approval.',
 ARRAY['takedown','post_removal'], true, true, 'a', 1, NOW()),

('LC-619-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall not sell or transfer any products provided by [PARTY A] unless explicitly permitted by [PARTY A].',
 'medium',
 '[PARTY B] cannot sell or gift brand-provided products without approval.',
 ARRAY['product_handling','gifting'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- COMPLIANCE / FTC (620-621)
-- =============================================================================
('LC-620-a', NULL, 'compliance', 'compliance',
 '[PARTY B] shall follow the Federal Trade Commission guidelines on social messages, testimonials, and endorsements for all Program content.',
 'high',
 '[PARTY B] must comply with FTC endorsement and testimonial rules for every sponsored post.',
 ARRAY['ftc','endorsements','regulatory'], true, true, 'a', 1, NOW()),

('LC-620-b', 'LC-620-a', 'compliance', 'compliance',
 '[PARTY B] must explicitly disclose [PARTY B]''s paid relationship with [PARTY A] on each piece of social content using "ad" and/or the branded content toggle or paid partnership tool as directed by [PARTY A].',
 'high',
 'Each post must clearly disclose that it is an ad or paid partnership, using tools and wording required by [PARTY A].',
 ARRAY['ftc','disclosure','paid_partnership'], true, true, 'b', 1, NOW()),

('LC-621-a', NULL, 'warranty', 'liability',
 '[PARTY B] warrants that all Content supplied under the Program is unique, original, and has not been previously published unless otherwise agreed in writing.',
 'high',
 '[PARTY B] promises the content is original and not previously published unless the parties agree otherwise.',
 ARRAY['originality','warranty','content'], true, true, 'a', 1, NOW()),

('LC-621-b', 'LC-621-a', 'scope_of_work', 'operational',
 'All Content and captions created by [PARTY B] for the Program shall be submitted to [PARTY A] for pre-approval before posting.',
 'medium',
 'Nothing goes live until [PARTY A] has approved the content and captions.',
 ARRAY['approvals','pre_approval'], true, true, 'b', 1, NOW()),

-- =============================================================================
-- INTELLECTUAL PROPERTY (622, 625)
-- =============================================================================
('LC-622-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY B] must use only royalty-free music or original audio or voiceover in all Program Content.',
 'high',
 'Music and audio used in content must be royalty-free or created by [PARTY B] to avoid IP issues.',
 ARRAY['music','ip','audio_rights'], true, true, 'a', 1, NOW()),

('LC-625-a', NULL, 'intellectual_property', 'information_protection',
 '[PARTY A] and its affiliates and retail partners may re-share, re-post, and reference [PARTY B]''s Program social posts with credit on their owned and operated social and digital outlets for up to sixty (60) days following the original post publication.',
 'medium',
 'Brand, parent, and retail partners can repost and reference the content with credit for 60 days on their own channels.',
 ARRAY['usage_rights','resharing','social_media'], true, true, 'a', 1, NOW()),

('LC-625-b', 'LC-625-a', 'intellectual_property', 'information_protection',
 '[PARTY A]''s rights to use [PARTY B]''s social media posts under the Program exclude any use in standard advertising such as television, radio, or print unless separately agreed.',
 'medium',
 'Usage rights do not extend to traditional paid ads like TV, radio, or print.',
 ARRAY['usage_limitations','traditional_media'], true, true, 'b', 1, NOW()),

-- =============================================================================
-- ENGAGEMENT / SCOPE (623)
-- =============================================================================
('LC-623-a', NULL, 'scope_of_work', 'operational',
 '[PARTY B] shall keep comments enabled and the number of likes visible on all Program Posts.',
 'medium',
 '[PARTY B] cannot hide comments or like counts on sponsored posts.',
 ARRAY['engagement','comments','likes'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- EXCLUSIVITY (624)
-- =============================================================================
('LC-624-a', NULL, 'exclusivity', 'relationship',
 '[PARTY B] shall not authorize use of [PARTY B]''s image rights or furnish services for advertisement, promotion, or endorsement of fragrance category competitor products, in paid or unpaid capacity, for forty-eight (48) hours before and forty-eight (48) hours after the Program-sponsored post on [PARTY B]''s Instagram page, unless agreed in writing by [PARTY A].',
 'high',
 '[PARTY B] is exclusive to [PARTY A]''s fragrance brand on Instagram for a 96-hour window around the sponsored post.',
 ARRAY['exclusivity','fragrance','instagram'], true, true, 'a', 1, NOW()),

('LC-624-b', 'LC-624-a', 'exclusivity', 'relationship',
 '[PARTY B] shall not authorize use of [PARTY B]''s image rights or furnish services for advertisement, promotion, or endorsement of competitor products in the fragrance and beauty categories, in paid or unpaid capacity, for two videos before and two videos after the Program-sponsored post on [PARTY B]''s TikTok page, unless agreed in writing by [PARTY A].',
 'high',
 '[PARTY B] must avoid competitor fragrance and beauty deals on TikTok for two videos before and after the sponsored content.',
 ARRAY['exclusivity','fragrance','beauty','tiktok'], true, true, 'b', 1, NOW()),

-- =============================================================================
-- PAYMENT TERMS (626)
-- =============================================================================
('LC-626-a', NULL, 'payment_terms', 'financial',
 '[PARTY B] shall be paid a total fee of [AMOUNT], with one hundred percent (100%) due within seventy-five (75) days of completion of the services outlined in the Agreement and submission of all documents required for payment.',
 'medium',
 '[PARTY B] is paid the full fee within 75 days after completing services and providing required paperwork.',
 ARRAY['fee','net_75','completion'], true, true, 'a', 1, NOW()),

('LC-626-b', 'LC-626-a', 'payment_terms', 'financial',
 'As a condition to payment, [PARTY B] shall provide [PARTY A] with an invoice and any required tax forms, including a W9 or equivalent.',
 'medium',
 'Payment depends on [PARTY B] issuing an invoice and supplying tax documentation.',
 ARRAY['invoice','tax_forms','condition_precedent'], true, true, 'b', 1, NOW()),

-- =============================================================================
-- TERMINATION (627-628)
-- =============================================================================
('LC-627-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 'If during the Term [PARTY A] has requested services and [PARTY B] is professionally unavailable or does not complete the full list of Services for any reason (other than as otherwise excused), [PARTY A] may immediately terminate the Agreement, whereupon all Services shall cease and [PARTY A] shall owe [PARTY B] only a pro-rata fee for completed work as solely determined by [PARTY A].',
 'high',
 'If [PARTY B] is unavailable or fails to complete services, [PARTY A] can terminate immediately and pay only a pro-rated amount it decides.',
 ARRAY['termination','nonperformance','pro_rata'], true, true, 'a', 1, NOW()),

('LC-627-b', 'LC-627-a', 'scope_of_work', 'contract_lifecycle',
 'In lieu of immediate termination for incomplete Services, [PARTY A] may elect to utilize [PARTY B]''s Services beyond the original Term until Program Services are complete.',
 'medium',
 'Instead of terminating, [PARTY A] can extend performance beyond the nominal Term until work is finished.',
 ARRAY['term_extension','services_completion'], true, true, 'b', 1, NOW()),

('LC-628-a', NULL, 'termination_for_convenience', 'contract_lifecycle',
 '[PARTY A] may terminate the Agreement for any reason by giving [PARTY B] thirty (30) days written notice, in which case [PARTY A] shall owe [PARTY B] a pro-rata fee for completed work as solely determined by [PARTY A].',
 'medium',
 '[PARTY A] can end the deal on 30 days notice and pay only for work done up to termination.',
 ARRAY['termination_for_convenience','notice_30_days','pro_rata'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- INDEPENDENT CONTRACTOR (629)
-- =============================================================================
('LC-629-a', NULL, 'independent_contractor', 'relationship',
 'The parties are independent contractors, and nothing in the Agreement creates a partnership, joint venture, employer-employee, or principal-agent relationship, nor does it make either party liable for the other''s obligations or liabilities.',
 'medium',
 'Clarifies that the relationship is independent contractor only, with no partnership or employment status.',
 ARRAY['independent_contractor','relationship'], true, true, 'a', 1, NOW());

-- =============================================================================
-- Summary:
--   38 clauses total (32 base, 6 variants)
--   Sections covered: Deliverables, Approvals/Scope, Compliance/FTC,
--                     IP/Usage Rights, Exclusivity, Payment, Termination
-- =============================================================================
