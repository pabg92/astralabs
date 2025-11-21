# Admin Dashboard - Design Plan
**Version:** 1.0
**Last Updated:** November 3, 2025
**Purpose:** LCL approval, HITL review, system monitoring

---

## Design Philosophy (From Existing UI)

### Color Palette
- **Primary:** Blue (blue-500, blue-600, blue-700)
- **Success:** Emerald (emerald-500, emerald-100, emerald-700)
- **Warning:** Amber (amber-500, amber-100, amber-700)
- **Error:** Red (red-500, red-100, red-700)
- **Info:** Purple (purple-500, purple-100, purple-700)
- **Neutral:** Slate/Gray (slate-50, gray-200, gray-900)

### Component Patterns
- **Cards:** `rounded-xl` or `rounded-2xl`, `shadow-md` or `shadow-lg`
- **Borders:** `border-2` with color-coded borders (border-blue-200, etc.)
- **Gradients:** `bg-gradient-to-br from-blue-500 to-blue-600` (hero sections)
- **Hover States:** `hover:shadow-lg hover:scale-105 transition-all duration-200`
- **Badges:** `rounded-full px-3 py-1` with semantic colors
- **Icons:** Lucide React, typically `w-4 h-4` or `w-5 h-5`

### Layout Structure
- **Max Width:** `max-w-[1600px] mx-auto` for content
- **Padding:** `px-6 py-8` for page containers
- **Grid Layouts:** `grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4/6`
- **Spacing:** Consistent mb-4/6/8 for vertical rhythm

### Typography
- **Page Titles:** `text-3xl font-bold text-gray-900`
- **Section Titles:** `text-xl font-semibold text-gray-800`
- **Body Text:** `text-sm text-gray-600`
- **Numbers/Metrics:** `text-3xl font-bold text-slate-900`

---

## Admin Dashboard Features

### Primary Features (MVP)

1. **New Clause Approval Queue**
   - View AI-drafted clauses pending verification
   - Sort by factual_correctness_score (lowest first)
   - Approve/Reject actions with notes
   - Priority indicators (high/medium/low)

2. **Deduplication Review Queue**
   - View duplicate clause clusters
   - See similarity scores (0.85-0.92 range)
   - Merge/Dismiss actions
   - Compare side-by-side

3. **System Health Dashboard**
   - Processing queue status (pgmq metrics)
   - Recent document uploads
   - Failed processing jobs (DLQ)
   - Database statistics

4. **Legal Clause Library Management**
   - Browse all LCL entries
   - Search and filter
   - Edit/deactivate clauses
   - View usage statistics

### Secondary Features (Future)

5. **Analytics Dashboard**
   - Contract volume trends
   - RAG status distribution
   - Processing time metrics
   - Cost tracking

6. **User Management**
   - View all users by tenant
   - Manage roles and permissions
   - Activity logs

---

## Layout Structure

### Main Admin Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Admin Dashboard                        [User Menu]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐  │
│ │ Pending   │ │ Processing│ │ Completed │ │ Failed    │  │
│ │ Review    │ │ Queue     │ │ Today     │ │ Jobs      │  │
│ │    12     │ │     8     │ │    156    │ │     2     │  │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘  │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌─────────────────────┐  ┌────────────────────────────────┐│
│ │ New Clauses Queue   │  │ Deduplication Review           ││
│ │ (High Priority)     │  │                                ││
│ │                     │  │ ┌──────────────────────────┐  ││
│ │ 1. Payment Terms    │  │ │ Cluster DUP-001          │  ││
│ │    Score: 0.73 🔴   │  │ │ Similarity: 89%          │  ││
│ │    [Approve][Reject]│  │ │ 3 duplicates found       │  ││
│ │                     │  │ │ [Merge] [Dismiss]        │  ││
│ │ 2. Liability Cap    │  │ └──────────────────────────┘  ││
│ │    Score: 0.84 🟠   │  │                                ││
│ │    [Approve][Reject]│  │                                ││
│ │                     │  │                                ││
│ │ 3. Termination      │  │                                ││
│ │    Score: 0.91 🟢   │  │                                ││
│ │    [Approve][Reject]│  │                                ││
│ └─────────────────────┘  └────────────────────────────────┘│
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Recent Activity Feed                                         │
│ ────────────────────────────────────────────────────────── │
│ • Contract uploaded: "Brand X - Jane Doe.pdf" (2 min ago)  │
│ • Clause approved: LCL-234 Payment Terms (5 min ago)       │
│ • Duplicate merged: DUP-012 → LCL-089 (12 min ago)         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Mock Data Structure

### New Clauses Pending Review

