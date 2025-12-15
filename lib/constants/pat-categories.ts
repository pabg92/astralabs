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
 */
export const PAT_CATEGORIES = [
  {
    value: "Compensation & Payment Timing",
    label: "Compensation & Payment",
    description: "Fee amount, payment terms, invoicing",
  },
  {
    value: "Deliverables & Posting Requirements",
    label: "Deliverables & Posting",
    description: "Content deliverables, posting schedule",
  },
  {
    value: "Usage Rights & Licensing",
    label: "Usage Rights & Licensing",
    description: "Usage duration, platforms, license scope",
  },
  {
    value: "Content Approval & Revisions",
    label: "Content Approval",
    description: "Approval process, revision rounds",
  },
  {
    value: "Content Retention & Non-Removal",
    label: "Content Retention",
    description: "How long posts must stay up",
  },
] as const

export type PATCategory = (typeof PAT_CATEGORIES)[number]
export type PATCategoryValue = PATCategory["value"]
