# PDF RAG Highlights

**Version:** 1.0
**Last Updated:** November 21, 2025

---

## Current Implementation (v1)

The PDF viewer uses text-layer substring matching to highlight clauses:

1. **PDF Rendering**: react-pdf v7.7.3 with pdfjs-dist v3.11.174 (CDN worker)
2. **Highlight Method**: DOM-based text search using `textLayer.textContent.indexOf(clauseText)`
3. **RAG Status Colors**:
   - Green: Matching/approved clauses
   - Amber: Review needed
   - Red: Issues detected
   - Orange border: Risk-accepted clauses

### Limitations

- **Substring matching** is fragile with line breaks, hyphenation, and OCR artifacts
- **No page awareness**: Cannot highlight multi-page clauses accurately
- **No coordinates**: Relies on text layer position, which may drift from visual PDF

---

## PDF Highlight v2 Plan (Bounding Box Approach)

### Goal

Replace substring matching with precise bounding-box coordinates stored during clause extraction.

### Schema Changes

Add to `clause_boundaries` table:

```sql
-- Migration: Add bounding box fields to clause_boundaries
ALTER TABLE clause_boundaries
ADD COLUMN IF NOT EXISTS page_spans JSONB;
-- Structure: [{ page: 1, bbox: { x: 72, y: 120, width: 468, height: 80 } }, ...]

ALTER TABLE clause_boundaries
ADD COLUMN IF NOT EXISTS highlight_coords JSONB;
-- Structure: [{ page: 1, rects: [{ x, y, w, h }, ...] }]

COMMENT ON COLUMN clause_boundaries.page_spans IS 'Page numbers and bounding boxes for multi-page clauses';
COMMENT ON COLUMN clause_boundaries.highlight_coords IS 'Precise highlight rectangles from PDF extraction';
```

### Worker Pipeline Changes (Phase 5)

During clause extraction, capture bounding boxes:

1. **PDF.js getTextContent()** returns items with `transform` matrix containing position
2. **Calculate bounding boxes** from consecutive text items belonging to each clause
3. **Store in `clause_boundaries.highlight_coords`** as array of page/rect objects

```typescript
// Example extraction logic
const textContent = await page.getTextContent();
const clauseRects = [];

for (const item of textContent.items) {
  if (isWithinClause(item, clauseBoundary)) {
    const [, , , , x, y] = item.transform;
    clauseRects.push({
      page: pageNum,
      rect: { x, y: pageHeight - y, width: item.width, height: item.height }
    });
  }
}
```

### Frontend Changes

Update `components/pdf-viewer.tsx`:

```typescript
// v2: Use stored coordinates instead of text search
const highlightClause = (clause: Clause, pageNum: number) => {
  const coords = clause.highlightCoords?.find(c => c.page === pageNum);
  if (!coords) return null;

  return coords.rects.map((rect, i) => (
    <div
      key={i}
      className="absolute pointer-events-none"
      style={{
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        backgroundColor: getRAGColor(clause.status),
      }}
    />
  ));
};
```

### Migration Path

1. **Phase 1**: Add schema columns (non-breaking)
2. **Phase 2**: Update extraction worker to populate coordinates
3. **Phase 3**: Backfill existing documents (optional reprocessing job)
4. **Phase 4**: Update frontend to use coordinates when available, fallback to text search

### Benefits

- **Precision**: Exact highlight positioning regardless of text layer quirks
- **Multi-page support**: Seamlessly highlight clauses spanning pages
- **Performance**: No runtime text searching
- **Consistency**: Highlights match exactly what was extracted

---

## Testing Notes

Current v1 testing:
- Manual verification: Select clause, confirm highlight appears on correct text
- Known issues: Line-broken clauses may only highlight first segment

v2 testing plan:
- Unit tests for bounding box calculation
- Visual regression tests with sample PDFs
- Edge cases: rotated pages, multi-column layouts, scanned documents