```typescript
const newClausesMock = [
  {
    id: "nc-001",
    clause_id: "LCL-NEW-234",
    clause_type: "payment_terms",
    standard_text: "Payment shall be made within 30 days of invoice receipt via wire transfer to the account specified by Contractor.",
    category: "financial",
    risk_level: "medium",
    factual_correctness_score: 0.73,
    review_priority: "high",
    created_at: "2025-11-03T10:23:00Z",
    extracted_from: "Brand X - Jane Doe Agreement.pdf"
  },
  {
    id: "nc-002",
    clause_id: "LCL-NEW-235",
    clause_type: "liability_cap",
    standard_text: "In no event shall Contractor's liability exceed 50% of fees paid under this Agreement.",
    category: "liability",
    risk_level: "high",
    factual_correctness_score: 0.84,
    review_priority: "medium",
    created_at: "2025-11-03T11:15:00Z",
    extracted_from: "Agency Y - Contract v1.0.pdf"
  },
  {
    id: "nc-003",
    clause_id: "LCL-NEW-236",
    clause_type: "termination",
    standard_text: "Either party may terminate this Agreement upon 30 days written notice.",
    category: "termination",
    risk_level: "low",
    factual_correctness_score: 0.91,
    review_priority: "low",
    created_at: "2025-11-03T12:45:00Z",
    extracted_from: "Brand Z - Influencer Agreement.pdf"
  }
]
```

### Deduplication Clusters

```typescript
const dedupClustersMock = [
  {
    cluster_id: "DUP-001",
    primary_clause: {
      id: "LCL-042",
      clause_type: "compliance",
      text: "Influencer shall comply with all applicable advertising regulations and platform guidelines."
    },
    duplicates: [
      {
        id: "LCL-156",
        text: "Influencer must adhere to FTC guidelines and social media terms.",
        similarity: 0.89
      },
      {
        id: "LCL-203",
        text: "Content shall comply with advertising laws and platform rules.",
        similarity: 0.87
      }
    ],
    avg_similarity: 0.88,
    review_priority: "medium",
    created_at: "2025-11-02T14:00:00Z"
  },
  {
    cluster_id: "DUP-002",
    primary_clause: {
      id: "LCL-089",
      clause_type: "payment_terms",
      text: "Payment due net 30 days from invoice date."
    },
    duplicates: [
      {
        id: "LCL-112",
        text: "Invoice payable within 30 days of receipt.",
        similarity: 0.91
      }
    ],
    avg_similarity: 0.91,
    review_priority: "low",
    created_at: "2025-11-02T16:30:00Z"
  }
]
```

### Processing Queue Status

```typescript
const queueMetricsMock = {
  document_processing_queue: {
    queue_length: 8,
    newest_msg_age_sec: 45,
    oldest_msg_age_sec: 320,
    total_messages: 156,
    scrape_time: "2025-11-03T15:43:00Z"
  },
  document_processing_dlq: {
    queue_length: 2,
    total_messages: 12
  }
}
```

### Recent Activity

```typescript
const recentActivityMock = [
  {
    id: "act-001",
    type: "contract_uploaded",
    description: "Contract uploaded: Brand X - Jane Doe.pdf",
    user: "sarah@agency.com",
    timestamp: "2025-11-03T15:41:00Z"
  },
  {
    id: "act-002",
    type: "clause_approved",
    description: "Clause approved: LCL-234 Payment Terms",
    user: "admin@contractbuddy.com",
    timestamp: "2025-11-03T15:38:00Z"
  },
  {
    id: "act-003",
    type: "duplicate_merged",
    description: "Duplicate merged: DUP-012 → LCL-089",
    user: "admin@contractbuddy.com",
    timestamp: "2025-11-03T15:31:00Z"
  },
  {
    id: "act-004",
    type: "reconciliation_completed",
    description: "Reconciliation completed: Brand Y - Contract v2.0",
    user: "john@agency.com",
    timestamp: "2025-11-03T15:22:00Z"
  }
]
```

---

## Key UI Components Needed

### 1. Review Card Component
- Clause text display (expandable)
- Confidence score badge (color-coded by priority)
- Metadata (clause type, category, risk level)
- Source document link
- Approve/Reject buttons
- Notes textarea for rejection reason

### 2. Deduplication Cluster Card
- Primary clause display
- Duplicate list with similarity scores
- Side-by-side comparison view
- Merge/Dismiss actions
- Similarity score visualization (progress bar)

### 3. Queue Status Card
- Queue depth indicator
- Oldest message age warning
- Processing rate chart
- Quick action: "View Queue Details"

### 4. Activity Feed
- Timeline-style layout
- Icon for activity type
- Relative timestamps ("2 min ago")
- User attribution
- Click to view details

---

## Route Structure

```
/admin                          - Dashboard overview
/admin/new-clauses              - New clause approval queue
/admin/deduplication            - Duplicate review queue
/admin/library                  - Legal clause library management
/admin/processing               - Processing queue monitoring
/admin/users                    - User management (future)
/admin/analytics                - Analytics dashboard (future)
```

---

**See:** Next section for complete v0 prompt
