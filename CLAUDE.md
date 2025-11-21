# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ContractBuddy is a legal operations contract review and reconciliation platform built with Next.js 15, React, and TypeScript. The application helps users manage influencer/talent contracts, perform clause-by-clause reconciliation, and track contract performance metrics.

## Technology Stack

- **Framework**: Next.js 15.5.4 (App Router with Server Components)
- **Language**: TypeScript 5 with strict mode enabled
- **Styling**: Tailwind CSS 4.1.9 with CSS variables
- **UI Components**: shadcn/ui (New York style) with Radix UI primitives
- **Icons**: Lucide React
- **Form Management**: React Hook Form with Zod validation
- **Package Manager**: pnpm

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server (http://localhost:3000)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linter
pnpm lint
```

## Application Architecture

### Route Structure

The application follows Next.js App Router conventions with the following main routes:

- `/` - Dashboard/home page showing KPIs, recent deals, and quick actions
- `/deals` - Deal management page with filtering, search, and bulk operations
- `/deals/new` - New deal creation/contract upload workflow
- `/reconciliation` - Contract reconciliation workspace (clause-by-clause review)
- `/reconciliation/complete` - Post-reconciliation summary and reports
- `/setup` - Initial setup/onboarding flow

### Key Domain Concepts

**Deals**: Influencer/talent contracts with brands. Each deal contains:
- Talent and agency information
- Brand and deliverables
- Financial terms (fee, currency)
- Contract status (Signed, Draft, In Review)
- Reconciliation status tracking

**Reconciliation**: The process of reviewing contracts clause-by-clause. Each clause has:
- Status: `match` (green), `review` (yellow), `issue` (red)
- Confidence score (0-100)
- Summary and full text
- Risk acceptance flag
- Clause type categorization

**Reconciliation Flow**:
1. Upload contract document (PDF/DOCX)
2. AI extracts and categorizes clauses
3. User reviews each clause with accept/reject/flag actions
4. Progress tracked with completion percentage
5. Final summary report generated

### Component Organization

- `app/` - Next.js pages and routing (all client components using "use client")
- `components/ui/` - shadcn/ui components (56+ components including dialogs, forms, tables, etc.)
- `components/theme-provider.tsx` - Theme management wrapper
- `lib/utils.ts` - Utility functions (currently only `cn()` for className merging)
- `hooks/` - Custom React hooks (`use-mobile.ts`, `use-toast.ts`)

### State Management

Currently using React component-level state with useState. No global state management library is configured. Reconciliation status is tracked locally and could be persisted to a backend in future iterations.

### Styling Conventions

- Uses Tailwind CSS with custom design system via CSS variables
- Color scheme: Blue primary, with semantic colors for status (emerald=success, amber=warning, red=error)
- Consistent spacing and rounded corners (typically `rounded-lg` or `rounded-xl`)
- Gradient backgrounds for hero sections and cards
- Hover states and transitions for interactive elements

## Important Configuration Notes

- **ESLint and TypeScript errors are ignored during builds** (`ignoreDuringBuilds: true`, `ignoreBuildErrors: true`) - This is intentional for the current development phase
- **Images are unoptimized** - Next.js image optimization is disabled
- **No environment variables** - Currently no .env file; this is a frontend-only prototype
- **Path alias**: `@/*` maps to project root for imports
- **React Strict Mode**: Enabled

## Working with shadcn/ui

This project uses shadcn/ui components. To add new components:

```bash
npx shadcn@latest add [component-name]
```

Configuration is in `components.json` with:
- Style: "new-york"
- Base color: "neutral"
- CSS variables enabled
- Icons from lucide-react

## Data Flow Patterns

Since this is currently a frontend prototype:

1. **Sample data** is hardcoded in page components (see `sampleDeals` arrays)
2. **Router navigation** handles state transitions (e.g., upload → reconciliation)
3. **Local state** manages UI interactions and reconciliation progress
4. When adding backend integration, maintain the existing TypeScript interfaces (`Deal`, `Clause`, `ReconciliationStatus`) as the API contract shapes

## UI/UX Patterns

- **Dashboard**: KPI cards with color-coded metrics and trend indicators
- **Deals table**: Filterable/searchable with inline actions and bulk operations
- **Reconciliation view**: Split-pane layout with clause list + detail panel
- **Progress tracking**: Visual progress bars and completion percentages throughout
- **Confetti celebration**: Used on reconciliation completion (`canvas-confetti`)
- **Responsive design**: Mobile-first with responsive grid layouts

## Future Integration Points

The codebase is structured to add:
- Backend API integration (clause extraction, deal storage)
- Authentication (user-specific deals and reconciliation history)
- Real-time collaboration features
- Document storage and versioning
- Export functionality (currently UI-only)
