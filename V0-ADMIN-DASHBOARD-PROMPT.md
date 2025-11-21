# v0 Prompt: Admin Dashboard for ContractBuddy

---

## Project Context

I'm building an admin dashboard for **ContractBuddy**, a legal contract reconciliation platform. The dashboard needs to follow our existing design system and provide visibility into:
1. AI-drafted clauses pending approval (HITL review queue)
2. Duplicate clause clusters for merging
3. System processing status and health
4. Recent activity feed

---

## Design System (Must Follow Exactly)

### Color Palette
- **Primary Blue:** `bg-blue-500`, `bg-blue-600`, `text-blue-700`, `border-blue-200`
- **Success Green:** `bg-emerald-500`, `bg-emerald-100`, `text-emerald-700`
- **Warning Amber:** `bg-amber-500`, `bg-amber-100`, `text-amber-700`
- **Error Red:** `bg-red-500`, `bg-red-100`, `text-red-700`
- **Info Purple:** `bg-purple-500`, `bg-purple-100`, `text-purple-700`
- **Neutral:** `bg-slate-50`, `bg-gray-200`, `text-gray-900`

### Component Styling
- **Cards:** `rounded-xl shadow-md border border-gray-200 p-6`
- **Hero Cards:** `rounded-2xl shadow-lg border-2 border-blue-200 bg-gradient-to-br from-blue-500 to-blue-600 text-white`
- **Badges:** `rounded-full px-3 py-1 text-xs font-medium`
- **Buttons:** `rounded-lg` with hover states
- **Hover Effects:** `transition-all duration-200 hover:shadow-lg hover:scale-105`

### Typography
- **Page Title:** `text-3xl font-bold text-gray-900`
- **Section Title:** `text-xl font-semibold text-gray-800`
- **Card Title:** `text-lg font-semibold text-slate-900`
- **Body:** `text-sm text-gray-600`
- **Metric Numbers:** `text-3xl font-bold text-slate-900`

### Layout
- **Container:** `min-h-screen bg-gray-50`
- **Inner Container:** `max-w-[1600px] mx-auto px-6 py-8`
- **Grid:** `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`

---

## Page Layout

Create a Next.js page (`/admin`) with this structure:

### Header Section
- Page title: "Admin Dashboard"
- Subtitle: "Manage clause library, review AI-drafted clauses, and monitor system health"
- Admin badge indicator
- Last sync timestamp

### KPI Cards (4 metrics in grid)
1. **Pending Reviews** (Red/Amber/Orange based on urgency)
   - Value: 12
   - Change: +3 today
   - Icon: AlertCircle from lucide-react
   - Color: Amber

2. **Processing Queue** (Blue)
   - Value: 8
   - Change: "Active"
   - Icon: Activity
   - Color: Blue

3. **Completed Today** (Green)
   - Value: 156
   - Change: +42 vs yesterday
   - Icon: CheckCircle2
   - Color: Emerald

4. **Failed Jobs** (Red if >0, Gray if 0)
   - Value: 2
   - Change: "Needs attention"
   - Icon: XCircle
   - Color: Red

### Main Content (2-column grid)

**Left Column (60%):**

**Section 1: New Clause Approval Queue**
- Title: "New Clauses Pending Review" with badge showing count
- Sort tabs: "High Priority (3)" | "Medium (6)" | "Low (3)"
- Card list with:
  - Clause ID badge (e.g., "LCL-NEW-234")
  - Clause type badge (e.g., "Payment Terms")
  - Factual correctness score with color indicator:
    - <0.85: Red badge with "⚠ High Priority"
    - 0.85-0.90: Amber badge with "! Medium"
    - ≥0.90: Green badge with "✓ Low"
  - Clause text preview (truncated to 2 lines, expandable)
  - Source document link
  - Action buttons: "Approve" (green) | "Reject" (red)
  - Expand button to show full text + notes textarea

