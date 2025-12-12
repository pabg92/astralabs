# Term Extraction Prompt

Use this prompt to extract pre-agreed terms from contract text.

## Prompt Template

```
You are a legal contract analyst. Analyze the following contract text and extract key commercial and legal terms that would be important for contract reconciliation.

For each term you identify, provide:
1. **term_category**: One of the following categories:
   - Payment
   - Usage/Rights
   - Deliverables
   - Exclusivity
   - Confidentiality
   - Termination
   - IP (Intellectual Property)
   - Compliance
   - Indemnification
   - Warranties
   - Assignment

2. **term_description**: A concise description of the specific term or obligation (1-2 sentences)

3. **expected_value**: The actual value, amount, date, or specific details from the contract (can be null if not applicable)

4. **is_mandatory**: Boolean - true if this term is critical/required, false if optional

## What to Extract

Focus on these key areas:

### Financial Terms
- Payment amounts and currency
- Payment schedule/milestones
- Late payment penalties
- Expense reimbursements

### Usage Rights
- License duration
- Territories/regions
- Platforms/channels
- Exclusions or limitations

### Deliverables
- Content types (posts, videos, stories)
- Quantities and formats
- Deadlines and schedules
- Approval processes

### Exclusivity
- Category exclusivity
- Duration of exclusivity
- Geographic scope
- Competitor definitions

### Confidentiality
- What information is confidential
- Duration of obligations
- Permitted disclosures

### Termination
- Notice periods
- Termination for cause conditions
- Termination for convenience
- Post-termination obligations

### Intellectual Property
- IP ownership
- License grants
- Moral rights waivers
- Content ownership

### Compliance
- FTC disclosure requirements
- Platform policy compliance
- Regulatory requirements
- Approval requirements

### Indemnification
- Indemnification scope
- Covered claims
- Limitations

### Warranties
- Content warranties
- Authority to contract
- Non-infringement

### Assignment
- Assignment restrictions
- Change of control provisions

## Contract Text

{CONTRACT_TEXT}

## Output Format

Return your analysis as a JSON array:

```json
[
  {
    "term_category": "Payment",
    "term_description": "Brand shall pay Influencer a flat fee for content creation and posting services",
    "expected_value": "2800 USD",
    "is_mandatory": true
  },
  {
    "term_category": "Payment",
    "term_description": "Payment shall be made within specified days after receipt of valid invoice",
    "expected_value": "30 days",
    "is_mandatory": true
  },
  {
    "term_category": "Deliverables",
    "term_description": "Influencer shall create and post Instagram feed content",
    "expected_value": "2 Instagram posts",
    "is_mandatory": true
  },
  {
    "term_category": "Usage/Rights",
    "term_description": "Brand receives license to use content for marketing purposes",
    "expected_value": "12 months, social media channels",
    "is_mandatory": true
  },
  {
    "term_category": "Exclusivity",
    "term_description": "Influencer shall not promote competing brands in the same category",
    "expected_value": "30 days, fitness/athleisure category",
    "is_mandatory": false
  },
  {
    "term_category": "Compliance",
    "term_description": "All sponsored content must include proper FTC disclosure",
    "expected_value": "#ad or #sponsored required",
    "is_mandatory": true
  }
]
```

## Guidelines

1. **Be specific**: Extract actual values, not generic descriptions
2. **Be comprehensive**: Include all material terms, even if seemingly minor
3. **Prioritize mandatory terms**: Mark critical business terms as mandatory
4. **Use exact wording**: Quote relevant contract language in expected_value when helpful
5. **Handle ambiguity**: If a term is unclear, still extract it and note the ambiguity
6. **Party identification**: Identify which party has obligations (Influencer, Brand, Agency)
```

## Example Extraction

Given contract text containing:
> "The fee payable by Adanola to Influencer is: 2800 USD. Payment terms: The Influencer/agency shall send the invoice within 7 days after the activity live date..."

Extract:
```json
[
  {
    "term_category": "Payment",
    "term_description": "Total fee payable by Brand to Influencer for services",
    "expected_value": "2800 USD",
    "is_mandatory": true
  },
  {
    "term_category": "Payment",
    "term_description": "Influencer must submit invoice within specified period after content goes live",
    "expected_value": "7 days after activity live date",
    "is_mandatory": true
  }
]
```

## Usage Notes

1. After extracting terms, map `term_category` to database clause types using the mapping in SKILL.md
2. Use `term_description` as the "Expected Term" field in the UI
3. Use `expected_value` as the "Notes" field in the UI
4. Set `is_mandatory` flag based on business criticality
