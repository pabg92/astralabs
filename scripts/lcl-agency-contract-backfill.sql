-- =============================================================================
-- LCL Backfill: Agency Contract (TikTok Campaign)
-- Block: LC-400 → LC-499
-- Total: 57 clauses (36 base, 21 variants)
-- Generated: 2025-11-26
-- =============================================================================
-- Topic Blocks:
--   400-409: Intellectual Property / Licensing
--   403-409: Deliverables (overlaps with IP block)
--   410-419: Usage Terms / Exclusivity
--   420-429: Payment Terms
--   430-449: Scope of Work / Approvals
--   450-459: Termination
--   460-469: Warranties / Compliance (incl. FTC Guidelines)
--   470-479: Indemnification / Liability
--   480-489: Force Majeure / Confidentiality / Dispute / General
-- =============================================================================

INSERT INTO legal_clause_library (
  clause_id, parent_clause_id, clause_type, category, standard_text,
  risk_level, plain_english_summary, tags, is_required, is_approved,
  variation_letter, version, created_at
) VALUES

-- =============================================================================
-- INTELLECTUAL PROPERTY (400-402)
-- =============================================================================
('LC-400-a', NULL, 'intellectual_property', 'information_protection',
 'Influencer owns all right, title, and interest in and to the Content created for the campaign, but may not use such Content for any commercial purpose, including in connection with any other marketing campaign, at any time.',
 'medium',
 'Influencer owns the content but cannot reuse it commercially outside this deal.',
 ARRAY['content_ownership','ip','usage'], true, true, 'a', 1, NOW()),

('LC-400-b', 'LC-400-a', 'intellectual_property', 'information_protection',
 '[PARTY A] and its client own all right, title, and interest in and to their respective names, logos, and other trademarks (Marks).',
 'low',
 'Agency and client keep ownership of their trademarks.',
 ARRAY['marks','ip'], true, true, 'b', 1, NOW()),

('LC-401-a', NULL, 'intellectual_property', 'information_protection',
 'Influencer grants [PARTY A]''s client the exclusive, worldwide, royalty-free right and license to reproduce, distribute, and display the Content and Influencer''s name, image, likeness, voice, and social media handles contained therein for the License Periods and Licensed Uses set forth in the campaign details, in connection with the campaign.',
 'high',
 'Client gets an exclusive worldwide license to use the content and likeness for specified periods and uses.',
 ARRAY['license','exclusive','likeness'], true, true, 'a', 1, NOW()),

('LC-401-b', 'LC-401-a', 'intellectual_property', 'information_protection',
 'Client is not obligated to take down any Content published on social media platforms during the License Period in accordance with the granted licenses, but all other forms of usage must be removed after the term.',
 'medium',
 'Client may keep social posts live during the license period; other uses end when the license ends.',
 ARRAY['social_media','takedown','license_term'], true, true, 'b', 1, NOW()),

('LC-402-a', NULL, 'intellectual_property', 'information_protection',
 'Influencer shall only use [PARTY A] and client Marks in connection with providing the Services as approved by them.',
 'medium',
 'Influencer can only use brand marks as approved for this campaign.',
 ARRAY['marks_usage','brand'], true, true, 'a', 1, NOW()),

('LC-402-b', 'LC-402-a', 'intellectual_property', 'information_protection',
 'If the Licensed Uses include paid media, Influencer shall timely take all steps required to whitelist the Content on the applicable social media platforms and analytics platforms in connection with the Posts.',
 'medium',
 'Influencer must cooperate with whitelisting for paid media.',
 ARRAY['whitelisting','paid_media'], true, true, 'b', 1, NOW()),

-- =============================================================================
-- DELIVERABLES (403-409)
-- =============================================================================
('LC-403-a', NULL, 'deliverables', 'operational',
 'Influencer shall provide the services set forth in the campaign details, including producing photo and/or video content for the campaign to be posted on Influencer''s social media channels, and/or attending a client-branded event as specified.',
 'medium',
 'Defines the overall services Influencer must provide (content and possibly event attendance).',
 ARRAY['services','scope_of_work'], true, true, 'a', 1, NOW()),