**Section 2: Deduplication Review Queue**
- Title: "Duplicate Clusters" with badge showing count
- Card list with:
  - Cluster ID badge (e.g., "DUP-001")
  - Primary clause preview
  - Similarity score badge with color:
    - 0.90-0.92: Amber (borderline)
    - 0.85-0.89: Red (needs review)
  - "X duplicates found" count
  - Action buttons: "Merge All" | "Review Individually"
  - Expand to show side-by-side comparison

**Right Column (40%):**

**Section 3: Processing Queue Status**
- Title: "System Health"
- Metrics:
  - Queue depth: 8 documents
  - Oldest message: 5m 20s (color-coded: green <5min, amber 5-15min, red >15min)
  - Processing rate: 12/hour
  - DLQ (dead letter queue): 2 failed
- Mini chart: Queue depth over last 24 hours (simple line chart)
- Button: "View Full Queue"

**Section 4: Recent Activity Feed**
- Title: "Recent Activity"
- Timeline-style list (last 10 items):
  - Icon based on activity type
  - Activity description
  - User who performed action
  - Relative timestamp ("2 min ago")
  - Color-coded by type:
    - Upload: Blue
    - Approval: Green
    - Rejection: Red
    - Merge: Purple

---

## Detailed Component Specifications

### New Clause Review Card

```tsx
<Card className="p-5 shadow-sm rounded-xl border-2 border-slate-200 hover:border-blue-300 transition-all">
  {/* Header */}
  <div className="flex items-start justify-between mb-3">
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-xs">LCL-NEW-234</Badge>
      <Badge className="text-xs bg-blue-100 text-blue-700">Payment Terms</Badge>
    </div>
    {/* Confidence Score Badge */}
    <Badge className={`text-xs ${
      score < 0.85 ? 'bg-red-100 text-red-700 border-red-300' :
      score < 0.90 ? 'bg-amber-100 text-amber-700 border-amber-300' :
      'bg-emerald-100 text-emerald-700 border-emerald-300'
    }`}>
      {score < 0.85 && '⚠ High Priority'}
      {score >= 0.85 && score < 0.90 && '! Medium'}
      {score >= 0.90 && '✓ Low'}
      {' '} Score: {(score * 100).toFixed(0)}%
    </Badge>
  </div>

  {/* Clause Text */}
  <p className="text-sm text-slate-700 mb-3 line-clamp-2">
    "Payment shall be made within 30 days of invoice receipt..."
  </p>

  {/* Metadata */}
  <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
    <div className="flex items-center gap-1">
      <FileText className="w-3 h-3" />
      <span>Brand X - Jane Doe.pdf</span>
    </div>
    <div className="flex items-center gap-1">
      <Clock className="w-3 h-3" />
      <span>23 min ago</span>
    </div>
  </div>

  {/* Actions */}
  <div className="flex gap-2">
    <Button size="sm" className="flex-1 bg-emerald-500 hover:bg-emerald-600">
      <CheckCircle2 className="w-4 h-4 mr-1" />
      Approve
    </Button>
    <Button size="sm" variant="outline" className="flex-1 hover:bg-red-50 hover:text-red-600">
      <XCircle className="w-4 h-4 mr-1" />
      Reject
    </Button>
    <Button size="sm" variant="ghost">
      <ChevronDown className="w-4 h-4" />
    </Button>
  </div>
</Card>
```

### Deduplication Cluster Card

