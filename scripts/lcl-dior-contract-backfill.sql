-- LCL Backfill: Dior Contract Clauses (LC-100 Series)
-- Generated: 2025-11-26
-- Total: 39 clauses (28 base, 11 variants)
-- Compatible with Migration 100 CBA Architecture
-- Block: LC-100 → LC-199 (Dior)

BEGIN;

-- ============================================================================
-- LC-100: IP & CONTENT RIGHTS - Usage Rights (3 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-100-a',
  'intellectual_property',
  'information_protection',
  'Dior shall have the right to use the Social Media Content for six months following the date the Social Media Content goes live in Dior digital platforms, including Dior.com and Dior social media channels, and on Dior''s retail partners'' digital platforms and social media channels, on an organic basis only, with any paid use during the usage term subject to the parties'' agreement on an additional fee of [AMOUNT] per thirty days.',
  'medium',
  'Grants Dior time limited organic usage rights over the Social Media Content on its own and retailer platforms, and requires an additional fee for any paid promotion during that period.',
  ARRAY['usage_rights', 'organic_use', 'paid_media', 'social_media'],
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
  'LC-100-b',
  'intellectual_property',
  'information_protection',
  'Influencer hereby grants to Dior a worldwide, exclusive, sublicensable license to use, reproduce, distribute and display the Social Media Content during the usage term in the forms of media specified in the agreement''s usage section.',
  'high',
  'Gives Dior an exclusive worldwide sublicensable license to the Social Media Content during the agreed usage term.',
  ARRAY['exclusive_license', 'social_media', 'usage_term'],
  true,
  true,
  'b',
  'LC-100-a',
  1,
  NOW()
);

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-100-c',
  'intellectual_property',
  'information_protection',
  'Any Social Media Content posted or displayed by Dior or its retail partners during the usage term does not need to be removed at the end of the usage period, and Dior may use the Social Media Content during and following the usage term for internal and archival purposes.',
  'medium',
  'Allows Dior and its retail partners to keep using the Social Media Content for internal and archival purposes even after the usage term ends.',
  ARRAY['archival_use', 'usage_survival', 'social_media'],
  true,
  true,
  'c',
  'LC-100-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-101: IP & CONTENT RIGHTS - Brand/Trademark Protection (3 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-101-a',
  'intellectual_property',
  'information_protection',
  'Influencer shall not use the name or trademarks of Dior or any of its affiliates except as incorporated into the Social Media Content and approved by Dior in each instance, such approval applying only to the specific purpose and instance of use, and Influencer agrees that it has no right, title or interest in Dior IP and shall not acquire any rights in Dior IP through use.',
  'medium',
  'Restricts Influencer''s use of Dior brands and confirms that all goodwill and rights in Dior IP remain with Dior.',
  ARRAY['dior_ip', 'trademark_use', 'brand_protection'],
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
  'LC-101-b',
  'intellectual_property',
  'information_protection',
  'Except for references to Influencer''s name expressly authorized in the agreement, Dior shall not use the name, image, likeness, voice, biographical data or trademarks of Influencer without Influencer''s prior written approval in each instance, provided that this agreement constitutes Influencer''s prior written approval for Dior to use the Influencer IP to the extent incorporated into the Social Media Content and used in a manner permitted by the agreement, and Dior acquires no rights in the Influencer IP beyond such permitted use.',
  'medium',
  'Limits Dior''s use of Influencer''s personal brand and likeness to agreed uses within the Social Media Content and confirms that Influencer retains all rights in Influencer IP.',
  ARRAY['influencer_ip', 'likeness', 'usage_consent'],
  true,
  true,
  'b',
  'LC-101-a',
  1,
  NOW()
);

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-101-c',
  'intellectual_property',
  'information_protection',
  'Each party retains all right, title and interest in its own intellectual property, including trademarks and copyrights, and all renewals, extensions, revivals and resuscitations thereof, throughout the universe in perpetuity in all media now known or hereafter devised.',
  'medium',
  'Confirms that each party keeps ownership of its own intellectual property and associated rights in all media and territories.',
  ARRAY['ip_ownership', 'trademarks', 'copyrights'],
  true,
  true,
  'c',
  'LC-101-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-110: SERVICES / DELIVERABLES (2 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-110-a',
  'deliverables',
  'operational',
  'Influencer shall create and post the Social Media Content consisting of one Instagram story of at least three frames including a link sticker on at least one frame, one Instagram reel with in feed preview, and one TikTok video plus a syndicated TikTok from the Instagram reel, on Influencer''s channels, incorporating the specified tagged accounts, hashtags and brand provided links, to promote the campaign and subject to Dior''s approval prior to posting.',
  'medium',
  'Defines the specific social media deliverables, platforms, tagging, hashtags, links and approval requirement for the campaign.',
  ARRAY['deliverables', 'instagram', 'tiktok', 'approval'],
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
  'LC-110-b',
  'deliverables',
  'operational',
  'Influencer shall post the Social Media Content on mutually agreed dates and must provide drafts of all Social Media Content for Dior''s review and edit no less than five business days before the scheduled go live date.',
  'medium',
  'Sets timelines for agreeing posting dates and requires draft content to be provided at least five business days before going live.',
  ARRAY['schedule', 'drafts', 'approvals'],
  true,
  true,
  'b',
  'LC-110-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-111: SCOPE OF WORK
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-111-a',
  'scope_of_work',
  'operational',
  'Influencer agrees to perform the services described in the agreement in a professional and workmanlike manner, consistent with the degree of care and skill ordinarily exercised under similar circumstances in the industry, and consistent with the schedule on the cover page and any applicable guidelines unless otherwise mutually agreed in writing.',
  'low',
  'Requires Influencer to perform the services to industry professional standards and in line with the agreed schedule and guidelines.',
  ARRAY['services', 'standard_of_care', 'professionalism'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-112: CREATIVE GUIDELINES & CONTENT DURATION (2 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-112-a',
  'deliverables',
  'operational',
  'If Dior provides creative guidelines in advance of a scheduled posting date, Influencer will comply with those guidelines when preparing the Social Media Content, and may be required, at Dior''s sole discretion, to reshoot or edit the Social Media Content if Influencer does not comply, and no Social Media Content shall be posted or otherwise shared publicly before Dior''s written approval.',
  'medium',
  'Obliges Influencer to follow Dior''s creative guidelines, gives Dior the right to demand reshoots or edits for non compliance, and requires Dior''s written approval before any content is posted.',
  ARRAY['guidelines', 'reshoot', 'pre_approval'],
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
  'LC-112-b',
  'deliverables',
  'operational',
  'Once posted, Social Media Content shall remain on Influencer''s applicable social media channel for at least twelve months following the go live date, provided that Instagram stories and similar ephemeral content may expire in the ordinary course.',
  'medium',
  'Requires Influencer to keep social posts live for at least twelve months, except for naturally expiring story type content.',
  ARRAY['content_duration', 'social_media', 'availability'],
  true,
  true,
  'b',
  'LC-112-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-120: FEES / PAYMENTS (2 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-120-a',
  'payment_terms',
  'financial',
  'In consideration for Influencer''s performance of the services, Dior shall pay Influencer a fee of [AMOUNT], payable in full to Influencer or Influencer''s authorized representative upon completion of all services, against an invoice issued on completion, with payment due within thirty days of Dior''s receipt of such invoice, by check or wire at Dior''s discretion to the payee details provided in writing.',
  'medium',
  'Sets out the base fee amount, that it is payable after all services are completed, and that Dior must pay within thirty days of receiving a proper invoice.',
  ARRAY['fee', 'invoice', 'payment_terms'],
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
  'LC-120-b',
  'payment_terms',
  'financial',
  'Any paid use of the Social Media Content during the usage term, including sponsored posts, promotion or whitelisting, is subject to the parties'' agreement on an additional fee of [AMOUNT] per thirty days of such paid use.',
  'medium',
  'Provides for an additional monthly fee if Dior wishes to use the Social Media Content in paid media during the usage term.',
  ARRAY['paid_media_fee', 'whitelisting', 'sponsored_posts'],
  false,
  true,
  'b',
  'LC-120-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-121: TAXES / EXPENSES / REIMBURSEMENT
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-121-a',
  'payment_terms',
  'financial',
  'Influencer shall be solely responsible for all broker and agent fees or commissions, taxes, withholdings and other amounts due to third parties in connection with the agreement or the services, Dior shall have no liability for such amounts, and expenses incurred by Influencer are not reimbursable unless Dior expressly approves them in writing in advance and Influencer provides reasonably sufficient supporting documentation, in which case Dior will reimburse in accordance with its expense reimbursement policies.',
  'medium',
  'Places responsibility on Influencer for all commissions, taxes and third party amounts, and makes expenses non reimbursable unless Dior pre approves them and they are properly documented.',
  ARRAY['taxes', 'commissions', 'expenses', 'reimbursement'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-130: EXCLUSIVITY
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-130-a',
  'exclusivity',
  'relationship',
  'Influencer agrees not to post any paid or sponsored content within the skincare category during the one day before or one day after the date on which any Social Media Content is posted by Influencer as part of the services.',
  'medium',
  'Prevents Influencer from posting other paid or sponsored skincare content immediately before or after Dior campaign posts.',
  ARRAY['exclusivity', 'skincare', 'sponsored_content_window'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-131: NON-DISPARAGEMENT
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-131-a',
  'non_disparagement',
  'relationship',
  'At no time during or after the term of the agreement shall Influencer make any derogatory or disparaging statement regarding Dior, the products of Dior or its affiliates, LVMH Moët Hennessy Louis Vuitton SE, or any member of the Arnault family, or use Dior''s name, the name of any officer, director, agent or employee of Dior or its affiliates, or any of Dior''s trademarks or brand names, in a disparaging, derogatory or offensive manner.',
  'high',
  'Prohibits Influencer from making disparaging statements about Dior, its group, related parties or using their names and brands in a derogatory way at any time.',
  ARRAY['non_disparagement', 'brand_reputation', 'conduct'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-140: TERM DURATION
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-140-a',
  'term_duration',
  'contract_lifecycle',
  'The term of the agreement commences on the effective date and ends on [DATE] unless earlier terminated in accordance with the agreement.',
  'low',
  'Sets the start and end dates of the agreement, subject to earlier termination rights.',
  ARRAY['term', 'duration'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-141: TERMINATION FOR CAUSE (2 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-141-a',
  'termination_for_cause',
  'contract_lifecycle',
  'Either party may terminate the agreement upon prior written notice if the other party breaches the agreement and, if the breach is capable of cure, fails to cure it within fifteen days after receiving written notice of the breach.',
  'medium',
  'Gives each party a right to terminate for uncured material breach after a fifteen day cure period where cure is possible.',
  ARRAY['termination', 'breach', 'cure_period'],
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
  'LC-141-b',
  'termination_for_cause',
  'contract_lifecycle',
  'Dior may terminate the agreement upon prior written notice if Influencer commits an act or becomes involved in a situation that could result in conviction for a felony or for a misdemeanor involving a controlled substance or substance abuse, dies or suffers a disability preventing performance, becomes involved in a public scandal or makes public statements or engages in conduct shocking or offensive to a substantial community, or breaches the non disparagement obligations.',
  'high',
  'Gives Dior enhanced termination rights if Influencer is involved in crime, scandal, offensive conduct, inability to perform, or breaches the non disparagement clause.',
  ARRAY['morals_clause', 'termination', 'reputation'],
  true,
  true,
  'b',
  'LC-141-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-142: TERMINATION - RIGHTS RESERVED
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-142-a',
  'waiver',
  'contract_lifecycle',
  'Any termination of the agreement under the termination section is without waiver of rights, and all rights and remedies are reserved notwithstanding such termination.',
  'low',
  'Clarifies that terminating the agreement does not waive any other rights or remedies a party may have.',
  ARRAY['termination', 'rights_reserved', 'no_waiver'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-143: SURVIVAL
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-143-a',
  'survival',
  'contract_lifecycle',
  'Any provisions of the terms and conditions that contemplate performance or observance after termination or expiration of the agreement will survive such termination or expiration and continue in full force and effect.',
  'medium',
  'States that clauses intended to operate after termination continue to bind the parties.',
  ARRAY['survival', 'post_termination'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-150: REPRESENTATIONS & WARRANTIES (2 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-150-a',
  'warranty',
  'liability',
  'Each party represents and warrants that it has the full right, power and authority to enter into and perform the agreement, that the agreement does not and will not conflict with or infringe upon any existing or future commitment of the party or the rights of any third party, and that it will comply with all applicable federal, state, local and other laws, rules and regulations in performing its obligations.',
  'medium',
  'Provides mutual assurances about authority, absence of conflicting obligations, and compliance with applicable laws.',
  ARRAY['representations', 'authority', 'compliance'],
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
  'LC-150-b',
  'warranty',
  'liability',
  'Influencer further represents and warrants that the services will not be performed within the jurisdiction of any union or guild or under any union or guild agreement, that any claims made in the Social Media Content about Dior or its products will reflect Influencer''s honest and truthful opinions, and that the Social Media Content does not violate any third party rights, including intellectual property rights.',
  'high',
  'Adds Influencer specific warranties that work is non union, that endorsements are truthful, and that the content will not infringe third party rights.',
  ARRAY['influencer_warranties', 'truthful_endorsements', 'ip_non_infringement'],
  true,
  true,
  'b',
  'LC-150-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-160: CONFIDENTIALITY
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-160-a',
  'confidentiality',
  'information_protection',
  'Influencer may receive or have access to Dior''s and its affiliates'' non public proprietary business information, including the terms of the agreement, business, marketing and promotional plans, business plans, product and process information and other confidential information, which remains Dior''s property, and Influencer agrees not to use such Confidential Information except to perform obligations under the agreement and not to disclose it during or after the term to any person or entity except as required by law or privately to attorneys, accountants, agents and other representatives who need to know and who keep it confidential.',
  'high',
  'Requires Influencer to keep Dior''s confidential information, including the agreement terms and business information, secret and to use it only for performing the contract, with limited exceptions for legal requirements and professional advisers.',
  ARRAY['confidential_information', 'non_disclosure', 'use_limitation'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-161: FTC COMPLIANCE
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-161-a',
  'compliance',
  'compliance',
  'Influencer agrees to comply with all applicable laws, regulations, rules and guidance with respect to the services, including the Federal Trade Commission Revised Endorsement and Testimonial Guidelines and any other FTC guidance then in effect, as well as any related guidelines provided by Dior, and to clearly and conspicuously disclose the relationship between Influencer and Dior in all Social Media Content using required disclosure language such as "#sponsored", "#ad" or "#paid ad" toward the beginning of the content.',
  'high',
  'Obliges Influencer to follow FTC endorsement rules and Dior''s guidelines and to include clear paid partnership disclosures in all relevant posts.',
  ARRAY['ftc', 'endorsement_guides', 'disclosure', 'ad_marking'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-162: FORCE MAJEURE
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-162-a',
  'force_majeure',
  'general',
  'Neither party shall be liable or deemed in breach for any failure or delay in performing under the agreement to the extent caused by an event of force majeure, including acts of God, natural disaster, war, epidemic, pandemic, government order, law or action, national emergency or other similar events beyond the party''s reasonable control, and in such case the parties shall negotiate in good faith appropriate modifications to the agreement, which may include extending the term or providing replacement services.',
  'low',
  'Excuses performance delays caused by specified force majeure events and requires the parties to negotiate good faith adjustments such as extensions or replacement services.',
  ARRAY['force_majeure', 'excused_performance', 'good_faith_modification'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-163: INDEPENDENT CONTRACTOR (2 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-163-a',
  'independent_contractor',
  'relationship',
  'Influencer is an independent contractor of Dior and not an employee, and the agreement does not create any association, joint venture, agency relationship or partnership between the parties, and neither party has authority to enter into agreements for, act as agent or representative of, or otherwise bind the other party.',
  'medium',
  'Clarifies that Influencer is an independent contractor, not an employee or agent, and that neither party can bind the other.',
  ARRAY['independent_contractor', 'no_agency', 'no_joint_venture'],
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
  'LC-163-b',
  'independent_contractor',
  'relationship',
  'If Influencer enters into the agreement through a loan out entity, that loan out entity represents and warrants that it has full power and authority to enter into the agreement on Influencer''s behalf and to bind Influencer, and covenants to cause Influencer to satisfy all of Influencer''s obligations under the agreement and to be responsible for any breach or failure to perform by Influencer.',
  'medium',
  'Extends responsibility to any loan out entity, requiring it to bind and ensure Influencer''s performance and making it responsible for any breach.',
  ARRAY['loan_out', 'authority', 'performance'],
  true,
  true,
  'b',
  'LC-163-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-164: INSURANCE
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-164-a',
  'insurance',
  'compliance',
  'Influencer acknowledges that Dior does not provide or carry any insurance for the benefit of Influencer, and that Influencer is solely responsible for obtaining any and all insurance related to Influencer''s performance of the services.',
  'medium',
  'Requires Influencer to arrange their own insurance because Dior will not provide coverage for them.',
  ARRAY['insurance', 'risk_allocation'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-170: INDEMNIFICATION (2 variants)
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-170-a',
  'indemnification',
  'liability',
  'Influencer agrees to indemnify, defend and hold Dior, its affiliates and their respective officers, directors, shareholders, members, employees, agents, successors and permitted assigns harmless from and against all third party claims, suits, judgments, losses, damages, penalties, fines and costs, including reasonable attorneys'' fees and related expenses, arising out of or related to Influencer''s breach of any representations, warranties or agreements in the agreement, Influencer''s gross negligence or willful misconduct, or Influencer''s performance of the services, including development, production or distribution of the Social Media Content by Influencer.',
  'high',
  'Requires Influencer to cover Dior for third party claims linked to Influencer''s breach, misconduct or work on the Social Media Content, including legal fees.',
  ARRAY['indemnity', 'influencer_breach', 'services', 'legal_fees'],
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
  'LC-170-b',
  'indemnification',
  'liability',
  'Dior agrees to indemnify, defend and hold Influencer and its successors and permitted assigns harmless from and against all claims arising out of or related to Dior''s breach of its representations or warranties in the agreement, Dior''s gross negligence or willful misconduct, or any actual or alleged product liability claims related to Dior''s products.',
  'medium',
  'Obligates Dior to indemnify Influencer for claims caused by Dior''s breach, misconduct or product related liability.',
  ARRAY['indemnity', 'company_breach', 'product_liability'],
  true,
  true,
  'b',
  'LC-170-a',
  1,
  NOW()
);

-- ============================================================================
-- LC-180: DISPUTE RESOLUTION / ARBITRATION
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-180-a',
  'dispute_resolution',
  'dispute_resolution',
  'Any dispute, claim or controversy arising out of or relating to the agreement, including its breach, termination, enforcement, interpretation or validity and the scope or applicability of the agreement to arbitrate, shall be determined by final and binding arbitration in New York, New York before a single neutral arbitrator who is a retired U.S. federal judge, administered by JAMS under its Comprehensive Arbitration Rules as modified in the agreement, with the parties waiving all rights to trial by jury or court, applying New York substantive law without regard to conflicts principles, keeping all arbitration proceedings confidential, and allowing judgment on the award to be entered in any court with jurisdiction, with the arbitrator empowered to allocate arbitration costs and reasonable attorneys'' fees to the losing party.',
  'medium',
  'Requires confidential final and binding JAMS arbitration in New York under New York law for all disputes, with no jury or court trial and with costs and fees potentially awarded against the losing party.',
  ARRAY['arbitration', 'jams', 'new_york_law', 'binding'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-190: MISCELLANEOUS - SEVERABILITY
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-190-a',
  'severability',
  'general',
  'If any provision or clause of the agreement, or its application, is held invalid or unenforceable in any circumstance, such invalidity or unenforceability shall not affect the validity or enforceability of the remainder of the agreement or of the application of such provision or clause in any other circumstances.',
  'low',
  'Ensures that if one part of the agreement is invalid or unenforceable, the rest remains in effect.',
  ARRAY['severability', 'validity'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-191: NOTICES
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-191-a',
  'notice',
  'general',
  'All notices, requests, demands and other correspondence under the agreement must be in writing and delivered by hand, e mail or nationally recognized private courier. Notices by hand or courier are deemed delivered when actually delivered, and notices by e mail are deemed delivered on the business day sent if sent before 5pm Eastern Time or on the next business day if sent at or after 5pm Eastern Time, provided no bounce back or error message is received. Notices must be sent to the addresses specified in the agreement or to any other address designated by notice under this section.',
  'low',
  'Sets formal requirements, delivery methods and deemed receipt times for notices between the parties.',
  ARRAY['notices', 'delivery', 'email'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-192: ASSIGNMENT
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-192-a',
  'assignment',
  'relationship',
  'Influencer may not assign or transfer the agreement or any rights or obligations under it without Dior''s prior written approval, and any attempted assignment or transfer not permitted is void from the outset.',
  'medium',
  'Prohibits Influencer from assigning the agreement without Dior''s written consent and makes unauthorized assignments void.',
  ARRAY['assignment', 'consent', 'transfer'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-193: INTERPRETATION / CONSTRUCTION
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-193-a',
  'other',
  'general',
  'The parties have jointly participated in negotiating and drafting the agreement and it shall be construed as if drafted jointly by them, with no presumption or burden of proof favoring or disfavoring any party based on authorship, and the words "including" and similar expressions mean "including without limitation", and unless the context requires otherwise, "neither", "nor", "any", "either" and "or" are not exclusive, references to sections, exhibits and schedules are to those of the agreement, and all words are to be construed by gender or number as circumstances require.',
  'low',
  'Sets interpretation rules, including no contra proferentem against the drafter and that "including" is non limiting and pronouns and references are read flexibly.',
  ARRAY['construction', 'interpretation', 'including_without_limitation'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-194: COUNTERPARTS / ELECTRONIC EXECUTION
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-194-a',
  'other',
  'general',
  'The agreement may be executed by electronic transmission, including PDF or DocuSign, or by facsimile signature, and such signatures are binding, and the agreement may be executed in two or more counterparts, each of which constitutes an original and together form one agreement.',
  'low',
  'Recognizes electronic and facsimile signatures as valid and allows the agreement to be signed in multiple counterparts.',
  ARRAY['electronic_signature', 'counterparts', 'execution'],
  true,
  true,
  'a',
  NULL,
  1,
  NOW()
);

-- ============================================================================
-- LC-196: ENTIRE AGREEMENT / AMENDMENT
-- ============================================================================

INSERT INTO legal_clause_library (
  clause_id, clause_type, category, standard_text, risk_level,
  plain_english_summary, tags, is_required, is_approved,
  variation_letter, parent_clause_id, version, created_at
) VALUES (
  'LC-196-a',
  'entire_agreement',
  'general',
  'The agreement, including the cover page, terms and conditions and all exhibits, represents the entire understanding and agreement of the parties regarding its subject matter and supersedes all prior negotiations, understandings, representations or agreements between them, and each party waives any right to rely on such prior matters, and the agreement may not be amended or modified except by a written agreement executed by both parties, and in the event of conflict between the cover page and the terms and conditions, the cover page controls.',
  'medium',
  'States that the written agreement is the complete and exclusive statement of the parties'' arrangement, requires written signed amendments and gives priority to the cover page if there is inconsistency.',
  ARRAY['entire_agreement', 'merger', 'amendment', 'precedence'],
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

-- Count total Dior clauses
SELECT COUNT(*) as total_dior_clauses
FROM legal_clause_library
WHERE clause_id LIKE 'LC-1%';

-- Count base vs variants
SELECT
  CASE WHEN parent_clause_id IS NULL THEN 'Base' ELSE 'Variant' END as type,
  COUNT(*) as count
FROM legal_clause_library
WHERE clause_id LIKE 'LC-1%'
GROUP BY CASE WHEN parent_clause_id IS NULL THEN 'Base' ELSE 'Variant' END;

-- List all clause families
SELECT
  COALESCE(parent_clause_id, clause_id) as family,
  COUNT(*) as variants,
  array_agg(clause_id ORDER BY variation_letter) as members
FROM legal_clause_library
WHERE clause_id LIKE 'LC-1%'
GROUP BY COALESCE(parent_clause_id, clause_id)
ORDER BY family;

-- Check category distribution
SELECT category, COUNT(*) as count
FROM legal_clause_library
WHERE clause_id LIKE 'LC-1%'
GROUP BY category
ORDER BY count DESC;

-- Check risk level distribution
SELECT risk_level, COUNT(*) as count
FROM legal_clause_library
WHERE clause_id LIKE 'LC-1%'
GROUP BY risk_level
ORDER BY count DESC;

-- Verify all variants have parent_clause_id
SELECT clause_id, variation_letter, parent_clause_id
FROM legal_clause_library
WHERE clause_id LIKE 'LC-1%'
  AND variation_letter != 'a'
  AND parent_clause_id IS NULL;
-- Should return 0 rows if all variants properly linked

-- Topic block summary
SELECT
  SUBSTRING(clause_id FROM 4 FOR 2) || '0' as topic_block,
  COUNT(*) as clauses
FROM legal_clause_library
WHERE clause_id LIKE 'LC-1%'
GROUP BY SUBSTRING(clause_id FROM 4 FOR 2)
ORDER BY topic_block;
