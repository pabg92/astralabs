-- LCL Backfill: Nécessaire Contract Clauses (LC-200 Series)
-- Generated: 2025-11-26
-- Total: 35 clauses (26 base, 9 variants)
-- Compatible with Migration 100 CBA Architecture
-- Block: LC-200 → LC-299 (Nécessaire)

BEGIN;

-- ============================================================================
-- LC-200: IP & CONTENT RIGHTS - Licensing (4 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-200-a',
  'intellectual_property',
  'information_protection',
  '[PARTY A] grants to [PARTY B] a limited right and license to use those trade names, trademarks, service marks and logos specified by [PARTY A] (the "[PARTY A] Marks") solely in connection with exercising [PARTY B]''s rights and fulfilling [PARTY B]''s obligations under each statement of work, in any and all media now known or hereafter developed, provided that [PARTY B] obtains [PARTY A]''s prior written approval before any public use, complies with [PARTY A]''s branding requirements, and ceases any use that [PARTY A] reasonably objects to.',
  'medium',
  'Allows the influencer to use the brand''s marks only as approved, for the campaign, following brand guidelines, and gives the brand the right to stop any objectionable use.',
  ARRAY['brand_marks', 'license_to_influencer', 'approval_required', 'branding'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-200-b',
  'intellectual_property',
  'information_protection',
  '[PARTY B] grants to [PARTY A] the right and license to use those trademarks, service marks, publicity and privacy rights, names, images, likenesses, biographical details, indicia of identity and logos specified by [PARTY B] (the "[PARTY B] Marks") in connection with [PARTY A]''s advertisement and promotion of itself and its products and services, and in exercising [PARTY A]''s rights under the agreement, in any and all media now known or hereafter developed, limited to paid usage only for a period of fifteen days, with [PARTY A] obtaining [PARTY B]''s written approval except as otherwise set out in the statement of work, and [PARTY B] retaining the right to revoke such use and require [PARTY A] to cease any objected use.',
  'high',
  'Lets the brand use the influencer''s name, image and related rights for paid advertising for a short period, with influencer approval and the right for the influencer to stop specific uses.',
  ARRAY['influencer_likeness', 'publicity_rights', 'paid_usage_window', 'license_to_brand'],
  true,
  true,
  'b',
  'LC-200-a',
  1,
  NOW()
);

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-200-c',
  'intellectual_property',
  'information_protection',
  '[PARTY B] grants to [PARTY A] the right and license to use the works of authorship created by or on behalf of [PARTY B] under the agreement (the "[PARTY B] Works") in whole or in part in connection with [PARTY A]''s advertisement and promotion of itself and its products and services, and in exercising [PARTY A]''s rights under the agreement, in any and all media now known or hereafter developed, limited to paid usage only for a period of fifteen days, with [PARTY A] obtaining [PARTY B]''s written approval except as otherwise set out in the statement of work, and [PARTY B] retaining the right to revoke such use and require [PARTY A] to cease any objected use.',
  'high',
  'Gives the brand a short term paid media license to use the influencer''s content itself in advertising, subject to influencer approval and with a right for the influencer to withdraw consent for specific uses.',
  ARRAY['content_license', 'paid_media', 'influencer_works', 'license_to_brand'],
  true,
  true,
  'c',
  'LC-200-a',
  1,
  NOW()
);

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-200-d',
  'intellectual_property',
  'information_protection',
  'If, after the initial posting of a social media post by [PARTY B], [PARTY A] wishes to continue utilizing that post, [PARTY A] may send a written post license notice, upon which [PARTY B] automatically grants [PARTY A] the right and license to use the relevant [PARTY B] Works (in whole or in part) in connection with [PARTY A]''s advertisement and promotion of itself and its products and services, and in exercising [PARTY A]''s rights under the agreement, in any and all media, limited to paid usage only for a period of fifteen days.',
  'high',
  'Creates an automatic short term paid usage license for the influencer''s post when the brand sends a written notice after the post goes live.',
  ARRAY['post_license', 'paid_usage', 'automatic_grant', 'influencer_works'],
  false,
  true,
  'd',
  'LC-200-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-201: IP OWNERSHIP (2 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-201-a',
  'intellectual_property',
  'information_protection',
  '[PARTY A] owns solely and exclusively, in perpetuity throughout the universe, all right, title and interest in and to the [PARTY A] Marks, the works of authorship created by or on behalf of [PARTY A] under the agreement and [PARTY A]''s products and services.',
  'medium',
  'Confirms that the brand fully owns its own marks, branded content and products and services everywhere and forever.',
  ARRAY['ip_ownership', 'brand_assets', 'perpetuity'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-201-b',
  'intellectual_property',
  'information_protection',
  '[PARTY B] owns solely and exclusively, in perpetuity throughout the universe, all right, title and interest in and to the [PARTY B] Marks and the [PARTY B] Works created under the agreement.',
  'medium',
  'Confirms that the influencer fully owns their own marks and the influencer created works everywhere and forever.',
  ARRAY['ip_ownership', 'influencer_assets', 'perpetuity'],
  true,
  true,
  'b',
  'LC-201-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-202: THIRD PARTY CLEARANCES
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-202-a',
  'compliance',
  'compliance',
  '[PARTY B] will, at its own expense, obtain all third party rights, licenses, clearances, authorizations, permissions and releases necessary for any deliverables to be publicly displayed, performed or otherwise used by or on behalf of [PARTY A] and [PARTY B] as contemplated in each statement of work, including releases needed for any materials included within or embodied by any [PARTY B] Marks or [PARTY B] Works and all creative elements, appearances and third party materials appearing in or forming part of such marks or works.',
  'high',
  'Requires the influencer to secure and pay for all necessary third party permissions so that the delivered content and influencer assets can be used by both parties without infringing others'' rights.',
  ARRAY['releases', 'third_party_rights', 'clearances', 'compliance'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-210: DELIVERABLES (3 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-210-a',
  'deliverables',
  'operational',
  'Beginning on the effective date and continuing through the term, [PARTY B] will provide the deliverables specified in the applicable statement of work, which may include photos, videos, social media content, materials and information, some authored by or on behalf of [PARTY A] and some authored by or on behalf of [PARTY B], and if [PARTY B] fails to deliver any deliverable, the parties will in good faith agree, at no additional cost to [PARTY A], on a make good deliverable to be provided instead.',
  'medium',
  'Defines that the influencer must supply the agreed content and, if they miss a deliverable, must provide an agreed replacement without charging extra.',
  ARRAY['deliverables', 'sow', 'make_good', 'content_creation'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-210-b',
  'deliverables',
  'operational',
  '[PARTY B] agrees to create one social media post in the form of a TikTok in accordance with brief guidelines provided by [PARTY A] by email, after which [PARTY A] will within three business days either approve the post or provide edits, limited to two rounds where the brief was not followed correctly, and if edits are requested [PARTY B] must promptly resubmit a revised post within forty eight hours, and then make the post live on a mutually agreed date once written approval is received.',
  'medium',
  'Spells out the specific TikTok deliverable, briefing, approval and edit process, and the requirement to post only after brand approval on an agreed date.',
  ARRAY['tiktok', 'approval_process', 'edits', 'timeline'],
  true,
  true,
  'b',
  'LC-210-a',
  1,
  NOW()
);

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-210-c',
  'deliverables',
  'operational',
  'After a post is made live, [PARTY B] agrees to delete the post at any time upon written request from [PARTY A] and must delete such post within one business day after [PARTY A]''s transmission of a removal request.',
  'medium',
  'Requires the influencer to take down a live post within one business day whenever the brand requests removal in writing.',
  ARRAY['removal_request', 'takedown', 'content_control'],
  true,
  true,
  'c',
  'LC-210-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-220: FEES / PAYMENTS (2 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-220-a',
  'payment_terms',
  'financial',
  'Subject to [PARTY B]''s compliance with the agreement, [PARTY B] will receive compensation as provided in the applicable statement of work, and [PARTY B] is responsible for all taxes other than taxes based on [PARTY A]''s net income.',
  'medium',
  'States that the influencer is paid according to the SOW and must handle their own taxes except for the brand''s income taxes.',
  ARRAY['compensation', 'taxes', 'sow_fee'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-220-b',
  'payment_terms',
  'financial',
  'Within thirty days of complete execution of the deliverables and receipt of an invoice, [PARTY A] shall pay [AMOUNT] to [PARTY B], and the payments described are deemed confidential information subject to the agreement''s confidentiality provisions.',
  'medium',
  'Provides a concrete fee amount for the campaign, payable within thirty days after all deliverables are completed and invoiced, and treats payment terms as confidential.',
  ARRAY['fee', 'invoice', 'payment_timing', 'confidential_fee'],
  true,
  true,
  'b',
  'LC-220-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-230: NON-DISPARAGEMENT / MORALS
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-230-a',
  'non_disparagement',
  'relationship',
  'Influencer acknowledges that the value of the agreement to [PARTY A] depends on goodwill and positive publicity generated by [PARTY B], [PARTY B]''s deliverables and [PARTY A]''s use of [PARTY B] Marks, and accordingly agrees to conduct themselves so as to avoid any material adverse change in such goodwill, not to malign or disparage [PARTY A] or its products and services, and to refrain from acting in an unprofessional manner or committing any act or becoming involved in any situation that involves criminal misconduct or moral turpitude, subjects [PARTY A] or the campaign to disrepute, scandal or ridicule, shocks or offends the community, or tarnishes [PARTY A] Marks by association, and [PARTY A] may terminate the agreement without liability if any such disparagement act occurs.',
  'high',
  'Imposes a morals and non disparagement obligation on the influencer and gives the brand the right to terminate if the influencer engages in scandalous, offensive or damaging conduct.',
  ARRAY['non_disparagement', 'morals_clause', 'reputation', 'termination_right'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-240: TERM DURATION
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-240-a',
  'term_duration',
  'contract_lifecycle',
  'The agreement commences as of the effective date and, unless terminated earlier, remains in effect for one year thereafter.',
  'low',
  'Sets a one year term for the agreement starting on the effective date, subject to earlier termination rights.',
  ARRAY['term', 'duration'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-241: TERMINATION FOR CAUSE
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-241-a',
  'termination_for_cause',
  'contract_lifecycle',
  'Either party may terminate the agreement, and [PARTY A] may terminate either the entire agreement and or any applicable statement of work, upon written notice in the event of a material breach by the other party that remains uncured for ten days following the breaching party''s receipt of written notice of such breach, and [PARTY A] also has the right to terminate the agreement immediately upon written notice in the event of a breach by [PARTY B] of the disparagement and communications provisions.',
  'medium',
  'Allows either party to terminate for uncured material breach after a ten day cure period and allows the brand to terminate immediately if the influencer breaches key conduct and communications obligations.',
  ARRAY['termination', 'breach', 'cure_period', 'morals_termination'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-242: SURVIVAL
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-242-a',
  'survival',
  'contract_lifecycle',
  'Upon expiration or termination of the agreement, all licenses granted under the agreement immediately terminate, and the provisions identified, including those on ownership, termination for disparagement, certain post term provisions, indemnification, limitation of liability, confidentiality, assignment, dispute resolution and other boilerplate, survive and remain in full force and effect.',
  'medium',
  'Provides that licenses end at termination but specified key clauses continue to bind the parties after the agreement ends.',
  ARRAY['survival', 'licenses_end', 'post_term'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-243: POST-TERM USE OF CONTENT
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-243-a',
  'intellectual_property',
  'information_protection',
  'Notwithstanding other provisions, after the term neither party is obligated to remove any social media posts incorporating [PARTY A] Marks, [PARTY B] Marks or deliverables that were posted during the term, but except as set forth in the statement of work, [PARTY A] agrees it will not make any new posts incorporating or otherwise using the deliverables or [PARTY B] Marks after the term without [PARTY B]''s prior written consent.',
  'medium',
  'Allows existing posts to remain live after the agreement ends but prevents the brand from creating new posts using the influencer''s content or marks without fresh consent.',
  ARRAY['post_term_use', 'social_media_posts', 'consent_for_new_use'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-250: WARRANTIES - BRAND
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-250-a',
  'warranty',
  'liability',
  '[PARTY A] represents and warrants that it has all rights necessary to enter into and perform its obligations under the agreement and that the [PARTY A] Marks and the authorized use thereof by [PARTY B] as set forth in the agreement will not violate or infringe the trademark rights of any third party.',
  'medium',
  'The brand promises it is properly authorized to sign and that the influencer''s permitted use of the brand''s marks will not infringe others'' trademark rights.',
  ARRAY['brand_warranties', 'authority', 'non_infringement'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-251: WARRANTIES - INFLUENCER
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-251-a',
  'warranty',
  'liability',
  '[PARTY B] represents and warrants that it has all rights necessary to enter into and perform its obligations under the agreement, that there are no additional releases [PARTY A] must obtain to use the [PARTY B] Marks or [PARTY B] Works as set forth, that [PARTY B] has not engaged in or caused the purchase of social media followers or other activity designed to fraudulently or artificially manipulate social media metrics or engagement, and that [PARTY B]''s activities under the agreement, including the deliverables, [PARTY B] Marks and their authorized use, will comply with all applicable laws, labor laws, union or guild requirements and social platform policies, will not infringe or misappropriate any third party intellectual property, privacy or publicity rights and will not give rise to claims for libel, slander, defamation or similar.',
  'high',
  'The influencer promises they are authorized, have secured necessary permissions, have not faked their social metrics, and that their work and its use will comply with law and platform rules and will not infringe or defame others.',
  ARRAY['influencer_warranties', 'no_fake_followers', 'legal_compliance', 'ip_non_infringement'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-260: CONFIDENTIALITY
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-260-a',
  'confidentiality',
  'information_protection',
  'Neither party will disclose to any third party any confidential information provided by the other party, except as required by law, rule or regulation, to comply with a court or governmental order after giving notice and seeking a protective order, or to that party''s accountants, legal, financial and marketing advisers, and actual or prospective lenders, investors, acquirors or other due diligence parties who agree to keep it confidential, and confidential information includes any information a party knows or should know is considered confidential by the other party, including the terms but not the mere existence of the agreement.',
  'high',
  'Requires both parties to keep each other''s non public information, including the deal terms, confidential, with limited exceptions for law, court orders and professional or transaction advisers who must also keep it confidential.',
  ARRAY['confidential_information', 'non_disclosure', 'advisers', 'deal_terms'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-261: FTC COMPLIANCE
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-261-a',
  'compliance',
  'compliance',
  '[PARTY B] covenants that all digital and social media postings, communications or statements made by or on behalf of [PARTY B] under the agreement will comply with applicable laws, rules, regulations and guidelines, including the Federal Trade Commission''s guides on endorsements and testimonials and the terms, rules and policies of each social media platform used, including clear disclosures that [PARTY B] received consideration, such as a clear and conspicuous disclosure of the paid nature of the relationship or hashtags like "#ad" or a specified campaign tag, and that all such communications will be approved in writing by [PARTY A] before public display or distribution and promptly edited as [PARTY A] requests.',
  'high',
  'Requires the influencer to follow FTC ad disclosure rules and platform policies, to clearly mark posts as paid, to obtain brand approval before posting and to make requested edits.',
  ARRAY['ftc_guides', 'endorsement_disclosure', 'platform_policies', 'approval_required'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-270: INDEMNIFICATION
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-270-a',
  'indemnification',
  'liability',
  'Each party agrees to indemnify, defend and hold harmless the other party and its affiliates and their respective officers, members, shareholders, directors, employees, representatives and agents and their successors, heirs and assigns from and against any and all losses, liabilities, claims, costs, damages and expenses, including attorneys'' fees, related to any third party claim arising out of or related to the indemnifying party''s negligent or intentional acts or omissions under the agreement or its actual or alleged breach of its representations, warranties or obligations under the agreement, including in the case of [PARTY B] any actual or alleged breach of the disparagement section.',
  'high',
  'Creates mutual indemnities so that each side covers the other for third party claims arising from its own negligence, intentional misconduct or breaches of its promises, including the influencer''s conduct obligations.',
  ARRAY['indemnity', 'mutual_indemnification', 'breach', 'negligence'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-271: LIMITATION OF LIABILITY
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-271-a',
  'limitation_of_liability',
  'liability',
  'Except for breaches of confidentiality and a party''s fulfillment of its indemnification obligations, neither party will be liable to the other for any consequential, incidental, indirect, economic, special, exemplary or punitive damages, even if advised of the possibility of such damages, and neither party''s liability under the agreement shall exceed the fees paid to [PARTY B].',
  'critical',
  'Caps each party''s liability at the total fees paid to the influencer and excludes most categories of indirect and special damages, except for confidentiality breaches and indemnity obligations.',
  ARRAY['limitation_of_liability', 'damage_exclusion', 'liability_cap'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-280: DISPUTE RESOLUTION (2 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-280-a',
  'governing_law',
  'dispute_resolution',
  'The agreement will be construed in accordance with the laws of the State of California, excluding its choice of law rules.',
  'medium',
  'Specifies that California law governs the agreement, without applying its conflict of law rules.',
  ARRAY['governing_law', 'california'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-280-b',
  'dispute_resolution',
  'dispute_resolution',
  'Any action or proceeding arising from or relating to the agreement must be brought exclusively in a federal or state court located in Los Angeles County, California, each party irrevocably consents to personal jurisdiction and venue in such courts and to service of process issued by them, either party may seek injunctive relief to protect its intellectual property rights in any court having jurisdiction, and the parties specifically waive any right to trial by jury in any court with respect to any claim connected to the agreement.',
  'medium',
  'Requires disputes to be litigated in Los Angeles County courts under California law, allows either party to seek IP injunctions elsewhere and waives jury trial rights for all related claims.',
  ARRAY['forum_selection', 'jurisdiction', 'jury_waiver', 'injunctive_relief'],
  true,
  true,
  'b',
  'LC-280-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-290: ASSIGNMENT
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-290-a',
  'assignment',
  'relationship',
  'The agreement is binding on the parties, their successors and permitted assigns, and given the unique nature of the deliverables, [PARTY B] may not assign, transfer or delegate any rights, duties or obligations under the agreement, in whole or in part, without [PARTY A]''s prior written approval, and neither party may assign or transfer the agreement, by operation of law or otherwise, without the other''s prior written consent, except that [PARTY A] may assign or transfer the agreement and all of its rights and obligations without [PARTY B]''s consent to a successor in interest as a result of a public offering, merger, consolidation or sale or transfer of all or substantially all of the business or assets to which the agreement relates.',
  'medium',
  'Prevents the influencer from assigning the agreement without consent and restricts assignments generally, while allowing the brand to transfer the agreement to a corporate successor without needing influencer consent.',
  ARRAY['assignment', 'change_of_control', 'successors'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-291: WAIVER
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-291-a',
  'waiver',
  'general',
  'No waiver of any breach of any term or condition of the agreement will constitute a waiver of any subsequent breach of the same or any other term or condition.',
  'low',
  'Clarifies that forgiving one breach does not waive the right to enforce the agreement against future breaches.',
  ARRAY['waiver', 'no_implied_waiver'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-292: SEVERABILITY
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-292-a',
  'severability',
  'general',
  'If any term of the agreement is held unenforceable, such term will be restated in accordance with applicable law to reflect as closely as possible the parties'' original intentions and the remainder of the agreement will remain in full force and effect.',
  'low',
  'Ensures that if a provision is invalid, it is adjusted to reflect the parties'' intent and the rest of the agreement still applies.',
  ARRAY['severability', 'reformation'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-293: NOTICES
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-293-a',
  'notice',
  'general',
  'All notices and other communications under the agreement must be in writing and are deemed effectively given upon the earlier of actual receipt or personal delivery, when sent by e mail or facsimile during the recipient''s normal business hours (or the next business day if sent outside such hours), five days after being sent by registered or certified mail, return receipt requested, postage prepaid, or one business day after deposit with a nationally recognized overnight courier specifying next day delivery, and must be sent to the parties at their stated addresses unless updated by notice.',
  'low',
  'Defines valid methods, timing and addresses for giving formal notices under the agreement.',
  ARRAY['notices', 'delivery_methods', 'email_notice'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-294: PUBLICITY / ANNOUNCEMENTS
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-294-a',
  'other',
  'operational',
  'The timing and content of any public announcements or communications relating to the agreement will be determined in [PARTY A]''s discretion.',
  'medium',
  'Gives the brand control over if and how the relationship or campaign is publicly announced.',
  ARRAY['publicity', 'announcements', 'brand_control'],
  false,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-295: ENTIRE AGREEMENT
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-295-a',
  'entire_agreement',
  'general',
  'The agreement contains the entire agreement and understanding between the parties and supersedes all prior written and oral understandings and negotiations relating to its subject matter.',
  'medium',
  'States that this written contract replaces all prior discussions or agreements about the subject matter.',
  ARRAY['entire_agreement', 'merger_clause'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-296: INDEPENDENT CONTRACTOR
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-296-a',
  'independent_contractor',
  'relationship',
  'Nothing in the agreement creates a partnership, joint venture, employer employee, master servant or franchisor franchisee relationship between the parties. [PARTY B]''s status is that of an independent contractor and [PARTY B] is not an employee of [PARTY A], is not entitled to participate in or receive benefits under any [PARTY A] compensation or employee benefit plan even if later reclassified as an employee, and will enter into all contracts in performance of its obligations as principal and not as agent of [PARTY A], with [PARTY A] having no liability to any third party under such contracts.',
  'medium',
  'Clarifies that the influencer is an independent contractor, not an employee or agent, has no right to company benefits and binds only themselves, not the brand, in their own contracts.',
  ARRAY['independent_contractor', 'no_benefits', 'no_agency'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-297: INTERPRETATION / CONSTRUCTION
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-297-a',
  'other',
  'general',
  'All headings in the agreement are for convenience only and may not be used to interpret the agreement, and references to "including" mean "including without limitation".',
  'low',
  'Sets basic interpretation rules that headings do not affect meaning and "including" is non exhaustive.',
  ARRAY['interpretation', 'including_without_limitation', 'headings'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Count total Nécessaire clauses
SELECT COUNT(*) as total_necessaire_clauses
FROM legal_clause_library
WHERE clause_id LIKE 'LC-2%';

-- Count base vs variants
SELECT
  CASE WHEN parent_clause_id IS NULL THEN 'Base' ELSE 'Variant' END as type,
  COUNT(*) as count
FROM legal_clause_library
WHERE clause_id LIKE 'LC-2%'
GROUP BY CASE WHEN parent_clause_id IS NULL THEN 'Base' ELSE 'Variant' END;

-- List all clause families
SELECT
  COALESCE(parent_clause_id, clause_id) as family,
  COUNT(*) as variants,
  array_agg(clause_id ORDER BY variation_letter) as members
FROM legal_clause_library
WHERE clause_id LIKE 'LC-2%'
GROUP BY COALESCE(parent_clause_id, clause_id)
ORDER BY family;

-- Check category distribution
SELECT category, COUNT(*) as count
FROM legal_clause_library
WHERE clause_id LIKE 'LC-2%'
GROUP BY category
ORDER BY count DESC;

-- Check risk level distribution
SELECT risk_level, COUNT(*) as count
FROM legal_clause_library
WHERE clause_id LIKE 'LC-2%'
GROUP BY risk_level
ORDER BY count DESC;

-- Verify all variants have parent_clause_id
SELECT clause_id, variation_letter, parent_clause_id
FROM legal_clause_library
WHERE clause_id LIKE 'LC-2%'
  AND variation_letter != 'a'
  AND parent_clause_id IS NULL;
-- Should return 0 rows if all variants properly linked

-- Topic block summary
SELECT
  SUBSTRING(clause_id FROM 4 FOR 2) || '0' as topic_block,
  COUNT(*) as clauses
FROM legal_clause_library
WHERE clause_id LIKE 'LC-2%'
GROUP BY SUBSTRING(clause_id FROM 4 FOR 2)
ORDER BY topic_block;