```tsx
<Card className="p-5 shadow-sm rounded-xl border-2 border-slate-200">
  {/* Header */}
  <div className="flex items-center justify-between mb-3">
    <Badge variant="outline">DUP-001</Badge>
    <Badge className="bg-amber-100 text-amber-700">
      {duplicates.length} duplicates · {avgSimilarity}% similar
    </Badge>
  </div>

  {/* Primary Clause */}
  <div className="mb-3">
    <p className="text-xs font-medium text-slate-500 mb-1">Primary Clause (LCL-042)</p>
    <p className="text-sm text-slate-700 line-clamp-2">
      "Influencer shall comply with all applicable advertising regulations..."
    </p>
  </div>

  {/* Duplicate List Preview */}
  <div className="bg-slate-50 rounded-lg p-3 mb-3">
    {duplicates.map(dup => (
      <div key={dup.id} className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-600">{dup.id}</span>
        <span className="font-medium text-slate-900">{dup.similarity}% match</span>
      </div>
    ))}
  </div>

  {/* Actions */}
  <div className="flex gap-2">
    <Button size="sm" className="flex-1 bg-purple-500 hover:bg-purple-600">
      <GitMerge className="w-4 h-4 mr-1" />
      Merge All
    </Button>
    <Button size="sm" variant="outline" className="flex-1">
      Review
    </Button>
  </div>
</Card>
```

### Queue Status Card

```tsx
<Card className="p-6 shadow-lg rounded-xl border border-slate-200">
  <h3 className="text-lg font-semibold text-slate-800 mb-4">System Health</h3>

  {/* Queue Depth */}
  <div className="mb-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-slate-600">Queue Depth</span>
      <span className="text-2xl font-bold text-blue-600">8</span>
    </div>
    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
      <div className="h-full bg-blue-500" style={{width: '32%'}} />
    </div>
    <p className="text-xs text-slate-500 mt-1">32% of capacity</p>
  </div>

  {/* Oldest Message */}
  <div className="mb-4">
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-600">Oldest Message</span>
      <Badge className={`text-xs ${
        ageSec < 300 ? 'bg-emerald-100 text-emerald-700' :
        ageSec < 900 ? 'bg-amber-100 text-amber-700' :
        'bg-red-100 text-red-700'
      }`}>
        5m 20s
      </Badge>
    </div>
  </div>

  {/* Failed Jobs */}
  <div className="mb-4">
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-600">Dead Letter Queue</span>
      <span className="text-sm font-semibold text-red-600">2 failed</span>
    </div>
  </div>

  <Button size="sm" variant="outline" className="w-full">
    View Queue Details
  </Button>
</Card>
```

---

## Mock Data to Include

Use the mock data structures from the ADMIN-DASHBOARD-PLAN.md file. Key arrays:

1. `newClausesMock` - 3 pending clauses with varying confidence scores
2. `dedupClustersMock` - 2 duplicate clusters
3. `queueMetricsMock` - Processing queue statistics
4. `recentActivityMock` - 4 recent activities

---

## Required Icons (Lucide React)

Import these from "lucide-react":
- AlertCircle, Activity, CheckCircle2, XCircle (KPIs)
- FileText, Clock, Users, TrendingUp (metadata)
- ChevronDown, ChevronUp (expand/collapse)
- GitMerge (deduplication)
- Shield (security/risk)
- Sparkles (AI features)
- Bell (notifications)
- Settings (configuration)

---

## Technical Requirements

### Framework
- Next.js 15 (App Router)
- "use client" directive
- TypeScript
- React hooks (useState, useMemo)

### UI Components (from shadcn/ui)
- Card
- Button
- Badge
- Progress (for progress bars)
- Tabs (for queue priority filters)
- Separator (for dividing sections)
- Textarea (for rejection notes)
- Dialog (for expanded views)

### Styling
- Tailwind CSS with utility classes
- Color scheme: Neutral base with blue primary
- Responsive: Mobile-first (grid adjusts for md: and lg: breakpoints)
- Animations: `transition-all duration-200` on hover states

---

## Page Structure