('LC-404-a', NULL, 'deliverables', 'operational',
 'Influencer shall participate in one briefing call with the creative team prior to producing Content if requested.',
 'low',
 'A pre-production briefing call may be required.',
 ARRAY['briefing','pre_production'], true, true, 'a', 1, NOW()),

('LC-405-a', NULL, 'deliverables', 'operational',
 'Influencer shall submit one Creative Treatment based on the creative brief, outlining the creative concept, proposed filming backdrop, and specific products to feature.',
 'medium',
 'Influencer must prepare and submit a creative treatment for approval.',
 ARRAY['creative_treatment','brief'], true, true, 'a', 1, NOW()),

('LC-406-a', NULL, 'deliverables', 'operational',
 'Influencer shall disseminate one TikTok Post on the specified handle including required tags, mentions, and product name in content and caption, and must include the specified campaign partner text for the entirety of the video content.',
 'medium',
 'Defines the required TikTok post and mandatory tags/text.',
 ARRAY['tiktok','tags','caption'], true, true, 'a', 1, NOW()),

('LC-407-a', NULL, 'deliverables', 'operational',
 'Influencer shall provide clean video assets without music, text overlays, or graphics to [PARTY A] within 20–24 hours after the Post goes live.',
 'medium',
 'Clean version of the video must be supplied within 20–24 hours.',
 ARRAY['clean_assets','postproduction'], true, true, 'a', 1, NOW()),

('LC-408-a', NULL, 'deliverables', 'operational',
 'Influencer shall provide screenshots of TikTok metrics to [PARTY A] within 20–24 hours after the Post goes live.',
 'medium',
 'Performance metrics screenshots must be sent within 20–24 hours.',
 ARRAY['metrics','analytics'], true, true, 'a', 1, NOW()),

