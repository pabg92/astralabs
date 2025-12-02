/**
 * Mock data fixtures for deals page E2E tests
 */

export const mockDeals = {
  empty: {
    success: true,
    data: [],
    count: 0,
  },

  standard: {
    success: true,
    data: [
      {
        id: "test-deal-1",
        title: "Test Deal - Playwright E2E",
        client_name: "Test Brand",
        talent_name: "Test Talent",
        status: "draft",
        value: 10000,
        currency: "USD",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tenant_id: "test-tenant",
        created_by: "test-user",
        version: 1,
        pre_agreed_terms: [],
        latest_document: null,
      },
      {
        id: "test-deal-2",
        title: "Second Test Deal - Fashion Campaign",
        client_name: "Fashion Brand",
        talent_name: "Fashion Talent",
        status: "in_review",
        value: 25000,
        currency: "USD",
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
        tenant_id: "test-tenant",
        created_by: "test-user",
        version: 1,
        pre_agreed_terms: [],
        latest_document: null,
      },
      {
        id: "test-deal-3",
        title: "Third Test Deal - Signed Contract",
        client_name: "Big Brand",
        talent_name: "Star Talent",
        status: "signed",
        value: 50000,
        currency: "USD",
        created_at: new Date(Date.now() - 172800000).toISOString(),
        updated_at: new Date(Date.now() - 172800000).toISOString(),
        tenant_id: "test-tenant",
        created_by: "test-user",
        version: 2,
        pre_agreed_terms: [],
        latest_document: {
          id: "doc-1",
          original_filename: "contract.pdf",
          processing_status: "completed",
        },
      },
    ],
    count: 3,
  },

  error: {
    success: false,
    error: "Database connection failed",
    details: "Unable to connect to Supabase",
    data: [],
    count: 0,
  },
}

export const mockVersionHistory = {
  standard: {
    success: true,
    data: {
      deal_id: "test-deal-1",
      deal_title: "Test Deal - Playwright E2E",
      deal_version: 2,
      documents: [
        {
          id: "doc-2",
          version: 2,
          original_filename: "contract_v2.pdf",
          created_at: new Date().toISOString(),
          created_by: "test-user",
          processing_status: "completed",
          size_bytes: 125000,
          mime_type: "application/pdf",
        },
        {
          id: "doc-1",
          version: 1,
          original_filename: "contract_v1.pdf",
          created_at: new Date(Date.now() - 86400000).toISOString(),
          created_by: "test-user",
          processing_status: "completed",
          size_bytes: 100000,
          mime_type: "application/pdf",
        },
      ],
      clauseChanges: [
        {
          id: "change-1",
          version: 1,
          change_type: "status_change",
          reason_code: "user_override",
          reason_description: "Clause approved after review",
          old_values: { rag_status: "amber" },
          new_values: { rag_status: "green" },
          created_at: new Date().toISOString(),
          changed_by: "test-user",
        },
      ],
      total_documents: 2,
      total_changes: 1,
    },
  },

  empty: {
    success: true,
    data: {
      deal_id: "test-deal-1",
      deal_title: "Test Deal",
      deal_version: 1,
      documents: [],
      clauseChanges: [],
      total_documents: 0,
      total_changes: 0,
    },
  },
}