```tsx
"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  AlertCircle, Activity, CheckCircle2, XCircle,
  FileText, Clock, ChevronDown, GitMerge,
  Shield, Sparkles, TrendingUp
} from "lucide-react"
import { useState } from "react"

// [Include mock data here]

export default function AdminDashboard() {
  const [selectedTab, setSelectedTab] = useState("high")
  const [expandedClause, setExpandedClause] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="mt-2 text-gray-600">
                Manage clause library, review AI-drafted clauses, and monitor system health
              </p>
            </div>
            <Badge className="bg-purple-100 text-purple-700 border-purple-300">
              <Shield className="w-3 h-3 mr-1" />
              Admin Access
            </Badge>
          </div>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* KPI cards here */}
        </div>

        {/* Main Content: 2-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            {/* New Clause Approval Queue */}
            {/* Deduplication Queue */}
          </div>

          {/* Right column (1/3 width) */}
          <div className="space-y-6">
            {/* System Health */}
            {/* Recent Activity */}
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## Specific Features to Implement

### 1. New Clause Approval Queue

**Header:**
- Title: "New Clauses Pending Review"
- Badge showing total count: `{newClauses.length}`
- Tabs for priority filtering: High (red) | Medium (amber) | Low (green)

**Clause Card (for each pending clause):**
- **Top row:** Clause ID badge + Clause type badge + Confidence score badge (color-coded)
- **Clause text:** 2-line preview with "Show more" expand
- **Metadata row:** Source document + timestamp (relative: "23 min ago")
- **Expanded view** (when clicked):
  - Full clause text
  - All metadata (category, risk_level, tags)
  - Notes textarea: "Add rejection notes (required if rejecting)"
  - GPT analysis summary if available
- **Action buttons:**
  - Approve (green, CheckCircle2 icon)
  - Reject (red outline, XCircle icon)
  - When reject clicked: Show textarea for notes

**Empty State:**
- Message: "No clauses pending review"
- Icon: Sparkles
- Description: "AI-drafted clauses will appear here for approval"

### 2. Deduplication Review Queue

**Header:**
- Title: "Duplicate Clusters"
- Badge showing total count

**Cluster Card (for each cluster):**
- **Top row:** Cluster ID badge + Similarity badge (avg %)
- **Primary clause:** Clause ID + preview text
- **Duplicates section:**
  - List of duplicate clause IDs with individual similarity scores
  - Progress bar showing similarity strength
- **Expanded view:**
  - Side-by-side comparison table
  - Highlight differences in red
- **Action buttons:**
  - Merge All (purple, GitMerge icon)
  - Dismiss (outline)
  - Review Individually (shows comparison)

### 3. System Health Card

**Metrics to show:**
- Queue depth with progress bar (% of capacity)
- Oldest message age (color-coded warning if >15min)
- Processing rate (documents/hour)
- Dead letter queue count (red if >0)

**Visual:**
- Use Progress component for queue depth
- Use Badge for oldest message (green/amber/red based on age)
- Small trend indicator (TrendingUp icon if increasing)

### 4. Recent Activity Feed

**Timeline layout:**
- Icon circle (color-coded by activity type)
- Activity description (bold key terms)
- User attribution (text-xs text-slate-500)
- Relative timestamp
- Subtle separator between items

**Activity Types:**
- 📄 Contract uploaded (blue)
- ✅ Clause approved (green)
- ❌ Clause rejected (red)
- 🔀 Duplicate merged (purple)
- ✓ Reconciliation completed (emerald)

---

## Interactions to Implement

### Approve Clause
```tsx
const handleApprove = (clauseId: string) => {
  // Show success toast
  // Remove from pending list
  // Update count badge
  // Add to activity feed
  console.log(`Approved clause: ${clauseId}`)
}
```

### Reject Clause
```tsx
const handleReject = (clauseId: string, notes: string) => {
  // Validate notes are provided
  // Show confirmation dialog
  // Remove from list
  // Log rejection
  console.log(`Rejected clause: ${clauseId}, notes: ${notes}`)
}
```

### Merge Duplicates
```tsx
const handleMerge = (clusterId: string) => {
  // Show confirmation
  // Merge duplicates into primary
  // Remove cluster from list
  // Add to activity feed
  console.log(`Merged cluster: ${clusterId}`)
}
```

### Expand/Collapse
```tsx
const toggleExpanded = (id: string) => {
  setExpandedClause(expandedClause === id ? null : id)
}
```

---

## Responsive Behavior

- **Mobile (<768px):** Single column, cards stack vertically
- **Tablet (768-1024px):** KPIs in 2x2 grid, main content single column
- **Desktop (>1024px):** Full 4-column KPI grid, 2-column main content (2/3 + 1/3 split)

---

## Additional Polish

### Hover States
- Cards: `hover:border-blue-300 hover:shadow-md`
- Buttons: `hover:scale-105` subtle scale
- Badges: Slightly brighter on hover

### Loading States
- Show skeleton loaders for each section while "loading"
- Use shimmer effect: `animate-pulse bg-slate-200`

### Empty States
- Each section has empty state with:
  - Relevant emoji or icon
  - Friendly message
  - Suggestion for next action

### Transitions
- Use `transition-all duration-200` on interactive elements
- Smooth expand/collapse with height animation
- Fade in new items: `animate-in fade-in duration-300`

---

## Example Mock Data Structure

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
    created_at: "2025-11-03T15:20:00Z",
    source_document: "Brand X - Jane Doe Agreement.pdf"
  },
  // 2-3 more with different scores (0.84, 0.91)
]

const dedupClustersMock = [
  {
    cluster_id: "DUP-001",
    primary: {
      id: "LCL-042",
      clause_type: "compliance",
      text: "Influencer shall comply with all applicable advertising regulations and platform guidelines."
    },
    duplicates: [
      { id: "LCL-156", text: "Influencer must adhere to FTC guidelines...", similarity: 0.89 },
      { id: "LCL-203", text: "Content shall comply with advertising laws...", similarity: 0.87 }
    ],
    avg_similarity: 0.88,
    review_priority: "medium"
  }
]

const queueMetrics = {
  queue_depth: 8,
  oldest_msg_age_sec: 320,
  processing_rate: 12,
  dlq_count: 2
}

const recentActivity = [
  { type: "upload", description: "Contract uploaded: Brand X - Jane Doe.pdf", user: "sarah@agency.com", timestamp: "2m ago" },
  { type: "approval", description: "Clause approved: LCL-234 Payment Terms", user: "admin@contractbuddy.com", timestamp: "5m ago" },
  // 2-3 more activities
]
```

