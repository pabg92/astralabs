# ContractBuddy Documentation

**Version:** 1.0
**Last Updated:** November 3, 2025

---

## Quick Navigation

### **Start Here**

1. **[1-ARCHITECTURE.md](./1-ARCHITECTURE.md)** - System design and key decisions
2. **[2-DATABASE-SCHEMA.md](./2-DATABASE-SCHEMA.md)** - Database structure and migrations
3. **[3-IMPLEMENTATION-GUIDE.md](./3-IMPLEMENTATION-GUIDE.md)** - How to build features
4. **[4-LCL-CLAUSE-ID-SCHEMA.md](./4-LCL-CLAUSE-ID-SCHEMA.md)** - Clause ID naming & extraction standards
5. **[CHANGELOG.md](./CHANGELOG.md)** - What changed and when

### **Project Files**

- **[CBA Developer Brief - v1.3.pdf](./CBA%20Developer%20Brief%20-%20v1.3.pdf)** - Original client brief
- **[archive/](./archive/)** - Historical planning documents

---

## What is ContractBuddy?

Contract reconciliation platform for influencer marketing agencies.

**Core Features:**
- AI-powered clause extraction (OpenAI GPT-4o)
- Semantic matching against 300+ legal templates (Cohere + pgvector)
- Red/Amber/Green (RAG) risk highlighting
- Contract versioning (v1.0 → v2.0 → v3.0)
- Three-way reconciliation (Contract vs Pre-Agreed vs Library)

---

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Database** | ✅ Complete | All migrations applied, pgmq enabled |
| **Frontend** | ✅ Built | Next.js 15, needs backend connection |
| **Backend API** | ⏳ Not started | Phase 1 next |
| **Edge Functions** | ⏳ Not started | Phase 3 |
| **Clause Library** | ⏳ Empty | Needs seeding |
| **Authentication** | ⏳ Not configured | Clerk integration pending |

---

## Tech Stack

**Frontend:** Next.js 15, React 19, TypeScript 5, Tailwind CSS, shadcn/ui
**Backend:** Supabase (PostgreSQL 15), pgvector, pgmq
**AI:** OpenAI GPT-4o, Cohere embed-english-v3.0
**Auth:** Clerk (planned)

---

## Quick Start

### For Developers
```bash
# Clone and install
cd ContractBuddy
pnpm install

# Set up environment
cp .env.example .env.local
# Add your API keys (Supabase, OpenAI, Cohere)

# Run dev server
pnpm dev
```

### For Reviewers
1. Read [1-ARCHITECTURE.md](./1-ARCHITECTURE.md) for system design
2. Review [2-DATABASE-SCHEMA.md](./2-DATABASE-SCHEMA.md) for schema details
3. Check [CHANGELOG.md](./CHANGELOG.md) for recent changes

---

## Architecture at a Glance

```
Deal (Pre-Agreed Terms)
    ↓
Contract Upload (v1.0)
    ↓ pgmq queue
Edge Function: Extract Clauses (OpenAI)
    ↓ [GREEN][AMBER][RED] markup
Generate Embeddings (Cohere)
    ↓ 1024-dim vectors
Match to Library (pgvector)
    ↓ Top 3 matches per clause
Three-Way Comparison
    ↓ Final RAG status
Store Results → Display in UI
```

---

## Cost Model

**300 contracts/month:** $33.25/mo
- Supabase Pro: $25
- OpenAI: $7.50
- Cohere: $0.75

**98% cheaper than Azure DI approach** ($450/mo)

---

## Questions?

- **Architecture:** See [1-ARCHITECTURE.md](./1-ARCHITECTURE.md)
- **Database:** See [2-DATABASE-SCHEMA.md](./2-DATABASE-SCHEMA.md)
- **How to build:** See [3-IMPLEMENTATION-GUIDE.md](./3-IMPLEMENTATION-GUIDE.md)
- **What changed:** See [CHANGELOG.md](./CHANGELOG.md)
- **For Claude Code:** See [../CLAUDE.md](../CLAUDE.md)

---

**Maintained by:** Development Team