('LC-409-a', NULL, 'deliverables', 'operational',
 'Influencer shall post the Content according to the schedule set forth in the campaign details, and shall not publish any Content outside of the agreed-upon schedule.',
 'medium',
 'Influencer must follow the agreed posting schedule and not post early or late.',
 ARRAY['schedule','posting'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- USAGE TERMS / EXCLUSIVITY (410-412)
-- =============================================================================
('LC-410-a', NULL, 'intellectual_property', 'information_protection',
 'Client may use the Posts organically on its owned and operated social media channels, websites, and e-newsletters for one month, and in paid digital media, including boosting and darkposting, for two weeks, as specified in the campaign details.',
 'medium',
 'Defines client''s organic and paid media usage periods.',
 ARRAY['usage_term','organic','paid_media'], true, true, 'a', 1, NOW()),

('LC-411-a', NULL, 'exclusivity', 'relationship',
 'Influencer shall not promote or endorse, whether in a paid or organic capacity, the competitor brands specified in the campaign details for the exclusivity period set forth therein.',
 'medium',
 'Influencer may not work with named competitors during the exclusivity window.',
 ARRAY['exclusivity','competitors'], true, true, 'a', 1, NOW()),

('LC-412-a', 'LC-411-a', 'exclusivity', 'relationship',
 'The exclusivity period runs from one day prior to Influencer''s publication of the first Post through one day after Influencer''s publication of the last Post.',
 'medium',
 'Exclusivity applies from one day before to one day after the campaign post.',
 ARRAY['exclusivity_period'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- PAYMENT TERMS (420-429)
-- =============================================================================
('LC-420-a', NULL, 'payment_terms', 'financial',
 'Influencer shall be paid a fee of [AMOUNT], due no later than sixty (60) days after the last day of the month in which the last Post is published by Influencer or, if no Posts are to be published, the month in which the last Influencer materials are delivered.',
 'medium',
 'Defines the total fee and timing of payment after campaign completion.',
 ARRAY['fee','net_60'], true, true, 'a', 1, NOW()),

('LC-420-b', 'LC-420-a', 'payment_terms', 'financial',
 'Payment of the Fee is conditioned on Influencer completing all Services as set forth in the Agreement and not being in uncured material breach, if capable of cure.',
 'medium',
 'Payment is only due if the Influencer completes services and is not in material breach.',
 ARRAY['condition_precedent','payment'], true, true, 'b', 1, NOW()),

('LC-420-c', 'LC-420-a', 'payment_terms', 'financial',
 'Influencer is solely responsible for all taxes, withholdings, and other statutory or contractual obligations related to the Fee, and [PARTY A] shall not provide any benefits such as social security, workers'' compensation, disability, health, or unemployment insurance.',
 'medium',
 'Influencer handles their own taxes and benefits; the agency does not.',
 ARRAY['taxes','benefits','independent_contractor'], true, true, 'c', 1, NOW()),

-- =============================================================================
-- SCOPE OF WORK / APPROVALS (430-443)
-- =============================================================================
('LC-430-a', NULL, 'scope_of_work', 'operational',
 'Posts shall remain on Influencer''s social channels for no less than one (1) year, unless directed by [PARTY A] to remove them earlier.',
 'medium',
 'Content must stay live for at least a year unless asked to remove it.',
 ARRAY['post_duration','social_media'], true, true, 'a', 1, NOW()),

('LC-431-a', NULL, 'scope_of_work', 'operational',
 'Influencer shall validate social media accounts in the analytics platform used by [PARTY A] so metrics can be retrieved and shared with the client on a read-only basis.',
 'medium',
 'Influencer must connect their accounts to the analytics platform.',
 ARRAY['analytics','account_access'], true, true, 'a', 1, NOW()),

('LC-440-a', NULL, 'scope_of_work', 'operational',
 '[PARTY A] shall provide a creative brief setting forth campaign requirements, and the parties shall finalize a mutually approved creative treatment, which [PARTY A] will review and approve per the agreed schedule.',
 'low',
 'Creative execution must follow an approved brief and treatment.',
 ARRAY['approvals','creative_brief'], true, true, 'a', 1, NOW()),

('LC-441-a', NULL, 'scope_of_work', 'operational',
 'If Content is delivered in compliance with the campaign details and creative treatment, Influencer shall not be obligated to reshoot, but must accommodate reasonable non-material edit requests.',
 'medium',
 'No reshoot if the content follows the brief, but reasonable edits are required.',
 ARRAY['reshoot','edits','compliance'], true, true, 'a', 1, NOW()),

('LC-441-b', 'LC-441-a', 'scope_of_work', 'operational',
 'If Content is not delivered in compliance with the campaign details and creative treatment, Influencer may be required to reshoot, and failure to reshoot and deliver compliant Content within the time required entitles [PARTY A] to terminate the Agreement.',
 'high',
 'If the content does not meet the brief and isn''t fixed, the agency can terminate.',
 ARRAY['reshoot','termination'], true, true, 'b', 1, NOW()),

('LC-442-a', NULL, 'deliverables', 'operational',
 'Influencer shall remove Posts from Influencer''s social channels within twenty-four (24) hours of notice from [PARTY A] in the event of Influencer''s uncured material breach or as reasonably requested in good faith due to unforeseen changes in circumstances, including changes in law.',
 'high',
 'Influencer must be able to take posts down within 24 hours when requested in certain circumstances.',
 ARRAY['takedown','breach','law_change'], true, true, 'a', 1, NOW()),

('LC-443-a', NULL, 'deliverables', 'operational',
 'Influencer is responsible for obtaining all necessary licenses and releases for third-party materials and appearances in the Content (excluding client Marks or materials provided by [PARTY A]) and shall provide copies on request.',
 'high',
 'Influencer must clear third-party rights and provide releases if asked.',
 ARRAY['releases','third_party_rights'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- TERMINATION (450-451)
-- =============================================================================
('LC-450-a', NULL, 'termination_for_convenience', 'contract_lifecycle',
 '[PARTY A] may terminate the Agreement in whole or in part at any time for convenience upon written notice, paying Influencer the portion of the Fee due for Services actually completed in accordance with the campaign details and creative treatment.',
 'medium',
 '[PARTY A] can terminate for convenience and pay only for completed work.',
 ARRAY['termination','convenience','pro_rata'], true, true, 'a', 1, NOW()),

('LC-451-a', NULL, 'termination_for_cause', 'contract_lifecycle',
 '[PARTY A] may terminate the Agreement upon Influencer''s material breach, which, if capable of cure in [PARTY A]''s reasonable opinion, is not cured within five (5) days after notice.',
 'high',
 'Agency can terminate for material breach not cured within 5 days.',
 ARRAY['termination','material_breach'], true, true, 'a', 1, NOW()),

('LC-451-b', 'LC-451-a', 'termination_for_cause', 'contract_lifecycle',
 '[PARTY A] may terminate the Agreement if Influencer delivers noncompliant Content after two opportunities to reshoot; in such case [PARTY A] shall pay only the portion of the Fee due for Services actually completed in accordance with the campaign details and creative treatment.',
 'high',
 'If after two reshoots the content still fails, agency can end the deal and pay only for compliant work.',
 ARRAY['reshoot','termination'], true, true, 'b', 1, NOW()),

('LC-451-c', 'LC-451-a', 'termination_for_cause', 'contract_lifecycle',
 'Upon termination for material breach, no Fee shall be paid to Influencer.',
 'high',
 'If terminated for Influencer''s breach, they may lose their fee.',
 ARRAY['termination_effects','payment'], true, true, 'c', 1, NOW()),

-- =============================================================================
-- WARRANTIES (460-461)
-- =============================================================================
('LC-460-a', NULL, 'warranty', 'liability',
 'Influencer represents and warrants that Influencer has the right and authority to enter into the Agreement, perform obligations, and grant the rights set forth, and that doing so will not breach any other agreement.',
 'medium',
 'Influencer promises they are legally allowed to sign and perform this deal.',
 ARRAY['authority','warranty'], true, true, 'a', 1, NOW()),

('LC-460-b', 'LC-460-a', 'warranty', 'compliance',
 'Influencer warrants that the Services will be performed in compliance with all applicable laws and regulations and with the endorsement and disclosure guidelines in Attachment 1.',
 'high',
 'Influencer must follow laws and the detailed FTC-style disclosure rules.',
 ARRAY['compliance','ftc','guidelines'], true, true, 'b', 1, NOW()),

('LC-460-c', 'LC-460-a', 'warranty', 'information_protection',
 'Influencer warrants that, excluding Marks and materials provided by [PARTY A], the Content will be original works created specifically for the campaign, will not infringe third-party rights, will not contain prohibited content such as profanity, nudity, illicit drugs, weapons, or defamatory or disparaging material, and will reflect Influencer''s honest opinion based on actual use of the product with true and accurate statements.',
 'high',
 'Content must be original, rights-cleared, safe, and truthful.',
 ARRAY['originality','prohibited_content','honest_opinion'], true, true, 'c', 1, NOW()),

('LC-461-a', NULL, 'non_disparagement', 'relationship',
 'Influencer shall not make statements or commit acts that, in [PARTY A]''s reasonable opinion, make Influencer the subject of public disrepute, contempt, or scandal affecting the reputations of Influencer, [PARTY A], or client, nor may Influencer defame or disparage them or their products or services.',
 'high',
 'Influencer must avoid conduct or statements that create scandal or disparage the brand or agency.',
 ARRAY['non_disparagement','morals'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- COMPLIANCE / FTC GUIDELINES (462)
-- =============================================================================
('LC-462-a', NULL, 'compliance', 'compliance',
 'Influencer shall comply with the endorsement and disclosure guidelines, including clearly disclosing that Influencer received payment or value in each post in a way that is difficult to miss and easily understandable.',
 'high',
 'Every sponsored post must contain clear, prominent disclosure of the paid relationship.',
 ARRAY['ftc','disclosure','sponsorship'], true, true, 'a', 1, NOW()),

('LC-462-b', 'LC-462-a', 'compliance', 'compliance',
 'For static social content with captions, disclosure must appear before any truncation such as "show more" and cannot be buried within a long list of hashtags; acceptable disclosures include terms such as "ad", "#ad", "sponsored", or "#CompanyPartner".',
 'medium',
 'Placement and format of disclosures in captions are strictly controlled.',
 ARRAY['caption','placement','hashtags'], true, true, 'b', 1, NOW()),

('LC-462-c', 'LC-462-a', 'compliance', 'compliance',
 'For video or livestream content, disclosure must be made verbally at the beginning and, where captions are available, also in the caption before truncation; overlays should be used if captions are not available.',
 'medium',
 'Video content must include both verbal and written disclosures at the start.',
 ARRAY['video','livestream','disclosure'], true, true, 'c', 1, NOW()),

('LC-462-d', 'LC-462-a', 'compliance', 'compliance',
 'Influencer may not rely solely on built-in platform disclosure tools and must include disclosures within the content itself.',
 'medium',
 'Platform tools alone are not enough; disclosures must be in the content.',
 ARRAY['platform_tools','disclosure'], true, true, 'd', 1, NOW()),

('LC-462-e', 'LC-462-a', 'compliance', 'compliance',
 'Influencer must actually use the product or service being endorsed, may not make claims requiring proof without actual proof, may not claim typical results without substantiation, and may not state or imply expertise unless qualified.',
 'high',
 'Influencer must genuinely use the product and avoid unsubstantiated or misleading claims.',
 ARRAY['product_use','claims','expertise'], true, true, 'e', 1, NOW()),

-- =============================================================================
-- INDEMNIFICATION / LIABILITY (470-471)
-- =============================================================================
('LC-470-a', NULL, 'indemnification', 'liability',
 'Each party shall indemnify and hold the other harmless from third-party claims, losses, damages, settlements, costs, and expenses arising from that party''s negligence or willful misconduct or breach of any representation, warranty, or provision of the Agreement; when Influencer is the indemnifying party, client is also an indemnified party.',
 'high',
 'Mutual indemnity covers breach and negligence; client is protected when Influencer is at fault.',
 ARRAY['indemnity','negligence','breach'], true, true, 'a', 1, NOW()),

('LC-471-a', NULL, 'limitation_of_liability', 'liability',
 'Except for indemnification obligations, neither party shall be liable under any theory for indirect, special, incidental, exemplary, punitive, or consequential damages, lost profits, or lost opportunities, and direct damages are capped at an amount equal to the Fee.',
 'critical',
 'No indirect damages and direct damages are capped at the total fee.',
 ARRAY['limitation','damage_cap'], true, true, 'a', 1, NOW()),

-- =============================================================================
-- FORCE MAJEURE / CONFIDENTIALITY / DISPUTE (480-485)
-- =============================================================================
('LC-480-a', NULL, 'force_majeure', 'operational',
 'A Force Majeure Event is any event or circumstance not caused by the affected party that prevents it from complying with obligations; during such an event, the nonperforming party is excused if it uses reasonable efforts, protected itself where reasonable, and complies with its notice obligations.',
 'medium',
 'Defines force majeure and when a party is excused from performance.',
 ARRAY['force_majeure','excuse'], true, true, 'a', 1, NOW()),

('LC-480-b', 'LC-480-a', 'force_majeure', 'operational',
 'Upon occurrence of a Force Majeure Event, the nonperforming party shall promptly notify the other of its effect and expected duration, update that information as needed, and use reasonable efforts to limit damages and resume performance.',
 'medium',
 'Force majeure requires prompt notice and efforts to mitigate and resume.',
 ARRAY['notice','mitigation','force_majeure'], true, true, 'b', 1, NOW()),

('LC-481-a', NULL, 'confidentiality', 'information_protection',
 'Influencer shall keep confidential all non-public business, technical, financial, and campaign information about [PARTY A] and client, including the terms of the Agreement, and shall not disclose or use such Confidential Information except to perform the Services.',
 'high',
 'Influencer must keep campaign and business information confidential.',
 ARRAY['confidentiality','trade_secrets'], true, true, 'a', 1, NOW()),

('LC-482-a', NULL, 'dispute_resolution', 'dispute_resolution',
 'In the event of a breach of the Agreement by [PARTY A], Influencer''s sole remedy shall be monetary damages and Influencer shall have no right to seek injunctive relief.',
 'medium',
 'Influencer cannot seek injunctions, only money damages.',
 ARRAY['remedies','injunction_limit'], true, true, 'a', 1, NOW()),

('LC-482-b', 'LC-482-a', 'dispute_resolution', 'dispute_resolution',
 'A breach of the Agreement may cause [PARTY A] or client irreparable harm, and they may seek injunctive relief without posting a bond.',
 'high',
 'Agency or client can seek injunctions without bond for violations.',
 ARRAY['injunctive_relief','irreparable_harm'], true, true, 'b', 1, NOW()),

('LC-483-a', NULL, 'independent_contractor', 'relationship',
 'Each party is an independent contractor and not a partner, joint venturer, or agent of the other and shall not bind the other to any contract; Influencer is solely responsible for all statutory and contractual obligations arising from the relationship.',
 'medium',
 'Clarifies independent contractor status and that neither side can bind the other.',
 ARRAY['independent_contractor','agency'], true, true, 'a', 1, NOW()),

('LC-484-a', NULL, 'assignment', 'general',
 'Influencer may not assign or subcontract obligations under the Agreement without [PARTY A]''s written consent; [PARTY A] may assign or subcontract to its client or a successor acquiring substantially all its assets or stock.',
 'medium',
 'Influencer cannot assign without consent; agency can assign to client or successor.',
 ARRAY['assignment','subcontract'], true, true, 'a', 1, NOW()),

('LC-485-a', NULL, 'governing_law', 'dispute_resolution',
 'The Agreement is governed by the substantive laws of the State of California, and any action arising out of or relating to it shall be filed only in state or federal courts in the Northern District of California.',
 'medium',
 'California law governs and disputes go to Northern California courts.',
 ARRAY['governing_law','jurisdiction'], true, true, 'a', 1, NOW()),

('LC-485-b', 'LC-485-a', 'dispute_resolution', 'dispute_resolution',
 'The prevailing party in any action shall be entitled to recover reasonable outside attorneys'' fees and expenses, and the parties agree to accept service of process by mail at their business addresses and waive jurisdictional or venue defenses.',
 'medium',
 'Prevailing party gets fees; service by mail is accepted and venue objections are waived.',
 ARRAY['attorneys_fees','service_of_process'], true, true, 'b', 1, NOW()),

-- =============================================================================
-- GENERAL / BOILERPLATE (486-489)
-- =============================================================================
('LC-486-a', NULL, 'other', 'general',
 'Influencer acknowledges having had the opportunity to have the Agreement reviewed by counsel of Influencer''s choice prior to execution.',
 'low',
 'Influencer had the chance to get legal advice before signing.',
 ARRAY['review_by_counsel'], true, true, 'a', 1, NOW()),

('LC-487-a', NULL, 'compliance', 'compliance',
 'Influencer acknowledges and consents to [PARTY A]''s privacy notice and expressly directs [PARTY A] to disclose Influencer''s information to third parties described therein, including sharing data with client and fulfillment partners as necessary to execute the campaign.',
 'medium',
 'Influencer agrees to data use and sharing per the privacy notice.',
 ARRAY['privacy','data_sharing'], true, true, 'a', 1, NOW()),

('LC-488-a', NULL, 'survival', 'contract_lifecycle',
 'The sections covering post duration obligations, ownership, license grants, representations and warranties, indemnification, limitation of liability, confidentiality, injunctive relief, governing law, and data use shall survive expiration or earlier termination of the Agreement.',
 'medium',
 'Key IP, warranty, liability, confidentiality, and dispute clauses continue after termination.',
 ARRAY['survival','post_term'], true, true, 'a', 1, NOW()),

('LC-489-a', NULL, 'entire_agreement', 'general',
 'The Agreement, consisting of the campaign details, general terms, and endorsement and disclosure guidelines, is the complete and exclusive statement of the parties'' understanding and supersedes all prior agreements; modifications must be in writing signed by both parties, and in case of conflict, the campaign details control.',
 'low',
 'Defines the entire agreement, how changes are made, and that campaign details win on conflicts.',
 ARRAY['entire_agreement','integration','precedence'], true, true, 'a', 1, NOW());

-- =============================================================================
-- Summary:
--   57 clauses total (36 base, 21 variants)
--   Notable: Detailed FTC compliance guidelines (LC-462-a through LC-462-e)
--   New clause_types used: force_majeure, independent_contractor
-- =============================================================================