---

## Success Criteria

The admin dashboard should:
- ✅ Match the visual style of existing pages (homepage, deals, reconciliation)
- ✅ Use the same color palette and component styling
- ✅ Display all 4 KPI metrics clearly
- ✅ Show new clause queue with priority filtering
- ✅ Show deduplication queue with similarity scores
- ✅ Display system health metrics
- ✅ Show recent activity feed
- ✅ Have approve/reject interactions working (console log for now)
- ✅ Be fully responsive (mobile to desktop)
- ✅ Include hover states and transitions
- ✅ Use TypeScript with proper types

---

## Design Reference

**Existing pages to match style:**
- Homepage: Hero card with gradient, KPI grid, recent deals list
- Deals page: Filter bar, table with status badges, action menus
- Reconciliation: Three-column layout, progress tracking, color-coded statuses

**Key design elements:**
- Gradient hero cards with white text
- Color-coded badges for status/priority
- Progress bars for completion tracking
- Clean card-based layouts with shadow and border
- Blue accent color throughout
- Rounded corners (rounded-xl/2xl)
- Consistent spacing and typography

---

## v0 Specific Instructions

**When creating in v0:**
1. Use "Next.js 15" as framework
2. Select "TypeScript" for language
3. Choose "Tailwind CSS" for styling
4. Component style: "shadcn/ui New York style"
5. Start with a blank page template
6. Copy the mock data structures above
7. Build the layout as specified
8. Test hover states and interactions
9. Ensure responsive breakpoints work
10. Export as a complete page component

---

**This prompt is ready to paste into v0.dev!** 🚀

Just copy this entire document into v0's prompt input and it will generate a fully-styled admin dashboard matching your existing design system.
