/**
 * Pre-Agreed Terms (PAT) Categories
 *
 * These categories are used for:
 * - Creating new deals with pre-agreed terms
 * - Editing existing deal terms
 * - Matching terms to contract clauses during reconciliation
 *
 * The `value` field is stored in the database as `term_category`
 * and used by the reconciliation worker for clause matching.
 *
 * CATEGORY TYPES:
 * - Semantic Terms: Require GPT comparison against contract clauses
 * - Identity Terms: Require simple string presence check (isIdentity: true)
 */
export const PAT_CATEGORIES = [
  // ============ SEMANTIC TERMS (GPT comparison) ============
  {
    value: "Compensation & Payment Timing",
    label: "Compensation & Payment",
    description: "Fee amount, payment terms, invoicing",
    isIdentity: false,
  },
  {
    value: "Payment Terms",
    label: "Payment Terms",
    description: "Payment schedule and conditions",
    isIdentity: false,
  },
  {
    value: "Deliverables & Posting Requirements",
    label: "Deliverables & Posting",
    description: "Content deliverables, posting schedule",
    isIdentity: false,
  },
  {
    value: "Usage Rights & Licensing",
    label: "Usage Rights & Licensing",
    description: "Usage duration, platforms, license scope",
    isIdentity: false,
  },
  {
    value: "Usage Rights",
    label: "Usage Rights",
    description: "IP and content usage permissions",
    isIdentity: false,
  },
  {
    value: "Content Approval & Revisions",
    label: "Content Approval",
    description: "Approval process, revision rounds",
    isIdentity: false,
  },
  {
    value: "Content Retention & Non-Removal",
    label: "Content Retention",
    description: "How long posts must stay up",
    isIdentity: false,
  },
  {
    value: "Exclusivity",
    label: "Exclusivity",
    description: "Competitor exclusivity restrictions",
    isIdentity: false,
  },
  {
    value: "Exclusivity Window",
    label: "Exclusivity Window",
    description: "Duration of exclusivity period",
    isIdentity: false,
  },
  {
    value: "FTC & Disclosure Compliance",
    label: "FTC & Disclosure",
    description: "FTC compliance and disclosure requirements",
    isIdentity: false,
  },
  {
    value: "Analytics Delivery",
    label: "Analytics Delivery",
    description: "Post-campaign performance reporting",
    isIdentity: false,
  },

  // ============ IDENTITY TERMS (string presence check) ============
  // These terms verify that expected party names appear in the contract
  // They bypass GPT and use direct string matching for faster, more accurate results
  {
    value: "Brand Name",
    label: "Brand Name",
    description: "Name of the brand/company party",
    isIdentity: true,
  },
  {
    value: "Brand",
    label: "Brand",
    description: "Brand identifier",
    isIdentity: true,
  },
  {
    value: "Talent Name",
    label: "Talent/Influencer Name",
    description: "Name of the talent/influencer party",
    isIdentity: true,
  },
  {
    value: "Talent",
    label: "Talent",
    description: "Talent identifier",
    isIdentity: true,
  },
  {
    value: "Influencer Name",
    label: "Influencer Name",
    description: "Name of the influencer",
    isIdentity: true,
  },
  {
    value: "Influencer",
    label: "Influencer",
    description: "Influencer identifier",
    isIdentity: true,
  },
  {
    value: "Agency",
    label: "Agency",
    description: "Name of the representing agency",
    isIdentity: true,
  },
  {
    value: "Agency Name",
    label: "Agency Name",
    description: "Full agency name",
    isIdentity: true,
  },
  {
    value: "Client Name",
    label: "Client Name",
    description: "Name of the client",
    isIdentity: true,
  },
  {
    value: "Client",
    label: "Client",
    description: "Client identifier",
    isIdentity: true,
  },
  {
    value: "Company Name",
    label: "Company Name",
    description: "Name of the company",
    isIdentity: true,
  },
  {
    value: "Company",
    label: "Company",
    description: "Company identifier",
    isIdentity: true,
  },
] as const

export type PATCategory = (typeof PAT_CATEGORIES)[number]
export type PATCategoryValue = PATCategory["value"]

/**
 * Check if a PAT category is an identity term (requires string matching, not GPT)
 * @param categoryValue - The term_category value to check
 * @returns true if this is an identity term category
 */
export function isIdentityCategory(categoryValue: string): boolean {
  const category = PAT_CATEGORIES.find(c => c.value === categoryValue)
  return category?.isIdentity ?? false
}

/**
 * Get all identity term category values
 * @returns Array of identity term category values
 */
export function getIdentityCategories(): string[] {
  return PAT_CATEGORIES.filter(c => c.isIdentity).map(c => c.value)
}

/**
 * Get all semantic term category values (non-identity)
 * @returns Array of semantic term category values
 */
export function getSemanticCategories(): string[] {
  return PAT_CATEGORIES.filter(c => !c.isIdentity).map(c => c.value)
}
