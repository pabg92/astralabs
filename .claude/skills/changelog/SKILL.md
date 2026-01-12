---
name: changelog
description: Add an entry to CHANGELOG.md under the [Unreleased] section. Use when you need to document a new feature, fix, or change.
---

# Changelog Command

Adds entries to CHANGELOG.md following the [Keep a Changelog](https://keepachangelog.com/) format.

## Usage

```
/changelog
```

Or with inline arguments:
```
/changelog fix: Fixed bug where clause text wasn't updating after accepting redline
/changelog feat: Added new AI suggestion inline display
```

## Workflow

### Step 1: Determine Change Type

If not provided in arguments, ask the user:

**What type of change is this?**
- **Added** - New features
- **Changed** - Changes to existing functionality
- **Fixed** - Bug fixes
- **Removed** - Removed features
- **Security** - Security fixes
- **Deprecated** - Soon-to-be removed features

### Step 2: Get Change Description

If not provided in arguments, ask the user:

**Describe the change:**
- Keep it concise (1-2 sentences)
- Start with a bold title: `**Feature Name**`
- Include affected files if relevant

### Step 3: Read Current CHANGELOG.md

```bash
# Read the current changelog
Read /home/pablo/ContractBuddy/CHANGELOG.md
```

### Step 4: Add Entry Under [Unreleased]

Insert the new entry under the appropriate category in `[Unreleased]`:

```markdown
## [Unreleased]

### {ChangeType}
- **{Title}** - {Description}
  - {Additional details if provided}
  - File: `{affected_file.ts}`
```

**Rules:**
- If the category (e.g., `### Fixed`) already exists under `[Unreleased]`, add to it
- If the category doesn't exist, create it in this order: Added, Changed, Deprecated, Removed, Fixed, Security
- Always add new entries at the TOP of their category section

### Step 5: Confirm Addition

Show the user what was added:

```
Added to CHANGELOG.md under [Unreleased] > {ChangeType}:

- **{Title}** - {Description}
```

## Examples

### Example 1: Quick Fix Entry

**User:** `/changelog fix: Clause text not updating after accepting redline`

**Action:** Add under `### Fixed`:
```markdown
- **Clause text not updating after accepting redline** - Fixed issue where accepting a redline didn't update the displayed text
  - File: `app/reconciliation/page.tsx`
```

### Example 2: New Feature Entry

**User:** `/changelog feat: Added inline diff display for redlines`

**Action:** Add under `### Added`:
```markdown
- **Inline diff display for redlines** - AI suggestions now show inline in clause cards with accept/dismiss buttons
  - Files: `components/redlines/inline-redline-diff.tsx`, `app/reconciliation/page.tsx`
```

### Example 3: Interactive Mode

**User:** `/changelog`

**Claude asks:** What type of change? (Added/Changed/Fixed/Removed/Security)
**User:** Fixed
**Claude asks:** Describe the change:
**User:** React version mismatch causing build failures

**Action:** Add under `### Fixed`:
```markdown
- **React version mismatch** - Aligned react and react-dom versions to fix build failures
```

## Argument Parsing

If arguments are provided, parse them:
- `fix:` or `fixed:` → Fixed
- `feat:` or `add:` or `added:` → Added
- `change:` or `changed:` → Changed
- `remove:` or `removed:` → Removed
- `security:` → Security
- `deprecate:` or `deprecated:` → Deprecated

Everything after the prefix becomes the description.

## File Location

Always edit: `/home/pablo/ContractBuddy/CHANGELOG.md`
